// ティッカー機能実装

// グローバル変数定義
let tickerData = [];
let currentTickerIndex = 0;
let rotationTimer = null;
let isTickerEnabled = false;

// キャッシュ管理
const CACHE_KEY = 'sekakare_ticker_cache';
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5分

// DOM要素のキャッシュ
const elements = {
    tickerContainer: null,
    tickerItem: null,
    categorySpan: null,
    linkElement: null
};

// 初期化時にDOM要素をキャッシュ
function initDOMElements() {
    elements.tickerContainer = document.getElementById('tickerContainer');
    elements.tickerItem = document.getElementById('tickerItem');
    if (elements.tickerItem) {
        elements.categorySpan = elements.tickerItem.querySelector('.ticker-category');
        elements.linkElement = elements.tickerItem.querySelector('a');
    }
}

// URL検証関数（セキュリティ対策）
function isValidUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const urlObj = new URL(url);
        // http/httpsプロトコルのみ許可
        // javascript:, data:, vbscript: 等の危険なプロトコルをブロック
        return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
        return false;
    }
}

// HTMLエスケープ関数（XSS対策）
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// キャッシュから取得
function getCache() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (!cached) return null;

        const data = JSON.parse(cached);
        const now = Date.now();

        if (now - data.timestamp > CACHE_EXPIRY_MS) {
            localStorage.removeItem(CACHE_KEY);
            return null;
        }

        return data.items;
    } catch (error) {
        console.error('キャッシュ読み込みエラー:', error);
        return null;
    }
}

