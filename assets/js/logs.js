// ログページのメインロジック

// Config フォールバック
const APP_NAME = (typeof Config !== 'undefined' && Config.APP_NAME) ? Config.APP_NAME : 'セカカレ';

// localStorageから訪問履歴を読み込み
let visits = [];
let currentEditIndex = -1;
let currentSortBy = 'date-desc';

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', function() {
    initLogsPage();
});

// ログページの初期化
function initLogsPage() {
    loadVisits();
    loadSortPreference();
    displayLogs();
    updateHeader();
    initModalEvents();
    initSortEvents();
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

            // データ構造の拡張と移行
            visits = visits.map(visit => {
                // visitedAt への移行
                if (!visit.visitedAt && visit.date) {
                    visit.visitedAt = visit.date;
                }

                // createdAt の設定
                if (!visit.createdAt) {
                    visit.createdAt = visit.visitedAt || visit.date || new Date().toISOString().split('T')[0];
                }

                // editedAt の設定
                if (!visit.editedAt) {
                    visit.editedAt = null;
                }

                // 新しいフィールドの初期化
                if (visit.menu === undefined) visit.menu = '';
                if (visit.memo === undefined) visit.memo = '';
                if (visit.photos === undefined) visit.photos = [];

                return visit;
            });

            // 更新されたデータを保存
            saveVisits();
        }
    } catch (error) {
        console.error('訪問履歴の読み込みエラー:', error);
        visits = [];
    }
}

// 訪問履歴を保存
function saveVisits() {
    try {
        const storageKey = (typeof Config !== 'undefined' && Config.storageKeys && Config.storageKeys.curryLogs)
            ? Config.storageKeys.curryLogs
            : 'curryLogs';

        localStorage.setItem(storageKey, JSON.stringify(visits));
    } catch (error) {
        console.error('訪問履歴の保存エラー:', error);
        alert('データの保存に失敗しました。ストレージ容量を確認してください。');
    }
}

// 並び替え設定を読み込み
function loadSortPreference() {
    const saved = localStorage.getItem('logsSortBy');
    if (saved) {
        currentSortBy = saved;
        const sortSelect = document.getElementById('sortBy');
        if (sortSelect) {
            sortSelect.value = currentSortBy;
        }
    }
}

// 並び替え設定を保存
function saveSortPreference() {
    localStorage.setItem('logsSortBy', currentSortBy);
}

// 並び替えイベントの初期化
function initSortEvents() {
    const sortSelect = document.getElementById('sortBy');
    if (sortSelect) {
        sortSelect.addEventListener('change', function() {
            currentSortBy = this.value;
            saveSortPreference();
            displayLogs();
        });
    }
}

