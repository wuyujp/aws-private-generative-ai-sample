import boto3
import json
import logging
from botocore.exceptions import ClientError
import re

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

def convert_to_list(input_string):
    # 文字列を<User: >と<Assistant: >で分割
    parts = re.split(r'(User: |Assistant: )', input_string)
    
    # 空の要素を削除
    parts = [part for part in parts if part.strip()]
    
    result = []
    for i in range(0, len(parts), 2):
        role = parts[i].strip(': ').lower()
        content = parts[i+1].strip()
        
        result.append({
            "role": role,
            "content": [
                {
                    "text": content
                }
            ]
        })
    
    return result

def generate_message_converse(bedrock_runtime, model_id, system_prompt, messages, max_tokens):
    
    inferenceConfig = {
        "temperature": 0.1,
        "topP": 0.9,
        "maxTokens": max_tokens,
        "stopSequences":[]
    }
    
    response = bedrock_runtime.converse(
        modelId=model_id ,
        messages=messages,
        inferenceConfig=inferenceConfig
    )
   
    return response["output"]["message"]


def lambda_handler(event, context):
    # Log the input event
    logger.info(f"Input event: {json.dumps(event)}")
    body = json.loads(event['body'])
    user_prompt = body['prompt']
    aiModel = body['aiModel']
    
    bedrock_runtime = boto3.client("bedrock-runtime")

    system_prompt = "あなたは優秀なAIアシスタントです。"
    max_tokens = 1000

    # Prompt with user turn only.
    # InvokeBedrock
    #messages =  [{"role": "user", "content": user_prompt}]
    # Converse
    messages = convert_to_list(user_prompt)

    response = generate_message_converse (bedrock_runtime, aiModel, system_prompt, messages, max_tokens)

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
