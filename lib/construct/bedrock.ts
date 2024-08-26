import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";

export interface BedrockProps {
  vpc: ec2.IVpc;
  securityGroup: ec2.SecurityGroup;
  authorizer: apigw.TokenAuthorizer;
  privateBackEndApi: apigw.LambdaRestApi;
  dataSourceBucketName?: string;
  knowledgeBaseId?: string;
}

export class Bedrock extends Construct {
  constructor(scope: Construct, id: string, props: BedrockProps) {
    super(scope, id);

    const {
      vpc,
      securityGroup,
      authorizer,
      privateBackEndApi,
      dataSourceBucketName,
      knowledgeBaseId,
    } = props;

    // バックエンドAPI
    // Lambda 関数を作成
    // iamロールの作成
    const lambdaRole = new iam.Role(this, "LambdaInvokeBedrockRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaVPCAccessExecutionRole",
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonBedrockFullAccess"),
      ],
    });

    const lambdaFunctionInvokeBedrock = new lambda.Function(
      this,
      "InvokeBedrockLambda",
      {
        runtime: lambda.Runtime.PYTHON_3_10,
        code: lambda.Code.fromAsset("lambda/InvokeBedrock"),
        handler: "lambda_function.lambda_handler",
        role: lambdaRole,
        timeout: cdk.Duration.seconds(300), // タイムアウトを5分（300秒）に設定
        vpc: vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        allowPublicSubnet: false,
        securityGroups: [securityGroup], // Security Group
      },
    );

    const chatItems = privateBackEndApi.root.addResource("chat");
    chatItems.addMethod(
      "POST",
      new apigw.LambdaIntegration(lambdaFunctionInvokeBedrock),
      {
        authorizer: authorizer,
        authorizationType: apigw.AuthorizationType.CUSTOM,
      },
    );

    // Bedrock Knowledgebaseを参照するAPI関数とLambdaを作成
    if (this.node.tryGetContext("ragKnowledgeBaseEnabled")) {
      const lambdaRole = new iam.Role(this, "LambdaInvokeBedrockKBRole", {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSLambdaBasicExecutionRole",
          ),
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSLambdaVPCAccessExecutionRole",
          ),
          iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonBedrockFullAccess"),
        ],
      });
      lambdaRole.addToPolicy(
        new iam.PolicyStatement({
          resources: [`arn:aws:s3:::${dataSourceBucketName}/*`],
          actions: ["s3:GetObject"],
        }),
      );

      const lambdaFunctionInvokeBedrockKB = new lambda.Function(
        this,
        "InvokeBedrockKBLambda",
        {
          runtime: lambda.Runtime.PYTHON_3_10,
          code: lambda.Code.fromAsset("lambda/InvokeBedrockKB"),
          handler: "lambda_function.lambda_handler",
          role: lambdaRole,
          timeout: cdk.Duration.seconds(300), // タイムアウトを5分（300秒）に設定
          environment: {
            knowledge_base_Id: `${knowledgeBaseId}`,
          },
          vpc: vpc,
          vpcSubnets: {
            subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          },
          allowPublicSubnet: false,
          securityGroups: [securityGroup], // Security Group
        },
      );
      const ragItems = privateBackEndApi.root.addResource("rag");
      ragItems.addMethod(
        "POST",
        new apigw.LambdaIntegration(lambdaFunctionInvokeBedrockKB),
        {
          authorizer: authorizer,
          authorizationType: apigw.AuthorizationType.CUSTOM,
        },
      );
    }
  }
}