// 訪問履歴をソート
function sortVisits(visitsArray) {
    const sorted = [...visitsArray];

    switch (currentSortBy) {
        case 'date-desc':
            // 新しい順
            sorted.sort((a, b) => {
                const dateA = a.visitedAt || a.date || a.createdAt || '';
                const dateB = b.visitedAt || b.date || b.createdAt || '';
                return dateB.localeCompare(dateA);
            });
            break;

        case 'date-asc':
            // 古い順
            sorted.sort((a, b) => {
                const dateA = a.visitedAt || a.date || a.createdAt || '';
                const dateB = b.visitedAt || b.date || b.createdAt || '';
                return dateA.localeCompare(dateB);
            });
            break;

        case 'location':
            // 地域別
            sorted.sort((a, b) => {
                const addrA = a.address || a.vicinity || '';
                const addrB = b.address || b.vicinity || '';
                return addrA.localeCompare(addrB, 'ja');
            });
            break;

        case 'visits':
            // 再訪回数順
            const visitCounts = {};
            visitsArray.forEach(visit => {
                const placeId = visit.id || visit.place_id || visit.placeId || '';
                if (placeId) {
                    visitCounts[placeId] = (visitCounts[placeId] || 0) + 1;
                }
            });
            sorted.sort((a, b) => {
                const placeIdA = a.id || a.place_id || a.placeId || '';
                const placeIdB = b.id || b.place_id || b.placeId || '';
                const countA = visitCounts[placeIdA] || 0;
                const countB = visitCounts[placeIdB] || 0;
                // 再訪回数で降順、同じなら日付で降順
                if (countB !== countA) {
                    return countB - countA;
                }
                const dateA = a.visitedAt || a.date || a.createdAt || '';
                const dateB = b.visitedAt || b.date || b.createdAt || '';
                return dateB.localeCompare(dateA);
            });
            break;
    }

    return sorted;
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

    // 訪問履歴をソート
    const sortedVisits = sortVisits(visits);

    // HTML生成（XSS対策: escapeHtml使用）
    let html = '';

    // 地域別の場合は月ごとにグループ化しない
    if (currentSortBy === 'location') {
        sortedVisits.forEach((visit, index) => {
            html += generateLogCard(visit, index);
        });
    } else {
        // 月ごとにグループ化
        const groupedByMonth = groupByMonth(sortedVisits);

        for (const [monthKey, logs] of Object.entries(groupedByMonth)) {
            html += `<div class="month-group">`;
            html += `<div class="month-header">${escapeHtml(monthKey)}</div>`;

            logs.forEach((visit, idx) => {
                // 元のインデックスを取得
                const originalIndex = visits.findIndex(v =>
                    (v.id || v.place_id || v.placeId) === (visit.id || visit.place_id || visit.placeId) &&
                    (v.visitedAt || v.date || v.createdAt) === (visit.visitedAt || visit.date || visit.createdAt)
                );
                html += generateLogCard(visit, originalIndex >= 0 ? originalIndex : idx);
            });

            html += `</div>`;
        }
    }

    logsContainer.innerHTML = html;

    // 編集アイコンにイベントリスナーを追加
    document.querySelectorAll('.edit-icon').forEach(button => {
        button.addEventListener('click', function() {
            const index = parseInt(this.dataset.index);
            openEditModal(index);
        });
    });
}

// ログカードのHTMLを生成
function generateLogCard(visit, index) {
    const visitDate = visit.visitedAt || visit.date || visit.createdAt || '日付不明';
    const placeId = visit.id || visit.place_id || visit.placeId || '';
    const name = visit.name || '店舗名不明';
    const address = visit.address || visit.vicinity || '住所不明';
    const menu = visit.menu || '';
    const memo = visit.memo || '';
    const photos = visit.photos || [];

    // 市区まで抽出（簡易版）
    const cityMatch = address.match(/(.+?[都道府県])(.+?[市区町村])/);
    const displayAddress = cityMatch ? cityMatch[1] + cityMatch[2] : address;

    let html = `
        <div class="log-card">
            <button class="edit-icon" data-index="${index}" aria-label="編集">✏️</button>
            <h3>
                <a href="/?placeId=${encodeURIComponent(placeId)}" class="shop-link">
                    ${escapeHtml(name)}
                </a>
            </h3>
            <p class="log-date">訪問日: ${escapeHtml(visitDate)}</p>
            <p class="log-location">📍 ${escapeHtml(displayAddress)}</p>
    `;

    if (menu) {
        html += `<p class="log-menu">🍛 ${escapeHtml(menu)}</p>`;
    }

    if (memo) {
        html += `<p class="log-memo">💭 ${escapeHtml(memo)}</p>`;
    }

    if (photos && photos.length > 0) {
        html += `<div class="log-photos">`;
        photos.forEach((photo, idx) => {
            html += `<img src="${escapeHtml(photo)}" alt="写真${idx + 1}" class="log-photo">`;
        });
        html += `</div>`;
    }

    html += `</div>`;

    return html;
}

