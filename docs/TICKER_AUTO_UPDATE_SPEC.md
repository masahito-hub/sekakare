# セカカレ ティッカー半自動更新システム 詳細仕様書

## 📋 システム概要

### 目的

セカカレのヘッダーティッカーに表示するニュースを、Google Alerts RSSから自動収集し、ChatGPTで要約、Slackでの承認プロセスを経て、Xserverに自動デプロイするシステム。

### 設計思想

1. **半自動化**: 完全自動ではなく、人間の判断を挟むことで品質を担保
2. **フェイルセーフ**: エラー発生時も現行システムを維持
3. **段階的処理**: 各ステップを独立させ、デバッグとメンテナンスを容易に
4. **ログ重視**: すべての処理をログに記録し、トラブルシューティングを支援

---

## 🔄 運用フロー

### 週次スケジュール

| 曜日 | 時刻 | 処理 | スクリプト |
|------|------|------|-----------|
| 金曜 | 21:00 | 候補収集・通知 | `run_notify.sh` |
| 土日 | - | 管理者が承認作業 | （Slackで👍） |
| 月曜 | 9:00 | 確定・反映 | `run_finalize.sh` |

### 詳細フロー

```
金曜 21:00
  ├─ fetch_rss.js          → RSS取得（3件のフィード）
  ├─ parse_and_filter.js   → パース・フィルタリング（10-15件に絞る）
  ├─ summarize.js          → ChatGPT要約（5-10件に絞る）
  └─ notify_slack.js       → Slack通知（候補を1件ずつ投稿）

週末
  └─ 管理者が各メッセージに👍リアクション

月曜 9:00
  ├─ collect_reactions.js  → Slackリアクション収集（2-4件承認）
  ├─ update_archive.js     → ニュースアーカイブ更新
  ├─ generate_ticker.js    → ticker.json生成（PR 3 + ニュース 7 = 10件）
  ├─ deploy.js             → FTPでXserverにアップロード
  └─ notify_result.js      → Slack完了通知
```

---

## 📂 ディレクトリ構造

```
ticker-automation/
├── .env                        # 環境変数（Git除外）
├── .env.example                # 環境変数テンプレート
├── .gitignore                  # Git除外設定
├── package.json                # npm設定
├── README.md                   # 運用マニュアル
│
├── scripts/                    # シェルスクリプト
│   ├── run_notify.sh          # 候補通知（金曜実行）
│   ├── run_finalize.sh        # 確定・反映（月曜実行）
│   └── rebuild_ticker.sh      # 手動再構築
│
├── src/                        # Node.jsスクリプト（ES Modules）
│   ├── fetch_rss.js           # [1] RSS取得
│   ├── parse_and_filter.js    # [2] パース・フィルタリング
│   ├── summarize.js           # [3] ChatGPT要約
│   ├── notify_slack.js        # [4] Slack通知
│   ├── collect_reactions.js   # [5] リアクション収集
│   ├── update_archive.js      # [6] アーカイブ更新
│   ├── generate_ticker.js     # [7] ticker.json生成
│   ├── deploy.js              # [8] FTPデプロイ
│   └── notify_result.js       # [9] 完了通知
│
├── data/                       # データファイル
│   ├── raw/                   # RSS XML一時保存（Git除外）
│   ├── news_archive.json      # ニュースアーカイブ（Git管理）
│   ├── pr_slots.json          # PR枠設定（Git管理）
│   ├── ticker.json            # 生成されたティッカー（Git管理可）
│   ├── candidates.json        # 候補（一時、Git除外）
│   ├── summarized.json        # 要約済み（一時、Git除外）
│   ├── approved_news.json     # 承認済み（一時、Git除外）
│   └── slack_messages.json    # Slackメッセージ記録（一時、Git除外）
│
└── logs/                       # ログファイル（Git除外）
    ├── notify_YYYYMMDD.log
    └── finalize_YYYYMMDD.log
```

---

## 🔧 各スクリプト詳細

### [1] fetch_rss.js

**役割**: Google Alerts RSSフィードを取得

**入力**:
- 環境変数 `RSS_URLS` (カンマ区切り)

