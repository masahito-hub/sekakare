# セカカレ ティッカー半自動更新システム

## 📋 概要

セカカレのニュースティッカーを半自動で更新するシステムです。

**運用フロー**:
- **金曜 21:00**: Google Alerts RSSから候補を自動収集・要約 → Slack通知
- **週末**: 管理者が各候補に👍リアクションで選択
- **月曜 9:00**: 選択された記事を自動反映 → Xserverにアップロード

**ティッカー構成**:
- **全体**: 10枠固定
- **PR枠**: 1番、5番、10番（手動管理）
- **ニュース枠**: 7枠（新着順、週2-4本追加）

---

## 🚀 セットアップ手順

### 1. 前提条件

- Node.js v20.19.5以上
- npm 10.8.2以上
- VPSまたはサーバー環境（cron実行可能）
- FTPアクセス権限（Xserver）

### 2. インストール

```bash
# リポジトリをクローン
git clone https://github.com/masahito-hub/sekakare.git
cd sekakare/ticker-automation

# 依存パッケージをインストール
npm install
```

### 3. 環境変数設定

`.env.example`をコピーして`.env`を作成:

```bash
cp .env.example .env
nano .env  # お好みのエディタで編集
```

必須の環境変数:
- `RSS_URLS`: Google Alerts RSSフィードURL（カンマ区切り）
- `OPENAI_API_KEY`: ChatGPT API Key
- `SLACK_BOT_TOKEN`: Slack Bot User OAuth Token
- `SLACK_CHANNEL_ID`: Slack通知先チャンネルID
- `FTP_HOST`, `FTP_USERNAME`, `FTP_PASSWORD`: FTP接続情報
- `FTP_REMOTE_PATH`: アップロード先パス

### 4. シェルスクリプトに実行権限を付与

```bash
chmod +x scripts/run_notify.sh
chmod +x scripts/run_finalize.sh
chmod +x scripts/rebuild_ticker.sh
```

### 5. cron設定

```bash
crontab -e
```

以下を追加:

```cron
# 金曜 21:00 - 候補配信
0 21 * * 5  cd /opt/sekakare-ticker && ./scripts/run_notify.sh >> logs/notify_$(date +\%Y\%m\%d).log 2>&1

# 月曜 9:00 - 確定・反映
0 9 * * 1   cd /opt/sekakare-ticker && ./scripts/run_finalize.sh >> logs/finalize_$(date +\%Y\%m\%d).log 2>&1
```

**注意**: `/opt/sekakare-ticker`は実際のインストールパスに置き換えてください。

---

## 🔧 使い方

### 自動運用（推奨）

cronが設定されていれば、以下の流れで自動実行されます:

1. **金曜 21:00**: `run_notify.sh` が実行され、Slackに候補が通知される
2. **週末**: 管理者がSlackで👍リアクションを付ける
3. **月曜 9:00**: `run_finalize.sh` が実行され、選択された記事がティッカーに反映される

### 手動実行

#### 候補通知を手動実行

```bash
./scripts/run_notify.sh
```

#### 確定・反映を手動実行

```bash
./scripts/run_finalize.sh
```

#### ティッカー再構築（PR枠変更時など）

```bash
./scripts/rebuild_ticker.sh
```

または個別にスクリプトを実行:

```bash
npm run notify    # 候補通知
npm run finalize  # 確定・反映
npm run rebuild   # 再構築
```

---

## 📁 ディレクトリ構造

```
ticker-automation/
├── .env                        # 環境変数（要作成、.gitignore済み）
├── .env.example                # 環境変数テンプレート
├── .gitignore                  # Git除外設定
├── package.json                # npm設定
├── README.md                   # このファイル
├── scripts/                    # シェルスクリプト
│   ├── run_notify.sh          # 候補通知（金曜実行）
│   ├── run_finalize.sh        # 確定・反映（月曜実行）
│   └── rebuild_ticker.sh      # 手動再構築
├── src/                        # Node.jsスクリプト
│   ├── fetch_rss.js           # RSS取得
│   ├── parse_and_filter.js    # パース・フィルタリング
│   ├── summarize.js           # ChatGPT要約
│   ├── notify_slack.js        # Slack通知
│   ├── collect_reactions.js   # リアクション収集
│   ├── update_archive.js      # アーカイブ更新
│   ├── generate_ticker.js     # ticker.json生成
│   ├── deploy.js              # FTPデプロイ
│   └── notify_result.js       # 完了通知
├── data/                       # データファイル
│   ├── raw/                   # RSS XML一時保存
│   ├── news_archive.json      # ニュースアーカイブ（Git管理）
│   ├── pr_slots.json          # PR枠設定（Git管理）
│   ├── ticker.json            # 生成されたティッカー
│   ├── candidates.json        # 候補（一時）
│   ├── summarized.json        # 要約済み（一時）
│   ├── approved_news.json     # 承認済み（一時）
│   └── slack_messages.json    # Slackメッセージ記録（一時）
└── logs/                       # ログファイル
    ├── notify_YYYYMMDD.log
    └── finalize_YYYYMMDD.log
```

