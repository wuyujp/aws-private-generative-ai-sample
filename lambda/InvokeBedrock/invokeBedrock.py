import boto3
import json
import logging
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

def generate_message(bedrock_runtime, model_id, system_prompt, messages, max_tokens):

    body=json.dumps(
        {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "system": system_prompt,
            "messages": messages
        }  
    )  

    
    response = bedrock_runtime.invoke_model(body=body, modelId=model_id)
    response_body = json.loads(response.get('body').read())
   
    return response_body


def lambda_handler(event, context):
    # Log the input event
    logger.info(f"Input event: {json.dumps(event)}")
    body = json.loads(event['body'])
    user_prompt = body['prompt']
    aiModel = body['aiModel']

    bedrock_runtime = boto3.client(service_name='bedrock-runtime')

    system_prompt = "あなたは優秀なAIアシスタントです。"
    max_tokens = 1000

    # Prompt with user turn only.

    user_message =  {"role": "user", "content": user_prompt}
    messages = [user_message]

    response = generate_message (bedrock_runtime, aiModel, system_prompt, messages, max_tokens)

    print(json.dumps(response, indent=4))
    return {
        'statusCode': 200,
        'headers': {
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
        },
        'body': json.dumps(response["content"][0]["text"])
    }
