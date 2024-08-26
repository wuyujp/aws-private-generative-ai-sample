import json
import time
import urllib.request
from jose import jwk, jwt
from jose.utils import base64url_decode
import boto3
import os

# 注意: これは簡略化された例です。本番環境では適切なエラーハンドリングと最適化が必要です。
def lambda_handler(event, context):
    token = event['authorizationToken'].split(' ')[1]
    
    # Cognitoユーザープールの設定
    region = boto3.Session().region_name
    user_pool_id = os.environ['cognito_user_pool_id']
    app_client_id = os.environ['cognito_client_id']
    keys_url = f'https://cognito-idp.{region}.amazonaws.com/{user_pool_id}/.well-known/jwks.json'

    # 公開鍵の取得
    with urllib.request.urlopen(keys_url) as f:
        response = f.read()
    keys = json.loads(response.decode('utf-8'))['keys']

    # トークンのヘッダーとペイロードをデコード
    headers = jwt.get_unverified_headers(token)
    claims = jwt.get_unverified_claims(token)

    # トークンの有効期限をチェック
    if time.time() > claims['exp']:
        raise Exception('Token is expired')

    # トークンの対象者（aud）をチェック
    if claims['aud'] != app_client_id:
        raise Exception('Token was not issued for this audience')

    # 署名を検証
    public_key = next(key for key in keys if key["kid"] == headers['kid'])
    key = jwk.construct(public_key)
    message, encoded_signature = str(token).rsplit('.', 1)
    decoded_signature = base64url_decode(encoded_signature.encode('utf-8'))
    if not key.verify(message.encode("utf8"), decoded_signature):
        raise Exception('Signature verification failed')

    # ここまでくれば認証成功
    return {
        'principalId': claims['sub'],
        'policyDocument': {
            'Version': '2012-10-17',
            'Statement': [{
                'Action': 'execute-api:Invoke',
                'Effect': 'Allow',
                'Resource': event['methodArn']
            }]
        }
    }