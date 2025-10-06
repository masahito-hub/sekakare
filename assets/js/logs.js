/**
 * ログページのメインロジック
 * - localStorageからvisits[]を読み込み
 * - 日付順ソート（新→旧）
 * - 月ごとにグループ化して表示
 * - Empty State表示
 */

(function() {
    'use strict';

    /**
     * localStorageから訪問ログを取得
     */
    function getVisitsFromStorage() {
        try {
            const curryLogs = JSON.parse(localStorage.getItem(Config.storageKeys.curryLogs) || '[]');

            // データ構造の拡張: createdAt, editedAtを追加（まだない場合）
            const visits = curryLogs.map(log => {
                // 既存のログにcreatedAtがない場合は追加
                if (!log.createdAt) {
                    log.createdAt = log.date || new Date().toISOString();
                }
                // editedAtはnullで初期化
                if (!log.editedAt) {
                    log.editedAt = null;
                }
                return log;
            });

            // 更新されたデータを保存
            localStorage.setItem(Config.storageKeys.curryLogs, JSON.stringify(visits));

            return visits;
        } catch (error) {
            console.error('ログの読み込みエラー:', error);
            return [];
        }
    }

    /**
     * 日付文字列をDateオブジェクトに変換
     */
    function parseDate(dateString) {
        if (!dateString) return new Date();

        // ISO形式の場合
        if (dateString.includes('T') || dateString.includes('-')) {
            return new Date(dateString);
        }

        // 日本語形式の場合（例: "2025/10/6 13:45:30"）
        return new Date(dateString);
    }

    /**
     * 訪問ログを日付順にソート（新→旧）
     */
    function sortVisitsByDate(visits) {
        return [...visits].sort((a, b) => {
            const dateA = parseDate(a.createdAt || a.date);
            const dateB = parseDate(b.createdAt || b.date);
            return dateB - dateA; // 降順
        });
    }

    /**
     * 月ごとにグループ化
     */
    function groupByMonth(visits) {
        const groups = {};

        visits.forEach(visit => {
            const date = parseDate(visit.createdAt || visit.date);
            const year = date.getFullYear();
            const month = date.getMonth() + 1; // 0-11 → 1-12
            const key = `${year}年${month}月`;

            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(visit);
        });

        return groups;
    }

    /**
     * 訪問日を表示用にフォーマット
     */
    function formatVisitDate(dateString) {
        const date = parseDate(dateString);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}/${month}/${day}`;
    }

    /**
     * 住所から市区までを抽出
     */
    function extractCityFromAddress(address) {
        if (!address) return '不明';

        // 例: "東京都新宿区西新宿1-2-3" → "東京都新宿区"
        // 都道府県 + 市区町村を抽出
        const match = address.match(/^(.+?[都道府県])(.+?[市区町村])/);
        if (match) {
            return match[1] + match[2];
        }

        // マッチしない場合は最初の30文字まで表示
        return address.substring(0, 30) + (address.length > 30 ? '...' : '');
    }

    /**
     * Empty Stateを表示
     */
    function renderEmptyState() {
        const content = `
            <div class="empty-state">
                <div class="empty-state-icon">🍛</div>
                <h2>まだカレーログがありません</h2>
                <p>
                    地図ページで店舗を検索して、<br>
                    「訪問済み」を追加しましょう！
                </p>
                <a href="/" class="btn-back-to-map">地図ページへ戻る</a>
            </div>
        `;

        document.getElementById('logsContent').innerHTML = content;
    }

    /**
     * ログカードを生成
     */
    function createLogCard(visit) {
        const visitDate = formatVisitDate(visit.createdAt || visit.date);
        const cityName = extractCityFromAddress(visit.address);

        // 店名クリックで地図ページへ遷移（placeIdパラメータ付き）
        const mapLink = `/?placeId=${encodeURIComponent(visit.id)}`;

        return `
            <div class="log-card">
                <div class="log-card-header">
                    <a href="${mapLink}" class="log-card-name">${visit.name}</a>
                    <div class="log-card-date">📅 ${visitDate}</div>
                </div>
                <div class="log-card-address">📍 ${cityName}</div>
            </div>
        `;
    }

    /**
     * ログ一覧を表示
     */
    function renderLogs(visits) {
        const sortedVisits = sortVisitsByDate(visits);
        const groupedVisits = groupByMonth(sortedVisits);

        let html = '';

        // 月ごとに表示
        Object.keys(groupedVisits).forEach(monthKey => {
            html += `<div class="month-header">${monthKey}</div>`;

            groupedVisits[monthKey].forEach(visit => {
                html += createLogCard(visit);
            });
        });

        document.getElementById('logsContent').innerHTML = html;
    }

    /**
     * サマリーを更新
     */
    function updateSummary(visits) {
        const count = visits.length;

        if (count === 0) {
            document.getElementById('logSummary').textContent = 'あなたのカレー旅ログ';
            return;
        }

        // 最古と最新の日付を取得
        const sortedVisits = sortVisitsByDate(visits);
        const latestDate = parseDate(sortedVisits[0].createdAt || sortedVisits[0].date);
        const oldestDate = parseDate(sortedVisits[sortedVisits.length - 1].createdAt || sortedVisits[sortedVisits.length - 1].date);

        const latestFormatted = formatVisitDate(latestDate.toISOString());
        const oldestFormatted = formatVisitDate(oldestDate.toISOString());

        document.getElementById('logSummary').textContent =
            `${count}杯のカレー履歴（${oldestFormatted}〜${latestFormatted}）`;
    }

    /**
     * ページ初期化
     */
    function init() {
        console.log('ログページを初期化中...');

        // フッターの年を設定
        const footerYear = document.getElementById('footer-year');
        if (footerYear) {
            footerYear.textContent = new Date().getFullYear();
        }

        // ログを取得
        const visits = getVisitsFromStorage();
        console.log(`${visits.length}件のログを読み込みました`);

        // サマリーを更新
        updateSummary(visits);

        // ログを表示
        if (visits.length === 0) {
            renderEmptyState();
        } else {
            renderLogs(visits);
        }

        // Google Analytics - ページビュー
        if (typeof gtag !== 'undefined') {
            gtag('event', 'page_view', {
                'page_title': 'ログページ',
                'page_location': window.location.href,
                'page_path': '/logs.html',
                'logs_count': visits.length
            });
        }
    }

    // DOMContentLoaded後に初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
