import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as oss from 'aws-cdk-lib/aws-opensearchserverless';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3Deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

const UUID = '339C5FED-A1B5-43B6-B40A-5E8E59E5734D';

// 以下が現状 Embedding model としてサポートされているモデル ID
// Dimension は最終的に Custom resource の props として渡すが
// 勝手に型が変換されてしまう Issue があるため、number ではなく string にしておく
// https://github.com/aws-cloudformation/cloudformation-coverage-roadmap/issues/1037
const MODEL_VECTOR_MAPPING: { [key: string]: string } = {
  'amazon.titan-embed-text-v1': '1536',
  'amazon.titan-embed-text-v2:0': '1024',
  'cohere.embed-multilingual-v3': '1024',
  'cohere.embed-english-v3': '1024',
};

const EMBEDDING_MODELS = Object.keys(MODEL_VECTOR_MAPPING);

interface OpenSearchServerlessIndexProps {
  collectionId: string;
  vectorIndexName: string;
  vectorField: string;
  metadataField: string;
  textField: string;
  vectorDimension: string;
}

class PrivateOpenSearchServerlessIndex extends Construct {
  public readonly customResourceHandler: lambda.IFunction;
  public readonly customResource: cdk.CustomResource;

  constructor(
    scope: Construct,
    id: string,
    props: OpenSearchServerlessIndexProps,
    vpc: ec2.IVpc,
    securityGroup: ec2.SecurityGroup
  ) {
    super(scope, id);

    const customResourceHandler = new lambda.SingletonFunction(
      this,
      'PrivateOpenSearchServerlessIndex',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset('custom-resources'),
        handler: 'oss-index.handler',
        uuid: UUID,
        lambdaPurpose: 'PrivateOpenSearchServerlessIndex',
        timeout: cdk.Duration.minutes(15),
        vpc: vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS // NATつきPrivate Subnetを使用
        },
        allowPublicSubnet: false,
        securityGroups: [securityGroup], // Security Group
      }
    );

    const customResource = new cdk.CustomResource(this, 'CustomResource', {
      serviceToken: customResourceHandler.functionArn,
      resourceType: 'Custom::OssIndex',
      properties: props,
    });

    this.customResourceHandler = customResourceHandler;
    this.customResource = customResource;
  }
}

interface PrivateGenerativeAISampleRagStackProps extends StackProps {
  collectionName?: string;
  vectorIndexName?: string;
  vectorField?: string;
  metadataField?: string;
  textField?: string;
  vpc : ec2.IVpc;
  securityGroup: ec2.SecurityGroup;
  privateOssVpcEndpoint: oss.CfnVpcEndpoint;
}

export class PrivateGenerativeAISampleRagStack extends Stack {
  public readonly knowledgeBaseId: string;
  public readonly dataSourceBucketName: string;

  constructor(scope: Construct, id: string, props: PrivateGenerativeAISampleRagStackProps) {
    super(scope, id, props);

    const embeddingModelId: string | null | undefined =
      this.node.tryGetContext('embeddingModelId')!;

    if (typeof embeddingModelId !== 'string') {
      throw new Error(
        'Knowledge Base RAG が有効になっていますが、embeddingModelId が指定されていません'
      );
    }

    if (!EMBEDDING_MODELS.includes(embeddingModelId)) {
      throw new Error(
        `embeddingModelId が無効な値です (有効な embeddingModelId ${EMBEDDING_MODELS})`
      );
    }

    const collectionName = props.collectionName ?? 'private-rag-oss';
    const vectorIndexName =
      props.vectorIndexName ?? 'bedrock-knowledge-base-default';
    const vectorField =
      props.vectorField ?? 'bedrock-knowledge-base-default-vector';
    const textField = props.textField ?? 'AMAZON_BEDROCK_TEXT_CHUNK';
    const metadataField = props.metadataField ?? 'AMAZON_BEDROCK_METADATA';
    const vpc = props.vpc;
    const securityGroup = props.securityGroup;

    const knowledgeBaseRole = new iam.Role(this, 'KnowledgeBaseRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
    });

    const standbyReplicas = this.node.tryGetContext(
      'ragKnowledgeBaseStandbyReplicas'
    );

    const collection = new oss.CfnCollection(this, 'Collection', {
      name: collectionName,
      description: 'aws_api_gateway_s3 Collection',
      type: 'VECTORSEARCH',
      standbyReplicas: standbyReplicas ? 'ENABLED' : 'DISABLED',
    });
    collection.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    const ossIndex = new PrivateOpenSearchServerlessIndex(this, 'OssIndex', {
      collectionId: collection.ref,
      vectorIndexName,
      vectorField,
      textField,
      metadataField,
      vectorDimension: MODEL_VECTOR_MAPPING[embeddingModelId],
    },vpc,securityGroup);