**出力**:
- `data/raw/rss_1_TIMESTAMP.xml`
- `data/raw/rss_2_TIMESTAMP.xml`
- `data/raw/rss_3_TIMESTAMP.xml`

**処理内容**:
1. `RSS_URLS`を分割
2. 各URLにHTTPリクエスト（User-Agent設定）
3. XMLファイルとして`data/raw/`に保存
4. 成功/失敗をログ出力

**エラーハンドリング**:
- 1件でも成功すれば継続
- 全失敗時はエラー終了

---

### [2] parse_and_filter.js

**役割**: RSSをパースし、NGワード除外・重複除外

**入力**:
- `data/raw/*.xml`

**出力**:
- `data/candidates.json` (10-15件)

**処理内容**:
1. `rss-parser`で全XMLをパース
2. NGワードチェック（`BAN_WORDS`配列）
3. 企業PRチェック（`PR_KEYWORDS`の出現頻度）
4. URL重複除外
5. タイトル類似度チェック（0.8以上で重複）
6. 新着順ソート
7. 上位10-15件を抽出

**NGワードリスト**:
```javascript
const BAN_WORDS = [
  '創価', '統一教会', '幸福の科学',
  '差別', '殺す', '死ね', 'ヘイト',
  '風俗', 'アダルト', 'セクシー',
  'レトルト', 'レシピ動画', 'クックパッド',
  '通販', 'Amazon', '楽天市場',
  'PR TIMES', 'プレスリリース配信'
];
```

---

### [3] summarize.js

**役割**: ChatGPT APIで記事を要約・タイトル短縮

**入力**:
- `data/candidates.json`

**出力**:
- `data/summarized.json` (5-10件)

**処理内容**:
1. 各候補をChatGPT APIに投げる（逐次処理）
2. タイトルを全角36文字以内に短縮
3. タグ付け（event, new_shop, culture, campaign, tip）
4. 有効期限設定（イベントの場合のみ）
5. リトライ処理（最大3回）
6. 失敗時は元のタイトル使用

**ChatGPT設定**:
- モデル: `gpt-4o-mini`（コスト削減）
- temperature: 0.7
- max_tokens: 200
- response_format: `json_object`

**出力スキーマ**:
```json
{
  "title": "全角36文字以内のタイトル",
  "tag": "event|new_shop|culture|campaign|tip",
  "expires_at": "YYYY-MM-DD または空文字"
}
```

---

### [4] notify_slack.js

**役割**: Slackに候補記事を通知

**入力**:
- `data/summarized.json`

**出力**:
- `data/slack_messages.json` (メッセージID記録)
- Slackチャンネルに投稿

**処理内容**:
1. 各候補を1メッセージずつ投稿
2. メッセージ形式:
   ```
   📰 候補 1/5

   🔥 渋谷でカレーナイト開催
   https://example.com/shibuya

   👍 採用する場合はこのメッセージに👍リアクションをお願いします
   ```
3. 最後に案内メッセージ投稿
4. メッセージID（`ts`）を記録

**レート制限対策**:
- 投稿間に1秒の待機時間

---

### [5] collect_reactions.js

**役割**: Slackメッセージのリアクションを収集

**入力**:
- `data/slack_messages.json`

**出力**:
- `data/approved_news.json` (承認済み記事)

**処理内容**:
1. 各メッセージIDの`reactions`を取得
2. `:+1:` (👍) リアクションがあるかチェック
3. 承認されたニュースのみ抽出
4. IDを生成（`YYYY-MM-DD-slug`形式）

**レート制限対策**:
- リクエスト間に500msの待機時間

---

### [6] update_archive.js

**役割**: ニュースアーカイブを更新

**入力**:
- `data/approved_news.json`
- `data/news_archive.json` (既存)

**出力**:
- `data/news_archive.json` (更新後)

**処理内容**:
1. 承認済みニュースを既存アーカイブの先頭に追加
2. ID重複チェック
3. 有効期限切れを除外（`expires_at < 今日`）
4. 新着順ソート（`approved_at` or `published_at`降順）

---

### [7] generate_ticker.js

**役割**: ticker.jsonを生成（10枠）

**入力**:
- `data/pr_slots.json` (PR 3件)
- `data/news_archive.json` (ニュース)

