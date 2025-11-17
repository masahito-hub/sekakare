// ログページのメインロジック

// Config フォールバック
const APP_NAME = (typeof Config !== 'undefined' && Config.APP_NAME) ? Config.APP_NAME : 'セカカレ';

/**
 * 日本の都道府県リスト
 * 地域別ソートで使用
 */
const PREFECTURES = [
    '北海道',
    '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
    '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
    '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
    '岐阜県', '静岡県', '愛知県', '三重県',
    '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
    '鳥取県', '島根県', '岡山県', '広島県', '山口県',
    '徳島県', '香川県', '愛媛県', '高知県',
    '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
];

// localStorageから訪問履歴を読み込み
let visits = [];

// モーダル関連のグローバル変数
let editModal = null;
let currentEditingLog = null;
let focusableElements = [];
let firstFocusableElement = null;
let lastFocusableElement = null;

// 写真管理用のグローバル変数
let currentPhotos = []; // 現在編集中の写真配列
const MAX_PHOTOS = 3; // 最大写真枚数

// 画像拡大モーダル関連
let imageViewModal = null;
let currentImageIndex = 0;
let currentImageArray = [];

/**
 * ログデータをソートする
 * @param {Array} logs - ログデータの配列
 * @param {string} sortType - ソートタイプ
 * @returns {Array} ソート済みのログデータ
 */
function sortLogs(logs, sortType) {
    const sortedLogs = [...logs]; // 元の配列を変更しないようコピー

    switch (sortType) {
        case 'date-desc': // 日付順（新→旧）
            return sortedLogs.sort((a, b) => {
                const dateA = a.visitedAt || a.createdAt || a.date || '';
                const dateB = b.visitedAt || b.createdAt || b.date || '';
                return dateB.localeCompare(dateA);
            });

        case 'date-asc': // 日付順（旧→新）
            return sortedLogs.sort((a, b) => {
                const dateA = a.visitedAt || a.createdAt || a.date || '';
                const dateB = b.visitedAt || b.createdAt || b.date || '';
                return dateA.localeCompare(dateB);
            });

        case 'region': // 地域別（都道府県）
            return sortedLogs.sort((a, b) => {
                const prefA = extractPrefecture(a.address || '');
                const prefB = extractPrefecture(b.address || '');
                return prefA.localeCompare(prefB, 'ja');
            });

        case 'visit-count': // 再訪回数順
            // 事前に訪問回数をカウント（O(n)）
            const visitCountMap = new Map();
            logs.forEach(log => {
                const name = log.name;
                visitCountMap.set(name, (visitCountMap.get(name) || 0) + 1);
            });

            return sortedLogs.sort((a, b) => {
                const countA = visitCountMap.get(a.name) || 0;
                const countB = visitCountMap.get(b.name) || 0;
                return countB - countA;
            });

        default:
            return sortedLogs;
    }
}

/**
 * 住所から都道府県を抽出
 * @param {string} address - 住所文字列
 * @returns {string} 都道府県名
 */
function extractPrefecture(address) {
    for (const pref of PREFECTURES) {
        if (address.includes(pref)) {
            return pref;
        }
    }
    return 'その他';
}

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
    setupSortListener();
    setupPhotoListeners();
    setupImageViewModal();
}

