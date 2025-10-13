// ログページのメインロジック

// Config フォールバック
const APP_NAME = (typeof Config !== 'undefined' && Config.APP_NAME) ? Config.APP_NAME : 'セカカレ';

// localStorageから訪問履歴を読み込み
let visits = [];

// モーダル関連のグローバル変数
let editModal = null;
let currentEditingLog = null;
let focusableElements = [];
let firstFocusableElement = null;
let lastFocusableElement = null;
let originalBodyOverflow = '';
let lastFocusedElement = null;

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', function() {
    initLogsPage();
});

// ログページの初期化
function initLogsPage() {
    loadVisits();
    migrateLogData();
    displayLogs();
    updateHeader();
    setupModalElements();
    setupModalListeners();
}

// 訪問履歴を読み込み
function loadVisits() {
    try {
        const storageKey = (typeof Config !== 'undefined' && Config.storageKeys && Config.storageKeys.curryLogs)
            ? Config.storageKeys.curryLogs
            : 'curryLogs';

        const logsData = localStorage.getItem(storageKey);

        if (logsData) {
            visits = JSON.parse(logsData);
        }
    } catch (error) {
        console.error('訪問履歴の読み込みエラー:', error);
        visits = [];
    }
}

/**
 * 既存データを新しい構造に移行
 */
