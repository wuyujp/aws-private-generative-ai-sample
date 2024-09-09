import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import { CfnOutput, RemovalPolicy, Token } from "aws-cdk-lib";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";

interface PrivateGenerativeAISampleClientStackProps extends StackProps {
  vpc: ec2.IVpc;
  securityGroup: ec2.SecurityGroup;
  dataSourceBucketName?: string;
  privateS3VpcEndpoint: ec2.InterfaceVpcEndpoint;
}

export class PrivateGenerativeAISampleClientStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: PrivateGenerativeAISampleClientStackProps,
  ) {
    super(scope, id, props);

    const { vpc, securityGroup, dataSourceBucketName, privateS3VpcEndpoint } =
      props;

    // SSM用VPC エンドポイント
    const privateSSMVpcEndpoint = new ec2.InterfaceVpcEndpoint(
      this,
      "privateSSMVpcEndpoint",
      {
        vpc: vpc,
        service: ec2.InterfaceVpcEndpointAwsService.SSM,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        securityGroups: [securityGroup],
        open: false,
      },
    );
    // SSM用VPC エンドポイント
    const privateEc2MessagesVpcEndpoint = new ec2.InterfaceVpcEndpoint(
      this,
      "privateEc2MessagesVpcEndpoint",
      {
        vpc: vpc,
        service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        securityGroups: [securityGroup],
        open: false,
      },
    );
    // SSM用VPC エンドポイント
    const privateSSMMessagesVpcEndpoint = new ec2.InterfaceVpcEndpoint(
      this,
      "privateSSMMessagesVpcEndpoint",
      {
        vpc: vpc,
        service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        securityGroups: [securityGroup],
        open: false,
      },
    );

    if (this.node.tryGetContext("ragKnowledgeBaseEnabled")) {
      // RAG Presigned URL用S3 VPC エンドポイントも本来必要だが、バックエンドと同じVPCを共有するため、vpcスタックで作成済みのものを利用
      // 名前解決するためのPrivate Host Zoneを作成
      // Route53
      const zone = new route53.PrivateHostedZone(this, "HostedZone", {
        zoneName: dataSourceBucketName + "." + "s3.amazonaws.com",
        vpc: vpc, 
      });

      new route53.ARecord(this, "AliasRecord", {
        recordName: dataSourceBucketName + "." + "s3.amazonaws.com",
        zone: zone,
        target: route53.RecordTarget.fromAlias(
          new route53Targets.InterfaceVpcEndpointTarget(privateS3VpcEndpoint),
        ),
        deleteExisting: true,
      });
    }
    // Private Windows
    const fleetManagerRole = new iam.Role(this, "FleetManagerRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore",
        ),
      ],
    });

    // // キーペア作成
    const keyPair = new ec2.KeyPair(this, "PrivateGenerativeAISampleKeyPair", {
      type: ec2.KeyPairType.RSA,
      format: ec2.KeyPairFormat.PEM,
    });
    // キーペア取得コマンドアウトプット
    new CfnOutput(this, "GetSSHKeyCommand", {
      value: `aws ssm get-parameter --name /ec2/keypair/${keyPair.keyPairId} --region ${this.region} --with-decryption --query Parameter.Value --output text`,
    });

    const windowsInstance = new ec2.Instance(this, "WindowsInstance", {
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MEDIUM,
      ),
      machineImage: ec2.MachineImage.latestWindows(
        ec2.WindowsVersion.WINDOWS_SERVER_2022_ENGLISH_FULL_BASE,
      ),
      vpc: vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroup: securityGroup,
      keyPair: keyPair,
      role: fleetManagerRole, // iamロールを割り当てる
    });
  }
}
