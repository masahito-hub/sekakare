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

// CSV取得・パース
async function fetchTickerData() {
    const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR5A92ZAN-APb-JPjiUOOyQSZoR1Owl6vbn2kz5sKu0RVrptYi7aw_GtA-pTO1Oc_YKtg7arooYXUBk/pub?gid=0&single=true&output=csv';

    try {
        // キャッシュチェック
        const cached = getCache();
        if (cached) {
            console.log('キャッシュからデータを使用');
            return cached;
        }

        console.log('CSVを取得中...');
        const response = await fetch(csvUrl);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const csvText = await response.text();

        return new Promise((resolve, reject) => {
            Papa.parse(csvText, {
                header: true,
                complete: (results) => {
                    console.log('CSV解析完了:', results.data.length + '件');

                    // CSV解析エラーの詳細表示
                    if (results.errors.length > 0) {
                        console.warn('CSV解析でエラーが発生:', results.errors);
                        results.errors.forEach(error => {
                            console.warn('エラー詳細:', error);
                        });
                    }

                    // データのサニタイゼーション（XSS対策）
                    const sanitizedData = results.data.map(item => ({
                        id: escapeHtml(item.id),
                        title: escapeHtml(item.title),
                        url: item.url, // URLはisValidUrlで検証
                        category: escapeHtml(item.category),
                        status: escapeHtml(item.status),
                        priority: parseInt(item.priority) || 999,
                        published_at: item.published_at,
                        expires_at: item.expires_at
                    }));

                    resolve(sanitizedData);
                },
                error: (error) => {
                    console.error('CSV解析エラー:', error);
                    reject(error);
                }
            });
        });
    } catch (error) {
        console.error('データ取得エラー:', error);
        throw error;
    }
}

// データフィルタリング
function filterActiveItems(items) {
    const now = new Date();

    return items.filter(item => {
        // status=activeチェック
        if (item.status !== 'active') return false;

        // 期限チェック
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
        // priority昇順
        if (a.priority !== b.priority) {
            return a.priority - b.priority;
        }

        // published_at降順
        const dateA = new Date(a.published_at || 0);
        const dateB = new Date(b.published_at || 0);
        return dateB - dateA;
    });
}

// ティッカー表示
function displayTickerItem(item) {
    if (!elements.tickerItem) {
        initDOMElements();
        if (!elements.tickerItem) return;
    }

    // カテゴリ表示
    let categoryText = '[ニュース]';
    let categoryClass = 'ticker-category-news';

    if (item.category === 'pr') {
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

    // 常にティッカーを表示（デバッグモード削除）

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
            // デバッグ表示削除（ティッカーのみ表示）

            // ローテーション開始
            startRotation();
            isTickerEnabled = true;
        } else {
            console.log('表示するニュースがありません');
            fallbackToDebugMode();
        }
    } catch (error) {
        console.error('ティッカー初期化エラー:', error);
        fallbackToDebugMode();
    }
}

// エラー時の処理（ティッカー表示継続）
function fallbackToDebugMode() {
    console.log('ティッカー初期化エラー - ティッカー表示継続');
    // エラー時でもティッカーコンテナは表示したまま
    if (elements.tickerContainer) {
        elements.tickerContainer.style.display = 'block';
    }
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

// デバッグモード切り替え監視削除（デバッグモード機能削除）

// エクスポート（テスト用）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initTicker,
        isValidUrl,
        escapeHtml,
        cleanup
    };
}