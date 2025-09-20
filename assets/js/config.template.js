// 設定ファイルテンプレート - APIキーと環境変数管理
//
// このファイルはconfig.jsのテンプレートです。
// デプロイ時にGitHub ActionsによってAPIキーが自動的に注入されます。
//
// ローカル開発時:
// 1. このファイルをconfig.jsにコピー: cp config.template.js config.js
// 2. config.jsのAPI_KEYを実際のキーに置き換える
// 3. config.jsは.gitignoreに含まれているため、誤ってコミットされません

const Config = {
    // Google Maps API Key
    // デプロイ時にGitHub Secretsから自動的に注入されます
    API_KEY: '__GOOGLE_PLACES_API_KEY__',

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
    if (Config.API_KEY === '__GOOGLE_PLACES_API_KEY__' || Config.API_KEY === 'YOUR_API_KEY_HERE') {
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