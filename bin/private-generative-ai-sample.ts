#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { PrivateGenerativeAISampleAppStack } from "../lib/private-generative-ai-sample-app-stack";
import { PrivateGenerativeAISampleRagStack } from "../lib/private-generative-ai-sample-rag-stack";
import { PrivateGenerativeAISampleClientStack } from "../lib/private-generative-ai-sample-client-stack";
import { PrivateGenerativeAISampleVpcStack } from "../lib/private-generative-ai-sample-vpc-stack";

const app = new cdk.App();

const privateGenerativeAISampleVpcStack = new PrivateGenerativeAISampleVpcStack(
  app,
  "PrivateGenerativeAISampleVpcStack",
  {},
);

const ragKnowledgeBaseEnabled =
  app.node.tryGetContext("ragKnowledgeBaseEnabled") || false;
const privateGenerativeAISampleRagStack = ragKnowledgeBaseEnabled
  ? new PrivateGenerativeAISampleRagStack(
      app,
      "PrivateGenerativeAISampleRagStack",
      {
        vpc: privateGenerativeAISampleVpcStack.vpc,
        securityGroup: privateGenerativeAISampleVpcStack.securityGroup,
        privateOssVpcEndpoint: privateGenerativeAISampleVpcStack.privateOssVpcEndpoint,
      },
    )
  : null;

const privateGenerativeAISampleAppStack = new PrivateGenerativeAISampleAppStack(
  app,
  "PrivateGenerativeAISampleAppStack",
  {
    vpc: privateGenerativeAISampleVpcStack.vpc,
    dataSourceBucketName:
      privateGenerativeAISampleRagStack?.dataSourceBucketName,
    knowledgeBaseId: privateGenerativeAISampleRagStack?.knowledgeBaseId,
    securityGroup: privateGenerativeAISampleVpcStack.securityGroup,
    privateApiVpcEndpoint: privateGenerativeAISampleVpcStack.privateApiVpcEndpoint,
    privateApiVpcEndpointIpAdressList: privateGenerativeAISampleVpcStack.privateApiVpcEndpointIpAdressList,
  },
);

const privateClientEnabled =
  app.node.tryGetContext("privateClientEnabled") || false;
const privateGenerativeAISampleClientStack = privateClientEnabled
  ? new PrivateGenerativeAISampleClientStack(
      app,
      "PrivateGenerativeAISampleClientStack",
      {
        vpc: privateGenerativeAISampleVpcStack.vpc,
        securityGroup: privateGenerativeAISampleVpcStack.securityGroup,
        dataSourceBucketName:
      privateGenerativeAISampleRagStack?.dataSourceBucketName,
      privateS3VpcEndpoint : privateGenerativeAISampleVpcStack.privateS3VpcEndpoint,
      },
    )
  : null;
