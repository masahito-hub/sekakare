/**
 * 写真機能の設定定数
 */
const PHOTO_CONFIG = {
    MAX_FILE_SIZE: 10 * 1024 * 1024,  // 10MB
    MAX_WIDTH: 800,
    MAX_HEIGHT: 800,
    QUALITY: 0.7,
    TARGET_SIZE: 500 * 1024,  // 目標サイズ 500KB
    QUALITY_STEP: 0.1,  // 品質調整ステップ
    MIN_QUALITY: 0.3,  // 最低品質
    STORAGE_WARNING_THRESHOLD: 80  // ストレージ警告閾値（%）
};

/**
 * HTML特殊文字をエスケープ
 * @param {string} str - エスケープする文字列
 * @returns {string} エスケープされた文字列
 */
function escapeHtml(str) {
    if (typeof str !== 'string') return '';

    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Base64画像データの妥当性を検証
 * @param {string} data - 検証するBase64データ
 * @returns {boolean} 妥当な場合true
 */
function isValidBase64Image(data) {
    if (typeof data !== 'string') return false;
    
    // Base64画像データの形式チェック
    const base64Pattern = /^data:image\/(jpeg|jpg|png|webp);base64,/i;
    if (!base64Pattern.test(data)) return false;
    
    // Base64部分の長さチェック（空でないこと）
    const base64Data = data.split(',')[1];
    if (!base64Data || base64Data.length === 0) return false;
    
    // 基本的なBase64文字セットチェック
    const validBase64 = /^[A-Za-z0-9+/]*={0,2}$/;
    return validBase64.test(base64Data);
}

/**
 * Base64画像データをサニタイゼーション（XSS対策）
 * @param {string} data - サニタイズするBase64データ
 * @returns {string|null} サニタイズ済みデータ、不正な場合はnull
 */
function sanitizeImageData(data) {
    // バリデーションチェック
    if (!isValidBase64Image(data)) {
        console.error('[Security] Invalid Base64 image data detected');
        return null;
    }
    
    // data URLからMIMEタイプとBase64部分を分離
    const match = data.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i);
    if (!match) {
        console.error('[Security] Failed to parse Base64 data');
        return null;
    }
    
    const mimeType = match[1].toLowerCase();
    const base64Content = match[2];
    
    // MIMEタイプを正規化（jpg → jpeg）
    const normalizedMimeType = mimeType === 'jpg' ? 'jpeg' : mimeType;
    
    // XSS攻撃を防ぐため、確実にdata URLスキームを再構築
    const sanitized = `data:image/${normalizedMimeType};base64,${base64Content}`;
    
    console.log(`[Security] Sanitized image data: ${normalizedMimeType}, size: ${(base64Content.length / 1024).toFixed(2)}KB`);
    
    return sanitized;
}

/**
 * 画像を圧縮してBase64形式で返す
 * @param {File} file - 画像ファイル
 * @param {Object} options - 圧縮オプション
 * @param {number} options.maxWidth - 最大幅
 * @param {number} options.maxHeight - 最大高さ
 * @param {number} options.quality - 品質 (0-1)
 * @returns {Promise<string>} Base64エンコードされた画像データ
 */
function compressImage(file, options = {}) {
    const maxWidth = options.maxWidth || PHOTO_CONFIG.MAX_WIDTH;
    const maxHeight = options.maxHeight || PHOTO_CONFIG.MAX_HEIGHT;
    let quality = options.quality || PHOTO_CONFIG.QUALITY;

    return new Promise((resolve, reject) => {
        // ファイル形式チェック（より厳密に）
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type.toLowerCase())) {
            reject(new Error('対応していない画像形式です。JPEG、PNG、WebPのみ対応しています。'));
            return;
        }

        // ファイルサイズチェック
        if (file.size > PHOTO_CONFIG.MAX_FILE_SIZE) {
            reject(new Error(`画像ファイルが大きすぎます。${PHOTO_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB以下のファイルを選択してください。`));
            return;
        }

        const reader = new FileReader();
        
        reader.onerror = () => {
            reject(new Error('画像の読み込みに失敗しました。'));
        };

        reader.onload = (e) => {
            const img = new Image();
            
            img.onerror = () => {
                reject(new Error('画像の処理に失敗しました。別の画像をお試しください。'));
            };

            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    if (!ctx) {
                        reject(new Error('Canvas APIの初期化に失敗しました。'));
                        return;
                    }

                    // アスペクト比を保ちながらリサイズ
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth || height > maxHeight) {
                        const aspectRatio = width / height;

                        if (width > height) {
                            width = maxWidth;
                            height = Math.round(width / aspectRatio);
                        } else {
                            height = maxHeight;
                            width = Math.round(height * aspectRatio);
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;

                    // 画像を描画
                    ctx.drawImage(img, 0, 0, width, height);

                    // Base64に変換（品質調整ループ）
                    let base64Data = canvas.toDataURL('image/jpeg', quality);
                    let compressedSize = Math.round((base64Data.length * 3) / 4);

                    // 目標サイズを超える場合は品質を下げて再圧縮
                    let attempts = 0;
                    const maxAttempts = 5;

                    while (compressedSize > PHOTO_CONFIG.TARGET_SIZE && 
                           quality > PHOTO_CONFIG.MIN_QUALITY && 
                           attempts < maxAttempts) {
                        quality -= PHOTO_CONFIG.QUALITY_STEP;
                        base64Data = canvas.toDataURL('image/jpeg', quality);
                        compressedSize = Math.round((base64Data.length * 3) / 4);
                        attempts++;
                        
                        console.log(`[Image Compress] 再圧縮 #${attempts}: quality=${quality.toFixed(2)}, size=${(compressedSize / 1024).toFixed(2)}KB`);
                    }

                    // 圧縮後のサイズをログ出力
                    console.log(`[Image Compress] Original: ${(file.size / 1024).toFixed(2)}KB → Compressed: ${(compressedSize / 1024).toFixed(2)}KB (quality: ${quality.toFixed(2)})`);

                    // 最終的なサイズが大きすぎる場合は警告（エラーではない）
                    if (compressedSize > PHOTO_CONFIG.TARGET_SIZE) {
                        console.warn(`[Image Compress] 目標サイズ(${PHOTO_CONFIG.TARGET_SIZE / 1024}KB)を超えています: ${(compressedSize / 1024).toFixed(2)}KB`);
                    }

                    // Base64データのサニタイゼーション（XSS対策）
                    const sanitizedData = sanitizeImageData(base64Data);
                    if (!sanitizedData) {
                        reject(new Error('画像データの検証に失敗しました。'));
                        return;
                    }

                    resolve(sanitizedData);
                } catch (error) {
                    reject(new Error('画像の圧縮処理に失敗しました: ' + error.message));
                }
            };

            img.src = e.target.result;
        };

        reader.readAsDataURL(file);
    });
}

/**
 * localStorage の使用容量をチェック
 * @returns {Object} { used: number, limit: number, percentage: number }
 */
function checkStorageCapacity() {
    let total = 0;
    
    try {
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                total += localStorage[key].length + key.length;
            }
        }
    } catch (error) {
        console.error('localStorage容量チェックエラー:', error);
        return { used: 0, limit: 5, percentage: 0 };
    }

    const usedMB = total / 1024 / 1024;
    const limitMB = 5; // 一般的なlocalStorageの容量目安
    const percentage = (usedMB / limitMB) * 100;

    return {
        used: parseFloat(usedMB.toFixed(2)),
        limit: limitMB,
        percentage: Math.round(percentage)
    };
}

/**
 * 一意なIDを生成
 * @returns {string} 一意なID
 */
function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
