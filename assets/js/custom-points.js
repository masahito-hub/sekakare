/**
 * カスタム地点管理モジュール
 * ユーザーが任意の地点にカレー体験を記録できる機能
 *
 * セキュリティ:
 * - すべてのユーザー入力はescapeHtml()でサニタイズ
 * - XSS攻撃対策を実装
 * - 入力値の厳格なバリデーション
 */

// 定数定義（マジックナンバー排除）
const CUSTOM_POINTS_CONFIG = {
    STORAGE_KEY: 'userCustomPoints',
    DUPLICATE_THRESHOLD_DEGREES: 0.0001, // 約10m
    MAX_NAME_LENGTH: 100,
    MAX_MENU_LENGTH: 100,
    MAX_MEMO_LENGTH: 500,
    POINT_TYPES: ['外食', 'デリバリー', 'コンビニ・スーパー', 'レトルト', '自炊', 'その他']
};

/**
 * カスタム地点一覧を取得
 * @returns {Array} カスタム地点の配列
 */
function getUserCustomPoints() {
    try {
        const data = localStorage.getItem(CUSTOM_POINTS_CONFIG.STORAGE_KEY);
        if (!data) return [];

        const points = JSON.parse(data);
        return Array.isArray(points) ? points : [];
    } catch (error) {
        console.error('[CustomPoints] データ読み込みエラー:', error);
        return [];
    }
}

/**
 * カスタム地点を保存
 * @param {Object} point - 保存する地点データ
 * @param {number} point.lat - 緯度（必須）
 * @param {number} point.lng - 経度（必須）
 * @param {string} point.name - 店舗名/地点名（必須）
 * @param {string} point.type - 種類
 * @param {string} point.date - 訪問日
 * @param {string} point.menu - メニュー
 * @param {string} point.memo - メモ
 * @param {Array} point.photos - 写真配列
 * @returns {Object|null} 保存された地点データ、エラー時はnull
 */
function saveCustomPoint(point) {
    // 必須フィールドの詳細バリデーション
    if (!point.lat || !point.lng) {
        console.error('[CustomPoints] 位置情報（lat/lng）が必要です');
        return null;
    }

    if (!point.name || typeof point.name !== 'string') {
        console.error('[CustomPoints] 店舗名は必須です');
        return null;
    }

    // データのサニタイゼーション（保存前にエスケープ）
    const sanitizedPoint = {
        id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        lat: parseFloat(point.lat),
        lng: parseFloat(point.lng),
        name: String(point.name).trim(),
        type: point.type || '外食',
        date: point.date || new Date().toISOString().split('T')[0],
        menu: point.menu ? String(point.menu).trim() : '',
        memo: point.memo ? String(point.memo).trim() : '',
        photos: Array.isArray(point.photos) ? point.photos : [],
        createdAt: new Date().toISOString(),
        isCustomPoint: true
    };

    // バリデーション
    if (sanitizedPoint.name.length > CUSTOM_POINTS_CONFIG.MAX_NAME_LENGTH) {
        console.error(`[CustomPoints] 店舗名は${CUSTOM_POINTS_CONFIG.MAX_NAME_LENGTH}文字以内である必要があります`);
        return null;
    }

    if (sanitizedPoint.menu.length > CUSTOM_POINTS_CONFIG.MAX_MENU_LENGTH) {
        console.error(`[CustomPoints] メニューは${CUSTOM_POINTS_CONFIG.MAX_MENU_LENGTH}文字以内である必要があります`);
        return null;
    }

    if (sanitizedPoint.memo.length > CUSTOM_POINTS_CONFIG.MAX_MEMO_LENGTH) {
        console.error(`[CustomPoints] メモは${CUSTOM_POINTS_CONFIG.MAX_MEMO_LENGTH}文字以内である必要があります`);
        return null;
    }

    try {
        const points = getUserCustomPoints();
        points.push(sanitizedPoint);
        localStorage.setItem(CUSTOM_POINTS_CONFIG.STORAGE_KEY, JSON.stringify(points));

        console.log('[CustomPoints] カスタム地点を保存しました:', sanitizedPoint.id);
        return sanitizedPoint;
    } catch (error) {
        console.error('[CustomPoints] 保存エラー:', error);
        return null;
    }
}

/**
 * カスタム地点を削除
 * @param {string} id - 削除する地点のID
 * @returns {boolean} 成功時true
 */
function deleteCustomPoint(id) {
    if (!id) {
        console.error('[CustomPoints] IDが指定されていません');
        return false;
    }

    try {
        const points = getUserCustomPoints();
        const filtered = points.filter(p => p.id !== id);

        if (filtered.length === points.length) {
            console.warn('[CustomPoints] 削除対象が見つかりませんでした:', id);
            return false;
        }

        localStorage.setItem(CUSTOM_POINTS_CONFIG.STORAGE_KEY, JSON.stringify(filtered));
        console.log('[CustomPoints] カスタム地点を削除しました:', id);
        return true;
    } catch (error) {
        console.error('[CustomPoints] 削除エラー:', error);
        return false;
    }
}