// 月ごとにグループ化する関数
function groupByMonth(visits) {
    const grouped = {};

    visits.forEach(visit => {
        const dateStr = visit.visitedAt || visit.date || visit.createdAt || '';
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
            .map(v => v.visitedAt || v.date || v.createdAt || '')
            .filter(d => d)
            .sort();

        if (sortedDates.length > 0) {
            const firstDate = sortedDates[0];
            const lastDate = sortedDates[sortedDates.length - 1];
            dateRange.textContent = `${firstDate} 〜 ${lastDate}`;
        }
    }
}

// モーダルイベントの初期化
function initModalEvents() {
    const modal = document.getElementById('editModal');
    const modalClose = document.getElementById('modalClose');
    const btnCancel = document.getElementById('btnCancel');
    const editForm = document.getElementById('editForm');
    const editPhotos = document.getElementById('editPhotos');
    const editMenu = document.getElementById('editMenu');
    const editMemo = document.getElementById('editMemo');

    // モーダルを閉じる
    if (modalClose) {
        modalClose.addEventListener('click', closeEditModal);
    }

    if (btnCancel) {
        btnCancel.addEventListener('click', closeEditModal);
    }

    // ESCキーでモーダルを閉じる
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
            closeEditModal();
        }
    });

    // モーダルの背景クリックで閉じる
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeEditModal();
            }
        });
    }

    // フォーム送信
    if (editForm) {
        editForm.addEventListener('submit', handleFormSubmit);
    }

    // 写真アップロード
    if (editPhotos) {
        editPhotos.addEventListener('change', handlePhotoUpload);
    }

    // 文字数カウント
    if (editMenu) {
        editMenu.addEventListener('input', function() {
            document.getElementById('menuCharCount').textContent = this.value.length;
        });
    }

    if (editMemo) {
        editMemo.addEventListener('input', function() {
            document.getElementById('memoCharCount').textContent = this.value.length;
        });
    }
}

// 編集モーダルを開く
function openEditModal(index) {
    currentEditIndex = index;
    const visit = visits[index];

    if (!visit) {
        console.error('訪問データが見つかりません:', index);
        return;
    }

    // フォームに値を設定
    document.getElementById('editShopName').textContent = visit.name || '店舗名不明';
    document.getElementById('editVisitedAt').value = visit.visitedAt || visit.date || visit.createdAt || '';
    document.getElementById('editMenu').value = visit.menu || '';
    document.getElementById('editMemo').value = visit.memo || '';

    // 文字数を更新
    document.getElementById('menuCharCount').textContent = (visit.menu || '').length;
    document.getElementById('memoCharCount').textContent = (visit.memo || '').length;

    // 日付の最大値を今日に設定
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('editVisitedAt').max = today;

    // 写真プレビュー
    displayPhotoPreview(visit.photos || []);

    // モーダルを表示
    const modal = document.getElementById('editModal');
    if (modal) {
        modal.style.display = 'flex';
        // フォーカストラップ
        setTimeout(() => {
            document.getElementById('editVisitedAt').focus();
        }, 100);
    }
}

// 編集モーダルを閉じる
function closeEditModal() {
    const modal = document.getElementById('editModal');
    if (modal) {
        modal.style.display = 'none';
    }
    currentEditIndex = -1;

    // フォームをリセット
    const editForm = document.getElementById('editForm');
    if (editForm) {
        editForm.reset();
    }

    // 写真プレビューをクリア
    displayPhotoPreview([]);

    // ファイル入力をクリア
    const editPhotos = document.getElementById('editPhotos');
    if (editPhotos) {
        editPhotos.value = '';
    }
}

// 写真プレビューを表示
function displayPhotoPreview(photos) {
    const photoPreview = document.getElementById('photoPreview');
    if (!photoPreview) return;

    photoPreview.innerHTML = '';

    photos.forEach((photo, index) => {
        const item = document.createElement('div');
        item.className = 'photo-preview-item';

        const img = document.createElement('img');
        img.src = photo;
        img.alt = `写真${index + 1}`;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'photo-delete';
        deleteBtn.textContent = '×';
        deleteBtn.type = 'button';
        deleteBtn.setAttribute('aria-label', `写真${index + 1}を削除`);
        deleteBtn.addEventListener('click', function() {
            removePhoto(index);
        });

        item.appendChild(img);
        item.appendChild(deleteBtn);
        photoPreview.appendChild(item);
    });
}