// 訪問履歴を読み込み（後方互換性あり + カスタムポイント統合）
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
                // 写真配列の初期化
                if (!visit.photos) {
                    visit.photos = [];
                }
                return visit;
            });

            // 更新されたデータを保存
            localStorage.setItem(storageKey, JSON.stringify(visits));
        }

        // カスタムポイントを取得してマージ（getUserCustomPoints関数を使用）
        if (typeof getUserCustomPoints === 'function') {
            const customPoints = getUserCustomPoints();

            // カスタムポイントをvisits形式に変換
            const convertedCustomPoints = customPoints.map(point => ({
                id: point.id,
                placeId: point.id,
                name: point.name,
                address: `${point.type}`, // 種類を住所フィールドに表示
                vicinity: `${point.type}`,
                date: point.date,
                visitedAt: point.date,
                createdAt: point.createdAt,
                editedAt: point.editedAt || null,
                menu: point.menu,
                memo: point.memo,
                photos: point.photos || [],
                lat: point.lat,
                lng: point.lng,
                isCustomPoint: true // カスタムポイント識別フラグ
            }));

            // マージ
            visits = [...visits, ...convertedCustomPoints];
            console.log(`ログ読み込み完了: Places API ${visits.length - convertedCustomPoints.length}件 + Custom ${convertedCustomPoints.length}件`);
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

    // 並び替え設定を取得（デフォルト: date-desc）
    let sortType = 'date-desc';
    try {
        sortType = localStorage.getItem('sortType') || 'date-desc';
    } catch (e) {
        console.warn('localStorage unavailable:', e);
    }

    // ソート実行
    const sortedVisits = sortLogs(visits, sortType);

    // ドロップダウンの選択状態を復元
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.value = sortType;
    }

    // ソートタイプに応じて表示方法を分岐
    if (sortType === 'region') {
        displayLogsByRegion(sortedVisits);
    } else {
        displayLogsByDate(sortedVisits);
    }
}

/**
 * 写真サムネイルHTMLを生成
 * @param {Array} photos - 写真配列
 * @param {string} placeId - 店舗ID
 * @returns {string} HTML文字列
 */
function generatePhotoThumbnails(photos, placeId) {
    if (!photos || photos.length === 0) return '';

    let html = '<div class="log-photos">';
    
    photos.slice(0, 3).forEach((photo, index) => {
        html += `
            <img 
                src="${photo.data}" 
                alt="写真 ${index + 1}" 
                class="log-photo-thumbnail"
                data-place-id="${escapeHtml(placeId)}"
                data-photo-index="${index}"
                loading="lazy">
        `;
    });

    html += '</div>';
    return html;
}

/**
 * 地域別にログを表示
 * @param {Array} logs - ソート済みのログデータ
 */
