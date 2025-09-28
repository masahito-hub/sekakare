/**
 * ヘッダーティッカー機能
 */

(function() {
    'use strict';

    // 設定
    const CONFIG = {
        CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR5A92ZAN-APb-JPjiUOOyQSZoR1Owl6vbn2kz5sKu0RVrptYi7aw_GtA-pTO1Oc_YKtg7arooYXUBk/pub?gid=0&single=true&output=csv',
        CACHE_KEY: 'sekakare_ticker_data',
        CACHE_EXPIRY_TIME: 5 * 60 * 1000, // 5分
        ROTATION_INTERVAL: 5000, // 5秒
        MAX_ITEMS: 10,
        DEBUG_MODE_KEY: 'sekakare_debug',
        CONTAINER_ID: 'tickerContainer',
        ITEM_ID: 'tickerItem'
    };

    // DOM要素のキャッシュ
    const elements = {
        tickerContainer: null,
        tickerItem: null,
        categorySpan: null,
        linkElement: null
    };

    let tickerData = [];
    let currentIndex = 0;
    let rotationTimer = null;

    /**
     * 安全なURL判定関数
     * @param {string} url - 検証するURL
     * @returns {boolean} - 安全なURLかどうか
     */
    function isValidUrl(url) {
        if (!url || typeof url !== 'string') return false;
        try {
            const urlObj = new URL(url);
            return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
        } catch {
            return false;
        }
    }

    /**
     * XSS対策: HTMLエスケープ関数
     * @param {string} str - エスケープする文字列
     * @returns {string} - エスケープされた文字列
     */
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * デバッグモードかどうかを判定
     * @returns {boolean}
     */
    function isDebugMode() {
        return localStorage.getItem(CONFIG.DEBUG_MODE_KEY) === 'true';
    }

    /**
     * キャッシュからデータを取得
     * @returns {Array|null}
     */
    function getCachedData() {
        try {
            const cached = localStorage.getItem(CONFIG.CACHE_KEY);
            if (!cached) return null;

            const data = JSON.parse(cached);
            if (Date.now() - data.timestamp > CONFIG.CACHE_EXPIRY_TIME) {
                localStorage.removeItem(CONFIG.CACHE_KEY);
                return null;
            }

            return data.items;
        } catch (e) {
            console.error('キャッシュ読み込みエラー:', e);
            return null;
        }
    }

    /**
     * データをキャッシュに保存
     * @param {Array} items
     */
    function setCachedData(items) {
        try {
            localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({
                items: items,
                timestamp: Date.now()
            }));
        } catch (e) {
            console.error('キャッシュ保存エラー:', e);
        }
    }

    /**
     * CSVデータを取得・パース
     * @returns {Promise<Array>}
     */
    async function fetchTickerData() {
        // キャッシュチェック
        const cached = getCachedData();
        if (cached) {
            return cached;
        }

        try {
            const response = await fetch(CONFIG.CSV_URL);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const csvText = await response.text();

            return new Promise((resolve, reject) => {
                Papa.parse(csvText, {
                    header: true,
                    skipEmptyLines: true,
                    complete: function(results) {
                        if (results.errors.length > 0) {
                            console.warn('CSV解析でエラーが発生:', results.errors);
                            // エラーがあっても処理を継続
                        }

                        const items = processTickerItems(results.data);
                        setCachedData(items);
                        resolve(items);
                    },
                    error: function(error) {
                        console.error('CSVパースエラー:', error);
                        reject(error);
                    }
                });
            });
        } catch (error) {
            console.error('データ取得エラー:', error);
            throw error;
        }
    }

    /**
     * ティッカーアイテムを処理
     * @param {Array} data
     * @returns {Array}
     */
    function processTickerItems(data) {
        const now = new Date();

        // サニタイゼーション、フィルタリング、ソート
        const processed = data
            .map(item => ({
                id: escapeHtml(item.id || ''),
                title: escapeHtml(item.title || ''),
                url: item.url || '',  // URLはエスケープせずに後で検証
                category: escapeHtml(item.category || 'news'),
                status: escapeHtml(item.status || ''),
                priority: parseInt(item.priority, 10) || 999,
                published_at: item.published_at || '',
                expires_at: item.expires_at || ''
            }))
            .filter(item => {
                // status=active のチェック
                if (item.status !== 'active') return false;

                // 期限チェック
                if (item.expires_at) {
                    const expiryDate = new Date(item.expires_at);
                    if (!isNaN(expiryDate) && expiryDate < now) {
                        return false;
                    }
                }

                return true;
            })
            .sort((a, b) => {
                // priority昇順
                if (a.priority !== b.priority) {
                    return a.priority - b.priority;
                }

                // published_at降順
                const dateA = new Date(a.published_at || 0);
                const dateB = new Date(b.published_at || 0);
                return dateB - dateA;
            })
            .slice(0, CONFIG.MAX_ITEMS);

        return processed;
    }

    /**
     * ティッカーUIを初期化
     */
    function initializeTickerUI() {
        // DOM要素をキャッシュ
        elements.tickerContainer = document.getElementById(CONFIG.CONTAINER_ID);

        if (!elements.tickerContainer) {
            console.error('ティッカーコンテナが見つかりません');
            return false;
        }

        elements.tickerContainer.innerHTML = `
            <div id="${CONFIG.ITEM_ID}" class="ticker-item">
                <span class="ticker-category"></span>
                <a href="#" target="_blank" rel="noopener noreferrer"></a>
            </div>
        `;

        elements.tickerItem = document.getElementById(CONFIG.ITEM_ID);
        elements.categorySpan = elements.tickerItem.querySelector('.ticker-category');
        elements.linkElement = elements.tickerItem.querySelector('a');

        return true;
    }

    /**
     * ティッカーアイテムを表示
     * @param {Object} item
     */
    function displayTickerItem(item) {
        if (!elements.tickerItem || !elements.categorySpan || !elements.linkElement) {
            console.error('必要なDOM要素が見つかりません');
            return;
        }

        elements.tickerItem.classList.remove('active', 'ticker-pr');

        setTimeout(() => {
            // カテゴリ設定
            const categoryLabel = item.category === 'pr' ? '[PR]' : '[ニュース]';
            elements.categorySpan.textContent = categoryLabel;

            // PRカテゴリの場合は特別スタイリング
            if (item.category === 'pr') {
                elements.tickerItem.classList.add('ticker-pr');
            }

            // リンク設定（URL検証を含む）
            elements.linkElement.textContent = item.title || '（タイトルなし）';

            if (isValidUrl(item.url)) {
                elements.linkElement.href = item.url;
                elements.linkElement.target = '_blank';
                elements.linkElement.rel = 'noopener noreferrer';
                elements.linkElement.style.cursor = 'pointer';
            } else {
                elements.linkElement.href = '#';
                elements.linkElement.target = '_self';
                elements.linkElement.removeAttribute('rel');
                elements.linkElement.style.cursor = 'default';
                elements.linkElement.onclick = (e) => {
                    e.preventDefault();
                    return false;
                };
            }

            elements.tickerItem.classList.add('active');
        }, 100);
    }

    /**
     * ティッカーローテーションを開始
     */
    function startRotation() {
        if (tickerData.length === 0) return;

        // 初回表示
        displayTickerItem(tickerData[currentIndex]);

        // タイマーをクリア（既存のタイマーがあれば）
        if (rotationTimer) {
            clearInterval(rotationTimer);
        }

        // ローテーション開始
        rotationTimer = setInterval(() => {
            currentIndex = (currentIndex + 1) % tickerData.length;
            displayTickerItem(tickerData[currentIndex]);
        }, CONFIG.ROTATION_INTERVAL);
    }

    /**
     * ティッカー機能を停止
     */
    function stopTicker() {
        if (rotationTimer) {
            clearInterval(rotationTimer);
            rotationTimer = null;
        }
    }

    /**
     * デバッグ情報表示に切り替え
     */
    function switchToDebugInfo() {
        stopTicker();

        const container = document.getElementById(CONFIG.CONTAINER_ID);
        if (container) {
            container.style.display = 'none';
        }

        const debugInfo = document.querySelector('.debug-info');
        if (debugInfo) {
            debugInfo.style.display = 'flex';
        }
    }

    /**
     * ティッカーを初期化
     */
    async function initializeTicker() {
        // デバッグモードチェック
        if (isDebugMode()) {
            console.log('デバッグモード: ティッカー非表示');
            return;
        }

        try {
            // デバッグ情報を非表示
            const debugInfo = document.querySelector('.debug-info');
            if (debugInfo) {
                debugInfo.style.display = 'none';
            }

            // UI初期化
            if (!initializeTickerUI()) {
                throw new Error('UI初期化失敗');
            }

            // データ取得
            tickerData = await fetchTickerData();

            if (tickerData.length === 0) {
                console.log('表示するティッカーアイテムがありません');
                switchToDebugInfo();
                return;
            }

            // ローテーション開始
            startRotation();

        } catch (error) {
            console.error('ティッカー初期化エラー:', error);
            switchToDebugInfo();
        }
    }

    /**
     * クリーンアップ処理（メモリリーク防止）
     */
    function cleanup() {
        stopTicker();
        elements.tickerContainer = null;
        elements.tickerItem = null;
        elements.categorySpan = null;
        elements.linkElement = null;
        tickerData = [];
        currentIndex = 0;
    }

    // ページアンロード時にタイマークリア（メモリリーク防止）
    window.addEventListener('beforeunload', cleanup);

    // Papaparseが読み込まれるまで待機
    function waitForPapaparse() {
        if (typeof Papa !== 'undefined') {
            initializeTicker();
        } else {
            setTimeout(waitForPapaparse, 100);
        }
    }

    // DOM読み込み完了後に実行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForPapaparse);
    } else {
        waitForPapaparse();
    }

    // グローバルに公開（デバッグ用）
    window.sekakareTickerDebug = {
        refresh: initializeTicker,
        stop: stopTicker,
        clearCache: () => localStorage.removeItem(CONFIG.CACHE_KEY),
        toggleDebugMode: () => {
            const current = isDebugMode();
            localStorage.setItem(CONFIG.DEBUG_MODE_KEY, String(!current));
            location.reload();
        }
    };

})();