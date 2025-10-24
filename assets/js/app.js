// メインアプリケーションロジック

let map;
let currentPlace = null;
let curryLogs = JSON.parse(localStorage.getItem(Config.storageKeys.curryLogs) || '[]');
let heatmapData = JSON.parse(localStorage.getItem(Config.storageKeys.heatmapData) || '{}');
let markers = [];
let heatmapCircles = [];
let heatmapOverlay = null; // Canvas-based heatmap overlay
let achievements = JSON.parse(localStorage.getItem(Config.storageKeys.achievements) || '{}');
let searchTimeout;
let isManualSearch = false;  // 手動検索フラグを追加

// ヘルパー関数: 訪問済みチェック
function isPlaceVisited(placeId) {
    return Array.isArray(curryLogs) && curryLogs.some(log => log.id === placeId);
}

// 地図を初期化
function initMap() {
    console.log('地図を初期化しています...');

    try {
        // デフォルトの中心座標（フォールバック用）
        let initialCenter = Config.settings.defaultLocation;
        let initialZoom = Config.settings.defaultZoom;

        // 現在地を取得してから地図を初期化
        if (navigator.geolocation) {
            console.log('現在地を取得中...');
            updateDebugInfo('<strong>📍 現在地を取得しています...</strong> 位置情報の使用を許可してください');

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    // 現在地取得成功
                    console.log('現在地取得成功:', position.coords);
                    initialCenter = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    initialZoom = 15;  // 現在地の場合はズームを調整
                    updateDebugInfo('<strong>✅ 現在地を取得しました</strong> あなたの周辺のカレー店を検索できます');

                    // 現在地を中心に地図を初期化
                    createMap(initialCenter, initialZoom);

                    // Google Analytics - 現在地取得成功イベント
                    if (typeof gtag !== 'undefined') {
                        gtag('event', 'geolocation_success', {
                            'event_category': 'location',
                            'latitude': position.coords.latitude.toFixed(4),
                            'longitude': position.coords.longitude.toFixed(4),
                            'event_label': 'current_location',
                            'custom_parameter_1': 'geolocation'
                        });
                    }
                },
                (error) => {
                    // 現在地取得失敗
                    console.error('現在地取得エラー:', error);
                    let errorMessage = '';
                    switch(error.code) {
                        case error.PERMISSION_DENIED:
                            errorMessage = '位置情報の使用が許可されませんでした';
                            break;
                        case error.POSITION_UNAVAILABLE:
                            errorMessage = '位置情報が利用できません';
                            break;
                        case error.TIMEOUT:
                            errorMessage = '位置情報の取得がタイムアウトしました';
                            break;
                        default:
                            errorMessage = '位置情報の取得に失敗しました';
                    }
                    updateDebugInfo(`<strong>⚠️ ${errorMessage}</strong> デフォルト位置で地図を表示します`);

                    // フォールバック: デフォルト位置で地図を初期化
                    createMap(initialCenter, initialZoom);

                    // Google Analytics - 現在地取得エラーイベント
                    if (typeof gtag !== 'undefined') {
                        gtag('event', 'geolocation_error', {
                            'event_category': 'error',
                            'error_code': error.code,
                            'error_message': errorMessage,
                            'event_label': 'geolocation_failed',
                            'custom_parameter_1': 'geolocation_error'
                        });
                    }
                },
                {
                    enableHighAccuracy: true,  // 高精度位置情報を要求
                    timeout: 10000,  // 10秒でタイムアウト
                    maximumAge: 0  // キャッシュを使用しない
                }
            );
        } else {
            // Geolocation API非対応
            console.log('Geolocation APIが利用できません');
            updateDebugInfo('<strong>⚠️ お使いのブラウザは位置情報に対応していません</strong> デフォルト位置で地図を表示します');
            createMap(initialCenter, initialZoom);
        }

    } catch (error) {
        console.error('地図初期化エラー:', error);
        updateDebugInfo('❌ 地図の初期化でエラーが発生しました');
    }
}

