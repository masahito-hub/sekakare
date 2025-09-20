# デプロイ設定ガイド

## 概要
このプロジェクトでは、GitHub Actionsを使用して自動的にAPIキーを注入し、本番環境にデプロイします。

## セットアップ手順

### 1. GitHub Secretsの設定

リポジトリの Settings > Secrets and variables > Actions で以下のシークレットを設定してください：

- `GOOGLE_PLACES_API_KEY`: Google Places APIキー ✅ (設定済み)
- `FTP_HOST`: FTPサーバーホスト
- `FTP_USERNAME`: FTPユーザー名
- `FTP_PASSWORD`: FTPパスワード

### 2. デプロイワークフローの更新

`deploy-workflow-example.yml` の内容を `.github/workflows/deploy.yml` にコピーしてください。

```bash
# リポジトリ管理者が実行:
cp deploy-workflow-example.yml .github/workflows/deploy.yml
git add .github/workflows/deploy.yml
git commit -m "feat: Add API key injection to deploy workflow"
git push
```

### 3. デプロイの流れ

1. `main`ブランチへのプッシュ時、または手動でワークフローをトリガー
2. GitHub Actionsが自動的に：
   - `config.template.js` から `config.js` を生成
   - GitHub Secretsから APIキーを注入
   - FTP経由で本番サーバーにデプロイ

## セキュリティ

- APIキーは GitHub Secrets に安全に保存されます
- `config.js` はリポジトリにコミットされません（.gitignore で除外）
- デプロイ時にのみ `config.js` が生成されます
- `config.template.js` はテンプレートファイルとしてリポジトリに含まれます

## トラブルシューティング

### APIキーが設定されていないエラー
GitHub Secrets に `GOOGLE_PLACES_API_KEY` が正しく設定されているか確認してください。

### FTPデプロイの失敗
FTP認証情報（HOST, USERNAME, PASSWORD）が正しく設定されているか確認してください。

## ローカル開発

ローカル開発環境では、手動で `config.js` を作成する必要があります：

```bash
cp assets/js/config.template.js assets/js/config.js
# エディタで config.js を開き、APIキーを設定
```