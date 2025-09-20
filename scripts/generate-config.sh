#!/bin/bash

# APIキーを含むconfig.jsを生成するスクリプト

# 環境変数からAPIキーを取得
API_KEY=${GOOGLE_PLACES_API_KEY:-"YOUR_GOOGLE_PLACES_API_KEY_HERE"}

# config.template.jsが存在するか確認
if [ ! -f "assets/js/config.template.js" ]; then
    echo "❌ Error: assets/js/config.template.js not found"
    exit 1
fi

# config.jsを生成
cp assets/js/config.template.js assets/js/config.js

# APIキーを置換
if [ "$API_KEY" != "YOUR_GOOGLE_PLACES_API_KEY_HERE" ]; then
    # sedを使用してAPIキーを置換
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/YOUR_GOOGLE_PLACES_API_KEY_HERE/$API_KEY/g" assets/js/config.js
    else
        # Linux
        sed -i "s/YOUR_GOOGLE_PLACES_API_KEY_HERE/$API_KEY/g" assets/js/config.js
    fi
    echo "✅ config.js generated with API key"
else
    echo "⚠️  Warning: No API key provided, using placeholder"
fi

echo "✅ config.js has been generated from template"