// 地図オブジェクトを作成
function createMap(center, zoom) {
    map = new google.maps.Map(document.getElementById('map'), {
        zoom: zoom,
        center: center,
        gestureHandling: 'greedy',  // 1本指でのパン操作を可能にする
        mapId: 'sekakare_map',  // Advanced Markers用のMap IDを追加
        styles: [
            {
                "featureType": "poi",
                "elementType": "labels.text",
                "stylers": [{ "visibility": "off" }]
            }
        ]
    });

    console.log('地図が作成されました');

    // 検索ボックスを有効化
    document.getElementById('searchBox').disabled = false;

    // 地図移動時の自動検索を設定（条件付き実行）
    setupAutoSearch();

    // 初期表示時の自動検索を無効化（店名検索専用）
    // console.log('周辺のカレー店を検索します');
    // autoSearchCurryShops(Config.settings.defaultLocation);

    // ヒートマップを表示
    displayHeatmap();

    // ログを表示
    displayLogs();

    // 実績システムを初期化
    initAchievements();

    // URLパラメータからplaceIdを取得（ログページからの遷移対応）
    const params = new URLSearchParams(window.location.search);
    const placeId = params.get('placeId');
    if (placeId) {
        const visit = curryLogs.find(v => v.id === placeId);
        if (visit) {
            map.setCenter({ lat: visit.lat, lng: visit.lng });
            map.setZoom(16);
            console.log('ログページから遷移: placeId =', placeId);

            // URLパラメータをクリーンアップ
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
}

// 自動検索の設定（条件付き実行）
function setupAutoSearch() {
    // 地図移動時の自動検索（手動検索時は実行しない）
    map.addListener('idle', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            // 手動検索フラグがtrueの場合は自動検索をスキップ
            if (isManualSearch) {
                console.log('手動検索のため自動検索をスキップ');
                isManualSearch = false;  // フラグをリセット
                return;
            }

            const center = map.getCenter();
            if (center) {
                console.log('地図移動検出 - 周辺のカレー店を検索中...');
                autoSearchCurryShops(center);
            }
        }, Config.settings.autoSearchDelay);
    });
}