**出力**:
- `data/ticker.json` (10件)

**処理内容**:
1. PR枠3件を読み込み
2. ニュースアーカイブから最新7件を取得
3. 10枠に配置:
   - slot 1: PR
   - slot 2-4: ニュース
   - slot 5: PR
   - slot 6-9: ニュース
   - slot 10: PR

**ticker.jsonスキーマ**:
```json
[
  {
    "slot": 1,
    "type": "pr",
    "id": "pr-2025-11-shop",
    "title": "セカカレ公式グッズ販売中🛍️",
    "url": "https://sekakare.life/shop",
    "published_at": "2025-11-01",
    "expires_at": "2025-11-30"
  },
  {
    "slot": 2,
    "type": "news",
    "id": "2025-11-16-shibuya",
    "title": "渋谷でカレーナイト開催🔥",
    "url": "https://example.com/shibuya",
    "tag": "event",
    "published_at": "2025-11-16",
    "expires_at": "2025-11-27"
  },
  ...
]
```

---

### [8] deploy.js

**役割**: ticker.jsonをXserverにFTPアップロード

**入力**:
- `data/ticker.json`
- 環境変数（FTP_HOST, FTP_USERNAME, FTP_PASSWORD, FTP_REMOTE_PATH）

**出力**:
- Xserver上の`/sekakare.life/public_html/ticker.json`

**処理内容**:
1. FTPサーバーに接続（`basic-ftp`使用）
2. `ticker.json`をアップロード
3. リトライ処理（最大3回、待機時間: 3秒、6秒）

**エラーハンドリング**:
- 接続失敗 → リトライ
- アップロード失敗 → リトライ
- 全リトライ失敗 → エラー終了

---

### [9] notify_result.js

**役割**: デプロイ完了をSlackに通知

**入力**:
- `data/ticker.json`
- `data/approved_news.json`

**出力**:
- Slackチャンネルに完了通知

**処理内容**:
1. 新規追加ニュースのリスト作成
2. 現在のティッカー内容のリスト作成
3. Slackに投稿

**メッセージ例**:
```
✅ セカカレティッカー更新完了！

【新規追加】(3件)
・渋谷でカレーナイト開催🔥
・京都の名店がミシュラン獲得🏆
・横浜スパイスフェス開催🎉

【現在のティッカー】(10件)
1. PR: セカカレ公式グッズ販売中
2. NEWS: 渋谷でカレーナイト開催
...

🌐 https://sekakare.life で確認できます
```

---

## 🎨 フロントエンド修正

### ticker.js の変更点

1. **データソース変更**
   - 変更前: `/assets/data/ticker-data.csv` (PapaParse使用)
   - 変更後: `/ticker.json` (fetch + JSON.parse)

2. **フィルタリング**
   - `status=active`チェック削除（JSONには不要）
   - `expires_at`チェックのみ維持

3. **ソート**
   - 変更前: `priority`昇順 → `published_at`降順
   - 変更後: `slot`昇順

4. **PR枠の特別表示**
   - `item.type === 'pr'` の場合、`.ticker-item-pr`クラスを追加

### style.css の変更点

```css
/* PR枠の背景色 */
.ticker-item-pr {
    background: linear-gradient(90deg, #fffbea 0%, #fff9e6 100%) !important;
}
```

---

## 🔐 セキュリティ対策

### 環境変数管理

- `.env`ファイルをGit除外（`.gitignore`設定済み）
- API Key、トークン、パスワードは環境変数で管理
- `.env.example`をテンプレートとして提供

### XSS対策

- フロントエンドで`escapeHtml()`関数を使用
- `textContent`でDOM更新（`innerHTML`は使用しない）

### URL検証

- `isValidUrl()`関数でプロトコルチェック
- `javascript:`, `data:`, `vbscript:` 等をブロック

### FTP接続

- パスワードは環境変数で管理
- 接続失敗時はリトライ（最大3回）

---

## 🚨 エラーハンドリング

### 各スクリプトの対応

