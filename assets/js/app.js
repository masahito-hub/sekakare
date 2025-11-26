// メインアプリケーションロジック

let map;
let currentPlace = null;
let curryLogs = JSON.parse(localStorage.getItem(Config.storageKeys.curryLogs) || '[]');
let heatmapData = JSON.parse(localStorage.getItem(Config.storageKeys.heatmapData) || '{}');
let placeMarkers = [];  // Places APIマーカー（🍛）
let customMarkers = []; // カスタム地点マーカー（✅）
let markers = [];       // 互換性のため残す（非推奨）
let heatmapCircles = [];
let zoomListenerAdded = false; // ズームリスナーの重複防止フラグ
let achievements = JSON.parse(localStorage.getItem(Config.storageKeys.achievements) || '{}');
let searchTimeout;
let isManualSearch = false;  // 手動検索フラグを追加

// 自動検索のズーム閾値（ヒステリシス付き）
const AUTO_ZOOM_ON = 13;   // 13以上でON（区・市レベル）
const AUTO_ZOOM_OFF = 12;  // 12以下でOFF（広域表示では自動検索無効化）
let autoSearchEnabled = false;  // 自動検索の有効/無効フラグ

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

        // デフォルトUIコントロールを非表示
        zoomControl: false,           // ズーム±ボタン非表示
        streetViewControl: false,     // ストリートビュー（黄色い人形）非表示
        mapTypeControl: false,        // 地図/航空写真切替非表示
        fullscreenControl: false,     // フルスクリーンボタン非表示

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

            // 🔧 追加: 広域表示では自動検索をスキップ
            if (!autoSearchEnabled) {
                console.log('🚫 検索スキップ (zoom < 13)');

                // Places APIマーカーのみを削除（カスタムマーカーは保持）
                if (placeMarkers && placeMarkers.length > 0) {
                    placeMarkers.forEach(marker => marker.setMap(null));
                    placeMarkers = [];
                    console.log('広域表示モードに切り替え - Places APIマーカーをクリア');
                }
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
    // 広域表示では自動検索をスキップ
    if (!autoSearchEnabled) {
        console.log('自動検索スキップ（広域表示モード: zoom <= 12）');
        return;
    }

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

            // Places APIマーカーのみをクリア（カスタムマーカーは保持）
            clearPlaceMarkers();

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
            clearPlaceMarkers();
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

        placeMarkers.push(marker);
        markers.push(marker); // 互換性のため

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

    placeMarkers.push(marker);
    markers.push(marker); // 互換性のため
}

// Places APIマーカーのみをクリア（カスタムマーカーは保持）
function clearPlaceMarkers() {
    placeMarkers.forEach(marker => marker.setMap(null));
    placeMarkers = [];
    console.log('[MarkerManagement] Places APIマーカーをクリアしました');
}