// 地図移動時の自動検索関数（新発見特化モード + GAイベント付き）
async function autoSearchCurryShops(location) {
    updateDebugInfo('<strong>🗺️ 地図移動検出</strong> この周辺のカレー店を自動検索中...');

    // locationオブジェクトから正しい座標を取得
    let lat, lng;
    if (typeof location.lat === 'function') {
        lat = location.lat();
        lng = location.lng();
    } else {
        lat = location.lat;
        lng = location.lng;
    }

    console.log('検索座標:', lat, lng);

    // ズームレベルに応じた動的検索半径を実装
    const zoomLevel = map.getZoom();
    let searchRadius;

    if (zoomLevel >= 15) {
        searchRadius = 1000;  // 1km
    } else if (zoomLevel >= 12 && zoomLevel <= 14) {
        searchRadius = 3000;  // 3km
    } else if (zoomLevel >= 10 && zoomLevel <= 11) {
        searchRadius = 10000;  // 10km
    } else {
        searchRadius = 20000;  // 20km
    }

    // デバッグ情報を詳細に出力
    console.log(`[検索デバッグ] ズームレベル: ${zoomLevel}, 検索範囲: ${searchRadius}m (動的)`);
    console.log(`[検索デバッグ] 中心座標: lat=${lat.toFixed(6)}, lng=${lng.toFixed(6)}`)

    // Google Analytics - 地図移動イベント
    if (typeof gtag !== 'undefined') {
        gtag('event', 'map_moved', {
            'event_category': 'user_action',
            'latitude': lat.toFixed(4),
            'longitude': lng.toFixed(4),
            'event_label': `${lat.toFixed(4)},${lng.toFixed(4)}`,
            'custom_parameter_1': 'map_interaction'
        });
    }

    try {
        // Places API (New)で30件取得を試みる（APIが20件に制限する可能性あり）
        console.log(`[API呼び出し] 検索中... (座標: ${lat}, ${lng}, 半径: ${searchRadius}m)`);

        // シンプルな座標形式のlocationBiasを使用
        const request = {
            textQuery: 'カレー',
            fields: ['displayName', 'location', 'businessStatus', 'formattedAddress', 'rating', 'id'],
            locationBias: { lat: lat, lng: lng },  // シンプルな座標指定
            maxResultCount: 30  // 30件を要求（APIは20件に制限する可能性あり）
        };

        // searchByTextはPromiseを返すので、awaitを使用して同期的に処理
        const { places } = await google.maps.places.Place.searchByText(request);

        console.log(`[検索結果] ${places ? places.length : 0}件のカレー店を取得 (最大30件要求)`);
        if (places && places.length > 0) {
            console.log(`[検索結果] 最初の店舗: ${places[0].displayName}, 評価: ${places[0].rating || 'なし'}`);
        }

        if (places && places.length > 0) {
            // 訪問済みIDをSetで管理（O(1)での高速チェック）
            const visitedIds = new Set();
            if (Array.isArray(curryLogs)) {
                curryLogs.forEach(log => visitedIds.add(log.id));
            }
            console.log(`[検索結果] 訪問済み店舗数: ${visitedIds.size}`);

            // 各placeにIDを事前生成（後でマーカー作成時に再利用）
            places.forEach(place => {
                if (!place.id) {
                    // crypto.randomUUID()を使用してIDを生成
                    place.id = crypto.randomUUID ? crypto.randomUUID() : `place_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    if (!crypto.randomUUID) {
                        console.warn('crypto.randomUUID()がサポートされていないため、フォールバックIDを使用しています');
                    }
                }
            });

            // すべての店舗を表示（訪問済みも含む）
            clearMarkers();

            // 店舗を評価でソート（非破壊的）
            let placesToShow = [...places].sort((a, b) => {
                const ratingA = a.rating || 0;
                const ratingB = b.rating || 0;
                return ratingB - ratingA;  // 降順
            });

            // 最大表示件数を制限
            const maxDisplay = Config.settings.maxSearchResults;
            if (placesToShow.length > maxDisplay) {
                placesToShow = placesToShow.slice(0, maxDisplay);
                console.log(`[検索結果] 評価順でソート後、上位${maxDisplay}件を表示`);
            }

            // すべての店舗にマーカーを作成（訪問済みは半透明で表示）
            placesToShow.forEach(place => createNewMarker(place));

            // 訪問済み・未訪問の件数をカウント
            const visitedCount = placesToShow.filter(place => visitedIds.has(place.id)).length;
            const unvisitedCount = placesToShow.length - visitedCount;

            // Google Analytics - 自動検索完了イベント
            if (typeof gtag !== 'undefined') {
                gtag('event', 'auto_search_completed', {
                    'event_category': 'search_result',
                    'unvisited_count': unvisitedCount,
                    'visited_count': visitedCount,
                    'total_count': places.length,
                    'displayed_count': placesToShow.length,
                    'latitude': lat.toFixed(4),
                    'longitude': lng.toFixed(4),
                    'event_label': `全${placesToShow.length}件表示（未訪問${unvisitedCount}件、訪問済み${visitedCount}件）`,
                    'custom_parameter_1': 'all_stores_mode'
                });
            }

            updateDebugInfo(`<strong>✅ ${placesToShow.length}件表示</strong> (未訪問: ${unvisitedCount}件 / 訪問済み: ${visitedCount}件)`);

        } else {
            updateDebugInfo('<strong>⚠️ この周辺にはカレー店が見つかりませんでした</strong> 地図を移動してみてください');
        }
    } catch (error) {
        console.error('[エラー] 自動検索エラー:', error);
        console.error('[エラー詳細]', error.stack);

        // エラーメッセージを詳細に表示
        let errorMsg = error.message;
        updateDebugInfo(`<strong>❌ 自動検索エラー:</strong> ${errorMsg}`);
    }
}

// 店名専用検索機能（GAイベント付き）
function searchCurryByKeyword(keyword) {
    console.log('店名検索中:', keyword);

    // 手動検索フラグを設定
    isManualSearch = true;

    // Google Analytics カスタムイベント - 検索実行
    if (typeof gtag !== 'undefined') {
        gtag('event', 'search', {
            'event_category': 'user_action',
            'search_term': keyword,
            'event_label': keyword,
            'custom_parameter_1': 'keyword_search'
        });
    }

    updateDebugInfo('<strong>🔍 検索中...</strong> "' + keyword + '" を店名で検索しています');

    const request = {
        textQuery: keyword,
        fields: ['displayName', 'location', 'businessStatus', 'formattedAddress'],
        maxResultCount: 1  // 店名検索は1件のみ表示
    };

    // locationBiasは削除（全国から検索）
    // const center = map.getCenter();
    // if (center) {
    //     request.locationBias = { lat: center.lat(), lng: center.lng() };
    // }

    google.maps.places.Place.searchByText(request).then((response) => {
        console.log('検索結果:', response);

        if (response.places && response.places.length > 0) {
            clearMarkers();
            // 店名検索は最初の1件のみ表示
            const targetPlace = response.places[0];
            createNewMarker(targetPlace);

            if (targetPlace && targetPlace.location) {
                map.setCenter(targetPlace.location);
                map.setZoom(16);  // 店舗にフォーカス
            }

            // Google Analytics - 検索成功イベント
            if (typeof gtag !== 'undefined') {
                gtag('event', 'search_success', {
                    'event_category': 'search_result',
                    'search_term': keyword,
                    'result_count': response.places.length,
                    'event_label': `${keyword} - ${response.places.length}件`,
                    'custom_parameter_1': 'search_success'
                });
            }

            updateDebugInfo(`<strong>✅ 検索完了！</strong> "${keyword}" の店舗が見つかりました`);

            document.getElementById('searchBox').value = '';

        } else {
            console.log('検索結果なし');

            // Google Analytics - 検索結果なしイベント
            if (typeof gtag !== 'undefined') {
                gtag('event', 'search_no_results', {
                    'event_category': 'search_result',
                    'search_term': keyword,
                    'event_label': keyword,
                    'custom_parameter_1': 'search_no_results'
                });
            }

            updateDebugInfo(`<strong>⚠️ 検索結果なし</strong> "${keyword}" という店名のカレー店が見つかりませんでした`);
        }

    }).catch((error) => {
        console.error('検索エラー:', error);

        // Google Analytics - 検索エラーイベント
        if (typeof gtag !== 'undefined') {
            gtag('event', 'search_error', {
                'event_category': 'error',
                'search_term': keyword,
                'error_message': error.message,
                'event_label': `${keyword} - エラー`,
                'custom_parameter_1': 'search_error'
            });
        }

        updateDebugInfo(`<strong>❌ 検索エラー:</strong> ${error.message}`);
    });
}

// 改良版マーカー作成関数（🍛アイコン付き + スケールアップアニメーション）
function createNewMarker(place) {
    console.log('マーカーを作成中:', place.displayName);

    try {
        // IDの生成または再利用（crypto.randomUUID使用）
        const placeId = place.id || (crypto.randomUUID ? crypto.randomUUID() : `place_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
        if (!place.id && !crypto.randomUUID) {
            console.warn(`place.id が存在しないため、フォールバックIDを生成しました: ${placeId}`);
        }

        // ヘルパー関数を使用して訪問済みチェック
        const isVisited = isPlaceVisited(placeId);

        // Advanced Markerを使用
        const markerContent = document.createElement('div');
        markerContent.className = 'custom-marker';

        // 訪問済みの場合は半透明クラスを追加
        if (isVisited) {
            markerContent.classList.add('visited-marker');
        }

        // アニメーション用のラッパーdiv
        const animationWrapper = document.createElement('div');
        animationWrapper.className = 'marker-animation-wrapper';

        // 訪問済みは✅、未訪問は🍛アイコンで表示
        const icon = isVisited ? '✅' : '🍛';
        const size = isVisited ? '28px' : '30px';  // 訪問済みは少し小さく

        animationWrapper.innerHTML = `
            <div style="font-size: ${size}; line-height: 1;">${icon}</div>
        `;

        markerContent.appendChild(animationWrapper);

        const marker = new google.maps.marker.AdvancedMarkerElement({
            map: map,
            position: place.location,
            title: place.displayName + (isVisited ? ' (訪問済み)' : ''),
            content: markerContent
        });

        const legacyPlace = {
            name: place.displayName,
            place_id: placeId,
            geometry: { location: place.location },
            vicinity: place.formattedAddress || '住所不明',
            rating: place.rating || null
        };

        marker.addListener('click', () => {
            console.log('マーカーがクリックされました:', place.displayName);
            currentPlace = legacyPlace;
            showPopup(legacyPlace);
        });

        markers.push(marker);

    } catch (error) {
        console.error('マーカー作成エラー:', error);
        createSimpleMarker(place);
    }
}

// シンプルマーカーのフォールバック（スケールアップアニメーション付き）
function createSimpleMarker(place) {
    console.log('フォールバックマーカーを作成:', place.displayName);

    // IDの生成（crypto.randomUUID使用）
    const placeId = place.id || (crypto.randomUUID ? crypto.randomUUID() : `simple_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
    if (!place.id && !crypto.randomUUID) {
        console.warn(`フォールバック: place.id が存在しないため、代替IDを生成しました: ${placeId}`);
    }

    // ヘルパー関数を使用して訪問済みチェック
    const isVisited = isPlaceVisited(placeId);

    // フォールバックでも可能な限りAdvanced Markerを使用
    const markerContent = document.createElement('div');
    markerContent.className = 'custom-marker';

    // 訪問済みの場合は半透明クラスを追加
    if (isVisited) {
        markerContent.classList.add('visited-marker');
    }

    const animationWrapper = document.createElement('div');
    animationWrapper.className = 'marker-animation-wrapper';

    // 訪問済みは✅、未訪問は🍛アイコンで表示
    const icon = isVisited ? '✅' : '🍛';
    const size = isVisited ? '28px' : '30px';

    animationWrapper.style.cssText = `display: flex; align-items: center; justify-content: center; font-size: ${size}; line-height: 1;`;
    animationWrapper.textContent = icon;

    markerContent.appendChild(animationWrapper);

    const marker = new google.maps.marker.AdvancedMarkerElement({
        map: map,
        position: place.location,
        title: place.displayName + (isVisited ? ' (訪問済み)' : ''),
        content: markerContent
    });

    const legacyPlace = {
        name: place.displayName,
        place_id: placeId,
        geometry: { location: place.location },
        vicinity: place.formattedAddress || '住所不明',
        rating: place.rating || null
    };

    marker.addListener('click', () => {
        currentPlace = legacyPlace;
        showPopup(legacyPlace);
    });

    markers.push(marker);
}

// マーカーをクリア
function clearMarkers() {
    markers.forEach(marker => marker.setMap(null));
    markers = [];
}

// ポップアップを表示
function showPopup(place) {
    console.log('ポップアップを表示:', place);
    try {
        // ヘルパー関数を使用して訪問済みチェック
        const isVisited = isPlaceVisited(place.place_id);

        // タイトルに訪問済み表示を追加
        let titleText = place.name;
        if (isVisited) {
            titleText += ' ✅ (訪問済み)';
        }
        if (place.rating) {
            titleText += ` ⭐${place.rating}`;
        }

        document.getElementById('popupTitle').textContent = titleText;
        document.getElementById('popupAddress').textContent = place.vicinity;

        // 訪問済みの場合はボタンのテキストを変更（再訪問可能）
        const btnAte = document.getElementById('btnAte');
        if (isVisited) {
            btnAte.textContent = '✅ 訪問済み';
            btnAte.disabled = false;  // 再訪問記録を可能にする
            btnAte.style.opacity = '0.8';  // 少し透明度を上げて訪問済みを表現
        } else {
            btnAte.textContent = '🍛 食べた！';
            btnAte.disabled = false;
            btnAte.style.opacity = '1';
        }

        document.getElementById('popupOverlay').style.display = 'block';
    } catch (error) {
        console.error('ポップアップ表示エラー:', error);
    }
}

// ポップアップを閉じる
function closePopup() {
    document.getElementById('popupOverlay').style.display = 'none';
    currentPlace = null;
}

// 「食べた」を記録（実績チェック付き + GAイベント）
function recordVisit() {
    if (!currentPlace) return;

    console.log('記録中:', currentPlace.name);

    const log = {
        id: currentPlace.place_id,
        name: currentPlace.name,
        address: currentPlace.vicinity,
        lat: currentPlace.geometry.location.lat(),
        lng: currentPlace.geometry.location.lng(),
        date: new Date().toLocaleString('ja-JP')
    };

    curryLogs.push(log);
    localStorage.setItem(Config.storageKeys.curryLogs, JSON.stringify(curryLogs));

    // Google Analytics カスタムイベント - カレー記録
    if (typeof gtag !== 'undefined') {
        gtag('event', 'curry_logged', {
            'event_category': 'user_action',
            'event_label': currentPlace.name,
            'curry_shop_name': currentPlace.name,
            'curry_shop_address': currentPlace.vicinity,
            'total_visits': curryLogs.length,
            'custom_parameter_1': 'curry_visit'
        });
    }

    // ヒートマップデータを更新
    updateHeatmapData(currentPlace.place_id, log.lat, log.lng);

    displayLogs();
    displayHeatmap();
    closePopup();

    // 成功メッセージ
    alert('🍛 セカカレに追加されました！');
    console.log('記録完了');

    // 実績チェック
    checkAchievements();
}

// ヒートマップデータを更新
function updateHeatmapData(placeId, lat, lng) {
    if (!heatmapData[placeId]) {
        heatmapData[placeId] = { lat, lng, count: 0 };
    }
    heatmapData[placeId].count++;
    localStorage.setItem(Config.storageKeys.heatmapData, JSON.stringify(heatmapData));
}

// ヒートマップを表示
function displayHeatmap() {
    console.log('ヒートマップを表示中...');

    // Check if HeatmapOverlay class is available
    if (typeof HeatmapOverlay === 'undefined') {
        console.warn('HeatmapOverlay class not loaded, falling back to circle-based heatmap');
        displayHeatmapLegacy();
        return;
    }

    // Convert heatmapData object to array format for HeatmapOverlay
    const dataArray = Object.values(heatmapData).map(data => ({
        lat: data.lat,
        lng: data.lng,
        count: data.count
    }));

    if (dataArray.length === 0) {
        // Remove existing overlay if no data
        if (heatmapOverlay) {
            heatmapOverlay.setMap(null);
            heatmapOverlay = null;
        }
        console.log('ヒートマップデータなし');
        return;
    }

    // Create or update Canvas-based heatmap overlay
    if (!heatmapOverlay) {
        heatmapOverlay = new HeatmapOverlay(map, dataArray);
        console.log(`Canvas-based ヒートマップを作成: ${dataArray.length} 箇所`);
    } else {
        heatmapOverlay.updateData(dataArray);
        console.log(`Canvas-based ヒートマップを更新: ${dataArray.length} 箇所`);
    }
}

// Legacy Circle-based heatmap (fallback)
function displayHeatmapLegacy() {
    console.log('Legacy Circle-based ヒートマップを表示中...');

    // 既存の円を削除
    heatmapCircles.forEach(circle => circle.setMap(null));
    heatmapCircles = [];

    // 各場所に円を表示
    Object.values(heatmapData).forEach(data => {
        const baseOpacity = Math.min(Config.settings.heatmap.minOpacity + (data.count * 0.15), Config.settings.heatmap.maxOpacity);
        const baseRadius = Config.settings.heatmap.baseRadius + (data.count * Config.settings.heatmap.radiusIncrement);

        // グラデーション効果のために複数の同心円を作成
        const gradientLayers = 8; // グラデーションの層数
        for (let i = 0; i < gradientLayers; i++) {
            const layerRatio = (gradientLayers - i) / gradientLayers;
            const layerRadius = baseRadius * layerRatio;

            // 中心から外側に向かって透明度を下げる
            // 中心部は濃く、外縁は透明に近づく
            const layerOpacity = baseOpacity * Math.pow(layerRatio, 2.5); // 指数関数でより自然なフェードアウト

            const circle = new google.maps.Circle({
                strokeColor: 'transparent', // 境界線を透明に
                strokeOpacity: 0,
                strokeWeight: 0,
                fillColor: '#ff8c00',
                fillOpacity: layerOpacity,
                map: map,
                center: { lat: data.lat, lng: data.lng },
                radius: layerRadius,
                clickable: false // クリックイベントを無効化
            });

            heatmapCircles.push(circle);
        }
    });

    console.log(`Legacy ヒートマップ ${Object.keys(heatmapData).length} 箇所を表示`);
}

// ログを表示
function displayLogs() {
    const logList = document.getElementById('logList');
    const logCount = document.getElementById('logCount');

    if (!Array.isArray(curryLogs) || curryLogs.length === 0) {
        logList.innerHTML = '<div class="loading">まだ記録がありません。地図上のカレー店をタップして記録を始めましょう！</div>';
        logCount.textContent = '0';
        return;
    }

    logCount.textContent = Array.isArray(curryLogs) ? curryLogs.length : 0;

    // 最新の記録を上に表示
    const sortedLogs = [...curryLogs].reverse();

    // 最大3件まで表示（それ以上は「もっと見る」リンク）
    const maxDisplay = 3;
    const logsToDisplay = sortedLogs.slice(0, maxDisplay);

    let html = logsToDisplay.map(log => `
        <div class="log-item">
            <div class="log-item-name">${escapeHtml(log.name)}</div>
            <div class="log-item-date">${escapeHtml(log.date)} - ${escapeHtml(log.address)}</div>
        </div>
    `).join('');

    // 3件以上ある場合は「もっと見る」リンクを追加
    if (curryLogs.length > maxDisplay) {
        html += `
            <div style="text-align: center; margin-top: 10px;">
                <a href="/logs.html" style="color: #ff6b00; text-decoration: none; font-weight: bold;">
                    もっと見る (${curryLogs.length - maxDisplay}件) →
                </a>
            </div>
        `;
    }

    logList.innerHTML = html;
}

// デバッグ情報を更新（ティッカーモード対応）
function updateDebugInfo(html) {
    const debugElement = document.getElementById('debugInfo');
    const isDebugMode = localStorage.getItem('sekakare_debug') === 'true';

    if (debugElement) {
        debugElement.innerHTML = html;

        // デバッグモードでない場合はティッカーを優先表示
        if (!isDebugMode) {
            // ティッカーが有効でない場合のみデバッグ情報を表示
            const tickerContainer = document.getElementById('tickerContainer');
            if (tickerContainer && tickerContainer.style.display !== 'block') {
                // ティッカーエラー時のフォールバック
                debugElement.style.display = 'block';
            }
        } else {
            // デバッグモードの場合は常に表示
            debugElement.style.display = 'block';
        }
    }
}

// 実績システムを初期化
function initAchievements() {
    checkAchievements();
    console.log('実績システムを初期化しました');
}

// 実績をチェックする関数
function checkAchievements() {
    if (!Array.isArray(curryLogs)) {
        console.warn('curryLogs is not an array');
        return;
    }
    const visitCount = curryLogs.length;
    const uniqueShops = new Set(curryLogs.map(log => log.id)).size;
    const newBadges = [];

    // 新しく達成した実績をチェック
    Config.achievements.forEach(rule => {
        let condition = false;
        if (rule.requiredVisits) {
            condition = visitCount >= rule.requiredVisits;
        } else if (rule.requiredShops) {
            condition = uniqueShops >= rule.requiredShops;
        }

        if (condition && !achievements[rule.id]) {
            achievements[rule.id] = {
                name: rule.name,
                desc: rule.desc,
                date: new Date().toLocaleString('ja-JP')
            };
            newBadges.push(rule);
        }
    });

    // 実績を保存
    localStorage.setItem(Config.storageKeys.achievements, JSON.stringify(achievements));

    // 新しいバッジがある場合は表示
    if (newBadges.length > 0) {
        showAchievementPopup(newBadges);
    }

    // 実績表示を更新
    updateAchievementDisplay();
}

// 実績ポップアップを表示（GAイベント付き）
function showAchievementPopup(badges) {
    const badgeText = badges.map(badge => `${badge.name}\n${badge.desc}`).join('\n\n');

    // Google Analytics - 実績達成イベント
    if (typeof gtag !== 'undefined') {
        badges.forEach(badge => {
            gtag('event', 'achievement_unlocked', {
                'event_category': 'gamification',
                'achievement_id': badge.id,
                'achievement_name': badge.name,
                'event_label': badge.name,
                'custom_parameter_1': 'achievement'
            });
        });
    }

    alert(`🎉 新しい実績を達成しました！\n\n${badgeText}`);
}

// 実績表示を更新
function updateAchievementDisplay() {
    if (!Array.isArray(curryLogs)) {
        console.warn('curryLogs is not an array');
        return;
    }
    const visitCount = curryLogs.length;
    const uniqueShops = new Set(curryLogs.map(log => log.id)).size;
    const achievementCount = Object.keys(achievements).length;

    // ログセクションに統計を追加
    const logTitle = document.querySelector('.log-title');
    const existingStats = document.getElementById('stats');

    if (existingStats) {
        existingStats.remove();
    }

    const stats = document.createElement('div');
    stats.id = 'stats';
    stats.style.cssText = 'font-size:12px; color:#666; margin-top:5px;';
    stats.innerHTML = `
        📊 ${visitCount}回訪問 | 🏪 ${uniqueShops}店舗制覇 | 🏆 ${achievementCount}個の実績達成
    `;

    logTitle.appendChild(stats);
}

// イベントリスナーの設定
function setupEventListeners() {
    // 「食べた」ボタン
    document.getElementById('btnAte').addEventListener('click', recordVisit);

    // ポップアップを閉じる
    document.getElementById('btnClose').addEventListener('click', closePopup);
    document.getElementById('popupOverlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('popupOverlay')) {
            closePopup();
        }
    });

    // 詳細を見る
    document.getElementById('btnDetails').addEventListener('click', () => {
        if (currentPlace) {
            const searchQuery = encodeURIComponent(currentPlace.name);
            window.open(`https://www.google.com/maps/search/${searchQuery}`, '_blank');
        }
    });

    // 検索機能
    document.getElementById('searchBox').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = e.target.value.trim();
            if (query) {
                console.log('検索実行:', query);
                searchCurryByKeyword(query);
            }
        }
    });
}