    ossIndex.customResourceHandler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: [cdk.Token.asString(collection.getAtt('Arn'))],
        actions: ['aoss:APIAccessAll'],
      })
    );

    const accessPolicy = new oss.CfnAccessPolicy(this, 'AccessPolicy', {
      name: collectionName,
      policy: JSON.stringify([
        {
          Rules: [
            {
              Resource: [`collection/${collectionName}`],
              Permission: [
                'aoss:DescribeCollectionItems',
                'aoss:CreateCollectionItems',
                'aoss:UpdateCollectionItems',
              ],
              ResourceType: 'collection',
            },
            {
              Resource: [`index/${collectionName}/*`],
              Permission: [
                'aoss:UpdateIndex',
                'aoss:DescribeIndex',
                'aoss:ReadDocument',
                'aoss:WriteDocument',
                'aoss:CreateIndex',
                'aoss:DeleteIndex',
              ],
              ResourceType: 'index',
            },
          ],
          Principal: [
            knowledgeBaseRole.roleArn,
            ossIndex.customResourceHandler.role?.roleArn,
          ],
          Description: '',
        },
      ]),
      type: 'data',
    });
    accessPolicy.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    const networkPolicy = new oss.CfnSecurityPolicy(this, 'NetworkPolicy', {
      name: collectionName,
      policy: JSON.stringify([
        {
          Rules: [
            {
              Resource: [`collection/${collectionName}`],
              ResourceType: 'collection',
            },
            {
              Resource: [`collection/${collectionName}`],
              ResourceType: 'dashboard',
            },
          ],
          AllowFromPublic: false,
          "SourceVPCEs":[
                  props.privateOssVpcEndpoint.attrId
               ],
          "SourceServices":[
         "bedrock.amazonaws.com"
      ],
        },
      ]),
      type: 'network',
    });
    networkPolicy.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);


    const encryptionPolicy = new oss.CfnSecurityPolicy(
      this,
      'EncryptionPolicy',
      {
        name: collectionName,
        policy: JSON.stringify({
          Rules: [
            {
              Resource: [`collection/${collectionName}`],
              ResourceType: 'collection',
            },
          ],
          AWSOwnedKey: true,
        }),
        type: 'encryption',
      }
    );
    encryptionPolicy.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);


    collection.node.addDependency(accessPolicy);
    collection.node.addDependency(networkPolicy);
    collection.node.addDependency(encryptionPolicy);

    const dataSourceBucket = new s3.Bucket(this, 'DataSourceBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
      serverAccessLogsPrefix: 'AccessLogs/',
      enforceSSL: true,
    });

    knowledgeBaseRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/${embeddingModelId}`,
        ],
        actions: ['bedrock:InvokeModel'],
      })
    );

    knowledgeBaseRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: [cdk.Token.asString(collection.getAtt('Arn'))],
        actions: ['aoss:APIAccessAll'],
      })
    );

    knowledgeBaseRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: [`arn:aws:s3:::${dataSourceBucket.bucketName}`],
        actions: ['s3:ListBucket'],
      })
    );

    knowledgeBaseRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: [`arn:aws:s3:::${dataSourceBucket.bucketName}/*`],
        actions: ['s3:GetObject'],
      })
    );

    const knowledgeBase = new bedrock.CfnKnowledgeBase(this, 'KnowledgeBase', {
      name: collectionName,
      roleArn: knowledgeBaseRole.roleArn,
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: `arn:aws:bedrock:${this.region}::foundation-model/${embeddingModelId}`,
        },
      },
      storageConfiguration: {
        type: 'OPENSEARCH_SERVERLESS',
        opensearchServerlessConfiguration: {
          collectionArn: cdk.Token.asString(collection.getAtt('Arn')),
          fieldMapping: {
            metadataField,
            textField,
            vectorField,
          },
          vectorIndexName,
        },
      },
    });

    new bedrock.CfnDataSource(this, 'DataSource', {
      dataSourceConfiguration: {
        s3Configuration: {
          bucketArn: `arn:aws:s3:::${dataSourceBucket.bucketName}`,
          inclusionPrefixes: ['docs/'],
        },
        type: 'S3',
      },
      knowledgeBaseId: knowledgeBase.ref,
      name: 's3-data-source',
      dataDeletionPolicy : 'RETAIN', //DELETEの場合はなぜかDataSourceの削除に失敗するため
    });

    knowledgeBase.addDependency(collection);
    knowledgeBase.node.addDependency(ossIndex.customResource);

    new s3Deploy.BucketDeployment(this, 'DeployDocs', {
      sources: [s3Deploy.Source.asset('./rag-docs')],
      destinationBucket: dataSourceBucket,
    });

    this.knowledgeBaseId = knowledgeBase.ref;
    this.dataSourceBucketName = dataSourceBucket.bucketName;
  }
}