// 写真を削除
function removePhoto(index) {
    if (currentEditIndex < 0 || currentEditIndex >= visits.length) return;

    const visit = visits[currentEditIndex];
    if (visit.photos && visit.photos[index]) {
        visit.photos.splice(index, 1);
        displayPhotoPreview(visit.photos);
    }
}

// 写真アップロード処理
async function handlePhotoUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (currentEditIndex < 0 || currentEditIndex >= visits.length) return;

    const visit = visits[currentEditIndex];
    if (!visit.photos) visit.photos = [];

    // 最大5枚まで
    const remainingSlots = 5 - visit.photos.length;
    if (remainingSlots <= 0) {
        alert('写真は最大5枚までです。');
        event.target.value = '';
        return;
    }

    const filesToProcess = Array.from(files).slice(0, remainingSlots);

    for (const file of filesToProcess) {
        // ファイルタイプチェック
        if (!file.type.startsWith('image/')) {
            alert(`${file.name} は画像ファイルではありません。`);
            continue;
        }

        try {
            // 画像を圧縮
            const compressed = await compressImage(file);
            visit.photos.push(compressed);
        } catch (error) {
            console.error('画像圧縮エラー:', error);
            alert(`${file.name} の処理に失敗しました。`);
        }
    }

    // プレビューを更新
    displayPhotoPreview(visit.photos);

    // ファイル入力をクリア
    event.target.value = '';
}

// 画像圧縮処理
async function compressImage(file, maxSizeKB = 500) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onerror = () => reject(new Error('ファイル読み込みエラー'));

        reader.onload = (e) => {
            const img = new Image();

            img.onerror = () => reject(new Error('画像読み込みエラー'));

            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // アスペクト比を維持してリサイズ
                const maxDimension = 1024;
                if (width > height && width > maxDimension) {
                    height = (height / width) * maxDimension;
                    width = maxDimension;
                } else if (height > maxDimension) {
                    width = (width / height) * maxDimension;
                    height = maxDimension;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // 品質を調整して圧縮
                let quality = 0.8;
                let result = canvas.toDataURL('image/jpeg', quality);

                // サイズチェック（Base64は約1.37倍になる）
                const sizeKB = (result.length * 0.75) / 1024;

                // 目標サイズを超えている場合は品質を下げる
                if (sizeKB > maxSizeKB) {
                    quality = 0.6;
                    result = canvas.toDataURL('image/jpeg', quality);
                }

                resolve(result);
            };

            img.src = e.target.result;
        };

        reader.readAsDataURL(file);
    });
}

// フォーム送信処理
function handleFormSubmit(event) {
    event.preventDefault();

    if (currentEditIndex < 0 || currentEditIndex >= visits.length) {
        console.error('無効な編集インデックス:', currentEditIndex);
        return;
    }

    const visit = visits[currentEditIndex];

    // 入力値を取得（XSS対策は表示時に行う）
    const visitedAt = document.getElementById('editVisitedAt').value.trim();
    const menu = document.getElementById('editMenu').value.trim();
    const memo = document.getElementById('editMemo').value.trim();

    // バリデーション
    if (!visitedAt) {
        alert('訪問日を入力してください。');
        return;
    }

    // 日付の妥当性チェック
    const today = new Date().toISOString().split('T')[0];
    if (visitedAt > today) {
        alert('訪問日は今日以前の日付を選択してください。');
        return;
    }

    // データを更新
    visit.visitedAt = visitedAt;
    visit.menu = menu;
    visit.memo = memo;
    visit.editedAt = new Date().toISOString();

    // 保存
    saveVisits();

    // モーダルを閉じる
    closeEditModal();

    // 表示を更新
    displayLogs();
    updateHeader();

    // 成功メッセージ（オプション）
    // alert('保存しました！');
}
