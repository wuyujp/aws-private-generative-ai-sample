import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as oss from "aws-cdk-lib/aws-opensearchserverless";
import * as iam from "aws-cdk-lib/aws-iam";

import {
  AwsCustomResource,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";

const UUID = "c54452ea-ef64-4ad4-a16c-153a67c26962";
// VPCエンドポイント使えるAZを絞るため、リージョンとAZのマッピングを定義
// 現時点以下3リージョンのみサポートする
const regionToAZs: { [key: string]: string[] } = {
  "us-east-1": ["us-east-1a", "us-east-1b"],
  "us-west-2": ["us-west-2a", "us-west-2b"],
  "ap-northeast-1": ["ap-northeast-1a", "ap-northeast-1c"],
};

export class PrivateGenerativeAISampleVpcStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly securityGroup: ec2.SecurityGroup;
  public readonly privateApiVpcEndpoint: ec2.InterfaceVpcEndpoint;
  public readonly privateApiVpcEndpointIpAdressList: string[];
  public readonly privateOssVpcEndpoint: oss.CfnVpcEndpoint;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // 現在のリージョンを取得
    const currentRegion = process.env.CDK_DEFAULT_REGION;
    // console.log("process.env", process.env);
    // console.log("currentRegion1", cdk.Stack.of(this).region);
    console.log("currentRegion", currentRegion);
    // リージョンに基づいて利用可能なAZを取得
    
    const availableAZs = regionToAZs[currentRegion as string] || [];
    if (availableAZs.length === 0) {
      throw new Error(`No AZs defined for region ${currentRegion}`);
    }
    // VPC
    this.vpc = new ec2.Vpc(this, "Vpc", {
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
      natGateways: 1,
      availabilityZones: availableAZs,

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
    this.privateApiVpcEndpoint = new ec2.InterfaceVpcEndpoint(
      this,
      "privateApiVpcEndpoint",
      {
        vpc: this.vpc,
        service: ec2.InterfaceVpcEndpointAwsService.APIGATEWAY,
        subnets: { subnets: this.vpc.isolatedSubnets },
        securityGroups: [this.securityGroup],
        open: false,
      },
    );

    // ALBのTarget Groupで参照するため、API Gateway VPC EndpointのプライベートIPアドレスを出力
    const eni = this.getVPCEndpointENI(this.privateApiVpcEndpoint);
    // note: two ENIs in our endpoint as above, so we can get two IPs out of the response
    const ip1 = eni.getResponseField("NetworkInterfaces.0.PrivateIpAddress");
    const ip2 = eni.getResponseField("NetworkInterfaces.1.PrivateIpAddress");

    this.privateApiVpcEndpointIpAdressList = [ip1, ip2];

    // Bedrock呼び出す用VPC エンドポイント
    const privateBedrockRuntimeVpcEndpoint = new ec2.InterfaceVpcEndpoint(
      this,
      "privateBedrockRuntimeVpcEndpoint",
      {
        vpc: this.vpc,
        service: ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME,
        subnets: { subnets: this.vpc.isolatedSubnets },
        securityGroups: [this.securityGroup],
        open: false,
      },
    );

    // Bedrock Knowledgebase使う場合はVPCエンドポイントを追加
    if (this.node.tryGetContext("ragKnowledgeBaseEnabled")) {
      const privateBedrockAgentRuntimeVpcEndpoint =
        new ec2.InterfaceVpcEndpoint(
          this,
          "privateBedrockAgentRuntimeVpcEndpoint",
          {
            vpc: this.vpc,
            service: ec2.InterfaceVpcEndpointAwsService.BEDROCK_AGENT_RUNTIME,
            subnets: { subnets: this.vpc.isolatedSubnets },
            securityGroups: [this.securityGroup],
            open: false,
          },
        );

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

      const privateS3VpcEndpoint = new ec2.InterfaceVpcEndpoint(
        this,
        "privateS3VpcEndpoint",
        {
          vpc: this.vpc,
          service: ec2.InterfaceVpcEndpointAwsService.S3,
          subnets: { subnets: this.vpc.isolatedSubnets },
          securityGroups: [this.securityGroup],
          open: false,
          privateDnsEnabled: false,
        },
      );
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
