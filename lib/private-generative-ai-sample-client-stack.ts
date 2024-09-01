import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import {CfnOutput, RemovalPolicy, Token} from 'aws-cdk-lib'

interface PrivateGenerativeAISampleClientStackProps extends StackProps {
  vpc : ec2.IVpc;
  securityGroup: ec2.SecurityGroup;
}

export class PrivateGenerativeAISampleClientStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PrivateGenerativeAISampleClientStackProps) {
    super(scope, id, props);
    
    const vpc = props.vpc;
    const securityGroup = props.securityGroup;
    
    // SSM用VPC エンドポイント
    const privateSSMVpcEndpoint = new ec2.InterfaceVpcEndpoint(this, "privateSSMVpcEndpoint", {
      vpc: vpc,
      service: ec2.InterfaceVpcEndpointAwsService.SSM,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [securityGroup],
      open: false,
    });
    // SSM用VPC エンドポイント
    const privateEc2MessagesVpcEndpoint = new ec2.InterfaceVpcEndpoint(this, "privateEc2MessagesVpcEndpoint", {
      vpc: vpc,
      service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [securityGroup],
      open: false,
    });
    // SSM用VPC エンドポイント
    const privateSSMMessagesVpcEndpoint = new ec2.InterfaceVpcEndpoint(this, "privateSSMMessagesVpcEndpoint", {
      vpc: vpc,
      service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [securityGroup],
      open: false,
    });
    // RAG Presigned URL用VPC エンドポイントも本来必要だが、バックエンドと同じVPCを共有するため、vpcスタックで作成済み
    
    // Private Windows
    const fleetManagerRole = new iam.Role(this, 'FleetManagerRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
      ]
    });
    // // キーペア作成
    // const cfnKeyPair = new ec2.CfnKeyPair(this, 'CfnKeyPair', {
    //   keyName: 'test-key-pair',
    // })
    // cfnKeyPair.applyRemovalPolicy(RemovalPolicy.DESTROY)
    //     // キーペア取得コマンドアウトプット
    // new CfnOutput(this, 'GetSSHKeyCommand', {
    //   value: `aws ssm get-parameter --name /ec2/keypair/${cfnKeyPair.getAtt('KeyPairId')} --region ${this.region} --with-decryption --query Parameter.Value --output text`,
    // })
    
    const keyPair = new ec2.KeyPair(this, 'PrivateGenerativeAISampleKeyPair', {
      type: ec2.KeyPairType.RSA,
      format: ec2.KeyPairFormat.PEM,
    });
            // キーペア取得コマンドアウトプット
    new CfnOutput(this, 'GetSSHKeyCommand', {
      value: `aws ssm get-parameter --name /ec2/keypair/${keyPair.keyPairId} --region ${this.region} --with-decryption --query Parameter.Value --output text`,
    })
    
    const windowsInstance = new ec2.Instance(this, 'WindowsInstance', {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
      machineImage: ec2.MachineImage.latestWindows(ec2.WindowsVersion.WINDOWS_SERVER_2022_ENGLISH_FULL_BASE),
      vpc: vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroup: securityGroup,
      keyPair: keyPair,
      role: fleetManagerRole, // iamロールを割り当てる
    });
  }
}
