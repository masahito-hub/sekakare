/**
 * HeatmapOverlay - Canvas-based zoom-linked heatmap for Google Maps
 *
 * Features:
 * - Zoom-linked radius calculation
 * - Gaussian kernel rendering
 * - Density-based transparency with isolation boost
 * - LCH color space interpolation
 * - p5-p95 percentile normalization + gamma correction
 * - Performance optimization with requestAnimationFrame + debouncing
 * - OffscreenCanvas support with fallback
 */

class HeatmapOverlay extends google.maps.OverlayView {
    constructor(map, data, params = {}) {
        super();

        // Parameter validation (Required Fix #3)
        if (!map || !map.getDiv) {
            throw new Error('Invalid Google Maps instance');
        }
        if (!Array.isArray(data)) {
            throw new Error('Data must be an array');
        }

        this.map = map;
        this.data = data; // Array of {lat, lng, count}

        // Zoom-linked radius parameters
        this.params = {
            z_ref: params.z_ref || 14,
            r_base: params.r_base || 14,
            k: params.k || 1.28,
            r_min_px: params.r_min_px || 16,
            r_max_px: params.r_max_px || 48,

            // Transparency parameters
            alpha_base: params.alpha_base || 0.55,
            tau: params.tau || 3,
            isolation_boost: params.isolation_boost || 1.25,

            // Color map (LCH)
            color_light_L: params.color_light_L || 95,
            color_light_C: params.color_light_C || 45,
            color_light_H: params.color_light_H || 95,
            color_dark_L: params.color_dark_L || 72,
            color_dark_C: params.color_dark_C || 65,
            color_dark_H: params.color_dark_H || 80,
            gamma: params.gamma || 1.45,

            // Normalization
            percentile_low: params.percentile_low || 5,
            percentile_high: params.percentile_high || 95,

            // Performance
            debounce_ms: params.debounce_ms || 150
        };

        this.canvas = null;
        this.ctx = null;
        this.offscreenCanvas = null;
        this.offscreenCtx = null;

        this.renderTimeout = null;
        this.rafId = null;

        // Required Fix #2: Neighbor count cache
        this.neighborCountCache = new Map();

        // Event listener references for cleanup (Required Fix #1)
        this.zoomListener = null;
        this.boundsListener = null;

        this.setMap(map);
    }

    onAdd() {
        // Create canvas element
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.left = '0';
        this.canvas.style.top = '0';
        this.canvas.style.pointerEvents = 'none';

        const panes = this.getPanes();
        panes.overlayLayer.appendChild(this.canvas);

        this.ctx = this.canvas.getContext('2d', { alpha: true });

        // Try to create OffscreenCanvas
        try {
            if (typeof OffscreenCanvas !== 'undefined') {
                this.offscreenCanvas = new OffscreenCanvas(100, 100);
                this.offscreenCtx = this.offscreenCanvas.getContext('2d', { alpha: true });
            }
        } catch (e) {
            console.warn('OffscreenCanvas not supported, using fallback');
        }

        // Required Fix #1: Store event listener references
        this.zoomListener = this.map.addListener('zoom_changed', () => {
            // Clear cache on zoom change (Required Fix #2)
            this.neighborCountCache.clear();
            this.scheduleRender();
        });
        this.boundsListener = this.map.addListener('bounds_changed', () => this.scheduleRender());

        this.scheduleRender();
    }

    onRemove() {
        // Required Fix #1: Clean up event listeners and timeouts
        if (this.zoomListener) {
            google.maps.event.removeListener(this.zoomListener);
            this.zoomListener = null;
        }
        if (this.boundsListener) {
            google.maps.event.removeListener(this.boundsListener);
            this.boundsListener = null;
        }
        if (this.renderTimeout) {
            clearTimeout(this.renderTimeout);
            this.renderTimeout = null;
        }
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }

        // Clear cache
        this.neighborCountCache.clear();

