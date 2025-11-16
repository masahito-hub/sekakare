#!/bin/bash
set -euo pipefail

# ロックファイルのパス (P0 Fix: 同時実行防止)
LOCK_FILE="/tmp/sekakare_ticker_notify.lock"

# 既に実行中かチェック
if [ -f "$LOCK_FILE" ]; then
    echo "Another instance is running. Exiting."
    exit 1
fi

# ロックファイル作成、終了時に自動削除
trap "rm -f $LOCK_FILE" EXIT
touch "$LOCK_FILE"

# 実行開始
cd "$(dirname "$0")/.."
source .env

echo "=== Ticker Notification Pipeline Started ==="
echo "Started at: $(date)"
echo ""

# RSS取得
echo "[1/4] Fetching RSS feeds..."
node src/fetch_rss.js

# パース・フィルタリング
echo ""
echo "[2/4] Parsing and filtering..."
node src/parse_and_filter.js

# ChatGPT要約
echo ""
echo "[3/4] Summarizing with ChatGPT..."
node src/summarize.js

# Slack通知
echo ""
echo "[4/4] Sending Slack notifications..."
node src/notify_slack.js

echo ""
echo "=== Ticker Notification Pipeline Completed ==="
echo "Completed at: $(date)"
