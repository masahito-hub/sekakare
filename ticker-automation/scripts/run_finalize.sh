#!/bin/bash
set -euo pipefail

# ロックファイルのパス (P0 Fix: 同時実行防止)
LOCK_FILE="/tmp/sekakare_ticker_finalize.lock"

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

echo "=== Ticker Finalization Pipeline Started ==="
echo "Started at: $(date)"
echo ""

# リアクション収集
echo "[1/6] Collecting reactions..."
node src/collect_reactions.js

# アーカイブ更新
echo ""
echo "[2/6] Updating archive..."
node src/update_archive.js

# ticker.json生成
echo ""
echo "[3/6] Generating ticker.json..."
node src/generate_ticker.js

# ticker-data.csv生成
echo ""
echo "[4/6] Generating ticker-data.csv..."
node src/generate_csv.js

# FTPデプロイ
echo ""
echo "[5/6] Deploying to Xserver..."
node src/deploy.js

# 結果通知
echo ""
echo "[6/6] Sending result notification..."
node src/notify_result.js

echo ""
echo "=== Ticker Finalization Pipeline Completed ==="
echo "Completed at: $(date)"
