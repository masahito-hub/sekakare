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

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', function() {
    initLogsPage();
});

// ログページの初期化
function initLogsPage() {
    loadVisits();
    displayLogs();
    updateHeader();
    setupModalElements();
    setupModalListeners();
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
            // visitedAt を優先して表示（空の場合は「日付不明」）
            const visitDate = visit.visitedAt || visit.date || '日付不明';
            const placeId = visit.placeId || visit.id || visit.place_id || '';
            const name = visit.name || '店舗名不明';
            const address = visit.address || visit.vicinity || '住所不明';

            // 市区まで抽出（簡易版）
            const cityMatch = address.match(/(.+?[都道府県])(.+?[市区町村])/);
            const displayAddress = cityMatch ? cityMatch[1] + cityMatch[2] : address;

            // メニュー・メモの表示用HTML
            const menuHtml = visit.menu ? `<p class="log-menu">🍛 ${escapeHtml(visit.menu)}</p>` : '';
            const memoHtml = visit.memo ? `<p class="log-memo">📝 ${escapeHtml(visit.memo)}</p>` : '';

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
                    ${menuHtml}
                    ${memoHtml}
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

// モーダルを開く
function openEditModal(placeId) {
    const log = visits.find(l => (l.placeId || l.id || l.place_id) === placeId);
    if (!log) {
        console.error('Log not found:', placeId);
        return;
    }

    currentEditingLog = log;

    // モーダルにデータを設定
    const modalStoreName = document.getElementById('modalStoreName');
    const modalVisitedAt = document.getElementById('modalVisitedAt');
    const modalMenu = document.getElementById('modalMenu');
    const modalMemo = document.getElementById('modalMemo');

    if (modalStoreName) modalStoreName.textContent = log.name || '店舗名不明';
    if (modalVisitedAt) modalVisitedAt.value = log.visitedAt || log.date || '';
    if (modalMenu) modalMenu.value = log.menu || '';
    if (modalMemo) modalMemo.value = log.memo || '';

    // モーダルを表示
    editModal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // 背景スクロール防止

    // フォーカス可能要素を取得
    updateFocusableElements();

    // 最初の入力要素にフォーカス
    if (modalVisitedAt) {
        modalVisitedAt.focus();
    }
}

// モーダルを閉じる
function closeEditModal() {
    if (!editModal) return;

    editModal.style.display = 'none';
    document.body.style.overflow = ''; // 背景スクロール復帰
    currentEditingLog = null;
    focusableElements = [];
}

// フォーカス可能要素を更新
function updateFocusableElements() {
    const focusableSelectors = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    focusableElements = Array.from(editModal.querySelectorAll(focusableSelectors));
    firstFocusableElement = focusableElements[0];
    lastFocusableElement = focusableElements[focusableElements.length - 1];
}

// フォーカストラップ
function handleFocusTrap(e) {
    if (!editModal || editModal.style.display === 'none') return;
    if (e.key !== 'Tab') return;

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

// 保存処理
function saveEditedLog() {
    if (!currentEditingLog) {
        console.error('編集中のログが見つかりません');
        return;
    }

    // 要素の存在確認を追加
    const visitedAtEl = document.getElementById('modalVisitedAt');
    const menuEl = document.getElementById('modalMenu');
    const memoEl = document.getElementById('modalMemo');

    if (!visitedAtEl || !menuEl || !memoEl) {
        console.error('必要なフォーム要素が見つかりません');
        alert('編集フォームの読み込みに失敗しました。ページを再読み込みしてください。');
        return;
    }

    // 値を取得
    const visitedAt = visitedAtEl.value;
    const menu = menuEl.value;
    const memo = memoEl.value;

    // バリデーション
    if (!validateEditInput(visitedAt, menu, memo)) {
        return;
    }

    // データ更新
    const storageKey = (typeof Config !== 'undefined' && Config.storageKeys && Config.storageKeys.curryLogs)
        ? Config.storageKeys.curryLogs
        : 'curryLogs';

    const logIndex = visits.findIndex(l => {
        const id = l.placeId || l.id || l.place_id;
        const currentId = currentEditingLog.placeId || currentEditingLog.id || currentEditingLog.place_id;
        return id === currentId;
    });

    if (logIndex === -1) {
        console.error('ログが見つかりません');
        alert('ログの更新に失敗しました。');
        return;
    }

    // 更新内容を適用
    visits[logIndex] = {
        ...visits[logIndex],
        visitedAt: visitedAt || null,  // 空の場合は null
        menu: menu.trim(),
        memo: memo.trim(),
        editedAt: new Date().toISOString()  // ISO 8601形式で保存
    };

    // localStorageに保存
    try {
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
    // 訪問日のチェック（空を許容）
    if (visitedAt) {  // 入力されている場合のみチェック
        // 日付フォーマットのチェック
        if (!/^\d{4}-\d{2}-\d{2}$/.test(visitedAt)) {
            alert('訪問日を正しい形式で入力してください');
            return false;
        }

        // 未来の日付チェック（文字列比較版 - タイムゾーン対応）
        const today = new Date();
        const todayString = today.getFullYear() + '-' +
            String(today.getMonth() + 1).padStart(2, '0') + '-' +
            String(today.getDate()).padStart(2, '0');

        if (visitedAt > todayString) {
            alert('未来の日付は選択できません');
            return false;
        }
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
    // 既存のトーストを削除（重複防止）
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }

    // トースト通知を作成
    const toast = document.createElement('div');
    toast.className = 'toast-notification';  // CSSクラスを使用
    toast.textContent = '保存しました ✓';

    document.body.appendChild(toast);

    // 2秒後に削除
    setTimeout(() => {
        toast.remove();
    }, 2000);
}
