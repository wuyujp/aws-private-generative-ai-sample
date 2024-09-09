import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as oss from "aws-cdk-lib/aws-opensearchserverless";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cr from "aws-cdk-lib/custom-resources";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";

import {
  AwsCustomResource,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";

const UUID = "c54452ea-ef64-4ad4-a16c-153a67c26962";
const UUID2 = "3b0157fe-d449-9c7f-d1f7-409cfb8f0006";

class GetAZs extends Construct {
  public readonly customResourceHandler: lambda.IFunction;
  public readonly customResource: cdk.CustomResource;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const customResourceHandler = new lambda.SingletonFunction(this, "GetAZs", {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset("custom-resources/get-az"),
      handler: "getAZ.handler",
      uuid: UUID2,
      lambdaPurpose: "GetAZs",
      timeout: cdk.Duration.minutes(3),
    });

    const customResource = new cdk.CustomResource(this, "CustomResource", {
      serviceToken: customResourceHandler.functionArn,
      resourceType: "Custom::GetAZs",
    });

    this.customResourceHandler = customResourceHandler;
    this.customResource = customResource;
  }
}

export class PrivateGenerativeAISampleVpcStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly securityGroup: ec2.SecurityGroup;
  public readonly privateApiVpcEndpoint: ec2.InterfaceVpcEndpoint;
  public readonly privateS3VpcEndpoint: ec2.InterfaceVpcEndpoint;
  public readonly privateApiVpcEndpointIpAdressList: string[];
  public readonly privateOssVpcEndpoint: oss.CfnVpcEndpoint;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Bedrock Agent Runtimeのエンドポイントに対応しているAZは限定されているため
    // カスタムリソースでaz1とaz2のIDAZ名を取得してくる。
    const azInfo = new GetAZs(this, 'GetAZs');
    azInfo.customResourceHandler.addToRolePolicy(
      new iam.PolicyStatement({
          actions: ["ec2:DescribeAvailabilityZones"],
          resources: ["*"],
        }),
    );
    // オブジェクト単位取得できないため、az1とaz2のIDAZ名別々で取得
    const az1 = azInfo.customResource.getAttString("az1");
    const az2 = azInfo.customResource.getAttString("az2");
    // VPC
    this.vpc = new ec2.Vpc(this, "Vpc", {
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
      natGateways: 1,
      availabilityZones: [az1, az2],
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "Private",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        {
          cidrMask: 24,
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "PrivateNAT",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    //　セキュリティグループ
    this.securityGroup = new ec2.SecurityGroup(this, "sharedSecurityGroup", {
      vpc: this.vpc,
      allowAllOutbound: true,
    });
    // VPC CIDRからのすべてのトラフィックを許可するインバウンドルールの追加
    this.securityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.allTraffic(),
    );

    // DynamoDB VPCエンドポイントの作成
    this.vpc.addGatewayEndpoint("DynamoDBEndpoint", {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }],
    });

    // API gateway エンドポイント
    this.privateApiVpcEndpoint = this.vpc.addInterfaceEndpoint(
      "privateApiVpcEndpoint",
      {
        service: ec2.InterfaceVpcEndpointAwsService.APIGATEWAY,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        securityGroups: [this.securityGroup],
      },
    );

    // ALBのTarget Groupで参照するため、API Gateway VPC EndpointのプライベートIPアドレスを出力
    const eni = this.getVPCEndpointENI(this.privateApiVpcEndpoint);
    // note: two ENIs in our endpoint as above, so we can get two IPs out of the response
    const ip1 = eni.getResponseField("NetworkInterfaces.0.PrivateIpAddress");
    const ip2 = eni.getResponseField("NetworkInterfaces.1.PrivateIpAddress");

    this.privateApiVpcEndpointIpAdressList = [ip1, ip2];

    // Bedrock呼び出す用VPC エンドポイント
    this.vpc.addInterfaceEndpoint("privateBedrockRuntimeVpcEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [this.securityGroup],
    });

    // Bedrock Knowledgebase使う場合はVPCエンドポイントを追加
    if (this.node.tryGetContext("ragKnowledgeBaseEnabled")) {
      this.vpc.addInterfaceEndpoint("privateBedrockAgentRuntimeVpcEndpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.BEDROCK_AGENT_RUNTIME,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        securityGroups: [this.securityGroup],
      });

      this.privateOssVpcEndpoint = new oss.CfnVpcEndpoint(
        this,
        "privateOSSVpcEndpoint",
        {
          name: "privateossvpcendpoint",
          subnetIds: this.vpc.isolatedSubnets.map((subnet) => subnet.subnetId),
          vpcId: this.vpc.vpcId,
          securityGroupIds: [this.securityGroup.securityGroupId],
        },
      );
      this.privateOssVpcEndpoint.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

      this.privateS3VpcEndpoint = this.vpc.addInterfaceEndpoint("privateS3VpcEndpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.S3,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        securityGroups: [this.securityGroup],
        privateDnsEnabled: false,
      });
    }
  }
  private getVPCEndpointENI(privateApiVpcEndpoint: ec2.InterfaceVpcEndpoint) {
    const eni = new AwsCustomResource(this, "DescribeNetworkInterfaces", {
      onCreate: {
        service: "EC2",
        action: "describeNetworkInterfaces",
        parameters: {
          NetworkInterfaceIds:
            privateApiVpcEndpoint.vpcEndpointNetworkInterfaceIds,
        },
        physicalResourceId: PhysicalResourceId.of(UUID),
      },
      onUpdate: {
        service: "EC2",
        action: "describeNetworkInterfaces",
        parameters: {
          NetworkInterfaceIds:
            privateApiVpcEndpoint.vpcEndpointNetworkInterfaceIds,
        },
        physicalResourceId: PhysicalResourceId.of(UUID),
      },
      policy: {
        statements: [
          new iam.PolicyStatement({
            actions: ["ec2:DescribeNetworkInterfaces"],
            resources: ["*"],
          }),
        ],
      },
    });
    return eni;
  }

}
