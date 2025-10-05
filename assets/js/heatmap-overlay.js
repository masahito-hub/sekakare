// Canvas版ヒートマップオーバーレイ
class HeatmapOverlay extends google.maps.OverlayView {
    constructor(map, data) {
        super();
        this.map = map;
        this.data = data;
        this.canvas = null;
        this.ctx = null;
        this.setMap(map);

        console.log('[HeatmapOverlay] Constructor called with', data.length, 'data points');
    }

    onAdd() {
        console.log('[HeatmapOverlay] onAdd() called');

        // Canvasを作成
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.pointerEvents = 'none'; // マウスイベントを透過

        // willReadFrequently属性を設定してパフォーマンス警告を回避
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

        // オーバーレイレイヤーに追加
        const panes = this.getPanes();
        if (panes) {
            panes.overlayLayer.appendChild(this.canvas);
            console.log('[HeatmapOverlay] Canvas added to overlayLayer');
        } else {
            console.error('[HeatmapOverlay] Failed to get panes');
        }
    }

    draw() {
        console.log('[HeatmapOverlay] draw() called');

        const overlayProjection = this.getProjection();
        if (!overlayProjection) {
            console.warn('[HeatmapOverlay] Projection is null, skipping draw');
            return;
        }

        const zoom = this.map.getZoom();
        console.log(`[HeatmapOverlay] zoom=${zoom}, points=${this.data.length}`);

        // 地図の境界を取得
        const bounds = this.map.getBounds();
        if (!bounds) {
            console.warn('[HeatmapOverlay] Bounds is null, skipping draw');
            return;
        }

        const ne = overlayProjection.fromLatLngToDivPixel(bounds.getNorthEast());
        const sw = overlayProjection.fromLatLngToDivPixel(bounds.getSouthWest());

        if (!ne || !sw) {
            console.warn('[HeatmapOverlay] Failed to convert bounds to pixels');
            return;
        }

        // Canvasのサイズと位置を設定
        const canvasWidth = Math.abs(ne.x - sw.x);
        const canvasHeight = Math.abs(ne.y - sw.y);

        this.canvas.width = canvasWidth;
        this.canvas.height = canvasHeight;
        this.canvas.style.left = Math.min(ne.x, sw.x) + 'px';
        this.canvas.style.top = Math.min(ne.y, sw.y) + 'px';
        this.canvas.style.width = canvasWidth + 'px';
        this.canvas.style.height = canvasHeight + 'px';

        console.log(`[HeatmapOverlay] Canvas size: ${canvasWidth}x${canvasHeight}px`);

        // Canvasをクリア
        this.ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        // 各データポイントを描画
        this.data.forEach((point, index) => {
            const position = new google.maps.LatLng(point.lat, point.lng);
            const pixel = overlayProjection.fromLatLngToDivPixel(position);

            if (!pixel) {
                console.warn(`[HeatmapOverlay] Failed to convert point ${index} to pixel`);
                return;
            }

            // Canvas座標系に変換（左上が原点）
            const canvasX = pixel.x - Math.min(ne.x, sw.x);
            const canvasY = pixel.y - Math.min(ne.y, sw.y);

            // ズームレベルに応じて半径を調整
            const baseRadius = 50;
            const zoomFactor = Math.pow(2, zoom - 10); // zoom=10を基準
            const radius = Math.max(20, Math.min(200, baseRadius * zoomFactor));

            // 訪問回数に応じて透明度を調整
            const baseOpacity = Math.min(0.3 + (point.count * 0.1), 0.7);

            // グラデーション効果（複数の同心円）
            const gradientLayers = 8;
            for (let i = 0; i < gradientLayers; i++) {
                const layerRatio = (gradientLayers - i) / gradientLayers;
                const layerRadius = radius * layerRatio;
                const layerOpacity = baseOpacity * Math.pow(layerRatio, 2.5);

                // 放射グラデーションで描画
                const gradient = this.ctx.createRadialGradient(
                    canvasX, canvasY, 0,
                    canvasX, canvasY, layerRadius
                );
                gradient.addColorStop(0, `rgba(255, 140, 0, ${layerOpacity})`);
                gradient.addColorStop(1, 'rgba(255, 140, 0, 0)');

                this.ctx.fillStyle = gradient;
                this.ctx.beginPath();
                this.ctx.arc(canvasX, canvasY, layerRadius, 0, Math.PI * 2);
                this.ctx.fill();
            }

            if (index === 0) {
                console.log(`[HeatmapOverlay] First point: lat=${point.lat}, lng=${point.lng}, canvas=(${canvasX.toFixed(1)}, ${canvasY.toFixed(1)}), radius=${radius.toFixed(1)}px`);
            }
        });

        console.log('[HeatmapOverlay] Draw completed');
    }

    onRemove() {
        console.log('[HeatmapOverlay] onRemove() called');
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
            this.canvas = null;
        }
    }

    // データを更新
    updateData(newData) {
        console.log('[HeatmapOverlay] updateData() called with', newData.length, 'points');
        this.data = newData;
        this.draw();
    }
}

// グローバルに公開
window.HeatmapOverlay = HeatmapOverlay;
console.log('[HeatmapOverlay] Class loaded successfully');