---

## 🎨 PR枠の管理

PR枠は`data/pr_slots.json`で管理されます。

### PR枠の編集

```bash
nano data/pr_slots.json
```

必ず3件のPR枠を維持してください:

```json
[
  {
    "id": "pr-2025-11-shop",
    "title": "セカカレ公式グッズ販売中🛍️",
    "url": "https://sekakare.life/shop",
    "published_at": "2025-11-01",
    "expires_at": "2025-11-30"
  },
  {
    "id": "pr-2025-11-campaign",
    "title": "カレー記録でポイントGET🎁",
    "url": "https://sekakare.life/campaign",
    "published_at": "2025-11-01",
    "expires_at": "2025-12-31"
  },
  {
    "id": "pr-2025-11-follow",
    "title": "公式Xアカウントをフォロー📱",
    "url": "https://x.com/sekakare",
    "published_at": "2025-11-01",
    "expires_at": ""
  }
]
```

### PR枠変更後の反映

```bash
./scripts/rebuild_ticker.sh
```

---

## 🔍 トラブルシューティング

### RSS取得エラー

```bash
node src/fetch_rss.js
```

エラーメッセージを確認し、`RSS_URLS`が正しいか確認してください。

### ChatGPT API エラー

- `OPENAI_API_KEY`が正しいか確認
- APIクォータが残っているか確認
- ネットワーク接続を確認

### Slack通知エラー

- `SLACK_BOT_TOKEN`と`SLACK_CHANNEL_ID`が正しいか確認
- Botがチャンネルに招待されているか確認
- Botに`chat:write`権限があるか確認

### FTPアップロードエラー

- FTP認証情報が正しいか確認
- `FTP_REMOTE_PATH`が正しいか確認
- ファイアウォール設定を確認

### ログの確認

```bash
# 最新の通知ログ
tail -f logs/notify_*.log

# 最新の確定ログ
tail -f logs/finalize_*.log
```

---

## 📝 データフロー

```
[Google Alerts RSS × 3]
  ↓ fetch_rss.js (金曜21:00)
[raw/*.xml]
  ↓ parse_and_filter.js
[candidates.json] (10-15件)
  ↓ summarize.js (ChatGPT)
[summarized.json] (5-10件)
  ↓ notify_slack.js
[Slack通知 + 👍リアクション待ち]
  ↓ collect_reactions.js (月曜9:00)
[approved_news.json] (2-4件)
  ↓ update_archive.js
[news_archive.json] (最新7件保持)
  ↓ generate_ticker.js
[ticker.json] (PR 3件 + ニュース 7件 = 10件)
  ↓ deploy.js (FTP)
[Xserver: /sekakare.life/public_html/ticker.json]
  ↓ notify_result.js
[Slack完了通知]
```

---

## 🔐 セキュリティ

- `.env`ファイルは絶対にGitにコミットしない（`.gitignore`設定済み）
- API Keyやトークンは環境変数で管理
- FTPパスワードも環境変数で管理
- XSS対策済み（フロントエンドでHTMLエスケープ）
- URL検証済み（危険なプロトコルをブロック）

---

## 📚 関連ドキュメント

- [詳細実装仕様書](../docs/TICKER_AUTO_UPDATE_SPEC.md)
- [Issue #140](https://github.com/masahito-hub/sekakare/issues/140)

---

## 🤝 サポート

問題が発生した場合は、GitHub Issueを作成してください:
https://github.com/masahito-hub/sekakare/issues

---

## 📄 ライセンス

MIT License
