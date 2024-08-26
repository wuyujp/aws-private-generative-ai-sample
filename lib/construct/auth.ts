import { Construct } from 'constructs';
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import {
  UserPool,
} from 'aws-cdk-lib/aws-cognito';
import { Duration } from 'aws-cdk-lib';


export interface AuthProps {
  privateBackEndApi: apigw.LambdaRestApi;
}

export class Auth extends Construct {

  readonly authorizer: apigw.TokenAuthorizer;

  constructor(scope: Construct, id: string, props: AuthProps) {
    super(scope, id);

    const { privateBackEndApi } = props;
    
    //Cgnito User Pool作成
    const userPool = new UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: {
        username: false,
        email: true,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        requireUppercase: true,
        requireSymbols: true,
        requireDigits: true,
        minLength: 8,
      },
    });

    const client = userPool.addClient('client', {
      idTokenValidity: Duration.days(1),
      generateSecret: false,
      authFlows: {
        adminUserPassword: true,
        userPassword: true,
        userSrp: true,
      },
    });
    
    // Lambda Authorizer IAMロール作成
    const lambdaAuthRole = new iam.Role(this, "lambdaAuthRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaVPCAccessExecutionRole",
        ),
      ],
    });

    // Lambda Authorizer 関数の作成
    const lambdaFunctionAuthorizer = new lambda.Function(
      this,
      "MyLambdaAuthorizer",
      {
        runtime: lambda.Runtime.PYTHON_3_10,
        code: lambda.Code.fromAsset("lambda/Authorizer"),
        handler: "lambda_function.lambda_handler",
        role: lambdaAuthRole,
        timeout: cdk.Duration.seconds(300), // タイムアウトを5分（300秒）に設定
        environment: {
        //table_name: userTable.tableName,
        cognito_client_id:client.userPoolClientId,
        cognito_user_pool_id:userPool.userPoolId
      },
        // vpc: vpc,
        // vpcSubnets: {
        //   subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        // },
        // allowPublicSubnet: false,
        // securityGroups: [securityGroup],
      },
    );

    // Lambda Authorizer の作成
    this.authorizer = new apigw.TokenAuthorizer(this, "ApiAuthorizer", {
      handler: lambdaFunctionAuthorizer,
      // resultsCacheTtl : Duration.seconds(300)
    });
    
    

    // // User DynamoDBテーブルの作成
    // const userTable = new dynamodb.Table(this, "UserTable", {
    //   tableName: 'PrivateGenerativeAISample' + "Users",
    //   partitionKey: { name: "UserId", type: dynamodb.AttributeType.STRING },
    //   //sortKey: { name: 'Email', type: dynamodb.AttributeType.STRING },
    //   billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // オンデマンドキャパシティモード
    //   removalPolicy: cdk.RemovalPolicy.DESTROY,
    // });

    // // テーブル名をCloudFormationの出力に追加
    // new cdk.CfnOutput(this, "UserTableName", {
    //   value: userTable.tableName,
    //   description: "The name of the user table",
    //   exportName: "UserTableName",
    // });

    // ログインのLambda関数を追加
    const lambdaFunctionLogin = new lambda.Function(this, "MyLambdaLogin", {
      runtime: lambda.Runtime.PYTHON_3_10,
      code: lambda.Code.fromAsset("lambda/Login"),
      handler: "lambda_function.lambda_handler",
      role: lambdaAuthRole,
      timeout: cdk.Duration.seconds(300), // タイムアウトを5分（300秒）に設定
      environment: {
        //table_name: userTable.tableName,
        cognito_client_id:client.userPoolClientId,
      },
      // vpc: vpc,
      // vpcSubnets: {
      //   subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      // },
      // allowPublicSubnet: false,
      // securityGroups: [securityGroup],
    });
    //userTable.grantReadWriteData(lambdaFunctionLogin);
        // Lambda関数にCognitoの権限を付与
    lambdaFunctionLogin.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:InitiateAuth'],
      resources: [userPool.userPoolArn],
    }));

    // 出力
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'The id of the user pool',
    });
    
    const loginItems = privateBackEndApi.root.addResource("login");
    loginItems.addMethod("POST", new apigw.LambdaIntegration(lambdaFunctionLogin));
  }
}