/**
 * カスタム地点を更新
 * @param {string} id - 更新する地点のID
 * @param {Object} updates - 更新内容
 * @returns {Object|null} 更新された地点データ、エラー時はnull
 */
function updateCustomPoint(id, updates) {
    if (!id) {
        console.error('[CustomPoints] IDが指定されていません');
        return null;
    }

    try {
        const points = getUserCustomPoints();
        const index = points.findIndex(p => p.id === id);

        if (index === -1) {
            console.error('[CustomPoints] 更新対象が見つかりませんでした:', id);
            return null;
        }

        // データのサニタイゼーション
        const sanitizedUpdates = {};
        if (updates.name !== undefined) sanitizedUpdates.name = String(updates.name).trim();
        if (updates.type !== undefined) sanitizedUpdates.type = String(updates.type);
        if (updates.date !== undefined) sanitizedUpdates.date = String(updates.date);
        if (updates.menu !== undefined) sanitizedUpdates.menu = String(updates.menu).trim();
        if (updates.memo !== undefined) sanitizedUpdates.memo = String(updates.memo).trim();
        if (updates.photos !== undefined) sanitizedUpdates.photos = updates.photos;

        // バリデーション
        if (sanitizedUpdates.name && sanitizedUpdates.name.length > CUSTOM_POINTS_CONFIG.MAX_NAME_LENGTH) {
            console.error(`[CustomPoints] 店舗名は${CUSTOM_POINTS_CONFIG.MAX_NAME_LENGTH}文字以内である必要があります`);
            return null;
        }

        points[index] = {
            ...points[index],
            ...sanitizedUpdates,
            editedAt: new Date().toISOString()
        };

        localStorage.setItem(CUSTOM_POINTS_CONFIG.STORAGE_KEY, JSON.stringify(points));
        console.log('[CustomPoints] カスタム地点を更新しました:', id);
        return points[index];
    } catch (error) {
        console.error('[CustomPoints] 更新エラー:', error);
        return null;
    }
}

/**
 * Haversine公式で2地点間の距離（メートル）を計算
 * @param {number} lat1 - 地点1の緯度
 * @param {number} lng1 - 地点1の経度
 * @param {number} lat2 - 地点2の緯度
 * @param {number} lng2 - 地点2の経度
 * @returns {number} 距離（メートル）
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // 地球の半径（メートル）
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // メートル単位
}

/**
 * スマート重複地点チェック（3段階）
 * @param {number} newLat - 新規地点の緯度
 * @param {number} newLng - 新規地点の経度
 * @returns {Object} {
 *   tier: 'auto'|'confirm'|'new',
 *   distance: number,
 *   existingPoint: Object|null,
 *   message: string|null
 * }
 */
function checkDuplicateNearby(newLat, newLng) {
    let closestPoint = null;
    let closestDistance = Infinity;

    // カスタム地点との距離チェック
    const customPoints = getUserCustomPoints();
    for (const point of customPoints) {
        const distance = calculateDistance(newLat, newLng, point.lat, point.lng);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestPoint = point;
        }
    }

    // Places API訪問記録との距離チェック
    if (typeof curryLogs !== 'undefined' && Array.isArray(curryLogs)) {
        for (const log of curryLogs) {
            if (log.lat && log.lng) {
                const distance = calculateDistance(newLat, newLng, log.lat, log.lng);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestPoint = {
                        name: log.name,
                        lat: log.lat,
                        lng: log.lng,
                        id: log.id
                    };
                }
            }
        }
    }

    // 3段階判定
    if (closestDistance <= 5) {
        // 5m以内: 自動で既存地点として扱う
        return {
            tier: 'auto',
            distance: Math.round(closestDistance),
            existingPoint: closestPoint,
            message: null
        };
    } else if (closestDistance <= 30) {
        // 5-30m: 確認ダイアログ
        const distanceText = Math.round(closestDistance);
        return {
            tier: 'confirm',
            distance: distanceText,
            existingPoint: closestPoint,
            message: `${distanceText}m先に「${closestPoint.name}」があります。同じ場所ですか？`
        };
    } else {
        // 30m以上: 新しい地点として作成
        return {
            tier: 'new',
            distance: Math.round(closestDistance),
            existingPoint: null,
            message: null
        };
    }
}

/**
 * カレーログとカスタム地点をマージ（共有関数）
 * コードの重複を排除し、app.jsとlogs.jsで共有
 * @param {Array} curryLogs - 既存のカレーログ配列
 * @returns {Array} マージされたログ配列
 */
function getMergedLogs(curryLogs) {
    const customPoints = getUserCustomPoints();

    // カスタム地点をログ形式に変換
    const convertedPoints = customPoints.map(point => ({
        id: point.id,
        placeId: point.id,
        place_id: point.id,
        name: point.name,
        address: point.type, // 種類を住所フィールドに表示
        vicinity: point.type,
        date: point.date,
        visitedAt: point.date,
        createdAt: point.createdAt,
        menu: point.menu,
        memo: point.memo,
        photos: point.photos || [],
        lat: point.lat,
        lng: point.lng,
        isCustomPoint: true
    }));

    // マージして返す
    return [...(Array.isArray(curryLogs) ? curryLogs : []), ...convertedPoints];
}