function displayLogsByRegion(logs) {
    const logsContainer = document.getElementById('logsContainer');

    // 都道府県ごとにグループ化
    const groupedByPrefecture = {};
    logs.forEach(log => {
        const prefecture = extractPrefecture(log.address || '');
        if (!groupedByPrefecture[prefecture]) {
            groupedByPrefecture[prefecture] = [];
        }
        groupedByPrefecture[prefecture].push(log);
    });

    // 都道府県の順序を保持（ソート済みの順番）
    const prefectureOrder = [];
    logs.forEach(log => {
        const prefecture = extractPrefecture(log.address || '');
        if (!prefectureOrder.includes(prefecture)) {
            prefectureOrder.push(prefecture);
        }
    });

    // HTML生成
    let html = '';
    prefectureOrder.forEach(prefecture => {
        html += `<div class="region-group">`;
        html += `<div class="region-header">${escapeHtml(prefecture)}</div>`;

        groupedByPrefecture[prefecture].forEach(visit => {
            const visitDate = visit.visitedAt || visit.createdAt || visit.date || '日付不明';
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
                    ${visit.menu ? `<p class="log-menu">🍛 ${escapeHtml(visit.menu)}</p>` : ''}
                    ${visit.memo ? `<p class="log-memo">📝 ${escapeHtml(visit.memo)}</p>` : ''}
                    ${generatePhotoThumbnails(visit.photos, placeId)}
                </div>
            `;
        });

        html += `</div>`;
    });

    logsContainer.innerHTML = html;
}

/**
 * 日付別（月別）にログを表示
 * @param {Array} logs - ソート済みのログデータ
 */
function displayLogsByDate(logs) {
    const logsContainer = document.getElementById('logsContainer');

    // 月ごとにグループ化
    const groupedByMonth = groupByMonth(logs);

    // HTML生成（XSS対策: escapeHtml使用）
    let html = '';

    for (const [monthKey, monthLogs] of Object.entries(groupedByMonth)) {
        html += `<div class="month-group">`;
        html += `<div class="month-header">${escapeHtml(monthKey)}</div>`;

        monthLogs.forEach(visit => {
            const visitDate = visit.visitedAt || visit.createdAt || visit.date || '日付不明';
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
                    ${visit.menu ? `<p class="log-menu">🍛 ${escapeHtml(visit.menu)}</p>` : ''}
                    ${visit.memo ? `<p class="log-memo">📝 ${escapeHtml(visit.memo)}</p>` : ''}
                    ${generatePhotoThumbnails(visit.photos, placeId)}
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
        const dateStr = visit.visitedAt || visit.createdAt || visit.date || '';
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
            .map(v => v.visitedAt || v.createdAt || v.date || '')
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

    // 写真サムネイルクリックで拡大表示
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('log-photo-thumbnail')) {
            const placeId = e.target.dataset.placeId;
            const photoIndex = parseInt(e.target.dataset.photoIndex, 10);
            
            const log = visits.find(l => (l.placeId || l.id || l.place_id) === placeId);
            if (log && log.photos && log.photos.length > 0) {
                openImageView(photoIndex, log.photos);
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

    // 保存ボタン
    const modalSave = document.getElementById('modalSave');
    if (modalSave) {
        modalSave.addEventListener('click', saveEditedLog);
    }
}

// 並び替えドロップダウンのイベントリスナー設定
function setupSortListener() {
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            const sortType = e.target.value;
            // 選択した並び順を保存
            try {
                localStorage.setItem('sortType', sortType);
            } catch (error) {
                console.warn('localStorage save failed:', error);
            }
            // ログを再表示
            displayLogs();
        });
    }
}

/**
 * 写真関連のイベントリスナー設定
 */
function setupPhotoListeners() {
    const addPhotoBtn = document.getElementById('addPhotoBtn');
    const photoInput = document.getElementById('modalPhotoInput');

    if (addPhotoBtn && photoInput) {
        addPhotoBtn.addEventListener('click', () => {
            if (currentPhotos.length >= MAX_PHOTOS) {
                alert(`写真は最大${MAX_PHOTOS}枚までです。`);
                return;
            }
            photoInput.click();
        });

        photoInput.addEventListener('change', handlePhotoSelection);
    }
}

/**
 * 写真選択ハンドラー
 * @param {Event} e - changeイベント
 */
async function handlePhotoSelection(e) {
    const files = Array.from(e.target.files);
    
    if (files.length === 0) return;

    // 枚数チェック
    if (currentPhotos.length + files.length > MAX_PHOTOS) {
        alert(`写真は最大${MAX_PHOTOS}枚までです。残り${MAX_PHOTOS - currentPhotos.length}枚追加できます。`);
        return;
    }

    // ローディング表示
    showPhotoLoading();

    try {
        // 各ファイルを処理
        for (const file of files) {
            // 容量チェック
            const storage = checkStorageCapacity();
            if (storage.percentage > 80) {
                alert('ストレージ容量が不足しています。古い写真を削除するか、他のデータを整理してください。');
                break;
            }

            try {
                // 画像圧縮
                const compressedData = await compressImage(file, {
                    maxWidth: 800,
                    maxHeight: 800,
                    quality: 0.7
                });

                // 写真オブジェクトを作成
                const photo = {
                    id: generateUniqueId(),
                    data: compressedData,
                    createdAt: new Date().toISOString()
                };

                currentPhotos.push(photo);
                console.log(`[Photo] Added: ${photo.id}, Size: ${(compressedData.length / 1024).toFixed(2)}KB`);

            } catch (error) {
                console.error('[Photo] 圧縮エラー:', error);
                alert(error.message || '画像の処理に失敗しました。');
            }
        }

        // プレビュー更新
        updatePhotoPreview();

    } finally {
        // ローディング非表示
        hidePhotoLoading();
        // ファイル入力をリセット
        e.target.value = '';
    }
}

/**
 * 写真プレビューを更新
 */
function updatePhotoPreview() {
    const previewContainer = document.getElementById('photoPreviewContainer');
    const addPhotoBtn = document.getElementById('addPhotoBtn');

    if (!previewContainer) return;

    // プレビューHTML生成
    let html = '';
    currentPhotos.forEach((photo, index) => {
        html += `
            <div class="photo-preview-item" data-photo-id="${escapeHtml(photo.id)}">
                <img src="${photo.data}" alt="写真 ${index + 1}" loading="lazy">
                <button class="photo-delete-btn" data-photo-id="${escapeHtml(photo.id)}" aria-label="削除">×</button>
            </div>
        `;
    });

    previewContainer.innerHTML = html;

    // 削除ボタンのイベントリスナー
    previewContainer.querySelectorAll('.photo-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const photoId = btn.dataset.photoId;
            deletePhoto(photoId);
        });
    });

    // プレビュー画像クリックで拡大表示
    previewContainer.querySelectorAll('.photo-preview-item img').forEach((img, index) => {
        img.addEventListener('click', () => {
            openImageView(index, currentPhotos);
        });
    });

    // 追加ボタンの表示/非表示
    if (addPhotoBtn) {
        if (currentPhotos.length >= MAX_PHOTOS) {
            addPhotoBtn.style.display = 'none';
        } else {
            addPhotoBtn.style.display = 'flex';
        }
    }
}

/**
 * 写真を削除
 * @param {string} photoId - 削除する写真のID
 */
function deletePhoto(photoId) {
    const index = currentPhotos.findIndex(p => p.id === photoId);
    if (index !== -1) {
        currentPhotos.splice(index, 1);
        updatePhotoPreview();
        console.log(`[Photo] Deleted: ${photoId}`);
    }
}

/**
 * ローディング表示
 */
function showPhotoLoading() {
    const addPhotoBtn = document.getElementById('addPhotoBtn');
    if (addPhotoBtn) {
        addPhotoBtn.disabled = true;
        addPhotoBtn.innerHTML = '<span class="add-photo-icon">⏳</span><span class="add-photo-text">処理中...</span>';
    }
}

/**
 * ローディング非表示
 */
function hidePhotoLoading() {
    const addPhotoBtn = document.getElementById('addPhotoBtn');
    if (addPhotoBtn) {
        addPhotoBtn.disabled = false;
        addPhotoBtn.innerHTML = '<span class="add-photo-icon">📷</span><span class="add-photo-text">写真を追加</span>';
    }
}

/**
 * 画像拡大モーダルの設定
 */
function setupImageViewModal() {
    imageViewModal = document.getElementById('imageViewModal');
    
    if (!imageViewModal) return;

    // 閉じるボタン
    const closeBtn = imageViewModal.querySelector('.image-modal-close');
    const overlay = imageViewModal.querySelector('.image-modal-overlay');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeImageView);
    }

    if (overlay) {
        overlay.addEventListener('click', closeImageView);
    }

    // ナビゲーションボタン
    const prevBtn = imageViewModal.querySelector('.image-nav-prev');
    const nextBtn = imageViewModal.querySelector('.image-nav-next');

    if (prevBtn) {
        prevBtn.addEventListener('click', showPrevImage);
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', showNextImage);
    }

    // キーボードナビゲーション
    document.addEventListener('keydown', (e) => {
        if (!imageViewModal || imageViewModal.style.display === 'none') return;

        if (e.key === 'ArrowLeft') {
            showPrevImage();
        } else if (e.key === 'ArrowRight') {
            showNextImage();
        } else if (e.key === 'Escape') {
            closeImageView();
        }
    });
}

/**
 * 画像拡大表示を開く
 * @param {number} index - 表示する画像のインデックス
 * @param {Array} photos - 写真配列
 */
function openImageView(index, photos) {
    if (!imageViewModal || !photos || photos.length === 0) return;

    currentImageIndex = index;
    currentImageArray = photos;

    updateImageView();

    imageViewModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

/**
 * 画像拡大表示を閉じる
 */
function closeImageView() {
    if (!imageViewModal) return;

    imageViewModal.style.display = 'none';
    document.body.style.overflow = '';
    currentImageIndex = 0;
    currentImageArray = [];
}

/**
 * 画像ビューを更新
 */
function updateImageView() {
    if (!imageViewModal || currentImageArray.length === 0) return;

    const img = document.getElementById('imageViewImg');
    const counter = document.getElementById('imageCounter');
    const prevBtn = imageViewModal.querySelector('.image-nav-prev');
    const nextBtn = imageViewModal.querySelector('.image-nav-next');

    if (img) {
        img.src = currentImageArray[currentImageIndex].data;
    }

    // カウンター更新
    if (counter && currentImageArray.length > 1) {
        counter.textContent = `${currentImageIndex + 1} / ${currentImageArray.length}`;
        counter.style.display = 'block';
    } else if (counter) {
        counter.style.display = 'none';
    }

    // ナビゲーションボタンの表示
    if (prevBtn) {
        prevBtn.style.display = currentImageArray.length > 1 ? 'block' : 'none';
    }

    if (nextBtn) {
        nextBtn.style.display = currentImageArray.length > 1 ? 'block' : 'none';
    }
}

/**
 * 前の画像を表示
 */
function showPrevImage() {
    if (currentImageArray.length === 0) return;
    currentImageIndex = (currentImageIndex - 1 + currentImageArray.length) % currentImageArray.length;
    updateImageView();
}

/**
 * 次の画像を表示
 */
function showNextImage() {
    if (currentImageArray.length === 0) return;
    currentImageIndex = (currentImageIndex + 1) % currentImageArray.length;
    updateImageView();
}

// モーダルを開く
function openEditModal(placeId) {
    const log = visits.find(l => (l.placeId || l.id || l.place_id) === placeId);
    if (!log) {
        console.error('Log not found:', placeId);
        return;
    }

    currentEditingLog = log;

    // 写真データを読み込み
    currentPhotos = log.photos ? [...log.photos] : [];

    // モーダルにデータを設定
    const modalStoreName = document.getElementById('modalStoreName');
    const modalVisitedAt = document.getElementById('modalVisitedAt');
    const modalMenu = document.getElementById('modalMenu');
    const modalMemo = document.getElementById('modalMemo');

    if (modalStoreName) modalStoreName.textContent = log.name || '店舗名不明';
    if (modalVisitedAt) modalVisitedAt.value = log.visitedAt || log.date || '';
    if (modalMenu) modalMenu.value = log.menu || '';
    if (modalMemo) modalMemo.value = log.memo || '';

    // 写真プレビュー更新
    updatePhotoPreview();

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
    currentPhotos = [];
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

    // 更新内容を適用（写真を含む）
    visits[logIndex] = {
        ...visits[logIndex],
        visitedAt: visitedAt || null,  // 空の場合は null
        menu: menu.trim(),
        memo: memo.trim(),
        photos: currentPhotos, // 写真データを保存
        editedAt: new Date().toISOString()  // ISO 8601形式で保存
    };

    // localStorageに保存（カスタムポイントと通常ログを分けて保存）
    try {
        // カスタムポイントの場合はupdateCustomPointを使用
        if (visits[logIndex].isCustomPoint && typeof updateCustomPoint === 'function') {
            const customPointId = visits[logIndex].id;
            updateCustomPoint(customPointId, {
                name: visits[logIndex].name,
                date: visits[logIndex].visitedAt || visits[logIndex].date,
                menu: visits[logIndex].menu,
                memo: visits[logIndex].memo,
                photos: visits[logIndex].photos
            });
            console.log('[Save] カスタムポイントを保存しました', customPointId);
        } else {
            // 通常のログの場合は既存の処理
            // カスタムポイントを除外して保存
            const regularLogs = visits.filter(v => !v.isCustomPoint);
            localStorage.setItem(storageKey, JSON.stringify(regularLogs));
            console.log('[Save] ログを保存しました', visits[logIndex]);
        }

        // モーダルを閉じる
        closeEditModal();

        // ログページを再レンダリング
        displayLogs();

        // 成功メッセージ
        showSaveSuccessMessage();

    } catch (error) {
        console.error('[Save] 保存エラー:', error);
        
        // 容量エラーの場合、詳細メッセージ
        if (error.name === 'QuotaExceededError') {
            const storage = checkStorageCapacity();
            alert(`保存に失敗しました。\nストレージ使用量: ${storage.used}MB / ${storage.limit}MB\n写真の枚数を減らすか、古いログを削除してください。`);
        } else {
            alert('保存に失敗しました。容量制限を超えている可能性があります。');
        }
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