function migrateLogData() {
    console.log('[Migration] データ移行処理を開始');

    let needsMigration = false;

    visits = visits.map(log => {
        let migrated = false;

        // date → visitedAt への移行
        if (log.date && !log.visitedAt) {
            log.visitedAt = log.date;
            migrated = true;
        }

        // createdAt の生成（なければ visitedAt または date から生成）
        if (!log.createdAt) {
            log.createdAt = log.visitedAt || log.date || new Date().toISOString().split('T')[0];
            migrated = true;
        }

        // 新しいフィールドの初期化
        if (log.editedAt === undefined) {
            log.editedAt = null;
            migrated = true;
        }

        if (log.menu === undefined) {
            log.menu = '';
            migrated = true;
        }

        if (log.memo === undefined) {
            log.memo = '';
            migrated = true;
        }

        if (log.photos === undefined) {
            log.photos = [];
            migrated = true;
        }

        if (migrated) {
            needsMigration = true;
        }

        return log;
    });

    // 移行が必要な場合は保存
    if (needsMigration) {
        const storageKey = (typeof Config !== 'undefined' && Config.storageKeys && Config.storageKeys.curryLogs)
            ? Config.storageKeys.curryLogs
            : 'curryLogs';
        localStorage.setItem(storageKey, JSON.stringify(visits));
        console.log('[Migration] データ移行完了', visits);
    } else {
        console.log('[Migration] 移行不要');
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
            const placeId = visit.placeId || visit.id || visit.place_id || '';
            const name = visit.name || '店舗名不明';
            const address = visit.address || visit.vicinity || '住所不明';

            // 市区まで抽出（簡易版）
            const cityMatch = address.match(/(.+?[都道府県])(.+?[市区町村])/);
            const displayAddress = cityMatch ? cityMatch[1] + cityMatch[2] : address;

            html += `
                <div class="log-card">
                    <button class="edit-icon" data-place-id="${escapeHtml(placeId)}" aria-label="編集">✏️</button>
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
                // YYYY-MM-DD または YYYY/MM/DD 形式から年月を抽出
                const match = dateStr.match(/^(\d{4})[-\/](\d{1,2})/);
                if (match) {
                    const year = match[1];
                    const month = parseInt(match[2], 10);
                    monthKey = `${year}年${month}月`;
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

// モーダル要素を取得
function setupModalElements() {
    editModal = document.getElementById('editModal');
}

// モーダル関連のイベントリスナー設定
function setupModalListeners() {
    // 編集アイコンのクリック（イベント委譲）
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('edit-icon') || e.target.parentElement.classList.contains('edit-icon')) {
            const button = e.target.classList.contains('edit-icon') ? e.target : e.target.parentElement;
            const placeId = button.dataset.placeId;
            if (placeId) {
                openEditModal(placeId);
            }
        }
    });

    // 閉じるボタン
    const modalClose = document.querySelector('.modal-close');
    const modalCancel = document.getElementById('modalCancel');
    const modalOverlay = document.querySelector('.modal-overlay');

    if (modalClose) {
        modalClose.addEventListener('click', closeEditModal);
    }

    if (modalCancel) {
        modalCancel.addEventListener('click', closeEditModal);
    }

    if (modalOverlay) {
        modalOverlay.addEventListener('click', closeEditModal);
    }

    // ESCキーで閉じる
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && editModal && editModal.style.display !== 'none') {
            closeEditModal();
        }
    });

    // フォーカストラップ
    document.addEventListener('keydown', handleFocusTrap);

    // 保存ボタン（Phase 1-B-2 で実装）
    const modalSave = document.getElementById('modalSave');
    if (modalSave) {
        modalSave.addEventListener('click', saveEditedLog);
    }
}

// モーダルを開く（修正版）
function openEditModal(placeId) {
    const log = visits.find(l => (l.placeId || l.id || l.place_id) === placeId);
    if (!log) {
        console.error('Log not found:', placeId);
        return;
    }

    currentEditingLog = log;

    // 現在フォーカスされている要素を保存（フォーカス復元用）
    lastFocusedElement = document.activeElement;

    // モーダルにデータを設定
    const modalStoreName = document.getElementById('modalStoreName');
    const modalVisitedAt = document.getElementById('modalVisitedAt');
    const modalMenu = document.getElementById('modalMenu');
    const modalMemo = document.getElementById('modalMemo');

    if (modalStoreName) modalStoreName.textContent = log.name || '店舗名不明';

    if (modalVisitedAt) {
        // 今日の日付を max 属性に設定（未来の日付を選択不可に）
        const today = new Date().toISOString().split('T')[0];
        modalVisitedAt.setAttribute('max', today);
        modalVisitedAt.value = log.visitedAt || log.date || '';
    }

    if (modalMenu) modalMenu.value = log.menu || '';
    if (modalMemo) modalMemo.value = log.memo || '';

    // body overflow を保存してから変更
    originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // モーダルを表示
    editModal.style.display = 'flex';

    // フォーカス可能要素を取得
    updateFocusableElements();

    // 最初の入力要素にフォーカス
    if (modalVisitedAt) {
        modalVisitedAt.focus();
    }
}

// モーダルを閉じる（修正版）
function closeEditModal() {
    if (!editModal) return;

    editModal.style.display = 'none';

    // body overflow を元の値に復元
    document.body.style.overflow = originalBodyOverflow;

    currentEditingLog = null;
    focusableElements = [];

    // フォーカスを復元
    if (lastFocusedElement && lastFocusedElement.focus) {
        lastFocusedElement.focus();
    }
    lastFocusedElement = null;
}

// フォーカス可能要素を更新
function updateFocusableElements() {
    const focusableSelectors = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    focusableElements = Array.from(editModal.querySelectorAll(focusableSelectors));
    firstFocusableElement = focusableElements[0];
    lastFocusableElement = focusableElements[focusableElements.length - 1];
}

// フォーカストラップ（修正版）
function handleFocusTrap(e) {
    if (!editModal || editModal.style.display === 'none') return;
    if (e.key !== 'Tab') return;

    // ガード追加
    if (focusableElements.length === 0) return;
    if (!firstFocusableElement || !lastFocusableElement) return;

    if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstFocusableElement) {
            e.preventDefault();
            lastFocusableElement.focus();
        }
    } else {
        // Tab
        if (document.activeElement === lastFocusableElement) {
            e.preventDefault();
            firstFocusableElement.focus();
        }
    }
}

/**
 * 編集内容を保存
 */
function saveEditedLog() {
    if (!currentEditingLog) {
        console.error('編集中のログが見つかりません');
        return;
    }

    // 入力値を取得
    const visitedAt = document.getElementById('modalVisitedAt').value;
    const menu = document.getElementById('modalMenu').value;
    const memo = document.getElementById('modalMemo').value;

    // バリデーション
    if (!validateEditInput(visitedAt, menu, memo)) {
        return;
    }

    // データ更新
    const logIndex = visits.findIndex(l => (l.placeId || l.id || l.place_id) === (currentEditingLog.placeId || currentEditingLog.id || currentEditingLog.place_id));

    if (logIndex === -1) {
        console.error('ログが見つかりません');
        return;
    }

    // 更新内容を適用
    visits[logIndex] = {
        ...visits[logIndex],
        visitedAt: visitedAt,
        menu: menu.trim(),
        memo: memo.trim(),
        editedAt: new Date().toISOString()  // ISO 8601形式で保存
    };

    // localStorageに保存
    try {
        const storageKey = (typeof Config !== 'undefined' && Config.storageKeys && Config.storageKeys.curryLogs)
            ? Config.storageKeys.curryLogs
            : 'curryLogs';
        localStorage.setItem(storageKey, JSON.stringify(visits));
        console.log('[Save] ログを保存しました', visits[logIndex]);

        // モーダルを閉じる
        closeEditModal();

        // ログページを再レンダリング
        displayLogs();

        // 成功メッセージ
        showSaveSuccessMessage();

    } catch (error) {
        console.error('[Save] 保存エラー:', error);
        alert('保存に失敗しました。容量制限を超えている可能性があります。');
    }
}

/**
 * 入力値のバリデーション
 */
function validateEditInput(visitedAt, menu, memo) {
    // 訪問日のチェック
    if (!visitedAt) {
        alert('訪問日を入力してください');
        return false;
    }

    // 未来の日付チェック
    const today = new Date().toISOString().split('T')[0];
    if (visitedAt > today) {
        alert('未来の日付は選択できません');
        return false;
    }

    // メニューの文字数制限（100文字）
    if (menu.length > 100) {
        alert('メニューは100文字以内で入力してください');
        return false;
    }

    // メモの文字数制限（500文字）
    if (memo.length > 500) {
        alert('メモは500文字以内で入力してください');
        return false;
    }

    return true;
}

/**
 * 保存成功メッセージを表示
 */
function showSaveSuccessMessage() {
    // 簡易的なトースト通知
    const toast = document.createElement('div');
    toast.textContent = '保存しました ✓';
    toast.className = 'toast-notification';
    toast.style.cssText = `
        position: fixed;
        bottom: 32px;
        left: 50%;
        transform: translateX(-50%);
        background: #4caf50;
        color: white;
        padding: 12px 24px;
        border-radius: 6px;
        z-index: 3000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        animation: fadeInOut 2s ease-in-out;
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 2000);
}
