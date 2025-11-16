# セカカレティッカー半自動更新システム

セカカレのニュースティッカーを半自動で更新するシステムです。

## 📋 概要

**運用フロー**:
- **金曜 21:00**: Google Alerts RSSから候補を自動収集・要約 → Slack通知
- **週末**: 管理者が各候補に👍リアクションで選択
- **月曜 9:00**: 選択された記事を自動反映 → Xserverにアップロード

**ティッカー構成**:
- **全体**: 10枠固定
- **PR枠**: 1番、5番、10番（手動管理）
- **ニュース枠**: 7枠（新着順、週2-4本追加）

## 🚀 セットアップ

### 1. 前提条件

- **VPS環境**: Linux
- **Node.js**: v20.19.5 以上
- **npm**: 10.8.2 以上

### 2. ディレクトリ配置

```bash
cd /opt
git clone https://github.com/masahito-hub/sekakare.git sekakare-ticker
cd sekakare-ticker/ticker-automation
```

### 3. 依存パッケージインストール

```bash
npm install
```

### 4. 環境変数設定

```bash
cp .env.example .env
nano .env  # 以下の値を設定
```

**必須環境変数**:

```bash
# Google Alerts RSS（3件）
RSS_URLS="https://www.google.co.jp/alerts/feeds/.../...,..."

# ChatGPT API
OPENAI_API_KEY=sk-...

# Slack API
SLACK_BOT_TOKEN=xoxb-...
SLACK_CHANNEL_ID=C0123456789

# FTP（Xserver）
FTP_HOST=example.xsrv.jp
FTP_USERNAME=your_username
FTP_PASSWORD=your_password
FTP_REMOTE_PATH=/sekakare.life/public_html/ticker.json
```

### 5. シェルスクリプトに実行権限付与

```bash
chmod +x scripts/*.sh
```

### 6. cron設定

```bash
crontab -e
```

以下を追加:

```cron
# 金曜 21:00 - 候補配信
0 21 * * 5  cd /opt/sekakare-ticker/ticker-automation && ./scripts/run_notify.sh >> logs/notify_$(date +\%Y\%m\%d).log 2>&1

# 月曜 9:00 - 確定・反映
0 9 * * 1   cd /opt/sekakare-ticker/ticker-automation && ./scripts/run_finalize.sh >> logs/finalize_$(date +\%Y\%m\%d).log 2>&1
```

## 🧪 テスト

### テスト実行

```bash
# 全テスト実行
npm test

# ウォッチモード
npm run test:watch

# カバレッジ確認
npm run test:coverage
```

### 手動テスト実行

```bash
# 候補通知テスト
./scripts/run_notify.sh

# Slackで👍リアクションを付けてから確定
./scripts/run_finalize.sh

# 手動でティッカー再構築
./scripts/rebuild_ticker.sh
```

## 📁 ディレクトリ構造

```
ticker-automation/
├── .env                      # 環境変数（Git除外）
├── .env.example              # 環境変数テンプレート
├── .gitignore                # Git除外設定
├── package.json              # 依存パッケージ定義
├── jest.config.js            # Jest設定
├── README.md                 # このファイル
├── scripts/
│   ├── run_notify.sh         # 候補通知処理（金曜21:00）
│   ├── run_finalize.sh       # 確定・反映処理（月曜9:00）
│   └── rebuild_ticker.sh     # 手動再構築
├── src/
│   ├── fetch_rss.js          # RSS取得
│   ├── parse_and_filter.js   # パース・フィルタリング
│   ├── summarize.js          # ChatGPT要約
│   ├── notify_slack.js       # Slack候補通知
│   ├── collect_reactions.js  # リアクション収集
│   ├── update_archive.js     # アーカイブ更新
│   ├── generate_ticker.js    # ticker.json生成
│   ├── deploy.js             # FTPデプロイ
│   └── notify_result.js      # Slack完了通知
├── data/
│   ├── raw/                  # RSS生データ（Git除外）
│   ├── news_archive.json     # ニュースアーカイブ
│   ├── pr_slots.json         # PR枠データ
│   └── ticker.json           # 最終ティッカー（Git除外）
├── logs/                     # 実行ログ（Git除外）
└── test/
    ├── parse_and_filter.test.js
    ├── collect_reactions.test.js
    └── generate_ticker.test.js
```

## 🔧 運用

### PR枠の更新

`data/pr_slots.json`を手動で編集してください。

```json
[
  {
    "id": "pr-2025-11-shop",
    "type": "pr",
    "title": "セカカレ公式グッズ販売中🛍️",
    "url": "https://sekakare.life/shop",
    "published_at": "2025-11-01",
    "expires_at": "2025-11-30"
  },
  ...
]
```

編集後、手動再構築:

```bash
./scripts/rebuild_ticker.sh
```

### 手動でニュースを追加

`data/news_archive.json`に追加してください。

```json
{
  "id": "2025-11-16-unique-id-hash",
  "type": "news",
  "title": "新しいニュース",
  "url": "https://example.com/news",
  "tag": "event",
  "published_at": "2025-11-16",
  "expires_at": ""
}
```

### ログ確認

```bash
# 最新の通知ログ
tail -f logs/notify_$(date +%Y%m%d).log

# 最新の確定ログ
tail -f logs/finalize_$(date +%Y%m%d).log
```

## 🔒 セキュリティ

### P0修正済み

- ✅ **ID生成の衝突リスク修正**: URLとタイトルからSHA256ハッシュを生成して一意性を保証
- ✅ **ファイルロック追加**: 全cronスクリプトに同時実行防止機構を実装
- ✅ **ユニットテスト追加**: Jest導入、重要な関数のテストカバレッジ確保

### 注意事項

- `.env`ファイルは絶対にコミットしない
- API Key、Slack Token、FTP認証情報を含むファイルは`.gitignore`で除外済み
- ログファイルも自動的に除外されます

## 🐛 トラブルシューティング

### RSS取得失敗

```bash
# RSS URLの確認
echo $RSS_URLS

# 手動テスト
node src/fetch_rss.js
```

### ChatGPT API失敗

```bash
# API Keyの確認
echo $OPENAI_API_KEY | cut -c1-10

# 手動テスト
node src/summarize.js
```

### Slack通知失敗

```bash
# Slack Tokenの確認
echo $SLACK_BOT_TOKEN | cut -c1-10

# 手動テスト
node src/notify_slack.js
```

### FTP失敗

```bash
# FTP設定の確認
echo "Host: $FTP_HOST"
echo "User: $FTP_USERNAME"
echo "Path: $FTP_REMOTE_PATH"

# 手動テスト
node src/deploy.js
```

## 📝 詳細仕様

詳細な実装仕様は以下を参照してください:

- [docs/TICKER_AUTO_UPDATE_SPEC.md](../docs/TICKER_AUTO_UPDATE_SPEC.md)

## 📄 ライセンス

MIT License
