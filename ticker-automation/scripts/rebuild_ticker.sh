#!/bin/bash
# ティッカー手動再構築スクリプト
# PR枠を変更した際などに手動実行

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "========================================="
echo "セカカレティッカー手動再構築"
echo "$(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================="

# 環境変数をロード
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "エラー: .envファイルが見つかりません"
    exit 1
fi

# 1. ticker.json生成（アーカイブは更新しない）
echo ""
echo "[1/3] ticker.json生成中..."
node src/generate_ticker.js
if [ $? -ne 0 ]; then
    echo "エラー: ticker.json生成に失敗しました"
    exit 1
fi

# 2. FTPデプロイ
echo ""
echo "[2/3] Xserverにデプロイ中..."
node src/deploy.js
if [ $? -ne 0 ]; then
    echo "エラー: デプロイに失敗しました"
    exit 1
fi

# 3. Slack完了通知（オプショナル）
echo ""
echo "[3/3] Slack通知中..."
node src/notify_result.js
if [ $? -ne 0 ]; then
    echo "警告: Slack通知に失敗しました（デプロイは完了）"
fi

echo ""
echo "========================================="
echo "完了: ティッカーを再構築しました"
echo "========================================="
