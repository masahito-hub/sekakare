// HeatmapOverlay - Canvas-based zoom-linked heatmap for Google Maps
// セカカレ専用ヒートマップ実装（ズーム連動Canvas実装）

class HeatmapOverlay extends google.maps.OverlayView {
    constructor(map, data, params = {}) {
        super();

        // パラメータバリデーション
        if (!map || !map.getDiv) {
            throw new Error('Invalid Google Maps instance');
        }
        if (!Array.isArray(data)) {
            throw new Error('Data must be an array');
        }

        this.map = map;
        this.data = data;

        // パフォーマンス定数（マジックナンバーのドキュメント化）
        this.GAUSSIAN_SIGMA_DIVISOR = 3;  // ガウシアン分布の標準偏差係数（半径の1/3）
        this.EARTH_CIRCUMFERENCE_METERS = 40075000;  // 地球赤道周長（メートル）
        this.MAX_CACHE_SIZE = 1000;  // LRUキャッシュの最大サイズ

        // パラメータ（デフォルト値）
        this.params = {
            // ズーム連動半径
            z_ref: params.z_ref || 14,
            r_base: params.r_base || 14,
            k: params.k || 1.28,
            r_min_px: params.r_min_px || 16,
            r_max_px: params.r_max_px || 48,

            // 透明度
            alpha_base: params.alpha_base || 0.55,
            tau: params.tau || 3,
            isolation_boost: params.isolation_boost || 1.25,

            // 色マップ（LCH）
            color_light_l: params.color_light_l || 95,
            color_light_c: params.color_light_c || 45,
            color_light_h: params.color_light_h || 95,
            color_dark_l: params.color_dark_l || 72,
            color_dark_c: params.color_dark_c || 65,
            color_dark_h: params.color_dark_h || 80,
            gamma: params.gamma || 1.45,

            // 正規化
            percentile_low: params.percentile_low || 5,
            percentile_high: params.percentile_high || 95,

            // パフォーマンス
            debounce_ms: params.debounce_ms || 150
        };

        this.canvas = null;
        this.renderTimeout = null;
        this.rafId = null;
        this.neighborCountCache = new Map();
        this.zoomListener = null;
        this.boundsListener = null;
        this.isRendering = false;  // レースコンディション対策

        this.setMap(map);
    }

    onAdd() {
        // Canvasを作成
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.pointerEvents = 'none';

        const panes = this.getPanes();
        panes.overlayLayer.appendChild(this.canvas);

        // イベントリスナーを登録（メモリリーク対策のため参照を保持）
        this.zoomListener = this.map.addListener('zoom_changed', () => {
            this.neighborCountCache.clear();
            this.scheduleRender();
        });
        this.boundsListener = this.map.addListener('bounds_changed', () => this.scheduleRender());

        this.scheduleRender();
    }

    onRemove() {
        // メモリリーク対策：イベントリスナーを削除
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
    }

    draw() {
        this.scheduleRender();
    }

    scheduleRender() {
        // レースコンディション対策：レンダリング中は無視
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
        this.isRendering = true;
        try {
            if (!this.canvas) return;

            const projection = this.getProjection();
            if (!projection) return;

            const mapDiv = this.map.getDiv();
            const width = mapDiv.offsetWidth;
            const height = mapDiv.offsetHeight;

            // Canvas サイズを調整
            this.canvas.width = width;
            this.canvas.height = height;
            this.canvas.style.width = width + 'px';
            this.canvas.style.height = height + 'px';

            const zoom = this.map.getZoom();
            const radiusPx = this.calculateRadius(zoom);

            // オフスクリーンCanvasを作成
            const offscreen = this.createOffscreenCanvas(width, height);
            if (!offscreen) return;

            const offCtx = offscreen.getContext('2d');

            // 累積描画用Canvas
            const accumCanvas = this.createOffscreenCanvas(width, height);
            if (!accumCanvas) return;

            const accumCtx = accumCanvas.getContext('2d');

            // 各地点のガウシアンカーネルを描画
            const intensities = [];
            this.data.forEach(point => {
                const worldPoint = projection.fromLatLngToDivPixel(
                    new google.maps.LatLng(point.lat, point.lng)
                );

                const neighborCount = this.countNeighbors(point, this.data, radiusPx);
                let alpha = this.params.alpha_base;

                // 孤立ブースト
                if (neighborCount < this.params.tau) {
                    alpha *= this.params.isolation_boost;
                }

                this.drawGaussianKernel(accumCtx, worldPoint.x, worldPoint.y, radiusPx, alpha);

                // 強度を記録（正規化用）
                const imageData = accumCtx.getImageData(worldPoint.x, worldPoint.y, 1, 1);
                intensities.push(imageData.data[3] / 255);
            });

            // パーセンタイル正規化
            const normalized = this.normalizeIntensities(accumCanvas, intensities);

            // 色マップ適用
            this.applyColorMap(offCtx, normalized);

            // 最終Canvasに転送
            const ctx = this.canvas.getContext('2d');
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(offscreen, 0, 0);

        } finally {
            this.isRendering = false;
        }
    }

    calculateRadius(zoom) {
        const r_px = this.params.r_base * Math.pow(this.params.k, this.params.z_ref - zoom);
        return Math.max(this.params.r_min_px, Math.min(this.params.r_max_px, r_px));
    }

    countNeighbors(point, allPoints, radiusPx) {
        const zoom = this.map.getZoom();
        const cacheKey = `${zoom}-${point.lat.toFixed(4)}-${point.lng.toFixed(4)}`;

        // キャッシュチェック
        if (this.neighborCountCache.has(cacheKey)) {
            return this.neighborCountCache.get(cacheKey);
        }

        // LRU削除（キャッシュサイズ制限）
        if (this.neighborCountCache.size >= this.MAX_CACHE_SIZE) {
            const firstKey = this.neighborCountCache.keys().next().value;
            this.neighborCountCache.delete(firstKey);
        }

        const lat = point.lat;
        const metersPerPx = this.EARTH_CIRCUMFERENCE_METERS * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom + 8);
        const radiusMeters = radiusPx * metersPerPx;

