import boto3
import json
import logging
import os
from botocore.exceptions import ClientError
from urllib.parse import urlparse

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

def create_s3_presigned_url(response_s3_uri_list):
        
    s3_client = boto3.client('s3')
    expiration = 3600  # URLの有効期限（秒）
    urlList = []
    for s3_uri in set(response_s3_uri_list) :
        # S3 URIをパースしてバケット名とオブジェクトキーを取得
        parsed_uri = urlparse(s3_uri)
        bucket_name = parsed_uri.netloc
        object_key = parsed_uri.path.lstrip('/')
        try:
            url = s3_client.generate_presigned_url('get_object',
                                                   Params={'Bucket': bucket_name,
                                                           'Key': object_key},
                                                   ExpiresIn=expiration)
            s3_dict = {"object_key":object_key, "presigned_url":url}
            urlList.append(s3_dict)                           
        except ClientError as e:
            logger.error("S3 URL作成失敗しました")

    return urlList
    
    
def extract_s3_uris(data):
    s3_uris = set()
    
    for citation in data.get('citations', []):
        for reference in citation.get('retrievedReferences', []):
            location = reference.get('location', {})
            s3_location = location.get('s3Location', {})
            uri = s3_location.get('uri')
            if uri:
                s3_uris.add(uri)
    
    return list(s3_uris)

def generate_message(bedrock_agent_runtime, model_id, knowledge_base_Id, message):
    
    
    response = bedrock_agent_runtime.retrieve_and_generate(
        input={
            'text': message
        },
        retrieveAndGenerateConfiguration={
            'knowledgeBaseConfiguration': {
                'knowledgeBaseId': knowledge_base_Id,
                'modelArn': f'arn:aws:bedrock:{boto3.Session().region_name}::foundation-model/{model_id}',
            },
            'type': 'KNOWLEDGE_BASE'
        }
    )
    logger.info(f"Output: {json.dumps(response)}")

    return response


def lambda_handler(event, context):
    # Log the input event
    logger.info(f"Input event: {json.dumps(event)}")
    
    body = json.loads(event['body'])
    user_prompt = body['prompt']
    aiModel = body['aiModel']

    bedrock_agent_runtime = boto3.client(service_name='bedrock-agent-runtime')
    knowledge_base_Id = os.environ['knowledge_base_Id']

    response = generate_message (bedrock_agent_runtime, aiModel, knowledge_base_Id, user_prompt)
    response_text = response['output']['text']
    response_s3_uri_list = extract_s3_uris(response)
    response_s3_presigned_url_list = create_s3_presigned_url(response_s3_uri_list)
    response_dict = { "text":response_text, "response_s3_presigned_url_list" : response_s3_presigned_url_list}
    
    logger.info(f"Response: {response_dict}")

    return {
        'statusCode': 200,
        'headers': {
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
        },
        'body': json.dumps(response_dict)
    }
