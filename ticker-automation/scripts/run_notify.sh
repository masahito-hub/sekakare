#!/bin/bash
# ティッカー候補通知スクリプト
# 金曜 21:00 に実行

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "========================================="
echo "セカカレティッカー候補通知"
echo "$(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================="

# 環境変数をロード
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "エラー: .envファイルが見つかりません"
    exit 1
fi

# 1. RSS取得
echo ""
echo "[1/4] RSS取得中..."
node src/fetch_rss.js
if [ $? -ne 0 ]; then
    echo "エラー: RSS取得に失敗しました"
    exit 1
fi

# 2. パース・フィルタリング
echo ""
echo "[2/4] パース・フィルタリング中..."
node src/parse_and_filter.js
if [ $? -ne 0 ]; then
    echo "エラー: パース・フィルタリングに失敗しました"
    exit 1
fi

# 3. 要約
echo ""
echo "[3/4] ChatGPTで要約中..."
node src/summarize.js
if [ $? -ne 0 ]; then
    echo "エラー: 要約に失敗しました"
    exit 1
fi

# 4. Slack通知
echo ""
echo "[4/4] Slack通知中..."
node src/notify_slack.js
if [ $? -ne 0 ]; then
    echo "エラー: Slack通知に失敗しました"
    exit 1
fi

echo ""
echo "========================================="
echo "完了: Slackに候補を通知しました"
echo "========================================="
