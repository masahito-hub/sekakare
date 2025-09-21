// メインアプリケーションロジック

let map;
let currentPlace = null;
let curryLogs = JSON.parse(localStorage.getItem(Config.storageKeys.curryLogs) || '[]');
let heatmapData = JSON.parse(localStorage.getItem(Config.storageKeys.heatmapData) || '{}');
let markers = [];
let heatmapCircles = [];
let achievements = JSON.parse(localStorage.getItem(Config.storageKeys.achievements) || '{}');
let searchTimeout;
let isManualSearch = false;  // 手動検索フラグを追加

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

// 地図移動時の自動検索関数（GAイベント付き）
function autoSearchCurryShops(location) {
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

    const request = {
        textQuery: 'カレー',
        fields: ['displayName', 'location', 'businessStatus', 'formattedAddress'],
        locationBias: { lat: lat, lng: lng },
        maxResultCount: Config.settings.maxSearchResults
    };

    google.maps.places.Place.searchByText(request).then((response) => {
        if (response.places && response.places.length > 0) {
            clearMarkers();
            response.places.forEach(place => createNewMarker(place));

            // Google Analytics - 自動検索成功イベント
            if (typeof gtag !== 'undefined') {
                gtag('event', 'auto_search_success', {
                    'event_category': 'search_result',
                    'result_count': response.places.length,
                    'latitude': lat.toFixed(4),
                    'longitude': lng.toFixed(4),
                    'event_label': `自動検索 - ${response.places.length}件`,
                    'custom_parameter_1': 'auto_search'
                });
            }

            updateDebugInfo(`<strong>✅ 自動検索完了！</strong> この周辺で${response.places.length}件のカレー店を発見`);
        } else {
            updateDebugInfo('<strong>⚠️ この周辺にはカレー店が見つかりませんでした</strong> 地図を移動してみてください');
        }
    }).catch((error) => {
        console.error('自動検索エラー:', error);
        updateDebugInfo(`<strong>❌ 自動検索エラー:</strong> ${error.message}`);
    });
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
        // Advanced Markerを使用
        const markerContent = document.createElement('div');
        markerContent.className = 'marker-content';
        markerContent.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="18" fill="#ff8c00" stroke="#ffffff" stroke-width="3"/>
                <text x="20" y="28" font-family="Arial" font-size="20" text-anchor="middle" fill="#ffffff">🍛</text>
            </svg>
        `;

        const marker = new google.maps.marker.AdvancedMarkerElement({
            map: map,
            position: place.location,
            title: place.displayName,
            content: markerContent
        });

        const legacyPlace = {
            name: place.displayName,
            place_id: place.id || 'new_api_' + Date.now() + '_' + Math.random(),
            geometry: { location: place.location },
            vicinity: place.formattedAddress || '住所不明'
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
    // フォールバックでも可能な限りAdvanced Markerを使用
    const markerContent = document.createElement('div');
    markerContent.className = 'marker-content';
    markerContent.style.cssText = 'width: 30px; height: 30px; background: #ff8c00; border: 3px solid #ffffff; border-radius: 50%;';

    const marker = new google.maps.marker.AdvancedMarkerElement({
        map: map,
        position: place.location,
        title: place.displayName,
        content: markerContent
    });

    const legacyPlace = {
        name: place.displayName,
        place_id: place.id || 'simple_' + Date.now(),
        geometry: { location: place.location },
        vicinity: place.formattedAddress || '住所不明'
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
        document.getElementById('popupTitle').textContent = place.name;
        document.getElementById('popupAddress').textContent = place.vicinity;
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

    console.log(`ヒートマップ ${Object.keys(heatmapData).length} 箇所を表示`);
}

// ログを表示
function displayLogs() {
    const logList = document.getElementById('logList');
    const logCount = document.getElementById('logCount');

    if (curryLogs.length === 0) {
        logList.innerHTML = '<div class="loading">まだ記録がありません。地図上のカレー店をタップして記録を始めましょう！</div>';
        logCount.textContent = '0';
        return;
    }

    logCount.textContent = curryLogs.length;

    // 最新の記録を上に表示
    const sortedLogs = [...curryLogs].reverse();

    logList.innerHTML = sortedLogs.map(log => `
        <div class="log-item">
            <div class="log-item-name">${log.name}</div>
            <div class="log-item-date">${log.date} - ${log.address}</div>
        </div>
    `).join('');
}

// デバッグ情報を更新
function updateDebugInfo(html) {
    const debugElement = document.getElementById('debugInfo');
    if (debugElement) {
        debugElement.innerHTML = html;
    }
}

// 実績システムを初期化
function initAchievements() {
    checkAchievements();
    console.log('実績システムを初期化しました');
}

// 実績をチェックする関数
function checkAchievements() {
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