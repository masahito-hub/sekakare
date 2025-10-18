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
 * 画像を圧縮してBase64形式で返す
 * @param {File} file - 画像ファイル
 * @param {Object} options - 圧縮オプション
 * @param {number} options.maxWidth - 最大幅 (デフォルト: 800)
 * @param {number} options.maxHeight - 最大高さ (デフォルト: 800)
 * @param {number} options.quality - 品質 (0-1, デフォルト: 0.7)
 * @returns {Promise<string>} Base64エンコードされた画像データ
 */
function compressImage(file, options = {}) {
    const maxWidth = options.maxWidth || 800;
    const maxHeight = options.maxHeight || 800;
    const quality = options.quality || 0.7;

    return new Promise((resolve, reject) => {
        // ファイル形式チェック
        if (!file.type.match(/image\/(jpeg|jpg|png|webp)/i)) {
            reject(new Error('対応していない画像形式です。JPEG、PNG、WebPのみ対応しています。'));
            return;
        }

        // ファイルサイズチェック（10MB制限）
        const maxFileSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxFileSize) {
            reject(new Error('画像ファイルが大きすぎます。10MB以下のファイルを選択してください。'));
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

                    // Base64に変換
                    const base64Data = canvas.toDataURL('image/jpeg', quality);

                    // 圧縮後のサイズチェック（目安: 500KB）
                    const compressedSize = Math.round((base64Data.length * 3) / 4); // Base64デコード後のサイズ
                    console.log(`[Image Compress] Original: ${(file.size / 1024).toFixed(2)}KB → Compressed: ${(compressedSize / 1024).toFixed(2)}KB`);

                    resolve(base64Data);
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