        let count = 0;
        allPoints.forEach(other => {
            if (point === other) return;
            const distance = this.haversineDistance(point.lat, point.lng, other.lat, other.lng);
            if (distance <= radiusMeters) {
                count++;
            }
        });

        // キャッシュに保存
        this.neighborCountCache.set(cacheKey, count);
        return count;
    }

    haversineDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000; // 地球の半径（メートル）
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    drawGaussianKernel(ctx, x, y, radius, alpha) {
        const sigma = radius / this.GAUSSIAN_SIGMA_DIVISOR;
        const size = Math.ceil(radius * 2);

        for (let i = -size; i <= size; i++) {
            for (let j = -size; j <= size; j++) {
                const dist = Math.sqrt(i * i + j * j);
                if (dist > radius) continue;

                const gaussian = Math.exp(-(dist * dist) / (2 * sigma * sigma));
                const intensity = gaussian * alpha * 255;

                const px = Math.floor(x + i);
                const py = Math.floor(y + j);

                if (px >= 0 && px < ctx.canvas.width && py >= 0 && py < ctx.canvas.height) {
                    ctx.fillStyle = `rgba(255, 255, 255, ${intensity / 255})`;
                    ctx.fillRect(px, py, 1, 1);
                }
            }
        }
    }

    normalizeIntensities(canvas, intensities) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // パーセンタイル計算
        const sorted = intensities.filter(v => v > 0).sort((a, b) => a - b);
        const lowIdx = Math.floor(sorted.length * this.params.percentile_low / 100);
        const highIdx = Math.floor(sorted.length * this.params.percentile_high / 100);
        const vMin = sorted[lowIdx] || 0;
        const vMax = sorted[highIdx] || 1;

        // 正規化 + ガンマ補正
        for (let i = 3; i < data.length; i += 4) {
            const alpha = data[i] / 255;
            let normalized = (alpha - vMin) / (vMax - vMin);
            normalized = Math.max(0, Math.min(1, normalized));
            normalized = Math.pow(normalized, 1 / this.params.gamma);
            data[i] = normalized * 255;
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    applyColorMap(ctx, normalizedCanvas) {
        const imageData = ctx.createImageData(normalizedCanvas.width, normalizedCanvas.height);
        const srcCtx = normalizedCanvas.getContext('2d');
        const srcData = srcCtx.getImageData(0, 0, normalizedCanvas.width, normalizedCanvas.height).data;
        const destData = imageData.data;

        for (let i = 0; i < srcData.length; i += 4) {
            const intensity = srcData[i + 3] / 255;

            if (intensity > 0) {
                // LCH補間
                const L = this.params.color_light_l + (this.params.color_dark_l - this.params.color_light_l) * intensity;
                const C = this.params.color_light_c + (this.params.color_dark_c - this.params.color_light_c) * intensity;
                const H = this.params.color_light_h + (this.params.color_dark_h - this.params.color_light_h) * intensity;

                const rgb = this.lchToRgb(L, C, H);
                destData[i] = rgb.r;
                destData[i + 1] = rgb.g;
                destData[i + 2] = rgb.b;
                destData[i + 3] = intensity * 255;
            } else {
                destData[i + 3] = 0;
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }

    lchToRgb(L, C, H) {
        // LCH → Lab
        const a = C * Math.cos(H * Math.PI / 180);
        const b = C * Math.sin(H * Math.PI / 180);

        // Lab → XYZ
        const fy = (L + 16) / 116;
        const fx = a / 500 + fy;
        const fz = fy - b / 200;

        const xr = fx > 0.206897 ? fx * fx * fx : (fx - 16 / 116) / 7.787;
        const yr = fy > 0.206897 ? fy * fy * fy : (fy - 16 / 116) / 7.787;
        const zr = fz > 0.206897 ? fz * fz * fz : (fz - 16 / 116) / 7.787;

        const X = xr * 95.047;
        const Y = yr * 100.000;
        const Z = zr * 108.883;

        // XYZ → RGB
        let R = X * 0.032406 + Y * -0.015372 + Z * -0.004986;
        let G = X * -0.009689 + Y * 0.018758 + Z * 0.000415;
        let B = X * 0.000557 + Y * -0.002040 + Z * 0.010570;

        // ガンマ補正
        R = R > 0.0031308 ? 1.055 * Math.pow(R, 1 / 2.4) - 0.055 : 12.92 * R;
        G = G > 0.0031308 ? 1.055 * Math.pow(G, 1 / 2.4) - 0.055 : 12.92 * G;
        B = B > 0.0031308 ? 1.055 * Math.pow(B, 1 / 2.4) - 0.055 : 12.92 * B;

        return {
            r: Math.max(0, Math.min(255, Math.round(R * 255))),
            g: Math.max(0, Math.min(255, Math.round(G * 255))),
            b: Math.max(0, Math.min(255, Math.round(B * 255)))
        };
    }

    createOffscreenCanvas(width, height) {
        if (typeof OffscreenCanvas !== 'undefined') {
            return new OffscreenCanvas(width, height);
        } else {
            // フォールバック
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            return canvas;
        }
    }

    // パラメータ更新用（デバッグツール用）
    updateParams(newParams) {
        this.params = { ...this.params, ...newParams };
        this.neighborCountCache.clear();
        this.scheduleRender();
    }
}

// グローバルに公開
window.HeatmapOverlay = HeatmapOverlay;