// キャッシュに保存
function setCache(items) {
    try {
        const data = {
            items: items,
            timestamp: Date.now()
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (error) {
        console.error('キャッシュ保存エラー:', error);
    }
}

// JSON取得・パース
async function fetchTickerData() {
    const jsonUrl = '/ticker.json';

    try {
        // キャッシュチェック
        const cached = getCache();
        if (cached) {
            console.log('キャッシュからデータを使用');
            return cached;
        }

        console.log('JSONを取得中...');
        const response = await fetch(jsonUrl);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error('Invalid data format: expected array');
        }

        console.log('JSON解析完了:', data.length + '件');

        // データのサニタイゼーション（XSS対策）
        const sanitizedData = data.map(item => ({
            slot: parseInt(item.slot) || 999,
            type: escapeHtml(item.type),
            id: escapeHtml(item.id),
            title: escapeHtml(item.title),
            url: item.url, // URLはisValidUrlで検証
            tag: escapeHtml(item.tag || item.category || ''),
            published_at: item.published_at,
            expires_at: item.expires_at
        }));

        return sanitizedData;
    } catch (error) {
        console.error('データ取得エラー:', error);
        throw error;
    }
}

// データフィルタリング
function filterActiveItems(items) {
    const now = new Date();

    return items.filter(item => {
        // 期限チェック（expires_atがある場合のみ）
        if (item.expires_at) {
            const expires = new Date(item.expires_at);
            if (expires < now) return false;
        }

        return true;
    });
}

// ソート処理
function sortItems(items) {
    return items.sort((a, b) => {
        // slot昇順でソート
        return a.slot - b.slot;
    });
}

// ティッカー表示
function displayTickerItem(item) {
    if (!elements.tickerItem) {
        initDOMElements();
        if (!elements.tickerItem) return;
    }

    // カテゴリ表示（typeフィールドを使用）
    let categoryText = '[ニュース]';
    let categoryClass = 'ticker-category-news';

    if (item.type === 'pr') {
        categoryText = '[PR]';
        categoryClass = 'ticker-category-pr';
    }

    // DOM更新（XSS対策済み）
    if (elements.categorySpan) {
        elements.categorySpan.textContent = categoryText;
        elements.categorySpan.className = 'ticker-category ' + categoryClass;
    }

    if (elements.linkElement) {
        elements.linkElement.textContent = item.title || '（タイトルなし）';

        // URL検証してから設定
        if (isValidUrl(item.url)) {
            elements.linkElement.href = item.url;
            elements.linkElement.target = '_blank';
            elements.linkElement.rel = 'noopener noreferrer'; // セキュリティ強化
        } else {
            elements.linkElement.href = '#';
            elements.linkElement.target = '_self';
            elements.linkElement.removeAttribute('rel');
        }
    }

    // PR枠の場合、tickerItemに特別なクラスを追加
    if (elements.tickerItem) {
        if (item.type === 'pr') {
            elements.tickerItem.classList.add('ticker-item-pr');
        } else {
            elements.tickerItem.classList.remove('ticker-item-pr');
        }
    }
}

// ローテーション処理
function startRotation() {
    if (tickerData.length === 0) return;

    // 最初のアイテムを表示
    displayTickerItem(tickerData[currentTickerIndex]);

    // タイマークリア（重複防止）
    if (rotationTimer) {
        clearInterval(rotationTimer);
    }

    // 5秒間隔でローテーション
    rotationTimer = setInterval(() => {
        // フェードアウト
        if (elements.tickerItem) {
            elements.tickerItem.classList.remove('active');

            setTimeout(() => {
                currentTickerIndex = (currentTickerIndex + 1) % tickerData.length;
                displayTickerItem(tickerData[currentTickerIndex]);

                // フェードイン
                if (elements.tickerItem) {
                    elements.tickerItem.classList.add('active');
                }
            }, 300);
        }
    }, 5000);
}

// ティッカー初期化
async function initTicker() {
    console.log('ティッカー初期化中...');

    // DOM要素の初期キャッシュ
    initDOMElements();

    // デバッグモードチェック
    const isDebugMode = localStorage.getItem('sekakare_debug') === 'true';

    if (isDebugMode) {
        console.log('デバッグモードが有効 - ティッカーを非表示');
        if (elements.tickerContainer) {
            elements.tickerContainer.style.display = 'none';
        }
        document.getElementById('debugInfo').style.display = 'block';
        return;
    }

    try {
        // データ取得
        const allItems = await fetchTickerData();

        // フィルタリング
        let activeItems = filterActiveItems(allItems);

        // ソート
        activeItems = sortItems(activeItems);

        // 最新10件まで
        tickerData = activeItems.slice(0, 10);

        // キャッシュに保存
        setCache(tickerData);

        console.log('表示対象:', tickerData.length + '件');

        if (tickerData.length > 0) {
            // ティッカー表示
            if (elements.tickerContainer) {
                elements.tickerContainer.style.display = 'block';
            }
            document.getElementById('debugInfo').style.display = 'none';

            // ローテーション開始
            startRotation();
            isTickerEnabled = true;
        } else {
            console.log('表示するニュースがありません');
            handleTickerError();
        }
    } catch (error) {
        console.error('ティッカー初期化エラー:', error);
        handleTickerError();
    }
}

// エラー時の処理
function handleTickerError() {
    console.log('ティッカーエラー処理');
    if (elements.tickerContainer) {
        elements.tickerContainer.style.display = 'none';
    }
    // デバッグモード削除により、エラー時もデバッグ情報は非表示
    document.getElementById('debugInfo').style.display = 'none';
}

// クリーンアップ処理（メモリリーク防止）
function cleanup() {
    if (rotationTimer) {
        clearInterval(rotationTimer);
        rotationTimer = null;
    }

    // DOM参照をクリア
    elements.tickerContainer = null;
    elements.tickerItem = null;
    elements.categorySpan = null;
    elements.linkElement = null;

    tickerData = [];
    currentTickerIndex = 0;
    isTickerEnabled = false;
}

// ページアンロード時のクリーンアップ
window.addEventListener('beforeunload', cleanup);

// デバッグモード切り替え監視
window.addEventListener('storage', (e) => {
    if (e.key === 'sekakare_debug') {
        console.log('デバッグモード設定が変更されました');
        cleanup();
        initTicker();
    }
});

// エクスポート（テスト用）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initTicker,
        isValidUrl,
        escapeHtml,
        cleanup
    };
}