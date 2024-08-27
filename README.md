> [!IMPORTANT]
> This repository is currently under development.

# Private Generative AI Sample 

Private Generative AI Sample は閉域網環境での生成AI利用を加速するサンプルアプリケーションのCDK実装です。

## アーキテクチャ

この実装では、フロントエンドに React を採用し、静的ファイルは Amazon API Gateway + Amazon S3 によって配信されています。バックエンドには Amazon API Gateway + AWS Lambda、認証にはカスタム認証と Amazon Cognito を使用しています。また、LLM は Amazon Bedrock を使用します。RAG は Amazon Bedrock Knowledge Bases, データソースには Amazon OpenSearch Serverless を利用しています。

  <img src="/imgs/arch.png"/>


## ユースケース一覧

<details>
  <summary>チャット</summary>

  大規模言語モデル (LLM) とチャット形式で対話することができます。LLM と直接対話するプラットフォームが存在するおかげで、細かいユースケースや新しいユースケースに迅速に対応することができます。また、プロンプトエンジニアリングの検証用環境としても有効です。

</details>

<details>
   <summary>RAG チャット</summary>

  RAG は LLM が苦手な最新の情報やドメイン知識を外部から伝えることで、本来なら回答できない内容にも答えられるようにする手法です。それと同時に、根拠に基づいた回答のみを許すため、LLM にありがちな「それっぽい間違った情報」を回答させないという効果もあります。例えば、社内ドキュメントを LLM に渡せば、社内の問い合わせ対応が自動化できます。このリポジトリでは Knowledge Base から情報を取得します。

</details>

## デプロイ

> [!IMPORTANT]
> このリポジトリでは、リージョン設定はしておりません。CDKコマンドを実行するAWSプロフィルのリージョンにフロントエンドとバックエンド全部をデプロイします。

まず、以下のコマンドを実行してください。全てのコマンドはリポジトリのルートで実行してください。

```bash
npm ci
```

CDK を利用したことがない場合、初回のみ [Bootstrap](https://docs.aws.amazon.com/ja_jp/cdk/v2/guide/bootstrapping.html) 作業が必要です。すでに Bootstrap された環境では以下のコマンドは不要です。

```bash
npx -w packages/cdk cdk bootstrap
```

`cdk.json`に記載している証明書 `certificateArn` とそのドメイン名 `domainName` は必ず編集してください。その他項目は必要に応じて編集してください。証明書はパブリック証明書でも問題ありません。

続いて、以下のコマンドで AWS リソースをデプロイします。デプロイが完了するまで、お待ちください（20 分程度かかる場合があります）。

```bash
npm run cdk:deploy
```
Cognitoユーザープールでユーザーを作成し、Amazon Bedrockで利用するモデルを申請してください。
[ユーザー作成参考手順](https://zenn.dev/longbridge/articles/56678cbb919d61)

Outpus から `PrivateGenerativeAiSampleClientStack.GetSSHKeyCommand` でSSH Keyを取得し、Fleet ManagerでPrivate SubnetにあるWindowsにRDP接続します。次に `PrivateGenerativeAiSampleAppStack.PrivateApplicationURL` をブラウザーに入力しウェブアプリケーションにアクセスできます。


