# APIキーの設定ガイド

このドキュメントでは、セカカレアプリケーションでGoogle Places APIキーを安全に設定する方法を説明します。

## 🔐 セキュリティ重要事項

**絶対にAPIキーを直接GitHubにコミットしないでください！**
- APIキーは機密情報です
- 公開リポジトリにコミットすると、誰でもアクセス可能になります
- 悪用されると高額な請求が発生する可能性があります

## 🛠️ ローカル開発環境での設定

### 1. config.jsファイルの作成

```bash
# テンプレートファイルをコピー
cp assets/js/config.template.js assets/js/config.js
```

### 2. APIキーの設定

`assets/js/config.js` を開き、APIキーを設定：

```javascript
// 変更前
API_KEY: 'YOUR_API_KEY_HERE',

// 変更後（実際のAPIキーに置き換え）
API_KEY: 'あなたのAPIキー',
```

### 3. 確認事項

- ✅ `assets/js/config.js` は `.gitignore` に追加されています
- ✅ 誤ってコミットされることはありません
- ✅ 各開発者が個別に設定する必要があります

## 🚀 本番環境での設定

### 方法1: GitHub Actions + GitHub Secrets（推奨）

1. GitHub リポジトリの Settings → Secrets and variables → Actions へ移動
2. 「New repository secret」をクリック
3. 以下のシークレットを作成：
   - Name: `GOOGLE_PLACES_API_KEY`
   - Value: 実際のAPIキー

4. GitHub Actions ワークフローでの使用：

```yaml
- name: Setup API Key
  run: |
    cp assets/js/config.template.js assets/js/config.js
    sed -i "s/YOUR_API_KEY_HERE/${{ secrets.GOOGLE_PLACES_API_KEY }}/g" assets/js/config.js
```

### 方法2: 環境変数を使用（ビルドツール必要）

WebpackやViteなどのビルドツールを使用している場合：

```javascript
// config.js
API_KEY: process.env.GOOGLE_PLACES_API_KEY || 'YOUR_API_KEY_HERE',
```

```bash
# .env.local (gitignoreに追加)
GOOGLE_PLACES_API_KEY=your_actual_api_key
```

### 方法3: サーバーサイドプロキシ（最も安全）

APIキーをサーバー側で管理し、クライアントからはプロキシ経由でアクセス：

1. バックエンドサーバーでAPIキーを環境変数として設定
2. クライアントからのリクエストをプロキシ
3. サーバー側でGoogle Places APIを呼び出し
4. 結果をクライアントに返す

## 📋 チェックリスト

開発開始前に以下を確認：

- [ ] config.template.js が存在する
- [ ] config.js を作成した（ローカルのみ）
- [ ] config.js に実際のAPIキーを設定した
- [ ] config.js は .gitignore に含まれている
- [ ] git status で config.js が表示されないことを確認

## 🆘 トラブルシューティング

### APIキーが機能しない場合

1. Google Cloud Console でAPIキーが有効になっているか確認
2. Places API が有効になっているか確認
3. APIキーの制限設定を確認（HTTPリファラーやIPアドレス）

### 誤ってコミットしてしまった場合

すぐに以下の対応を実施：

1. APIキーを Google Cloud Console で無効化または削除
2. 新しいAPIキーを生成
3. git履歴からファイルを削除（BFG Repo-Cleanerなどを使用）
4. Force pushで履歴を書き換え

## 📚 参考リンク

- [Google Cloud Console](https://console.cloud.google.com/)
- [Places API Documentation](https://developers.google.com/maps/documentation/places/web-service)
- [APIキーのベストプラクティス](https://cloud.google.com/docs/authentication/api-keys#best_practices)