# APIキー設定の修正手順

## 問題の原因

デプロイワークフローでAPIキーが正しく注入されない問題が発生していました。

### 原因:
1. **プレースホルダーの不一致**
   - config.template.js: `YOUR_API_KEY_HERE`
   - deploy.yml: `YOUR_GOOGLE_PLACES_API_KEY_HERE` を置換しようとしていた

2. **config.jsのGit追跡**
   - config.jsがリポジトリにコミットされていた
   - .gitignoreに追加されていなかった

## 修正内容

### 1. config.jsをGitの追跡から除外
- `.gitignore`にconfig.jsを追加
- リポジトリからconfig.jsを削除（ローカルファイルは保持）

### 2. デプロイワークフローの修正
deploy.ymlの20行目を以下のように修正してください：

**変更前:**
```yaml
sed -i "s/YOUR_GOOGLE_PLACES_API_KEY_HERE/${{ secrets.GOOGLE_PLACES_API_KEY }}/g" assets/js/config.js
```

**変更後:**
```yaml
sed -i "s/YOUR_API_KEY_HERE/${{ secrets.GOOGLE_PLACES_API_KEY }}/g" assets/js/config.js
```

## 手動での更新手順

### ステップ1: deploy.ymlの更新

1. GitHubリポジトリの `.github/workflows/deploy.yml` を開く
2. "Edit this file" ボタンをクリック
3. 20行目の sed コマンドを上記の「変更後」の内容に修正
4. "Commit changes" をクリック

または、提供した `deploy-workflow-fix.yml` の内容をコピーして置き換えてください。

### ステップ2: ローカル開発環境の設定（必要な場合）

```bash
# config.template.jsからconfig.jsを作成
cp assets/js/config.template.js assets/js/config.js

# config.jsのAPIキーを手動で設定
# エディタで assets/js/config.js を開き、
# 'YOUR_API_KEY_HERE' を実際のAPIキーに置換
```

## 確認事項

- [x] GitHub Secretsに `GOOGLE_PLACES_API_KEY` が設定されている
- [ ] deploy.ymlが正しいプレースホルダーを使用している
- [x] config.jsが.gitignoreに追加されている
- [x] config.jsがリポジトリから削除されている

## 次回デプロイ時の動作

1. mainブランチへのマージ時に自動実行
2. config.template.jsをconfig.jsにコピー
3. `YOUR_API_KEY_HERE` を GitHub Secrets の値で置換
4. FTPでサーバーにアップロード

これにより、APIキーが正しく本番環境に反映されます。