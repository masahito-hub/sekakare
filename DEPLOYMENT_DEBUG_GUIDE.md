# APIキー設定デバッグガイド

## 🔍 現在の問題

APIキーが本番環境で正しく読み込まれていない問題が発生しています。

## 📊 診断ツール

作成した `debug-config.html` をブラウザで開くことで、以下を確認できます：

1. config.js が正しく読み込まれているか
2. APIキーが設定されているか
3. APIキーがプレースホルダーのままではないか

### 使用方法

1. デプロイ後、ブラウザで `https://sekakare.life/debug-config.html` にアクセス
2. 表示される情報を確認：
   - 🟢 緑のメッセージ: 正常
   - 🔴 赤のメッセージ: 問題あり

## 🔧 確認すべきポイント

### 1. GitHub Secretsの確認

GitHub リポジトリの Settings → Secrets → Actions で以下を確認：

- Secret名: `GOOGLE_PLACES_API_KEY`（大文字小文字も正確に）
- 値: `AIzaSyD-yu-HTOD1zxQem8aPBUx46OQys1aMkhg`

### 2. デプロイワークフローの確認

`.github/workflows/deploy.yml` の19-20行目が以下のようになっているか確認：

```yaml
# GitHub SecretsのAPIキーを挿入
sed -i "s/YOUR_API_KEY_HERE/${{ secrets.GOOGLE_PLACES_API_KEY }}/g" assets/js/config.js
```

### 3. GitHub Actionsのログ確認

1. リポジトリの Actions タブを開く
2. 最新の "Deploy to Xserver" ワークフローを選択
3. ログで以下を確認：
   - "✅ config.js generated with API key from GitHub Secrets" が表示されているか
   - エラーメッセージがないか

## 🚀 問題解決の手順

### ケース1: APIキーがプレースホルダーのまま

**原因**: GitHub Secretsが正しく設定されていない、またはsed コマンドが失敗

**解決方法**:
1. GitHub Secretsの名前と値を再確認
2. Secretを削除して再作成（コピペミスを防ぐため）
3. mainブランチに再プッシュしてデプロイを実行

### ケース2: config.js が見つからない

**原因**: FTPアップロードが失敗、またはパスが間違っている

**解決方法**:
1. FTP設定を確認（FTP_HOST, FTP_USERNAME, FTP_PASSWORD）
2. `server-dir: /sekakare.life/public_html/` が正しいか確認
3. FTPクライアントで手動確認

### ケース3: APIキーは設定されているがマップが表示されない

**原因**: Google Cloud Console側の設定問題

**解決方法**:
1. Google Cloud Consoleにログイン
2. 以下のAPIが有効になっているか確認：
   - Maps JavaScript API
   - Places API
3. APIキーの制限設定を確認（HTTPリファラーなど）

## 📝 手動テスト方法

1. **ローカルでのテスト**
```bash
cp assets/js/config.template.js assets/js/config.js
# config.js を編集してAPIキーを設定
# ローカルサーバーで動作確認
```

2. **本番環境でのテスト**
   - デプロイ後、開発者ツールのコンソールを開く
   - エラーメッセージを確認
   - Network タブで Google Maps API の読み込み状態を確認

## 🔄 デプロイの再実行

問題を修正したら、以下の手順でデプロイを再実行：

1. mainブランチに空のコミットをプッシュ:
```bash
git commit --allow-empty -m "Trigger deployment"
git push origin main
```

2. または GitHub Actions から手動実行：
   - Actions → Deploy to Xserver → Run workflow

## 💡 追加のデバッグ機能

`config.template.js` に以下のデバッグ機能を追加しました：

- APIキーの長さをコンソールに表示
- APIキーの最初の10文字を表示（セキュリティのため一部のみ）
- エラー時の詳細メッセージ

これにより、ブラウザのコンソールで問題を特定しやすくなります。