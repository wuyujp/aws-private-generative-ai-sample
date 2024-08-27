import json
import boto3
import os
from datetime import datetime
import logging
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['table_name'])

def lambda_handler(event, context):
    # Log the input event
    logger.info(f"Input event: {json.dumps(event)}")
    
    try:
        # イベントからデータを取得
        body = json.loads(event['body'])
        user_id = body['userID']
        chat_id = body['chatID']
        message = body['message']
        message_type = body['messageType']
        ai_model = body['aiModel']

        # タイムスタンプを生成
        timestamp = int(datetime.now().timestamp() * 1000)  # ミリ秒単位の Unix タイムスタンプ

        # DynamoDB に挿入するアイテムを作成
        item = {
            'UserID': user_id,
            'ChatID': chat_id,
            'Timestamp': timestamp,
            'MessageType': message_type,
            'Message': message,
            'AIModel': ai_model,
            'Metadata': {}  # 必要に応じてメタデータを追加
        }

        # DynamoDB にアイテムを挿入
        table.put_item(Item=item)
        return {
            'statusCode': 200,
            'headers': {
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
        },
            'body': json.dumps({'message': 'Record added successfully'})
        }
    except Exception as e:
        print(f'Error adding record to DynamoDB: {str(e)}')
        return {
            'statusCode': 500,
            'headers': {
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
        },
            'body': json.dumps({'message': 'Error adding record to DynamoDB'})
        }