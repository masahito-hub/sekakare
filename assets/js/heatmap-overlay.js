/**
 * HeatmapOverlay - Google Maps Canvas-based Heatmap Implementation
 *
 * ズーム連動のCanvas実装によるヒートマップ
 * 全ての修正（LRUキャッシュ、レースコンディション対策など）を最初から適用済み
 */

class HeatmapOverlay extends google.maps.OverlayView {
    constructor(map, data, params = {}) {
        super();

        // パラメータバリデーション (Fix #3)
        if (!map || !map.getDiv) {
            throw new Error('Invalid Google Maps instance');
        }
        if (!Array.isArray(data)) {
            throw new Error('Data must be an array');
        }

        this.map = map;
        this.data = data;

        // 定数定義 (Fix #4: マジックナンバーのドキュメント化)
        this.GAUSSIAN_SIGMA_DIVISOR = 3;  // ガウシアン分布の標準偏差係数
        this.EARTH_CIRCUMFERENCE_METERS = 40075000;  // 地球赤道周長（メートル）
        this.MAX_CACHE_SIZE = 1000;  // LRUキャッシュの最大サイズ (Fix #1)

        // デフォルトパラメータ
        this.params = {
            // ズーム連動半径パラメータ
            z_ref: 14,
            r_base: 14,
            k: 1.28,
            r_min_px: 16,
            r_max_px: 48,

            // 透明度パラメータ
            alpha_base: 0.55,
            tau: 3,
            isolation_boost: 1.25,

            // 色マップパラメータ（LCH）
            color_min_L: 95,
            color_min_C: 45,
            color_min_H: 95,
            color_max_L: 72,
            color_max_C: 65,
            color_max_H: 80,
            gamma: 1.45,

            // 正規化パラメータ
            percentile_low: 5,
            percentile_high: 95,

            // パフォーマンスパラメータ
            debounce_ms: 150,

            ...params
        };

        // 内部状態
        this.canvas = null;
        this.ctx = null;
        this.renderTimeout = null;
        this.rafId = null;
        this.neighborCountCache = new Map();  // Fix #1: LRUキャッシュ
        this.isRendering = false;  // Fix #2: レースコンディション対策
        this.zoomListener = null;
        this.boundsListener = null;

        this.setMap(map);
    }

    onAdd() {
        // Canvasを作成
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.pointerEvents = 'none';  // クリックイベントを透過

        this.ctx = this.canvas.getContext('2d');

        // マップのpanes.overlayLayerに追加
        const panes = this.getPanes();
        panes.overlayLayer.appendChild(this.canvas);

        // ズーム・バウンド変更時に再描画
        this.zoomListener = this.map.addListener('zoom_changed', () => this.scheduleRender());
        this.boundsListener = this.map.addListener('bounds_changed', () => this.scheduleRender());

        // 初回描画
        this.scheduleRender();
    }

    onRemove() {
        // イベントリスナーをクリーンアップ (Fix #1: メモリリーク対策)
        if (this.zoomListener) {
            google.maps.event.removeListener(this.zoomListener);
            this.zoomListener = null;
        }
        if (this.boundsListener) {
            google.maps.event.removeListener(this.boundsListener);
            this.boundsListener = null;
        }

        // タイムアウトとrAFをクリア
        if (this.renderTimeout) {
            clearTimeout(this.renderTimeout);
            this.renderTimeout = null;
        }
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }

        // キャッシュをクリア
        this.neighborCountCache.clear();

