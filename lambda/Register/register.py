import json
import boto3
import os
from botocore.exceptions import ClientError

def lambda_handler(event, context):
    # リクエストボディからemailとpasswordを取得
    body = json.loads(event['body'])
    username = body['email']
    password = body['password']

    # Cognito クライアントの初期化
    client = boto3.client('cognito-idp')

    # 環境変数からUser Pool IDを取得
    user_pool_id = os.environ['cognito_user_pool_id']
    
    headers = {
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
        }

    try:
        # ユーザー作成
        create_response = client.admin_create_user(
            UserPoolId=user_pool_id,
            Username=username,
            MessageAction='SUPPRESS',
            TemporaryPassword=password,  
            UserAttributes=[
                {
                    'Name': 'email',
                    'Value': username
                },
                {
                    'Name': 'email_verified',
                    'Value': 'true'
                }
            ]
        )

        # パスワード変更せずユーザーをConfirmステータスとする
        set_password_response = client.admin_set_user_password(
            UserPoolId=user_pool_id,
            Username=username,
            Password=password,
            Permanent=True
        )

        return {
            'statusCode': 200,
            'headers' : headers,
            'body': json.dumps('User successfully created and password set')
        }

    except ClientError as e:
        error_message = e.response['Error']['Message']
        print(error_message)

        return {
            'statusCode': 400,
            'headers' : headers,
            'body': json.dumps({'error': error_message})
        }

    except Exception as e:
        print(e)

        return {
            'statusCode': 500,
            'headers' : headers,
            'body': json.dumps({'error': str(e)})
        }