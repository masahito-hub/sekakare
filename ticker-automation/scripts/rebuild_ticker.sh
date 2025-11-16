#!/bin/bash
set -euo pipefail

# ロックファイルのパス (P0 Fix: 同時実行防止)
LOCK_FILE="/tmp/sekakare_ticker_rebuild.lock"

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

echo "=== Ticker Rebuild (Manual) Started ==="
echo "Started at: $(date)"
echo ""

echo "[1/3] Generating ticker.json from existing archive..."
node src/generate_ticker.js

echo ""
echo "[2/3] Deploying to Xserver..."
node src/deploy.js

echo ""
echo "[3/3] Sending result notification..."
node src/notify_result.js

echo ""
echo "=== Ticker Rebuild Completed ==="
echo "Completed at: $(date)"
