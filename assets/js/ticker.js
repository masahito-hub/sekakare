// ティッカー機能実装（JSON版）

// グローバル変数定義
let tickerData = [];
let isTickerEnabled = false;

// キャッシュ管理
const CACHE_KEY = 'sekakare_ticker_cache';
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5分

// アニメーション設定
const DISPLAY_DURATION = 5000; // 5秒表示
const FADE_DURATION = 500; // 0.5秒フェード

// DOM要素のキャッシュ
const elements = {
    tickerContainer: null,
    tickerWrapper: null,
    tickerContent: null
};

// フェードアニメーション用変数
let currentIndex = 0;
let tickerInterval = null;

// 初期化時にDOM要素をキャッシュ
function initDOMElements() {
    elements.tickerContainer = document.getElementById('tickerContainer');
    elements.tickerWrapper = document.getElementById('tickerWrapper');
    elements.tickerContent = document.getElementById('tickerContent');
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

// ticker.json取得・パース
async function fetchTickerData() {
    const jsonUrl = 'https://sekakare.life/ticker.json';

    try {
        // キャッシュチェック
        const cached = getCache();
        if (cached) {
            console.log('キャッシュからデータを使用');
            return cached;
        }

        console.log('ticker.jsonを取得中...');
        const response = await fetch(jsonUrl);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const jsonData = await response.json();

        console.log('ticker.json取得完了:', jsonData.length + '件');

        // データのサニタイゼーション（XSS対策）
        const sanitizedData = jsonData.map(item => ({
            slot: parseInt(item.slot) || 999,
            id: escapeHtml(item.id),
            type: escapeHtml(item.type), // "pr" or "news"
            title: escapeHtml(item.title),
            url: item.url, // URLはisValidUrlで検証
            tag: escapeHtml(item.tag || ''), // newsの場合のタグ（event, trend等）
            published_at: item.published_at,
            expires_at: item.expires_at || ''
        }));

        return sanitizedData;
    } catch (error) {
        console.error('ticker.json取得エラー:', error);
        throw error;
    }
}

// データフィルタリング
function filterActiveItems(items) {
    const now = new Date();

    return items.filter(item => {
        // 期限チェック
        if (item.expires_at) {
            const expires = new Date(item.expires_at);
            if (expires < now) return false;
        }

        return true;
    });
}

// ソート処理（slot番号順）
function sortItems(items) {
    return items.sort((a, b) => {
        // slot番号昇順
        return a.slot - b.slot;
    });
}

// ティッカーアイテムのHTML生成
function createTickerItemHTML(item) {
    // カテゴリ表示
    let categoryText = '[ニュース]';
    let categoryClass = 'ticker-category-news';
    let emoji = '🍛';

    if (item.type === 'pr') {
        categoryText = '[PR]';
        categoryClass = 'ticker-category-pr';
        emoji = '✨';
    } else if (item.tag === 'event') {
        emoji = '🎉';
    } else if (item.tag === 'trend') {
        emoji = '🔥';
    }

    const title = item.title || '（タイトルなし）';
    const validUrl = isValidUrl(item.url);
    const href = validUrl ? item.url : '#';
    const target = validUrl ? '_blank' : '_self';
    const rel = validUrl ? 'noopener noreferrer' : '';

    return `
        <div class="ticker-item">
            <span class="ticker-emoji">${emoji}</span>
            <span class="ticker-category ${categoryClass}">${categoryText}</span>
            <a href="${href}" target="${target}" ${rel ? `rel="${rel}"` : ''}>${title}</a>
        </div>
    `;
}

// フェードイン・アウトアニメーション開始
function startFadeAnimation() {
    if (!elements.tickerContent || tickerData.length === 0) return;

    // 初期表示
    currentIndex = 0;
    showCurrentItem();

    // 定期的に切り替え
    tickerInterval = setInterval(showNextItem, DISPLAY_DURATION);
}

// 現在のアイテムを表示
function showCurrentItem() {
    if (!elements.tickerContent || tickerData.length === 0) return;

    const item = tickerData[currentIndex];
    elements.tickerContent.innerHTML = createTickerItemHTML(item);
    elements.tickerContent.style.opacity = '1';
}

// 次のアイテムに切り替え
function showNextItem() {
    if (!elements.tickerContent || tickerData.length === 0) return;

    // フェードアウト
    elements.tickerContent.style.transition = `opacity ${FADE_DURATION}ms ease-in-out`;
    elements.tickerContent.style.opacity = '0';

    setTimeout(() => {
        // 次のアイテムに切り替え
        currentIndex = (currentIndex + 1) % tickerData.length;
        const item = tickerData[currentIndex];

        // HTML更新
        elements.tickerContent.innerHTML = createTickerItemHTML(item);

        // フェードイン
        elements.tickerContent.style.opacity = '1';
    }, FADE_DURATION);
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
        const debugInfo = document.getElementById('debugInfo');
        if (debugInfo) debugInfo.style.display = 'block';
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
            const debugInfo = document.getElementById('debugInfo');
            if (debugInfo) debugInfo.style.display = 'none';

            // フェードイン・アウトアニメーション開始
            startFadeAnimation();
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
    // エラー時はデバッグ情報も非表示
    const debugInfo = document.getElementById('debugInfo');
    if (debugInfo) debugInfo.style.display = 'none';
}

// クリーンアップ処理（メモリリーク防止）
function cleanup() {
    // インターバルを停止
    if (tickerInterval) {
        clearInterval(tickerInterval);
        tickerInterval = null;
    }

    // アニメーションを停止
    if (elements.tickerContent) {
        elements.tickerContent.style.animation = 'none';
        elements.tickerContent.innerHTML = '';
    }

    // DOM参照をクリア
    elements.tickerContainer = null;
    elements.tickerWrapper = null;
    elements.tickerContent = null;

    tickerData = [];
    isTickerEnabled = false;
    currentIndex = 0;
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

// ページ読み込み時に自動初期化
if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTicker);
    } else {
        // 既に読み込み済みの場合は即座に実行
        initTicker();
    }
}

// エクスポート（テスト用）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initTicker,
        isValidUrl,
        escapeHtml,
        cleanup
    };
}