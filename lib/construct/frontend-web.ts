import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3Deploy from "aws-cdk-lib/aws-s3-deployment";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as elbv2Targets from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { Size } from 'aws-cdk-lib';

export interface FrontendWebProps {
  vpc: ec2.IVpc;
  securityGroup: ec2.SecurityGroup;
  privateApiVpcEndpoint: ec2.InterfaceVpcEndpoint;
  privateApiVpcEndpointIpAdressList: string[];
  domainName: string;
  subDomainName: string;
  certificateArn: string;
  apiURL: string;
  textModelId: string;
}

export class FrontendWeb extends Construct {
  constructor(scope: Construct, id: string, props: FrontendWebProps) {
    super(scope, id);

    const {
      vpc,
      securityGroup,
      privateApiVpcEndpoint,
      privateApiVpcEndpointIpAdressList,
      domainName,
      subDomainName,
      certificateArn,
      apiURL,
      textModelId,
    } = props;

    const targetGroup = new elbv2.ApplicationTargetGroup(
      this,
      "privateALBTargetGroup",
      {
        port: 443,
        targetType: elbv2.TargetType.IP,
        vpc: vpc,
      },
    );
    
    // note: two ENIs in our endpoint as above, so we can get two IPs out of the response
    targetGroup.addTarget(new elbv2Targets.IpTarget(privateApiVpcEndpointIpAdressList[0]));
    targetGroup.addTarget(new elbv2Targets.IpTarget(privateApiVpcEndpointIpAdressList[1]));

    // プライベートALBの作成
    const alb = new elbv2.ApplicationLoadBalancer(this, "PrivateALB", {
      vpc: vpc,
      internetFacing: false, // これをfalseに設定することでプライベートALBになります
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    });
    alb.addSecurityGroup(securityGroup);

    const certificate = acm.Certificate.fromCertificateArn(
      this,
      "domainCert",
      certificateArn,
    );
    // ALBにリスナーを追加
    const listener = alb.addListener("ALBHTTPSListener", {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      defaultTargetGroups: [targetGroup],
      certificates: [certificate],
    });

    // Route53
    const zone = new route53.PrivateHostedZone(this, "HostedZone", {
      zoneName: domainName,
      vpc: vpc, // At least one VPC has to be added to a Private Hosted Zone.
    });
    new route53.ARecord(this, "AliasRecord", {
      recordName: subDomainName+'.'+domainName,
      zone: zone,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.LoadBalancerTarget(alb),
      ),
      deleteExisting: true,
    });

    // 静的ウェブサイトを格納するS3、およびProxyとなるAPIGWを作成
    const assetsBucket = new s3.Bucket(this, "StaticAssetsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
      enforceSSL: true,
    });
    const apiGateway = new apigw.RestApi(this, "assets-api", {
      restApiName: "PrivateGenerativeAISampleAssetsProvider",
      description: "Serves assets from the s3 bucket.",
      binaryMediaTypes: ["*/*"],
      minCompressionSize: Size.kibibytes(1),
      endpointConfiguration: {
        types: [apigw.EndpointType.PRIVATE],
        vpcEndpoints: [privateApiVpcEndpoint],
      },
      policy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            principals: [new iam.AnyPrincipal()],
            actions: ["execute-api:Invoke"],
            resources: ["execute-api:/*"],
            effect: iam.Effect.DENY,
            conditions: {
              StringNotEquals: {
                "aws:SourceVpce": privateApiVpcEndpoint.vpcEndpointId,
              },
            },
          }),
          new iam.PolicyStatement({
            principals: [new iam.AnyPrincipal()],
            actions: ["execute-api:Invoke"],
            resources: ["execute-api:/*"],
            effect: iam.Effect.ALLOW,
          }),
        ],
      }),
    });
    const executeRole = new iam.Role(this, "api-gateway-s3-assume-tole", {
      assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      roleName: "API-Gateway-S3-Integration-Role",
    });

    executeRole.addToPolicy(
      new iam.PolicyStatement({
        resources: [assetsBucket.bucketArn],
        actions: ["s3:Get"],
      }),
    );
    assetsBucket.grantReadWrite(executeRole);

    // APIGWにS3を参照するメソッドを追加
    const s3Integration = this.creates3Integration(assetsBucket, executeRole);
    const s3IntegrationIndex = this.creates3IntegrationIndex(
      assetsBucket,
      executeRole,
    );
    this.addAssetsEndpoint(apiGateway, s3Integration);
    this.addIndexAssetsEndpoint(apiGateway, s3IntegrationIndex);

    // カスタムドメインの設定
    const customDomainName = new apigw.DomainName(this, "CustomDomain", {
      certificate: certificate,
      domainName: subDomainName+'.'+domainName,
      endpointType: apigw.EndpointType.REGIONAL,
    });
    customDomainName.addBasePathMapping(apiGateway);
    
    //デプロイするフォルダを指定
    new s3Deploy.BucketDeployment(this, "deployreactApp", {
      sources: [
        s3Deploy.Source.jsonData("/config.json", {
          API_URL: apiURL,
          TEXT_MODEL_ID: textModelId,
        }),
        s3Deploy.Source.asset("./react/my-app/build"),
      ],
      destinationBucket: assetsBucket,
    });
  }

  private creates3Integration(assetsBucket: s3.IBucket, executeRole: iam.Role) {
    return new apigw.AwsIntegration({
      service: "s3",
      integrationHttpMethod: "GET",
      path: `${assetsBucket.bucketName}/{proxy}`,
      options: {
        credentialsRole: executeRole,
        requestParameters: {
          "integration.request.path.proxy": "method.request.path.proxy",
        },
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Content-Type":
                "integration.response.header.Content-Type",
            },
          },
        ],
      },
    });
  }

  private creates3IntegrationIndex(
    assetsBucket: s3.IBucket,
    executeRole: iam.Role,
  ) {
    return new apigw.AwsIntegration({
      service: "s3",
      integrationHttpMethod: "GET",
      path: `${assetsBucket.bucketName}/index.html`,
      options: {
        credentialsRole: executeRole,
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Content-Type":
                "integration.response.header.Content-Type",
            },
          },
        ],
      },
    });
  }

  private addAssetsEndpoint(
    apiGateway: apigw.RestApi,
    s3Integration: apigw.AwsIntegration,
  ) {
    apiGateway.root
      //addResource("assets")
      .addResource("{proxy+}")
      .addMethod("GET", s3Integration, {
        requestParameters: {
          "method.request.path.proxy": true,
        },
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Content-Type": true,
            },
          },
        ],
      });
  }

  private addIndexAssetsEndpoint(
    apiGateway: apigw.RestApi,
    s3Integration: apigw.AwsIntegration,
  ) {
    apiGateway.root.addMethod("GET", s3Integration, {
      requestParameters: {
        "method.request.path.proxy": true,
      },
      methodResponses: [
        {
          statusCode: "200",
          responseParameters: {
            "method.response.header.Content-Type": true,
          },
        },
      ],
    });
  }
}
