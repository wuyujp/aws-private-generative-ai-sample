import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { FrontendWeb } from "./construct/frontend-web";
import { BackendApi } from "./construct/backend-api";

interface PrivateGenerativeAISampleAppStackProps extends StackProps {
  vpc: ec2.IVpc;
  securityGroup: ec2.SecurityGroup;
  privateApiVpcEndpoint: ec2.InterfaceVpcEndpoint;
  privateApiVpcEndpointIpAdressList: string[];
  dataSourceBucketName?: string;
  knowledgeBaseId?: string;
}

export class PrivateGenerativeAISampleAppStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: PrivateGenerativeAISampleAppStackProps,
  ) {
    super(scope, id, props);

    const { vpc, securityGroup, privateApiVpcEndpoint, privateApiVpcEndpointIpAdressList, dataSourceBucketName, knowledgeBaseId } = props;

    const certificateArn: string | null | undefined =
      this.node.tryGetContext("certificateArn")!;

    if (typeof certificateArn !== "string") {
      throw new Error("ACM certification が指定されていません");
    }

    const domainName: string | null | undefined =
      this.node.tryGetContext("domainName")!;

    if (typeof domainName !== "string") {
      throw new Error("ドメイン名 が指定されていません");
    }

    const subDomainName: string | null | undefined =
      this.node.tryGetContext("subDomainName")!;

    if (typeof subDomainName !== "string") {
      throw new Error("サブドメイン名 が指定されていません");
    }

    const textModelId: string | null | undefined =
      this.node.tryGetContext("textModelId")!;

    if (typeof textModelId !== "string") {
      throw new Error("テキストモーデル が指定されていません");
    }

    const backendApi = new BackendApi(this, "BackendApi", {
      vpc: vpc,
      securityGroup: securityGroup,
      privateApiVpcEndpoint: privateApiVpcEndpoint,
      dataSourceBucketName: dataSourceBucketName,
      knowledgeBaseId: knowledgeBaseId,
    });

    const frontendWeb = new FrontendWeb(this, "FrontendWeb", {
      vpc: vpc,
      securityGroup: securityGroup,
      privateApiVpcEndpoint: privateApiVpcEndpoint,
      privateApiVpcEndpointIpAdressList: privateApiVpcEndpointIpAdressList,
      domainName: domainName,
      subDomainName: subDomainName,
      certificateArn: certificateArn,
      apiURL: backendApi.apiURL,
      textModelId: textModelId,
    });

    // 出力
    new cdk.CfnOutput(this, 'PrivateApplicationURL', {
      value: "https://" + subDomainName + "." + domainName,
      description: 'PrivateApplicationURL',
    });
  }
}
