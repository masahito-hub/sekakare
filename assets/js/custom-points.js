/**
 * custom-points.js
 * ユーザーが任意地点に追加したカレー体験を管理
 */

// localStorage キー
const CUSTOM_POINTS_KEY = 'userCustomPoints';

/**
 * カスタムポイントのタイプ定義
 */
const CUSTOM_POINT_TYPES = [
    '外食',
    'デリバリー',
    'コンビニ・スーパー',
    'レトルト',
    '自炊',
    'その他'
];

/**
 * すべてのカスタムポイントを取得
 * @returns {Array} カスタムポイントの配列
 */
function getUserCustomPoints() {
    try {
        const data = localStorage.getItem(CUSTOM_POINTS_KEY);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('[CustomPoints] 読み込みエラー:', error);
        return [];
    }
}

/**
 * カスタムポイントを保存
 * @param {Object} point - 保存するポイントデータ
 * @param {number} point.lat - 緯度
 * @param {number} point.lng - 経度
 * @param {string} point.name - 地点名
 * @param {string} point.type - 種類
 * @param {string} point.date - 訪問日
 * @param {string} point.menu - メニュー
 * @param {string} point.memo - メモ
 * @param {Array} point.photos - 写真配列
 * @returns {Object|null} 保存されたポイント、失敗時はnull
 */
function saveCustomPoint(point) {
    try {
        // バリデーション
        if (!point.lat || !point.lng || !point.name) {
            console.error('[CustomPoints] 必須フィールドが不足しています');
            return null;
        }

        // ユニークID生成
        const id = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const newPoint = {
            id: id,
            lat: parseFloat(point.lat),
            lng: parseFloat(point.lng),
            name: point.name.trim(),
            type: point.type || 'その他',
            date: point.date || new Date().toISOString().split('T')[0],
            menu: point.menu ? point.menu.trim() : '',
            memo: point.memo ? point.memo.trim() : '',
            photos: Array.isArray(point.photos) ? point.photos : [],
            createdAt: new Date().toISOString(),
            isCustomPoint: true // カスタムポイント識別フラグ
        };

        // 既存データを取得
        const points = getUserCustomPoints();
        points.push(newPoint);

        // 保存
        localStorage.setItem(CUSTOM_POINTS_KEY, JSON.stringify(points));
        console.log('[CustomPoints] 保存成功:', id);

        return newPoint;
    } catch (error) {
        console.error('[CustomPoints] 保存エラー:', error);

        // QuotaExceededError の場合は明示的にエラーメッセージ
        if (error.name === 'QuotaExceededError') {
            alert('ストレージ容量が不足しています。古い写真やデータを削除してください。');
        }

        return null;
    }
}

/**
 * カスタムポイントを削除
 * @param {string} id - 削除するポイントのID
 * @returns {boolean} 成功時はtrue
 */
function deleteCustomPoint(id) {
    try {
        const points = getUserCustomPoints();
        const filteredPoints = points.filter(p => p.id !== id);

        if (points.length === filteredPoints.length) {
            console.warn('[CustomPoints] 削除対象が見つかりません:', id);
            return false;
        }

        localStorage.setItem(CUSTOM_POINTS_KEY, JSON.stringify(filteredPoints));
        console.log('[CustomPoints] 削除成功:', id);
        return true;
    } catch (error) {
        console.error('[CustomPoints] 削除エラー:', error);
        return false;
    }
}

/**
 * カスタムポイントを更新
 * @param {string} id - 更新するポイントのID
 * @param {Object} updates - 更新内容
 * @returns {Object|null} 更新されたポイント、失敗時はnull
 */
function updateCustomPoint(id, updates) {
    try {
        const points = getUserCustomPoints();
        const index = points.findIndex(p => p.id === id);

        if (index === -1) {
            console.error('[CustomPoints] 更新対象が見つかりません:', id);
            return null;
        }

        // 更新内容をマージ
        points[index] = {
            ...points[index],
            ...updates,
            id: id, // IDは変更不可
            createdAt: points[index].createdAt, // 作成日時は変更不可
            isCustomPoint: true, // フラグは変更不可
            editedAt: new Date().toISOString()
        };

        localStorage.setItem(CUSTOM_POINTS_KEY, JSON.stringify(points));
        console.log('[CustomPoints] 更新成功:', id);
        return points[index];
    } catch (error) {
        console.error('[CustomPoints] 更新エラー:', error);
        return null;
    }
}

/**
 * 重複チェック（既存の訪問記録との近接チェック）
 * @param {number} newLat - 新しい緯度
 * @param {number} newLng - 新しい経度
 * @param {number} thresholdDegrees - 閾値（度）デフォルト: 0.0001 (約10m)
 * @returns {Object} { isDuplicate: boolean, existingKey?: string, existingPoint?: Object }
 */
function checkDuplicateNearby(newLat, newLng, thresholdDegrees = 0.0001) {
    try {
        // 既存のPlaces API訪問記録との比較
        const heatmapData = JSON.parse(localStorage.getItem(Config.storageKeys.heatmapData) || '{}');

        for (const key in heatmapData) {
            const data = heatmapData[key];
            const distance = Math.sqrt(
                Math.pow(data.lat - newLat, 2) + Math.pow(data.lng - newLng, 2)
            );

            if (distance < thresholdDegrees) {
                // 店舗名を取得（curryLogsから）
                const curryLogs = JSON.parse(localStorage.getItem(Config.storageKeys.curryLogs) || '[]');
                const log = curryLogs.find(l => l.id === key);

                return {
                    isDuplicate: true,
                    existingKey: key,
                    existingPoint: log || null,
                    distance: distance
                };
            }
        }

        // カスタムポイント同士の重複チェック
        const customPoints = getUserCustomPoints();
        for (const point of customPoints) {
            const distance = Math.sqrt(
                Math.pow(point.lat - newLat, 2) + Math.pow(point.lng - newLng, 2)
            );

            if (distance < thresholdDegrees) {
                return {
                    isDuplicate: true,
                    existingKey: point.id,
                    existingPoint: point,
                    distance: distance
                };
            }
        }

        return { isDuplicate: false };
    } catch (error) {
        console.error('[CustomPoints] 重複チェックエラー:', error);
        return { isDuplicate: false };
    }
}

/**
 * 特定のカスタムポイントを取得
 * @param {string} id - ポイントID
 * @returns {Object|null} ポイントデータ、見つからない場合はnull
 */
function getCustomPointById(id) {
    const points = getUserCustomPoints();
    return points.find(p => p.id === id) || null;
}
