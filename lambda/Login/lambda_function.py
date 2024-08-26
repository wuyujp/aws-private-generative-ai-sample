import json
import os
import boto3
import jwt
from datetime import datetime, timedelta

def lambda_handler(event, context):
    
    body = json.loads(event['body'])
    email = body['email']  # 'username'の代わりに'email'を使用
    password = body['password']
    headers = {
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
            }
    client = boto3.client('cognito-idp')
    try:
        response = client.initiate_auth(
            ClientId=os.environ['cognito_client_id'],
            AuthFlow='USER_PASSWORD_AUTH',
            AuthParameters={
                'USERNAME': email,  # 'USERNAME'パラメータにemailを使用
                'PASSWORD': password
            }
        )
    
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'message': 'Authentication successful',
                'token': response['AuthenticationResult']['IdToken'],
            })
            }
    except client.exceptions.NotAuthorizedException:
        return {
            'statusCode': 401,
            'headers': headers,
            'body': json.dumps({'message': 'Login failed'})
        }
    except client.exceptions.UserNotFoundException:
        return {
            'statusCode': 404,
            'headers': headers,
            'body': json.dumps({'message': 'User not found'})
        }
    except Exception as e:
        print(f"Login error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'message': 'Internal server error'})
        }