| スクリプト | エラー | 対応 |
|-----------|-------|------|
| fetch_rss.js | RSS取得失敗 | 他のフィードが成功すれば継続 |
| parse_and_filter.js | パースエラー | エラーログ出力、処理継続 |
| summarize.js | ChatGPT API失敗 | リトライ3回、失敗時は元タイトル使用 |
| notify_slack.js | Slack API失敗 | リトライ3回、エラーログ出力 |
| collect_reactions.js | リアクション取得失敗 | エラーログ出力、処理継続 |
| update_archive.js | ファイル読み込み失敗 | 空配列で初期化 |
| generate_ticker.js | ニュース不足 | 警告ログ出力、利用可能分で生成 |
| deploy.js | FTP失敗 | リトライ3回、全失敗時はエラー終了 |
| notify_result.js | Slack通知失敗 | 警告ログ出力（デプロイは成功） |

### フェイルセーフ

- **候補0件**: 現行`ticker.json`を維持
- **承認0件**: 現行`ticker.json`を維持
- **デプロイ失敗**: Slack通知で管理者にアラート

---

## 📊 データ永続化

### Git管理対象

- `news_archive.json` (ニュースアーカイブ)
- `pr_slots.json` (PR枠設定)
- `ticker.json` (生成されたティッカー)

### Git除外対象

- `candidates.json` (一時)
- `summarized.json` (一時)
- `approved_news.json` (一時)
- `slack_messages.json` (一時)
- `data/raw/*.xml` (一時)
- `logs/*.log` (ログ)

---

## 🧪 テスト手順

### 1. 候補通知テスト

```bash
./scripts/run_notify.sh
```

確認項目:
- [ ] Slackに候補が投稿されたか
- [ ] メッセージ形式が正しいか
- [ ] `data/slack_messages.json`が生成されたか

### 2. リアクション収集テスト

Slackで👍リアクションを付けてから:

```bash
node src/collect_reactions.js
```

確認項目:
- [ ] `data/approved_news.json`に承認された記事が含まれているか

### 3. ティッカー生成テスト

```bash
node src/generate_ticker.js
```

確認項目:
- [ ] `data/ticker.json`が生成されたか
- [ ] PR 3件 + ニュース 7件 = 10件か
- [ ] slot順が正しいか

### 4. デプロイテスト

```bash
node src/deploy.js
```

確認項目:
- [ ] FTPアップロード成功したか
- [ ] Xserver上のファイルが更新されたか

### 5. フロントエンドテスト

ブラウザで `https://sekakare.life` にアクセス:

確認項目:
- [ ] ティッカーが表示されているか
- [ ] PR枠の背景色が薄い黄色か
- [ ] 5秒間隔でローテーションしているか
- [ ] リンクが正しく機能するか

---

## 📝 運用Tips

### PR枠の定期更新

月初に`data/pr_slots.json`を見直し、有効期限切れのPRを更新:

```bash
nano data/pr_slots.json
./scripts/rebuild_ticker.sh
```

### ログの定期削除

ログが溜まったら手動で削除:

```bash
find logs/ -name "*.log" -mtime +30 -delete
```

### 緊急時の手動デプロイ

ティッカーを即座に更新したい場合:

```bash
# news_archive.jsonを手動編集
nano data/news_archive.json

# ティッカー再構築
./scripts/rebuild_ticker.sh
```

---

## 🔄 今後の拡張案

1. **多言語対応**: ChatGPTで英語版タイトルも生成
2. **画像対応**: ニュースにサムネイル画像を付与
3. **カテゴリフィルタ**: ユーザーが興味のあるタグのみ表示
4. **A/Bテスト**: 複数のタイトル候補を比較
5. **アナリティクス**: クリック率を計測し、人気記事を分析

---

## 📚 参考資料

- [rss-parser - npm](https://www.npmjs.com/package/rss-parser)
- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)
- [Slack Web API](https://api.slack.com/web)
- [basic-ftp - npm](https://www.npmjs.com/package/basic-ftp)

---

## 📄 変更履歴

| 日付 | バージョン | 変更内容 | 担当者 |
|------|-----------|---------|--------|
| 2025-11-16 | 1.0.0 | 初版作成 | Claude Code |

---

## 📞 サポート

問題が発生した場合は、GitHub Issueを作成してください:
https://github.com/masahito-hub/sekakare/issues
