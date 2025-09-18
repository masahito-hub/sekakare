// 設定ファイル - APIキーと環境変数管理
//
// 注意: ブラウザ上で動作するJavaScriptでは環境変数を直接読み込むことができません。
// 本番環境では、以下のいずれかの方法でAPIキーを管理してください：
// 1. サーバーサイドでAPIキーを管理し、プロキシ経由でアクセス
// 2. ビルドツール（webpack等）を使用して環境変数をビルド時に注入
// 3. GitHub ActionsなどのCI/CDツールで自動的に置換
//
// 開発時の設定方法:
// 1. このファイルの API_KEY の値を実際のAPIキーに置き換える
// 2. このファイルを .gitignore に追加して、誤ってコミットしないようにする

const Config = {
    // Google Maps API Key
    // 本番環境では環境変数から取得することを推奨
    // 例: process.env.GOOGLE_MAPS_API_KEY (ビルドツール使用時)
    API_KEY: 'YOUR_API_KEY_HERE',

    // Google Analytics ID
    GA_ID: 'G-XXXXXXXXXX',

    // アプリケーション設定
    settings: {
        // 地図のデフォルト位置（東京駅）
        defaultLocation: { lat: 35.6812, lng: 139.7671 },

        // 地図のデフォルトズームレベル
        defaultZoom: 15,

        // 検索結果の最大表示数
        maxSearchResults: 20,

        // 自動検索の遅延時間（ミリ秒）
        autoSearchDelay: 500,

        // ヒートマップ設定
        heatmap: {
            minOpacity: 0.3,
            maxOpacity: 0.8,
            baseRadius: 100,
            radiusIncrement: 50
        }
    },

    // ローカルストレージのキー名
    storageKeys: {
        curryLogs: 'curryLogs',
        heatmapData: 'heatmapData',
        achievements: 'achievements'
    },

    // 実績の定義
    achievements: [
        { id: 'first_curry', name: '🍛 カレーデビュー', desc: '初回のカレーを記録', requiredVisits: 1 },
        { id: 'curry_lover', name: '🧡 カレー好き', desc: 'カレーを5回記録', requiredVisits: 5 },
        { id: 'curry_master', name: '👑 カレーマスター', desc: 'カレーを10回記録', requiredVisits: 10 },
        { id: 'explorer', name: '🗺️ カレー探検家', desc: '5店舗を制覇', requiredShops: 5 },
        { id: 'curry_addict', name: '🔥 カレー中毒', desc: 'カレーを20回記録', requiredVisits: 20 },
        { id: 'shop_hunter', name: '🎯 店舗ハンター', desc: '10店舗を制覇', requiredShops: 10 }
    ]
};

// APIキーの検証
function validateApiKey() {
    if (Config.API_KEY === 'YOUR_API_KEY_HERE') {
        console.warn('APIキーが設定されていません。Config.API_KEYを設定してください。');
        return false;
    }
    return true;
}

// 設定の取得メソッド
function getConfig(key) {
    const keys = key.split('.');
    let value = Config;
    for (const k of keys) {
        value = value[k];
        if (value === undefined) return null;
    }
    return value;
}

// グローバルに公開
window.Config = Config;
window.validateApiKey = validateApiKey;
window.getConfig = getConfig;