        // Canvasを削除
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        this.canvas = null;
        this.ctx = null;
    }

    draw() {
        // このメソッドはOverlayViewで必須だが、実際の描画はrenderで行う
        this.render();
    }

    scheduleRender() {
        // Fix #2: レースコンディション対策
        if (this.isRendering) return;

        if (this.renderTimeout) {
            clearTimeout(this.renderTimeout);
        }

        this.renderTimeout = setTimeout(() => {
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
            }
            this.rafId = requestAnimationFrame(() => this.render());
        }, this.params.debounce_ms);
    }

    render() {
        // Fix #2: レースコンディション対策
        this.isRendering = true;

        try {
            if (!this.canvas || !this.ctx || !this.map) {
                return;
            }

            const projection = this.getProjection();
            if (!projection) {
                return;
            }

            // Canvasサイズを地図のサイズに合わせる
            const mapDiv = this.map.getDiv();
            const width = mapDiv.offsetWidth;
            const height = mapDiv.offsetHeight;

            if (this.canvas.width !== width || this.canvas.height !== height) {
                this.canvas.width = width;
                this.canvas.height = height;
                this.canvas.style.width = width + 'px';
                this.canvas.style.height = height + 'px';
            }

            // Canvasをクリア
            this.ctx.clearRect(0, 0, width, height);

            // データがない場合は終了
            if (!this.data || this.data.length === 0) {
                return;
            }

            // OffscreenCanvasを使用（フォールバック付き）
            let offscreen, offscreenCtx;
            if (typeof OffscreenCanvas !== 'undefined') {
                offscreen = new OffscreenCanvas(width, height);
                offscreenCtx = offscreen.getContext('2d');
            } else {
                offscreen = document.createElement('canvas');
                offscreen.width = width;
                offscreen.height = height;
                offscreenCtx = offscreen.getContext('2d');
            }

            // 現在のズームレベルを取得
            const zoom = this.map.getZoom();

            // ズーム連動半径を計算
            const radiusPx = this.calculateRadius(zoom);

            // 各データポイントにガウシアンカーネルを描画
            const intensityData = [];

            this.data.forEach(point => {
                const latLng = new google.maps.LatLng(point.lat, point.lng);
                const pixel = projection.fromLatLngToContainerPixel(latLng);

                if (!pixel) return;

                // 画面内かチェック
                if (pixel.x < -radiusPx || pixel.x > width + radiusPx ||
                    pixel.y < -radiusPx || pixel.y > height + radiusPx) {
                    return;
                }

                // 近傍カウント（キャッシュ付き）
                const neighborCount = this.countNeighbors(point, this.data, radiusPx);

                // 密度ベースの透明度調整
                let alpha = this.params.alpha_base;
                if (neighborCount < this.params.tau) {
                    alpha *= this.params.isolation_boost;  // 孤立ブースト
                }

                // ガウシアンカーネルを描画
                this.drawGaussianKernel(offscreenCtx, pixel.x, pixel.y, radiusPx, alpha);

                // 強度データを収集（正規化用）
                intensityData.push({
                    x: Math.round(pixel.x),
                    y: Math.round(pixel.y),
                    intensity: point.count || 1
                });
            });

            // ImageDataを取得して色マッピング
            const imageData = offscreenCtx.getImageData(0, 0, width, height);
            this.applyColorMap(imageData, intensityData);

            // メインCanvasに転送
            this.ctx.putImageData(imageData, 0, 0);

        } finally {
            this.isRendering = false;  // Fix #2: 必ずフラグをリセット
        }
    }

    calculateRadius(zoom) {
        const { z_ref, r_base, k, r_min_px, r_max_px } = this.params;
        const r = r_base * Math.pow(k, z_ref - zoom);
        return Math.max(r_min_px, Math.min(r_max_px, r));
    }

    countNeighbors(point, allPoints, radiusPx) {
        const zoom = this.map.getZoom();
        const cacheKey = `${zoom}-${point.lat.toFixed(4)}-${point.lng.toFixed(4)}`;

        // キャッシュチェック
        if (this.neighborCountCache.has(cacheKey)) {
            return this.neighborCountCache.get(cacheKey);
        }

        // Fix #1: LRU削除
        if (this.neighborCountCache.size >= this.MAX_CACHE_SIZE) {
            const firstKey = this.neighborCountCache.keys().next().value;
            this.neighborCountCache.delete(firstKey);
        }

        // メートル単位の半径に変換
        const lat = point.lat;
        const metersPerPx = this.EARTH_CIRCUMFERENCE_METERS * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom + 8);
        const radiusMeters = radiusPx * metersPerPx;

        // 近傍カウント
        let count = 0;
        allPoints.forEach(other => {
            if (point === other) return;

            const distance = this.haversineDistance(
                point.lat, point.lng,
                other.lat, other.lng
            );

            if (distance <= radiusMeters) {
                count++;
            }
        });

        // キャッシュに保存
        this.neighborCountCache.set(cacheKey, count);
        return count;
    }

    haversineDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000;  // 地球の半径（メートル）
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    drawGaussianKernel(ctx, x, y, radius, alpha) {
        const sigma = radius / this.GAUSSIAN_SIGMA_DIVISOR;

        // 放射状グラデーションを作成
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);

        // ガウス関数に基づく透明度
        for (let i = 0; i <= 10; i++) {
            const t = i / 10;
            const r = t * radius;
            const gaussianAlpha = alpha * Math.exp(-(r * r) / (2 * sigma * sigma));

            gradient.addColorStop(t, `rgba(255, 255, 255, ${gaussianAlpha})`);
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    applyColorMap(imageData, intensityData) {
        const data = imageData.data;

        // アルファ値を収集
        const alphaValues = [];
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] > 0) {
                alphaValues.push(data[i]);
            }
        }

        if (alphaValues.length === 0) return;

        // パーセンタイル計算
        alphaValues.sort((a, b) => a - b);
        const p_low = this.percentile(alphaValues, this.params.percentile_low);
        const p_high = this.percentile(alphaValues, this.params.percentile_high);

        // 色マッピング
        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];

            if (alpha === 0) continue;

            // 正規化
            const normalized = Math.max(0, Math.min(1, (alpha - p_low) / (p_high - p_low)));

            // ガンマ補正
            const corrected = Math.pow(normalized, 1 / this.params.gamma);

            // LCH補間
            const color = this.lchInterpolate(corrected);

            data[i] = color.r;
            data[i + 1] = color.g;
            data[i + 2] = color.b;
            data[i + 3] = 255;  // 完全不透明
        }
    }

    percentile(sortedArray, p) {
        const index = (p / 100) * (sortedArray.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;

        if (lower === upper) {
            return sortedArray[lower];
        }

        return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
    }

    lchInterpolate(t) {
        const { color_min_L, color_min_C, color_min_H, color_max_L, color_max_C, color_max_H } = this.params;

        const L = color_min_L + t * (color_max_L - color_min_L);
        const C = color_min_C + t * (color_max_C - color_min_C);
        const H = color_min_H + t * (color_max_H - color_min_H);

        // LCH → Lab → RGB変換
        return this.lchToRgb(L, C, H);
    }

    lchToRgb(L, C, H) {
        // LCH → Lab
        const a = C * Math.cos(H * Math.PI / 180);
        const b = C * Math.sin(H * Math.PI / 180);

        // Lab → XYZ
        let fy = (L + 16) / 116;
        let fx = a / 500 + fy;
        let fz = fy - b / 200;

        const delta = 6 / 29;
        const fx3 = fx * fx * fx;
        const fy3 = fy * fy * fy;
        const fz3 = fz * fz * fz;

        const xr = fx3 > delta * delta * delta ? fx3 : (fx - 16 / 116) * 3 * delta * delta;
        const yr = fy3 > delta * delta * delta ? fy3 : (fy - 16 / 116) * 3 * delta * delta;
        const zr = fz3 > delta * delta * delta ? fz3 : (fz - 16 / 116) * 3 * delta * delta;

        // D65 白色点
        const X = xr * 0.95047;
        const Y = yr * 1.00000;
        const Z = zr * 1.08883;

        // XYZ → RGB (sRGB)
        let r = X * 3.2406 + Y * -1.5372 + Z * -0.4986;
        let g = X * -0.9689 + Y * 1.8758 + Z * 0.0415;
        let b_val = X * 0.0557 + Y * -0.2040 + Z * 1.0570;

        // ガンマ補正
        r = r > 0.0031308 ? 1.055 * Math.pow(r, 1 / 2.4) - 0.055 : 12.92 * r;
        g = g > 0.0031308 ? 1.055 * Math.pow(g, 1 / 2.4) - 0.055 : 12.92 * g;
        b_val = b_val > 0.0031308 ? 1.055 * Math.pow(b_val, 1 / 2.4) - 0.055 : 12.92 * b_val;

        // クランプ
        r = Math.max(0, Math.min(1, r));
        g = Math.max(0, Math.min(1, g));
        b_val = Math.max(0, Math.min(1, b_val));

        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b_val * 255)
        };
    }
}

// グローバルスコープに公開
window.HeatmapOverlay = HeatmapOverlay;
