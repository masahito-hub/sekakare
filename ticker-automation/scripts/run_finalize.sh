#!/bin/bash
# ティッカー確定・反映スクリプト
# 月曜 9:00 に実行

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "========================================="
echo "セカカレティッカー確定・反映"
echo "$(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================="

# 環境変数をロード
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "エラー: .envファイルが見つかりません"
    exit 1
fi

# 1. リアクション収集
echo ""
echo "[1/5] リアクション収集中..."
node src/collect_reactions.js
if [ $? -ne 0 ]; then
    echo "エラー: リアクション収集に失敗しました"
    exit 1
fi

# 2. アーカイブ更新
echo ""
echo "[2/5] アーカイブ更新中..."
node src/update_archive.js
if [ $? -ne 0 ]; then
    echo "エラー: アーカイブ更新に失敗しました"
    exit 1
fi

# 3. ticker.json生成
echo ""
echo "[3/5] ticker.json生成中..."
node src/generate_ticker.js
if [ $? -ne 0 ]; then
    echo "エラー: ticker.json生成に失敗しました"
    exit 1
fi

# 4. FTPデプロイ
echo ""
echo "[4/5] Xserverにデプロイ中..."
node src/deploy.js
if [ $? -ne 0 ]; then
    echo "エラー: デプロイに失敗しました"
    exit 1
fi

# 5. Slack完了通知
echo ""
echo "[5/5] Slack完了通知中..."
node src/notify_result.js
if [ $? -ne 0 ]; then
    echo "警告: Slack通知に失敗しました（デプロイは完了）"
fi

echo ""
echo "========================================="
echo "完了: ティッカーを更新しました"
echo "========================================="