        // Remove canvas
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        this.canvas = null;
        this.ctx = null;
        this.offscreenCanvas = null;
        this.offscreenCtx = null;
    }

    draw() {
        // This is called by OverlayView when projection changes
        this.scheduleRender();
    }

    scheduleRender() {
        // Debounce rendering
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
        const projection = this.getProjection();
        if (!projection || !this.canvas) return;

        const mapDiv = this.map.getDiv();
        const width = mapDiv.offsetWidth;
        const height = mapDiv.offsetHeight;

        // Resize canvas
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            this.canvas.style.width = width + 'px';
            this.canvas.style.height = height + 'px';
        }

        // Clear canvas
        this.ctx.clearRect(0, 0, width, height);

        if (this.data.length === 0) return;

        // Calculate zoom-linked radius
        const zoom = this.map.getZoom();
        const radiusPx = this.calculateRadius(zoom);

        // Create or resize offscreen canvas
        let workCanvas, workCtx;
        if (this.offscreenCanvas) {
            if (this.offscreenCanvas.width !== width || this.offscreenCanvas.height !== height) {
                this.offscreenCanvas.width = width;
                this.offscreenCanvas.height = height;
            }
            workCanvas = this.offscreenCanvas;
            workCtx = this.offscreenCtx;
        } else {
            workCanvas = document.createElement('canvas');
            workCanvas.width = width;
            workCanvas.height = height;
            workCtx = workCanvas.getContext('2d', { alpha: true });
        }

        workCtx.clearRect(0, 0, width, height);

        // Accumulate intensity in grayscale
        const intensityData = workCtx.createImageData(width, height);
        const intensityArray = new Float32Array(width * height);

        // Draw Gaussian kernels for each point
        this.data.forEach(point => {
            const latLng = new google.maps.LatLng(point.lat, point.lng);
            const pixel = projection.fromLatLngToDivPixel(latLng);

            if (!pixel) return;

            const x = Math.round(pixel.x);
            const y = Math.round(pixel.y);

            // Count neighbors for isolation boost
            const neighborCount = this.countNeighbors(point, this.data, radiusPx, projection);
            let alpha = this.params.alpha_base;
            if (neighborCount < this.params.tau) {
                alpha *= this.params.isolation_boost;
            }

            // Draw Gaussian kernel
            this.drawGaussianKernel(intensityArray, width, height, x, y, radiusPx, alpha * (point.count || 1));
        });

        // Normalize and apply color map
        this.applyColorMap(intensityArray, intensityData, width, height);

        // Transfer to work canvas
        workCtx.putImageData(intensityData, 0, 0);

        // Copy to visible canvas
        this.ctx.drawImage(workCanvas, 0, 0);
    }

    calculateRadius(zoom) {
        const { z_ref, r_base, k, r_min_px, r_max_px } = this.params;
        const r_px = r_base * Math.pow(k, z_ref - zoom);
        return Math.max(r_min_px, Math.min(r_max_px, r_px));
    }

    countNeighbors(point, allPoints, radiusPx, projection) {
        // Required Fix #2: Use cache for performance
        const zoom = this.map.getZoom();
        const cacheKey = `${zoom}-${point.lat.toFixed(4)}-${point.lng.toFixed(4)}`;

        if (this.neighborCountCache.has(cacheKey)) {
            return this.neighborCountCache.get(cacheKey);
        }

        const latLng = new google.maps.LatLng(point.lat, point.lng);
        const pixel = projection.fromLatLngToDivPixel(latLng);
        if (!pixel) return 0;

        let count = 0;
        // Approximate radius in meters (very rough estimation)
        const metersPerPx = 40075000 * Math.cos(point.lat * Math.PI / 180) / Math.pow(2, zoom + 8);
        const radiusMeters = radiusPx * metersPerPx;

        for (let other of allPoints) {
            if (other === point) continue;
            const distance = this.haversineDistance(point.lat, point.lng, other.lat, other.lng);
            if (distance <= radiusMeters) {
                count++;
            }
        }

        // Cache the result (Required Fix #2)
        this.neighborCountCache.set(cacheKey, count);
        return count;
    }

    haversineDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000; // Earth radius in meters
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    drawGaussianKernel(intensityArray, width, height, cx, cy, radius, weight) {
        const sigma = radius / 3;
        const sigma2 = sigma * sigma;
        const r = Math.ceil(radius);

        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                const x = cx + dx;
                const y = cy + dy;

                if (x < 0 || x >= width || y < 0 || y >= height) continue;

                const dist2 = dx * dx + dy * dy;
                if (dist2 > r * r) continue;

                const gauss = Math.exp(-dist2 / (2 * sigma2));
                const idx = y * width + x;
                intensityArray[idx] += gauss * weight;
            }
        }
    }

    applyColorMap(intensityArray, imageData, width, height) {
        // Calculate percentiles for normalization
        const sorted = Array.from(intensityArray).filter(v => v > 0).sort((a, b) => a - b);
        if (sorted.length === 0) return;

        const p_low_idx = Math.floor(sorted.length * this.params.percentile_low / 100);
        const p_high_idx = Math.floor(sorted.length * this.params.percentile_high / 100);
        const p_low = sorted[p_low_idx] || 0;
        const p_high = sorted[p_high_idx] || sorted[sorted.length - 1];

        const range = p_high - p_low;
        if (range === 0) return;

        // Apply color map
        const data = imageData.data;
        for (let i = 0; i < intensityArray.length; i++) {
            const intensity = intensityArray[i];
            if (intensity === 0) continue;

            // Normalize and clamp
            let t = (intensity - p_low) / range;
            t = Math.max(0, Math.min(1, t));

            // Apply gamma correction
            t = Math.pow(t, 1 / this.params.gamma);

            // Interpolate in LCH color space
            const rgb = this.lchToRgb(
                this.lerp(this.params.color_light_L, this.params.color_dark_L, t),
                this.lerp(this.params.color_light_C, this.params.color_dark_C, t),
                this.lerp(this.params.color_light_H, this.params.color_dark_H, t)
            );

            const pixelIdx = i * 4;
            data[pixelIdx] = rgb.r;
            data[pixelIdx + 1] = rgb.g;
            data[pixelIdx + 2] = rgb.b;
            data[pixelIdx + 3] = Math.round(t * 255); // Alpha based on intensity
        }
    }

    lerp(a, b, t) {
        return a + (b - a) * t;
    }

    lchToRgb(l, c, h) {
        // LCH to Lab
        const hRad = h * Math.PI / 180;
        const a = c * Math.cos(hRad);
        const b = c * Math.sin(hRad);

        // Lab to XYZ (D65 illuminant)
        const fy = (l + 16) / 116;
        const fx = a / 500 + fy;
        const fz = fy - b / 200;

        const xr = fx > 0.206897 ? fx * fx * fx : (fx - 16 / 116) / 7.787;
        const yr = fy > 0.206897 ? fy * fy * fy : (fy - 16 / 116) / 7.787;
        const zr = fz > 0.206897 ? fz * fz * fz : (fz - 16 / 116) / 7.787;

        const x = xr * 95.047;
        const y = yr * 100.000;
        const z = zr * 108.883;

        // XYZ to RGB
        let r = x * 0.032406 + y * -0.015372 + z * -0.004986;
        let g = x * -0.009689 + y * 0.018758 + z * 0.000415;
        let bl = x * 0.000557 + y * -0.002040 + z * 0.010570;

        // Gamma correction
        r = r > 0.0031308 ? 1.055 * Math.pow(r, 1 / 2.4) - 0.055 : 12.92 * r;
        g = g > 0.0031308 ? 1.055 * Math.pow(g, 1 / 2.4) - 0.055 : 12.92 * g;
        bl = bl > 0.0031308 ? 1.055 * Math.pow(bl, 1 / 2.4) - 0.055 : 12.92 * bl;

        return {
            r: Math.max(0, Math.min(255, Math.round(r * 255))),
            g: Math.max(0, Math.min(255, Math.round(g * 255))),
            b: Math.max(0, Math.min(255, Math.round(bl * 255)))
        };
    }

    // Update data dynamically
    setData(data) {
        if (!Array.isArray(data)) {
            throw new Error('Data must be an array');
        }
        this.data = data;
        this.neighborCountCache.clear();
        this.scheduleRender();
    }

    // Update parameters dynamically
    setParams(params) {
        Object.assign(this.params, params);
        if (params.z_ref !== undefined || params.k !== undefined) {
            this.neighborCountCache.clear();
        }
        this.scheduleRender();
    }
}

// Make it available globally
if (typeof window !== 'undefined') {
    window.HeatmapOverlay = HeatmapOverlay;
}