// 全マーカーをクリア（互換性のため残す、非推奨）
function clearMarkers() {
    markers.forEach(marker => marker.setMap(null));
    markers = [];
    console.warn('[MarkerManagement] clearMarkers()は非推奨です。clearPlaceMarkers()を使用してください');
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

// ヒートマップの色を取得（訪問回数に応じて変化）
function getHeatmapColor(count) {
    if (count >= 10) return '#DC143C';  // クリムゾン
    if (count >= 5) return '#FF6347';   // トマトレッド
    if (count >= 3) return '#FF8C00';   // ダークオレンジ
    return '#FFA500';                    // オレンジ
}

// ヒートマップの基本透明度を計算
function getBaseOpacity(count) {
    const minOpacity = Config.settings.heatmap.minOpacity;
    const maxOpacity = Config.settings.heatmap.maxOpacity;
    const opacityIncrement = 0.08;
    return Math.min(minOpacity + (count * opacityIncrement), maxOpacity);
}

// ヒートマップの基本半径を計算
function getBaseRadius(count) {
    const baseRadius = Config.settings.heatmap.baseRadius;
    const radiusIncrement = Config.settings.heatmap.radiusIncrement;
    const maxRadius = 800;
    return Math.min(baseRadius + (count * radiusIncrement), maxRadius);
}

/**
 * ズームレベルに応じたヒートマップ半径（ピクセル）を計算
 * Phase 2: 非線形スケーリング（広域を厚めに、近接は自然に）
 * @param {number} zoom - 現在のズームレベル
 * @returns {number} 半径（ピクセル）
 */
function getHeatmapRadius(zoom) {
    const config = Config.settings.heatmap;
    const minPx = config.minRadiusPx || 35;  // zoom 6での最小半径（デフォルト35）
    const maxPx = config.maxRadiusPx || 55;  // zoom 18での最大半径（デフォルト55）
    const zMin = 6;
    const zMax = 18;

    // 正規化（0-1の範囲に）
    const t = Math.max(0, Math.min(1, (zoom - zMin) / (zMax - zMin)));

    // 非線形イージング（広域を厚めに）
    const eased = Math.pow(t, 0.8);

    const radius = minPx + (maxPx - minPx) * eased;
    return Math.round(radius);
}

// ヒートマップを表示
function displayHeatmap() {
    console.time('heatmap-render');

    // 既存のCircle削除
    heatmapCircles.forEach(circle => circle.setMap(null));
    heatmapCircles = [];

    // HeatmapLayer用のデータ準備（minWeight boost付き）
    const heatmapDataArray = Object.values(heatmapData).map(data => {
        return {
            location: new google.maps.LatLng(data.lat, data.lng),
            weight: Math.max(data.count, 2)  // 最小weight=2を保証（孤立点の視認性向上）
        };
    });

    // カスタム地点をヒートマップに追加（weight=2で統一）
    const customPoints = getUserCustomPoints();
    const customPointData = customPoints.map(point => ({
        location: new google.maps.LatLng(point.lat, point.lng),
        weight: 2  // カスタム地点は常にweight=2
    }));

    // マージ
    const allHeatmapData = [...heatmapDataArray, ...customPointData];

    // 🔧 Critical Fix 1: Visualization Library存在チェック
    if (!google.maps.visualization || !google.maps.visualization.HeatmapLayer) {
        console.error('Google Maps Visualization Library not loaded. Check if &libraries=visualization is included in the Maps API script.');
        console.timeEnd('heatmap-render');
        return;
    }

    // HeatmapLayer作成（初回のみ）
    if (!window.heatmapLayer) {
        // カレー色グラデーション定義（Phase 2: alpha値を調整して塗り感を向上）
        const curryGradient = [
            'rgba(0,0,0,0)',          // 透明
            'rgba(255,214,102,0.45)', // 淡いカレー黄 (#FFD666) - alpha up: 0.28→0.45
            'rgba(255,186,73,0.60)',  // 黄橙 (#FFBA49) - alpha up: 0.55→0.60
            'rgba(255,140,0,0.85)',   // オレンジ (#FF8C00) - alpha up: 0.80→0.85
            'rgba(205,90,20,1.0)',    // 濃橙茶 - color adjust: #DC6619→#CD5A14
            'rgba(139,69,19,1.0)'     // ブラウン (#8B4513)
        ];

        window.heatmapLayer = new google.maps.visualization.HeatmapLayer({
            data: allHeatmapData,
            map: map,
            dissipating: true,  // ピクセル半径一定
            opacity: 0.85,      // Phase 2: 0.7 → 0.85（塗り感を向上）
            maxIntensity: 3,    // Phase 2: 孤立点の視認性向上（weight=1が33%の濃さ）
            gradient: curryGradient  // カレー色グラデーションを適用
        });

        // 🔧 Critical Fix 2: ズーム変更時の半径調整（リスナーは1回だけ追加）
        if (!zoomListenerAdded) {
            map.addListener('zoom_changed', () => {
                // ヒートマップ半径調整
                if (window.heatmapLayer) {
                    const radius = getHeatmapRadius(map.getZoom());
                    window.heatmapLayer.set('radius', radius);
                }

                // 自動検索のズーム制御（ヒステリシス付き）
                const z = map.getZoom();
                if (!autoSearchEnabled && z >= AUTO_ZOOM_ON) {
                    autoSearchEnabled = true;
                    console.log('自動検索: ON (zoom >= 13)');
                }
                if (autoSearchEnabled && z <= AUTO_ZOOM_OFF) {
                    autoSearchEnabled = false;
                    console.log('自動検索: OFF (zoom <= 12)');
                }

                // カスタムマーカーの表示/非表示制御
                if (typeof displayCustomPointMarkers === 'function') {
                    displayCustomPointMarkers();
                }
            });
            zoomListenerAdded = true;
        }
    } else {
        // データ更新のみ
        window.heatmapLayer.setData(allHeatmapData);
    }

    // 初回の半径設定
    const radius = getHeatmapRadius(map.getZoom());
    window.heatmapLayer.set('radius', radius);

    console.timeEnd('heatmap-render');
    console.log(`HeatmapLayer: ${allHeatmapData.length} 箇所を表示 (Places: ${heatmapDataArray.length}, Custom: ${customPointData.length})`);
}

// ログを表示
function displayLogs() {
    const logList = document.getElementById('logList');
    const logCount = document.getElementById('logCount');

    // カレーログとカスタム地点をマージ（共有関数使用）
    const mergedLogs = getMergedLogs(curryLogs);

    if (!Array.isArray(mergedLogs) || mergedLogs.length === 0) {
        logList.innerHTML = '<div class="loading">まだ記録がありません。地図上のカレー店をタップして記録を始めましょう！</div>';
        logCount.textContent = '0';
        return;
    }

    logCount.textContent = mergedLogs.length;

    // 最新の記録を上に表示
    const sortedLogs = [...mergedLogs].reverse();

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
    if (mergedLogs.length > maxDisplay) {
        html += `
            <div style="text-align: center; margin-top: 10px;">
                <a href="/logs.html" style="color: #ff6b00; text-decoration: none; font-weight: bold;">
                    もっと見る (${mergedLogs.length - maxDisplay}件) →
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
    // カレーログとカスタム地点をマージして実績計算
    const mergedLogs = getMergedLogs(curryLogs);

    if (!Array.isArray(mergedLogs)) {
        console.warn('mergedLogs is not an array');
        return;
    }
    const visitCount = mergedLogs.length;
    const uniqueShops = new Set(mergedLogs.map(log => log.id || log.placeId || log.place_id)).size;
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
    // カレーログとカスタム地点をマージして表示
    const mergedLogs = getMergedLogs(curryLogs);

    if (!Array.isArray(mergedLogs)) {
        console.warn('mergedLogs is not an array');
        return;
    }
    const visitCount = mergedLogs.length;
    const uniqueShops = new Set(mergedLogs.map(log => log.id || log.placeId || log.place_id)).size;
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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${Config.API_KEY}&libraries=places,marker,visualization&callback=initMap`;
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

// ============================================================================
// カスタム地点機能の統合
// ============================================================================

let customPointPhotos = []; // 現在選択中の写真
let customPointLatLng = null; // 選択された地点の座標

/**
 * 地図長押しイベントでカスタム地点追加モーダルを表示
 */
function setupCustomPointMapClick() {
    if (!map) return;

    let longPressTimer = null;
    let longPressTriggered = false;
    let longPressCancelled = false;
    let startX = 0;
    let startY = 0;
    const LONG_PRESS_DURATION = 800; // 800ms
    const MOVE_THRESHOLD = 35; // 35px以内の移動は許容

    // デスクトップ（マウス）用の長押し検出
    map.addListener('mousedown', (event) => {
        if (!event.latLng) return;

        longPressTriggered = false;
        longPressCancelled = false;
        startX = event.domEvent.clientX;
        startY = event.domEvent.clientY;

        longPressTimer = setTimeout(() => {
            if (longPressCancelled) return;
            longPressTriggered = true;
            handleLongPress(event.latLng.lat(), event.latLng.lng());
        }, LONG_PRESS_DURATION);
    });

    map.addListener('mousemove', (event) => {
        // タイマーがなければ何もしない
        if (!longPressTimer) return;

        if (event.domEvent) {
            const moveX = Math.abs(event.domEvent.clientX - startX);
            const moveY = Math.abs(event.domEvent.clientY - startY);

            // 移動距離が閾値を超えたらキャンセル
            if (moveX > MOVE_THRESHOLD || moveY > MOVE_THRESHOLD) {
                longPressCancelled = true;
                clearTimeout(longPressTimer);
                longPressTimer = null;
                console.log('[LongPress] キャンセル: 移動検出 (desktop)', moveX, moveY);
            }
        }
    });

    map.addListener('mouseup', () => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    });

    // マウスが地図外に出た場合もクリア
    map.addListener('mouseleave', () => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
            console.log('[LongPress] キャンセル: mouseleave');
        }
    });

    // モバイル（タッチ）用の長押し検出
    const mapDiv = document.getElementById('map');
    if (mapDiv) {
        mapDiv.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return; // 単一タッチのみ

            longPressTriggered = false;
            longPressCancelled = false;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;

            longPressTimer = setTimeout(() => {
                if (longPressCancelled) return;
                longPressTriggered = true;

                // タッチ位置から緯度経度を計算
                const bounds = map.getBounds();
                const ne = bounds.getNorthEast();
                const sw = bounds.getSouthWest();
                const projection = map.getProjection();

                if (projection) {
                    const topRight = projection.fromLatLngToPoint(ne);
                    const bottomLeft = projection.fromLatLngToPoint(sw);
                    const scale = Math.pow(2, map.getZoom());

                    const mapDiv = document.getElementById('map');
                    const rect = mapDiv.getBoundingClientRect();

                    const x = (e.touches[0].clientX - rect.left) / rect.width;
                    const y = (e.touches[0].clientY - rect.top) / rect.height;

                    const worldPoint = new google.maps.Point(
                        bottomLeft.x + (topRight.x - bottomLeft.x) * x,
                        topRight.y + (bottomLeft.y - topRight.y) * y
                    );

                    const latLng = projection.fromPointToLatLng(worldPoint);

                    handleLongPress(latLng.lat(), latLng.lng());
                }
            }, LONG_PRESS_DURATION);
        });

        mapDiv.addEventListener('touchmove', (event) => {
            // タイマーがなければ何もしない
            if (!longPressTimer) return;

            if (event.touches[0]) {
                const touch = event.touches[0];
                const deltaX = Math.abs(touch.clientX - startX);
                const deltaY = Math.abs(touch.clientY - startY);

                // 閾値を超えたらキャンセル
                if (deltaX > MOVE_THRESHOLD || deltaY > MOVE_THRESHOLD) {
                    longPressCancelled = true;
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                    console.log('[LongPress] キャンセル: 移動検出', deltaX, deltaY);
                }
            }
        }, { passive: true });

        mapDiv.addEventListener('touchend', () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        });

        // タッチキャンセル時もクリア
        mapDiv.addEventListener('touchcancel', () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
                console.log('[LongPress] キャンセル: touchcancel');
            }
        }, { passive: true });
    }

    /**
     * 長押しが検出されたときの処理
     */
    function handleLongPress(lat, lng) {
        console.log('[LongPress] 長押し検出成功:', { lat, lng });

        // 振動フィードバック
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }

        // スマート重複チェック（3段階）
        const duplicateCheck = checkDuplicateNearby(lat, lng);

        if (duplicateCheck.tier === 'auto') {
            // 5m以内: 自動で既存地点の記録追加モーダルを表示
            console.log(`[LongPress] 自動判定: ${duplicateCheck.distance}m以内 - 既存地点として扱う`);
            if (duplicateCheck.existingPoint) {
                // 既存地点のポップアップを表示（カスタム地点の場合）
                if (duplicateCheck.existingPoint.isCustomPoint !== false) {
                    showCustomPointPopup(duplicateCheck.existingPoint);
                } else {
                    // Places API地点の場合は通常のポップアップ
                    const legacyPlace = {
                        name: duplicateCheck.existingPoint.name,
                        place_id: duplicateCheck.existingPoint.id,
                        geometry: { location: { lat: () => duplicateCheck.existingPoint.lat, lng: () => duplicateCheck.existingPoint.lng } },
                        vicinity: duplicateCheck.existingPoint.address || '住所不明',
                        rating: null
                    };
                    showPopup(legacyPlace);
                }
            }
            return;
        } else if (duplicateCheck.tier === 'confirm') {
            // 5-30m: 確認ダイアログ
            console.log(`[LongPress] 確認判定: ${duplicateCheck.distance}m`);
            if (!confirm(duplicateCheck.message + '\n\n「はい」→既存地点に記録追加\n「いいえ」→新しい地点として作成')) {
                // 「いいえ」を選択: 新しい地点として作成
                console.log('[LongPress] ユーザーが新しい地点として作成を選択');
                showCustomPointModal(lat, lng);
                return;
            } else {
                // 「はい」を選択: 既存地点として扱う
                console.log('[LongPress] ユーザーが既存地点への記録追加を選択');
                if (duplicateCheck.existingPoint) {
                    if (duplicateCheck.existingPoint.isCustomPoint !== false) {
                        showCustomPointPopup(duplicateCheck.existingPoint);
                    } else {
                        const legacyPlace = {
                            name: duplicateCheck.existingPoint.name,
                            place_id: duplicateCheck.existingPoint.id,
                            geometry: { location: { lat: () => duplicateCheck.existingPoint.lat, lng: () => duplicateCheck.existingPoint.lng } },
                            vicinity: duplicateCheck.existingPoint.address || '住所不明',
                            rating: null
                        };
                        showPopup(legacyPlace);
                    }
                }
                return;
            }
        }

        // 30m以上: 新しい地点として作成
        console.log('[LongPress] 新規地点として作成');
        showCustomPointModal(lat, lng);
    }
}

