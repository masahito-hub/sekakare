// 設定ファイルのテンプレート
//
// 使用方法:
// 1. このファイルをコピーして config.js として保存
//    cp assets/js/config.template.js assets/js/config.js
// 2. config.js の API_KEY を実際のAPIキーに置き換える
// 3. config.js は .gitignore に追加されているため、誤ってコミットされることはありません
//
// 本番環境での設定:
// - GitHub Actions でのビルド時に環境変数から自動的に置換
// - または、サーバーサイドでAPIキーを管理し、プロキシ経由でアクセス

const Config = {
    // Google Places API Key
    // 開発環境: 実際のAPIキーに置き換えてください
    // 本番環境: GitHub Secretsから自動的に注入されます
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
    if (Config.API_KEY === 'YOUR_API_KEY_HERE' || !Config.API_KEY) {
        console.error('⚠️ APIキーが設定されていません');
        console.info('📝 設定方法:');
        console.info('1. assets/js/config.template.js を config.js としてコピー');
        console.info('2. config.js の API_KEY を実際のAPIキーに置き換える');

        // エラーメッセージをUIに表示
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#ff4444;color:white;padding:15px 20px;border-radius:8px;z-index:10000;font-family:sans-serif;box-shadow:0 2px 10px rgba(0,0,0,0.3)';
        errorDiv.innerHTML = '⚠️ APIキーが設定されていません。<br>開発者向け: assets/js/config.jsを確認してください。';
        document.body.appendChild(errorDiv);

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