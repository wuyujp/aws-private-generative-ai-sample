> [!IMPORTANT]
> This repository is currently under development.

# Private Generative AI Sample 

Private Generative AI Sample は閉域網環境での生成AI利用を加速するサンプルアプリケーションのCDK実装です。

## アーキテクチャ

この実装では、フロントエンドに React を採用し、静的ファイルは Amazon API Gateway + Amazon S3 によって配信されています。バックエンドには Amazon API Gateway + AWS Lambda、認証にはカスタム認証と Amazon Cognito を使用しています。また、LLM は Amazon Bedrock を使用します。RAG は Amazon Bedrock Knowledge Bases、 データソースには Amazon OpenSearch Serverless を利用しています。

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

## cdk.jsonの編集

編集が **必須** の項目

- certificateArn
  - AWS Certificate Manager に登録された証明書。証明書はパブリック証明書でも問題ありません。
- domainName
  - 証明書のドメイン名

> [!IMPORTANT]
> ウェブアプリケーションへのアクセスにHTTPS通信が必須のため証明書は必要です。認証されたドメインの証明書登録が難しい場合は、信頼されていないドメインへのアクセスを許可する前提で、自己証明書も一応利用可能です。自己証明書の登録手順はこちらご参照ください。[CloudShellでサクッと自己証明書を作成してACMにインポートする](https://dev.classmethod.jp/articles/aws-acm-import-cloudshell/)

<img src="/imgs/acm.png"/>

編集が **任意** の項目

- ragKnowledgeBaseEnabled
  - RAG 関連のリソースを利用する場合は`true`を設定します。
- privateClientEnabled
  - 閉域アプリケーションにアクセスする Windows クライアントを利用する場合は`true`を設定します。
- embeddingModelId
  - Amazon Bedrock Knowledge bases が利用する Embedding Model。単一モデルのみ選択可能です。
- textModelId
   - Amazon Bedrock が利用する Text Model。現時点は単一モデルのみ選択可能です。
- subdomainName
  - アプリケーションのサブドメイン名。 `<subdomainName>.<domainName>` が閉域アプリケーションのアクセスURLとなります。
## デプロイ

> [!IMPORTANT]
> このリポジトリでは、リージョン設定はしておりません。CDKコマンドを実行するAWSプロフィルのリージョンにフロントエンドとバックエンド全部をデプロイします。

まず、以下のコマンドを実行してください。全てのコマンドはリポジトリのルートで実行してください。

```bash
npm run ci:all
```

CDK を利用したことがない場合、初回のみ [Bootstrap](https://docs.aws.amazon.com/ja_jp/cdk/v2/guide/bootstrapping.html) 作業が必要です。すでに Bootstrap された環境では以下のコマンドは不要です。

```bash
npm run cdk:bootstrap
```

続いて、以下のコマンドで AWS リソースをデプロイします。デプロイが完了するまで、お待ちください（30 分程度かかる場合があります）。

```bash
npm run cdk:deploy
```

## 利用手順

1. 利用するリージョンの Amazon Bedrock のコンソールから利用する Embedding Model と Text Model を有効化します。
2. Amazon Bedrock Knowledge bases のコンソール画面でデータソースを選択して Sync を実施します。
3. CDK / Cloudformation の Outputs から `PrivateGenerativeAiSampleClientStack.GetSSHKeyCommand` で SSH Key を取得し、Fleet Manager で Private Subnet にある Windows に RDP 接続します。
4. 同じ Outputs から `PrivateGenerativeAiSampleAppStack.PrivateApplicationURL` の URL をブラウザーに入力しウェブアプリケーションにアクセスします。
5. アプリの Register 画面からユーザーを作成し、そのユーザーでLoginできます。
6. Chat または RagChat を選択して生成 AI と会話しましょう。

## 削除手順

```bash
npm run cdk:destroy 
```
全タスク削除の確認が出ってきましたら `y` を入力してください。

## 月額料金試算
### この構成例の概算料金：
443.41 ドル (月額)

| サービス名 | 項目 | 数量 | 単価 | 料金
| ---- | ---- | ---- | ---- | ---- |
| Amazon Bedrock | Claude 3.5 Sonnet 入力トークン | 11,000,000 トークン | 0.003 USD/1000 トークンあたり | 33 |
| | Claude 3.5 Sonnet 出力トークン | 4,400,000 トークン | 0.015 USD/1000 トークンあたり | 66 |
| OpenSearch Serverless | OpenSearch Compute Unit (OCU) | 1 OCU | 0.334 USD/OCU 1 時間あたり | 243.82 |
| | マネージドストレージ | 50 GB | 0.026 USD/GB 1ヶ月あたり | 1.3 |
| Amazon VPC エンドポイント | エンドポイント数 | 7 個 | 0.014 USD/エンドポイント 1 時間あたり | 71.54 |
| | 処理されるデータ | 100 GB | 0.01 USD/GB | 1 |
| Application Load Balancer | Load Balancer Capacity Units (LCU)| 1 LCU | 0.008 USD/LCU 1 時間あたり | 22.42 |
| Amazon API Gateway | REST API リクエスト数 | 15,000 リクエスト | 4.25 USD/100 万リクエスト | 0.06 |
| AWS Lambda | 割り当てたメモリと実行時間	| 37,500 GB-秒 | 0.000016667 USD/GB-秒あたり | 0.63 |
| Amazon DynamoDB | オンデマンド 書き込み要求単位 (WRU)	| 1,000,000 WRU	 | 1.4269 USD/100 万 | 1.43 |
| | ストレージ | 5 GB | 0.285 USD/GB	 | 1.43 |
| Amazon Cognito | アクティブユーザー数 | 50 ユーザー | 0.0055 USD/ユーザー | 0.28 |
| Amazon Route 53 | ホストゾーン | 1 個 | 0.5 USD/月 | 0.5 |