/**
 * カスタム地点追加モーダルを表示
 * @param {number} lat - 緯度
 * @param {number} lng - 経度
 */
function showCustomPointModal(lat, lng) {
    customPointLatLng = { lat, lng };
    customPointPhotos = [];

    // フォームをリセット
    document.getElementById('customPointName').value = '';
    document.getElementById('customPointType').value = '外食';
    document.getElementById('customPointDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('customPointMenu').value = '';
    document.getElementById('customPointMemo').value = '';
    document.getElementById('customPointPhotoPreview').innerHTML = '';

    // モーダルを表示
    const modal = document.getElementById('customPointModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

/**
 * カスタム地点モーダルを閉じる
 */
function closeCustomPointModal() {
    const modal = document.getElementById('customPointModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
    customPointLatLng = null;
    customPointPhotos = [];
}

/**
 * カスタム地点を保存
 */
async function saveCustomPointFromModal() {
    if (!customPointLatLng) {
        alert('位置情報が取得できませんでした');
        return;
    }

    // XSS対策: フォーム入力値をエスケープして取得
    const nameEl = document.getElementById('customPointName');
    const typeEl = document.getElementById('customPointType');
    const dateEl = document.getElementById('customPointDate');
    const menuEl = document.getElementById('customPointMenu');
    const memoEl = document.getElementById('customPointMemo');

    if (!nameEl || !typeEl || !dateEl || !menuEl || !memoEl) {
        alert('フォーム要素の読み込みに失敗しました');
        return;
    }

    const name = nameEl.value.trim();
    const type = typeEl.value;
    const date = dateEl.value;
    const menu = menuEl.value.trim();
    const memo = memoEl.value.trim();

    // バリデーション
    if (!name) {
        alert('店舗名・地点名を入力してください');
        nameEl.focus();
        return;
    }

    if (name.length > CUSTOM_POINTS_CONFIG.MAX_NAME_LENGTH) {
        alert(`店舗名は${CUSTOM_POINTS_CONFIG.MAX_NAME_LENGTH}文字以内で入力してください`);
        nameEl.focus();
        return;
    }

    if (!date) {
        alert('訪問日を入力してください');
        dateEl.focus();
        return;
    }

    if (menu.length > CUSTOM_POINTS_CONFIG.MAX_MENU_LENGTH) {
        alert(`メニューは${CUSTOM_POINTS_CONFIG.MAX_MENU_LENGTH}文字以内で入力してください`);
        menuEl.focus();
        return;
    }

    if (memo.length > CUSTOM_POINTS_CONFIG.MAX_MEMO_LENGTH) {
        alert(`メモは${CUSTOM_POINTS_CONFIG.MAX_MEMO_LENGTH}文字以内で入力してください`);
        memoEl.focus();
        return;
    }

    // カスタム地点を保存
    const point = {
        lat: customPointLatLng.lat,
        lng: customPointLatLng.lng,
        name: name,
        type: type,
        date: date,
        menu: menu,
        memo: memo,
        photos: customPointPhotos
    };

    const saved = saveCustomPoint(point);
    if (saved) {
        alert('🍛 カレー体験を追加しました！');
        closeCustomPointModal();

        // ヒートマップを更新
        displayHeatmap();

        // マーカーを追加
        displayCustomPointMarkers();

        // ログを更新
        displayLogs();

        // 実績チェック
        checkAchievements();
    } else {
        alert('保存に失敗しました。入力内容を確認してください。');
    }
}

/**
 * カスタム地点のマーカーを表示
 */
function displayCustomPointMarkers() {
    // 既存のカスタムマーカーをクリア
    customMarkers.forEach(marker => marker.setMap(null));
    customMarkers = [];

    const customPoints = getUserCustomPoints();

    console.log(`[CustomPoint] カスタム地点マーカーを表示: ${customPoints.length}件`);

    // ズームレベルチェック: zoom <= 12では非表示
    const currentZoom = map ? map.getZoom() : 13;
    if (currentZoom <= 12) {
        console.log(`[CustomPoint] ズーム ${currentZoom} のため、カスタムマーカーを非表示`);
        return;
    }

    customPoints.forEach((point, index) => {
        try {
            console.log(`[CustomPoint] マーカー作成中 [${index + 1}/${customPoints.length}]: ${point.name} (lat: ${point.lat}, lng: ${point.lng})`);

            const markerContent = document.createElement('div');
            markerContent.className = 'custom-point-marker';
            markerContent.style.cssText = 'position: relative; z-index: 1000;';

            const icon = '✅'; // 緑チェックアイコン
            const size = '32px'; // サイズを拡大（28px → 32px）

            markerContent.innerHTML = `
                <div style="
                    font-size: ${size};
                    line-height: 1;
                    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
                ">${icon}</div>
            `;

            const marker = new google.maps.marker.AdvancedMarkerElement({
                map: map,
                position: { lat: point.lat, lng: point.lng },
                title: `${point.name} (${point.type})`,
                content: markerContent,
                zIndex: 1000 // 高いz-indexで優先表示
            });

            marker.addListener('click', () => {
                console.log(`[CustomPoint] マーカークリック: ${point.name}`);
                showCustomPointPopup(point);
            });

            customMarkers.push(marker);
            markers.push(marker); // 互換性のため
            console.log(`[CustomPoint] マーカー作成成功: ${point.name}`);
        } catch (error) {
            console.error(`[CustomPoint] マーカー作成エラー [${point.name}]:`, error);
        }
    });

    console.log(`[CustomPoint] マーカー表示完了: ${customPoints.length}件のマーカーを追加`);
}

/**
 * カスタム地点のポップアップを表示（XSS対策済み）
 * @param {Object} point - カスタム地点データ
 */
function showCustomPointPopup(point) {
    // XSS対策: すべてのユーザー入力をエスケープ
    const title = document.getElementById('popupTitle');
    const address = document.getElementById('popupAddress');
    const btnAte = document.getElementById('btnAte');

    if (title) {
        title.textContent = `${escapeHtml(point.name)} ✅ (${escapeHtml(point.type)})`;
    }

    if (address) {
        const menuText = point.menu ? ` | ${escapeHtml(point.menu)}` : '';
        address.textContent = `訪問日: ${point.date || '不明'}${menuText}`;
    }

    if (btnAte) {
        btnAte.textContent = '✅ 登録済み';
        btnAte.disabled = true;
        btnAte.style.opacity = '0.5';
    }

    // 詳細ボタンでアラート表示（XSS対策済み）
    const btnDetails = document.getElementById('btnDetails');
    if (btnDetails) {
        btnDetails.onclick = () => {
            alert(
                `店舗名: ${escapeHtml(point.name)}\n` +
                `種類: ${escapeHtml(point.type)}\n` +
                `訪問日: ${point.date || '不明'}\n` +
                `メニュー: ${escapeHtml(point.menu || 'なし')}\n` +
                `メモ: ${escapeHtml(point.memo || 'なし')}`
            );
        };
    }

    document.getElementById('popupOverlay').style.display = 'block';
}

/**
 * 写真選択ハンドラー
 */
async function handleCustomPointPhotoSelection(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const MAX_PHOTOS = 3;
    if (customPointPhotos.length + files.length > MAX_PHOTOS) {
        alert(`写真は最大${MAX_PHOTOS}枚までです`);
        return;
    }

    for (const file of files) {
        try {
            const compressedData = await compressImage(file, {
                maxWidth: 800,
                maxHeight: 800,
                quality: 0.7
            });

            const photo = {
                id: generateUniqueId(),
                data: compressedData,
                createdAt: new Date().toISOString()
            };

            customPointPhotos.push(photo);
        } catch (error) {
            console.error('[CustomPoint] 写真圧縮エラー:', error);
            alert('写真の処理に失敗しました');
        }
    }

    updateCustomPointPhotoPreview();
    e.target.value = '';
}

/**
 * 写真プレビューを更新
 */
function updateCustomPointPhotoPreview() {
    const preview = document.getElementById('customPointPhotoPreview');
    if (!preview) return;

    let html = '';
    customPointPhotos.forEach((photo, index) => {
        html += `
            <div class="photo-preview-item">
                <img src="${photo.data}" alt="写真 ${index + 1}" loading="lazy">
                <button type="button" class="photo-delete-btn" data-photo-id="${escapeHtml(photo.id)}" aria-label="削除">×</button>
            </div>
        `;
    });

    preview.innerHTML = html;

    // 削除ボタンのイベントリスナー
    preview.querySelectorAll('.photo-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const photoId = btn.dataset.photoId;
            customPointPhotos = customPointPhotos.filter(p => p.id !== photoId);
            updateCustomPointPhotoPreview();
        });
    });
}

/**
 * カスタム地点機能のイベントリスナーを設定
 */
function setupCustomPointListeners() {
    // モーダル閉じるボタン
    const closeBtn = document.getElementById('customPointModalClose');
    const cancelBtn = document.getElementById('customPointCancelBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeCustomPointModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeCustomPointModal);

    // モーダル外クリックで閉じる
    const modal = document.getElementById('customPointModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeCustomPointModal();
            }
        });
    }

    // ESCキーで閉じる
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
            closeCustomPointModal();
        }
    });

    // 保存ボタン
    const saveBtn = document.getElementById('customPointSaveBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveCustomPointFromModal);
    }

    // 写真追加ボタン
    const addPhotoBtn = document.getElementById('customPointAddPhotoBtn');
    const photoInput = document.getElementById('customPointPhotoInput');
    if (addPhotoBtn && photoInput) {
        addPhotoBtn.addEventListener('click', () => {
            if (customPointPhotos.length >= 3) {
                alert('写真は最大3枚までです');
                return;
            }
            photoInput.click();
        });
        photoInput.addEventListener('change', handleCustomPointPhotoSelection);
    }
}

// カスタム地点機能を初期化（地図作成後に呼び出す）
function initCustomPoints() {
    setupCustomPointListeners();
    setupCustomPointMapClick();
    displayCustomPointMarkers();
}

// createMap関数内でカスタム地点を初期化するよう、既存のcreateMap関数を拡張
const originalCreateMap = window.createMap || createMap;
window.createMap = function(center, zoom) {
    originalCreateMap.call(this, center, zoom);
    // カスタム地点機能を初期化
    if (typeof initCustomPoints === 'function') {
        setTimeout(() => initCustomPoints(), 100);
    }
};
