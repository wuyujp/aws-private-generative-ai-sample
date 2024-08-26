# Private Generative AI Sample 

Private Generative AI Sample は閉域網環境での生成AI利用を加速するサンプルアプリケーションのCDK実装です。

## アーキテクチャ

この実装では、フロントエンドに React を採用し、静的ファイルは Amazon API Gateway + Amazon S3 によって配信されています。バックエンドには Amazon API Gateway + AWS Lambda、認証にはカスタム認証と Amazon Cognito を使用しています。また、LLM は Amazon Bedrock を使用します。RAG は Amazon Bedrock Knowledge Bases, データソースには Amazon OpenSearch Serverless を利用しています。

## デプロイ

> [!IMPORTANT]
> このリポジトリでは、リージョン設定はしておりません。CDKコマンドを実行するAWSプロフィルのリージョンにフロントエンドとバックエンドをデプロイします。

まず、以下のコマンドを実行してください。全てのコマンドはリポジトリのルートで実行してください。

```bash
npm ci
```

CDK を利用したことがない場合、初回のみ [Bootstrap](https://docs.aws.amazon.com/ja_jp/cdk/v2/guide/bootstrapping.html) 作業が必要です。すでに Bootstrap された環境では以下のコマンドは不要です。

```bash
npx -w packages/cdk cdk bootstrap
```

cdk.jsonに記載している証明書 certificateArn とそのドメイン名 domainName は必ず編集してください。その他項目は必要に応じて編集してください。

続いて、以下のコマンドで AWS リソースをデプロイします。デプロイが完了するまで、お待ちください（20 分程度かかる場合があります）。

```bash
npm run cdk:deploy
```
Cognitoユーザープールでユーザーを作成し、Amazon Bedrockで利用するモデルを申請してください。
[ユーザー作成参考手順](https://zenn.dev/longbridge/articles/56678cbb919d61)

Outpus から `PrivateGenerativeAiSampleClientStack.GetSSHKeyCommand` でSSH Keyを取得し、Fleet ManagerでPrivate SubnetにあるWindowsにRDP接続します。次に `PrivateGenerativeAiSampleAppStack.PrivateApplicationURL` をブラウザーに入力しウェブアプリケーションにアクセスできます。