// 地図を読み込み
function loadGoogleMaps() {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${Config.API_KEY}&libraries=places,marker&callback=initMap`;
    script.async = true;
    script.onerror = () => {
        console.error('Google Maps APIの読み込みに失敗しました');
        updateDebugInfo('❌ Google Maps APIの読み込みに失敗しました');
    };
    document.head.appendChild(script);
}

// 初期化処理
function init() {
    setupEventListeners();

    // ティッカー機能を初期化
    if (typeof initTicker === 'function') {
        initTicker();
    }

    // APIキーが設定されているかチェック
    if (!validateApiKey()) {
        document.getElementById('map').innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #f0f0f0; color: #666; text-align: center; padding: 20px;">
                <div>
                    <h3>APIキーを設定してください</h3>
                    <p>assets/js/config.js内の「YOUR_API_KEY_HERE」をあなたのGoogle Maps APIキーに置き換えてください。</p>
                </div>
            </div>
        `;
        updateDebugInfo('❌ APIキーが設定されていません');
    } else {
        loadGoogleMaps();
    }
}

// ページ読み込み完了時に初期化
document.addEventListener('DOMContentLoaded', init);

// Google Maps APIコールバック用のグローバル関数
window.initMap = initMap;

// フッターの著作権年を動的に設定
document.addEventListener('DOMContentLoaded', function() {
    const footerYear = document.getElementById('footer-year');
    if (footerYear) {
        footerYear.textContent = new Date().getFullYear();
    }
});
