# セカカレ Twitter Bot（Phase 0）

セカカレ公式X用のツイートネタ自動生成ボットです。

## 📋 概要

**運用フロー**:
- **火・木 10:00**: 自動実行（週2回）
- カレー関連ニュースをRSSから取得し、LLMで整形（最大3件）
- カレー豆知識をLLMで生成（3〜5件）
- Slackの専用チャンネルに投稿候補を通知

**Phase 0の機能**:
1. **ニュース紹介ツイート**: RSSからカレー関連ニュースを取得しLLMで整形（最大3件）
2. **カレー豆知識ツイート**: LLMでトリビアを生成（3〜5件）
3. Slackの専用チャンネルに投稿

## 🚀 セットアップ

### 1. 前提条件

- **Node.js**: v18以上
- **npm**: 8以上
- **環境**: VPS（cron実行）またはローカル

### 2. 依存パッケージインストール

```bash
cd twitter-bot
npm install
```

### 3. 環境変数設定

```bash
cp .env.example .env
nano .env  # 以下の値を設定
```

**必須環境変数**:

```bash
# OpenAI API Key（既存のものを使用）
OPENAI_API_KEY=sk-...

# Slack Webhook URL（Twitter Bot専用チャンネル）
SLACK_TWITTER_WEBHOOK_URL=https://hooks.slack.com/services/...

# RSS Feeds（カレー関連ニュース）
RSS_URLS="https://www.google.co.jp/alerts/feeds/.../...,https://www.google.co.jp/alerts/feeds/..."
```

### 4. 手動実行テスト

```bash
npm start
```

成功すると、Slackチャンネルにツイート候補が投稿されます。

### 5. cron設定（VPS環境）

```bash
crontab -e
```

以下を追加:

```cron
# 火曜・木曜 10:00 - ツイート候補生成
0 10 * * 2,4  cd /opt/sekakare/twitter-bot && node src/generate_tweet_candidates.js >> logs/generate_$(date +\%Y\%m\%d).log 2>&1
```

## 📁 ディレクトリ構造

```
twitter-bot/
├── src/
│   └── generate_tweet_candidates.js  # メインスクリプト
├── logs/
│   └── .gitkeep                      # ログ保存用
├── .env                              # 環境変数（Git除外）
├── .env.example                      # 環境変数テンプレート
├── .gitignore                        # Git除外設定
├── package.json                      # 依存パッケージ定義
└── README.md                         # このファイル
```

## 🛠️ 技術スタック

- **Node.js**: JavaScript実行環境
- **OpenAI API**: gpt-3.5-turbo（ニュース整形・豆知識生成）
- **rss-parser**: RSSフィード解析
- **Slack Webhook**: 投稿候補の通知

## 📝 機能詳細

### 1. ニュース紹介ツイート

RSSフィードからカレー関連ニュースを取得し、LLMで280文字以内のツイート形式に整形します。

**処理フロー**:
1. 複数のRSSフィードから最新ニュースを取得
2. 日付順にソート
3. 最大3件を選択
4. 各ニュースをLLMで親しみやすいツイート文に整形

**LLMプロンプトの特徴**:
- カレー好きが興味を持つポイントを強調
- 絵文字1〜2個使用
- URLは末尾に配置
- **NGルール**: 健康効果・ダイエット・病気改善には触れない（YMYL回避）

### 2. カレー豆知識ツイート

LLMでカレーに関する豆知識・トリビアを3〜5件生成します。

**生成内容**:
- カレーの歴史・文化・レシピに関する興味深い情報
- 各280文字以内
- 絵文字使用
- **NGルール**: 健康効果・ダイエット・病気改善には触れない（YMYL回避）

### 3. Slack通知

生成されたツイート候補をSlackの専用チャンネルに投稿します。

**通知内容**:
- 生成日時
- ニュースツイート候補（最大3件）
- 豆知識ツイート候補（3〜5件）
- 各候補の出典情報

## ⚠️ NGルール（重要）

Phase 0では以下の内容は**絶対に含めない**ようLLMに指示しています：

- 健康効果（例: 「カレーで健康に」「免疫力アップ」）
- ダイエット効果（例: 「痩せる」「カロリー制限」）
- 病気改善（例: 「風邪予防」「認知症予防」）

**理由**: YMYL（Your Money or Your Life）領域のコンテンツはGoogle検索で厳しく評価されるため、健康・医療に関する不確実な情報は避けます。

## 🐛 トラブルシューティング

### RSS取得失敗

```bash
# RSS URLの確認
echo $RSS_URLS

# 手動テスト
node src/generate_tweet_candidates.js
```

ログファイル: `logs/generate_YYYY-MM-DD.log`

### OpenAI API失敗

```bash
# API Keyの確認
echo $OPENAI_API_KEY | cut -c1-10

# クォータ・課金状況を確認
# https://platform.openai.com/account/usage
```

**エラー例**:
- `RateLimitError`: リクエスト制限超過 → 時間を空けて再実行
- `AuthenticationError`: APIキーが無効 → 環境変数を再確認

### Slack投稿失敗

```bash
# Webhook URLの確認
echo $SLACK_TWITTER_WEBHOOK_URL

# 手動テスト（curlで確認）
curl -X POST $SLACK_TWITTER_WEBHOOK_URL \
  -H 'Content-Type: application/json' \
  -d '{"text":"Test message"}'
```

## 📊 ログファイル

実行ログは `logs/` ディレクトリに日付別で保存されます。

```bash
# 最新ログの確認
tail -f logs/generate_$(date +%Y-%m-%d).log

# ログ一覧
ls -lh logs/
```

**ログ内容**:
- 処理開始・完了時刻
- RSS取得結果
- LLM生成結果
- Slack投稿結果
- エラー詳細（発生時）

## 🔒 セキュリティ

### 注意事項

- `.env`ファイルは絶対にコミットしない
- API Key、Webhook URLを含むファイルは`.gitignore`で除外済み
- ログファイルも自動的に除外されます

### 環境変数の管理

- **開発環境**: `.env`ファイルで管理
- **本番環境（VPS）**: 環境変数をシステムに設定するか、`.env`を安全な場所に配置

## 🚧 今後の拡張（Phase 1以降）

Phase 0では候補生成のみですが、今後以下の機能を追加予定：

- **Phase 1**: Slackでのツイート承認フロー（リアクション方式）
- **Phase 2**: X（Twitter）への自動投稿機能
- **Phase 3**: ツイート効果測定・分析機能

## 📄 ライセンス

MIT License

## 🔗 関連ドキュメント

- [セカカレ README](../README.md)
- [プロジェクト引き継ぎドキュメント](../HANDOVER.md)
