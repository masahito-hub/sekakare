// ログページのメインロジック

// Config フォールバック
const APP_NAME = (typeof Config !== 'undefined' && Config.APP_NAME) ? Config.APP_NAME : 'セカカレ';

// localStorageから訪問履歴を読み込み
let visits = [];

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', function() {
    initLogsPage();
});

// ログページの初期化
function initLogsPage() {
    loadVisits();
    displayLogs();
    updateHeader();
}

// 訪問履歴を読み込み（後方互換性あり）
function loadVisits() {
    try {
        const storageKey = (typeof Config !== 'undefined' && Config.storageKeys && Config.storageKeys.curryLogs)
            ? Config.storageKeys.curryLogs
            : 'curryLogs';

        const logsData = localStorage.getItem(storageKey);

        if (logsData) {
            visits = JSON.parse(logsData);

            // 後方互換性: createdAt と editedAt がない場合は追加
            visits = visits.map(visit => {
                if (!visit.createdAt) {
                    visit.createdAt = visit.date || new Date().toISOString().split('T')[0];
                }
                if (!visit.editedAt) {
                    visit.editedAt = null;
                }
                return visit;
            });

            // 更新されたデータを保存
            localStorage.setItem(storageKey, JSON.stringify(visits));
        }
    } catch (error) {
        console.error('訪問履歴の読み込みエラー:', error);
        visits = [];
    }
}

// ログを表示
function displayLogs() {
    const logsContainer = document.getElementById('logsContainer');

    if (!logsContainer) {
        console.error('logsContainer が見つかりません');
        return;
    }

    // ログが0件の場合は Empty State を表示
    if (!visits || visits.length === 0) {
        logsContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🍛</div>
                <h2>まだカレーログがありません</h2>
                <p>地図ページで店舗を検索して、<br>「訪問済み」を追加しましょう！</p>
                <a href="/" class="btn-back">地図ページへ戻る</a>
            </div>
        `;
        return;
    }

    // 訪問日でソート（新→旧）
    const sortedVisits = [...visits].sort((a, b) => {
        const dateA = a.createdAt || a.date || '';
        const dateB = b.createdAt || b.date || '';
        return dateB.localeCompare(dateA);
    });

    // 月ごとにグループ化
    const groupedByMonth = groupByMonth(sortedVisits);

    // HTML生成（XSS対策: escapeHtml使用）
    let html = '';

    for (const [monthKey, logs] of Object.entries(groupedByMonth)) {
        html += `<div class="month-group">`;
        html += `<div class="month-header">${escapeHtml(monthKey)}</div>`;

        logs.forEach(visit => {
            const visitDate = visit.createdAt || visit.date || '日付不明';
            const placeId = visit.id || visit.place_id || '';
            const name = visit.name || '店舗名不明';
            const address = visit.address || visit.vicinity || '住所不明';

            // 市区まで抽出（簡易版）
            const cityMatch = address.match(/(.+?[都道府県])(.+?[市区町村])/);
            const displayAddress = cityMatch ? cityMatch[1] + cityMatch[2] : address;

            html += `
                <div class="log-card">
                    <h3>
                        <a href="/?placeId=${encodeURIComponent(placeId)}" class="shop-link">
                            ${escapeHtml(name)}
                        </a>
                    </h3>
                    <p class="log-date">訪問日: ${escapeHtml(visitDate)}</p>
                    <p class="log-location">📍 ${escapeHtml(displayAddress)}</p>
                </div>
            `;
        });

        html += `</div>`;
    }

    logsContainer.innerHTML = html;
}

// 月ごとにグループ化する関数
function groupByMonth(visits) {
    const grouped = {};

    visits.forEach(visit => {
        const dateStr = visit.createdAt || visit.date || '';
        let monthKey = '日付不明';

        if (dateStr) {
            try {
                // YYYY-MM-DD 形式を想定
                const parts = dateStr.split(/[-T\s]/);
                if (parts.length >= 2) {
                    const year = parts[0];
                    const month = parts[1];
                    monthKey = `${year}年${parseInt(month, 10)}月`;
                }
            } catch (error) {
                console.error('日付解析エラー:', error, dateStr);
            }
        }

        if (!grouped[monthKey]) {
            grouped[monthKey] = [];
        }
        grouped[monthKey].push(visit);
    });

    return grouped;
}

// ヘッダー情報を更新
function updateHeader() {
    const visitCount = document.getElementById('visitCount');
    const dateRange = document.getElementById('dateRange');

    if (visitCount) {
        visitCount.textContent = visits.length;
    }

    if (dateRange && visits.length > 0) {
        const sortedDates = [...visits]
            .map(v => v.createdAt || v.date || '')
            .filter(d => d)
            .sort();

        if (sortedDates.length > 0) {
            const firstDate = sortedDates[0];
            const lastDate = sortedDates[sortedDates.length - 1];
            dateRange.textContent = `${firstDate} 〜 ${lastDate}`;
        }
    }
}
