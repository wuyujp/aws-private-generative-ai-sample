import { Construct } from 'constructs';
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";

import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

export interface ChatHistoryProps {
  vpc: ec2.IVpc;
  securityGroup: ec2.SecurityGroup;
  authorizer: apigw.TokenAuthorizer;
  privateBackEndApi: apigw.LambdaRestApi;
}

export class ChatHistory extends Construct {

  readonly modelIds: string[];


  constructor(scope: Construct, id: string, props: ChatHistoryProps) {
    super(scope, id);

    const { vpc, securityGroup, privateBackEndApi, authorizer } = props;
    // DynamoDB作成
    // Chat History DynamoDB テーブルの作成
    const table = new dynamodb.Table(this, "AIChatHistoryTable", {
      tableName: 'PrivateGenerativeAISample' + "ChatHistory",
      partitionKey: { name: "UserID", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "ChatID", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // オンデマンドキャパシティモード
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // グローバルセカンダリインデックス（GSI）の追加
    table.addGlobalSecondaryIndex({
      indexName: "ChatID-Timestamp-Index",
      partitionKey: { name: "ChatID", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "Timestamp", type: dynamodb.AttributeType.NUMBER },
    });

    const lambdaAddChatHistoryRole = new iam.Role(
      this,
      "LambdaAddChatHistoryRole",
      {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSLambdaBasicExecutionRole",
          ),
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSLambdaVPCAccessExecutionRole",
          ),
        ],
      },
    );

    const lambdaFunctionAddChatHistory = new lambda.Function(
      this,
      "MyLambdaAddChatHistory",
      {
        runtime: lambda.Runtime.PYTHON_3_10,
        code: lambda.Code.fromAsset("lambda/AddChatHistory"),
        handler: "lambda_function.lambda_handler",
        role: lambdaAddChatHistoryRole,
        timeout: cdk.Duration.seconds(300), // タイムアウトを5分（300秒）に設定
        environment: {
          table_name: table.tableName,
        },
        vpc: vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        allowPublicSubnet: false,
        securityGroups: [securityGroup], // Security Group
      },
    );
    table.grantWriteData(lambdaFunctionAddChatHistory);

    const addChatHistoryItems = privateBackEndApi.root.addResource("addChatHistory");
    addChatHistoryItems.addMethod(
      "POST",
      new apigw.LambdaIntegration(lambdaFunctionAddChatHistory),
            { authorizer: authorizer,
      authorizationType: apigw.AuthorizationType.CUSTOM,},
    );
    
    
  }
}