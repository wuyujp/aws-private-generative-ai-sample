import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import { Duration } from "aws-cdk-lib";

export interface AuthProps {
  privateBackEndApi: apigw.LambdaRestApi;
}

export class Auth extends Construct {
  readonly authorizer: apigw.CognitoUserPoolsAuthorizer;

  constructor(scope: Construct, id: string, props: AuthProps) {
    super(scope, id);

    const { privateBackEndApi } = props;

    //Cgnito User Pool作成
    const userPool = new UserPool(this, "UserPool", {
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

    const client = userPool.addClient("client", {
      idTokenValidity: Duration.days(1),
      generateSecret: false,
      authFlows: {
        adminUserPassword: true,
        userPassword: true,
        userSrp: true,
      },
    });

    // 出力
    new cdk.CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
      description: "The id of the user pool",
    });

    // LambdaのIAMロール作成
    const lambdaAuthRole = new iam.Role(this, "lambdaAuthRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),
      ],
    });

    // ロールにCognitoの権限を付与
    lambdaAuthRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "cognito-idp:InitiateAuth",
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminSetUserPassword",
        ],
        resources: [userPool.userPoolArn],
      }),
    );

    // Cognito Authorizer の作成
    this.authorizer = new apigw.CognitoUserPoolsAuthorizer(this, 'CognitoApiAuthorizer', {
      cognitoUserPools: [userPool],
      resultsCacheTtl: Duration.minutes(5),
      identitySource: 'method.request.header.Authorization',
    });

    // ログインのLambda関数を追加
    const lambdaFunctionLogin = new lambda.Function(this, "MyLambdaLogin", {
      runtime: lambda.Runtime.PYTHON_3_10,
      code: lambda.Code.fromAsset("lambda/Login"),
      handler: "login.lambda_handler",
      role: lambdaAuthRole,
      timeout: cdk.Duration.seconds(300), // タイムアウトを5分（300秒）に設定
      environment: {
        cognito_client_id: client.userPoolClientId,
      },
    });
    // Lambda関数にCognitoの権限を付与
    lambdaFunctionLogin.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cognito-idp:InitiateAuth"],
        resources: [userPool.userPoolArn],
      }),
    );
    // ユーザー登録Lambda
    const lambdaFunctionRegister = new lambda.Function(
      this,
      "MyLambdaRegister",
      {
        runtime: lambda.Runtime.PYTHON_3_10,
        code: lambda.Code.fromAsset("lambda/Register"),
        handler: "register.lambda_handler",
        role: lambdaAuthRole,
        timeout: cdk.Duration.seconds(300), // タイムアウトを5分（300秒）に設定
        environment: {
          cognito_user_pool_id: userPool.userPoolId,
        },
      },
    );

    const loginItems = privateBackEndApi.root.addResource("login");
    loginItems.addMethod(
      "POST",
      new apigw.LambdaIntegration(lambdaFunctionLogin),
    );

    const registerItems = privateBackEndApi.root.addResource("register");
    registerItems.addMethod(
      "POST",
      new apigw.LambdaIntegration(lambdaFunctionRegister),
    );
  }
}
