import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import { ChatHistory } from "./chat-history";
import { Auth } from "./auth";
import { Bedrock } from "./bedrock";

export interface BackendApiProps {
  vpc: ec2.IVpc;
  securityGroup: ec2.SecurityGroup;
  privateApiVpcEndpoint: ec2.InterfaceVpcEndpoint;
  dataSourceBucketName?: string;
  knowledgeBaseId?: string;
}

export class BackendApi extends Construct {
  readonly apiURL: string;

  constructor(scope: Construct, id: string, props: BackendApiProps) {
    super(scope, id);

    const { vpc, securityGroup, privateApiVpcEndpoint, dataSourceBucketName, knowledgeBaseId } = props;

    const privateBackEndApi = new apigw.RestApi(
      this,
      "PrivateGenerativeAISampleBackendApi",
      {
        endpointConfiguration: {
          types: [apigw.EndpointType.PRIVATE],
          vpcEndpoints: [privateApiVpcEndpoint],
        },
        defaultCorsPreflightOptions: {
          allowOrigins: apigw.Cors.ALL_ORIGINS,
          allowMethods: apigw.Cors.ALL_METHODS,
          allowHeaders: apigw.Cors.DEFAULT_HEADERS,
          statusCode: 200,
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
      },
    );

    this.apiURL = privateBackEndApi.url;

    const auth = new Auth(this, "Auth", {
      privateBackEndApi: privateBackEndApi,
    });

    new Bedrock(this, "Bedrock", {
      vpc: vpc,
      securityGroup: securityGroup,
      authorizer: auth.authorizer,
      privateBackEndApi: privateBackEndApi,
      dataSourceBucketName: dataSourceBucketName,
      knowledgeBaseId: knowledgeBaseId,
    });

    new ChatHistory(this, "ChatHistory", {
      vpc: vpc,
      securityGroup: securityGroup,
      authorizer: auth.authorizer,
      privateBackEndApi: privateBackEndApi,
    });
  }
}
