// ティッカー機能実装
(function() {
    // 定数
    const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR5A92ZAN-APb-JPjiUOOyQSZoR1Owl6vbn2kz5sKu0RVrptYi7aw_GtA-pTO1Oc_YKtg7arooYXUBk/pub?gid=0&single=true&output=csv';
    const ROTATION_INTERVAL = 5000; // 5秒
    const MAX_ITEMS = 10; // 最大表示件数
    const CACHE_KEY = 'sekakare_ticker_data';
    const CACHE_DURATION = 5 * 60 * 1000; // 5分間キャッシュ

    // 状態管理
    let tickerData = [];
    let currentIndex = 0;
    let rotationTimer = null;

    // 初期化関数
    function initTicker() {
        // デバッグモード判定
        const isDebugMode = localStorage.getItem('sekakare_debug') === 'true';

        const debugInfo = document.getElementById('debugInfo');
        const tickerContainer = document.getElementById('tickerContainer');

        if (isDebugMode) {
            // デバッグモード: デバッグ情報を表示
            if (debugInfo) debugInfo.style.display = 'block';
            if (tickerContainer) tickerContainer.style.display = 'none';
            if (rotationTimer) {
                clearInterval(rotationTimer);
                rotationTimer = null;
            }
        } else {
            // 通常モード: ティッカーを表示
            if (debugInfo) debugInfo.style.display = 'none';
            if (tickerContainer) tickerContainer.style.display = 'block';

            // ティッカーデータを読み込み
            loadTickerData();
        }
    }

    // CSVデータを読み込み
    async function loadTickerData() {
        try {
            // キャッシュチェック
            const cached = getCachedData();
            if (cached) {
                console.log('キャッシュからティッカーデータを読み込み');
                tickerData = cached;
                startTicker();
                return;
            }

            // CSVを取得
            console.log('CSVからティッカーデータを取得中...');
            const response = await fetch(CSV_URL);

            if (!response.ok) {
                throw new Error('CSV取得失敗: ' + response.status);
            }

            const csvText = await response.text();

            // Papaparseでパース
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: function(results) {
                    if (results.data && results.data.length > 0) {
                        console.log('CSV解析成功:', results.data.length + '件');
                        processTickerData(results.data);
                    } else {
                        console.error('CSVデータが空です');
                        showFallbackDebugInfo();
                    }
                },
                error: function(error) {
                    console.error('CSV解析エラー:', error);
                    showFallbackDebugInfo();
                }
            });

        } catch (error) {
            console.error('ティッカーデータ読み込みエラー:', error);
            showFallbackDebugInfo();
        }
    }

    // ティッカーデータを処理
    function processTickerData(data) {
        const now = new Date();

        // フィルタリング: status=active かつ期限内
        const filtered = data.filter(item => {
            if (item.status !== 'active') return false;

            if (item.expires_at && item.expires_at.trim() !== '') {
                const expiryDate = new Date(item.expires_at);
                if (expiryDate < now) return false;
            }

            return true;
        });

        // ソート: priority昇順 → published_at降順
        filtered.sort((a, b) => {
            // priority比較
            const priorityA = parseInt(a.priority) || 999;
            const priorityB = parseInt(b.priority) || 999;
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }

            // published_at比較
            const dateA = a.published_at ? new Date(a.published_at) : new Date(0);
            const dateB = b.published_at ? new Date(b.published_at) : new Date(0);
            return dateB - dateA;
        });

        // 最大件数制限
        tickerData = filtered.slice(0, MAX_ITEMS);

        console.log('ティッカーデータ処理完了:', tickerData.length + '件');

        // キャッシュに保存
        setCachedData(tickerData);

        // ティッカー開始
        startTicker();
    }

    // ティッカー開始
    function startTicker() {
        if (tickerData.length === 0) {
            console.log('表示するティッカーデータがありません');
            showFallbackDebugInfo();
            return;
        }

        // 最初のアイテムを表示
        currentIndex = 0;
        displayTickerItem(currentIndex);

        // ローテーション開始
        if (rotationTimer) {
            clearInterval(rotationTimer);
        }

        rotationTimer = setInterval(() => {
            rotateTickerItem();
        }, ROTATION_INTERVAL);
    }

    // ティッカーアイテムを表示
    function displayTickerItem(index) {
        const item = tickerData[index];
        if (!item) return;

        const tickerContainer = document.getElementById('tickerContainer');
        const tickerItem = document.getElementById('tickerItem');
        const categorySpan = tickerItem.querySelector('.ticker-category');
        const linkElement = tickerItem.querySelector('.ticker-link');

        // フェードアウト
        tickerItem.classList.remove('active');

        setTimeout(() => {
            // カテゴリ別表示
            if (item.category === 'pr') {
                categorySpan.textContent = '[PR]';
                tickerContainer.classList.add('pr-category');
            } else {
                categorySpan.textContent = '[ニュース]';
                tickerContainer.classList.remove('pr-category');
            }

            // タイトルとリンク設定
            linkElement.textContent = item.title || '（タイトルなし）';
            linkElement.href = item.url || '#';

            // フェードイン
            tickerItem.classList.add('active');
        }, 250);
    }

    // ティッカーアイテムをローテーション
    function rotateTickerItem() {
        currentIndex = (currentIndex + 1) % tickerData.length;
        displayTickerItem(currentIndex);
    }

    // フォールバック: デバッグ情報を表示
    function showFallbackDebugInfo() {
        console.log('ティッカー表示失敗: デバッグ情報にフォールバック');
        const debugInfo = document.getElementById('debugInfo');
        const tickerContainer = document.getElementById('tickerContainer');

        if (debugInfo) debugInfo.style.display = 'block';
        if (tickerContainer) tickerContainer.style.display = 'none';

        if (rotationTimer) {
            clearInterval(rotationTimer);
            rotationTimer = null;
        }
    }

    // キャッシュからデータ取得
    function getCachedData() {
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (!cached) return null;

            const parsed = JSON.parse(cached);
            const now = Date.now();

            // キャッシュ期限チェック
            if (parsed.timestamp && (now - parsed.timestamp) < CACHE_DURATION) {
                return parsed.data;
            }

            // 期限切れキャッシュを削除
            localStorage.removeItem(CACHE_KEY);
        } catch (error) {
            console.error('キャッシュ読み込みエラー:', error);
        }
        return null;
    }

    // キャッシュにデータ保存
    function setCachedData(data) {
        try {
            const cacheData = {
                timestamp: Date.now(),
                data: data
            };
            localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        } catch (error) {
            console.error('キャッシュ保存エラー:', error);
        }
    }

    // DOMContentLoaded時に初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTicker);
    } else {
        initTicker();
    }

    // デバッグモード切り替え時に再初期化（外部から呼び出し可能）
    window.reinitializeTicker = initTicker;
})();