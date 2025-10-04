/**
 * HeatmapOverlay - Canvas-based heatmap with zoom-linked rendering
 *
 * Implements a high-quality heatmap overlay using Google Maps OverlayView
 * with Canvas 2D API, featuring:
 * - Zoom-linked radius calculation
 * - Density-based transparency adjustment
 * - LCH color space interpolation
 * - Performance optimizations with requestAnimationFrame
 */

class HeatmapOverlay extends google.maps.OverlayView {
    constructor(map, data, params = {}) {
        super();

        this.map = map;
        this.data = data; // Array of {lat, lng, count}

        // Parameters with defaults from specification
        this.params = {
            // Zoom-linked radius parameters
            z_ref: params.z_ref || 14,
            r_base: params.r_base || 14,
            k: params.k || 1.28,
            r_min_px: params.r_min_px || 16,
            r_max_px: params.r_max_px || 48,

            // Density-based transparency
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
        this.offscreenCanvas = null;
        this.ctx = null;
        this.offscreenCtx = null;
        this.renderTimeout = null;
        this.isRendering = false;

        // Load parameters from localStorage if available (for debugging)
        this.loadDebugParams();

        this.setMap(map);
    }

    /**
     * Load debug parameters from localStorage
     */
    loadDebugParams() {
        try {
            const debugParams = localStorage.getItem('sekakare_heatmap_params');
            if (debugParams) {
                const parsed = JSON.parse(debugParams);
                Object.assign(this.params, parsed);
                console.log('[HeatmapOverlay] Loaded debug parameters:', parsed);
            }
        } catch (e) {
            console.warn('[HeatmapOverlay] Failed to load debug parameters:', e);
        }
    }

    /**
     * Called when overlay is added to map
     */
    onAdd() {
        // Create canvas element
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.pointerEvents = 'none'; // Allow map interaction

        // Create offscreen canvas if supported
        if (typeof OffscreenCanvas !== 'undefined') {
            this.offscreenCanvas = new OffscreenCanvas(100, 100);
            this.offscreenCtx = this.offscreenCanvas.getContext('2d');
        } else {
            // Fallback: use regular canvas
            this.offscreenCanvas = document.createElement('canvas');
            this.offscreenCtx = this.offscreenCanvas.getContext('2d');
        }

        this.ctx = this.canvas.getContext('2d');

        // Add canvas to overlay layer
        const panes = this.getPanes();
        panes.overlayLayer.appendChild(this.canvas);

        // Listen to zoom changes
        this.map.addListener('zoom_changed', () => this.scheduleRender());
        this.map.addListener('bounds_changed', () => this.scheduleRender());
    }

    /**
     * Called when overlay needs to be drawn
     */
    draw() {
        this.scheduleRender();
    }

    /**
     * Schedule render with debouncing
     */
    scheduleRender() {
        if (this.renderTimeout) {
            clearTimeout(this.renderTimeout);
        }

        this.renderTimeout = setTimeout(() => {
            this.render();
        }, this.params.debounce_ms);
    }

    /**
     * Main render function
     */
    render() {
        if (this.isRendering) return;
        this.isRendering = true;

        requestAnimationFrame(() => {
            try {
                this.drawHeatmap();
            } catch (e) {
                console.error('[HeatmapOverlay] Render error:', e);
            } finally {
                this.isRendering = false;
            }
        });
    }

    /**
     * Draw heatmap on canvas
     */
    drawHeatmap() {
        const projection = this.getProjection();
        if (!projection || !this.data || this.data.length === 0) {
            return;
        }

        const bounds = this.map.getBounds();
        if (!bounds) return;

        // Get canvas dimensions from map div
        const mapDiv = this.map.getDiv();
        const width = mapDiv.offsetWidth;
        const height = mapDiv.offsetHeight;

        // Resize canvases if needed
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            this.offscreenCanvas.width = width;
            this.offscreenCanvas.height = height;
        }

        // Update canvas position
        const ne = projection.fromLatLngToDivPixel(bounds.getNorthEast());
        this.canvas.style.left = '0px';
        this.canvas.style.top = '0px';
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';

        // Clear offscreen canvas
        this.offscreenCtx.clearRect(0, 0, width, height);

        // Get current zoom level
        const zoom = this.map.getZoom();

        // Calculate zoom-linked radius
        const radius = this.calculateRadius(zoom);

        // Filter data points within view + margin
        const margin = radius * 2;
        const visiblePoints = this.data.filter(point => {
            const latLng = new google.maps.LatLng(point.lat, point.lng);
            return bounds.contains(latLng);
        });

        if (visiblePoints.length === 0) {
            this.ctx.clearRect(0, 0, width, height);
            return;
        }

        // Draw each point with Gaussian kernel
        const densityMap = new Float32Array(width * height);

        visiblePoints.forEach(point => {
            const latLng = new google.maps.LatLng(point.lat, point.lng);
            const pixel = projection.fromLatLngToDivPixel(latLng);

            // Count neighbors for isolation boost
            const neighborCount = this.countNeighbors(point, visiblePoints, radius);

            // Calculate alpha with isolation boost
            let alpha = this.params.alpha_base;
            if (neighborCount < this.params.tau) {
                alpha *= this.params.isolation_boost;
            }

            // Draw Gaussian kernel
            this.drawGaussianKernel(
                densityMap,
                width,
                height,
                pixel.x,
                pixel.y,
                radius,
                point.count || 1,
                alpha
            );
        });

        // Normalize density map
        const normalized = this.normalizeDensity(densityMap);

        // Apply color map and render to canvas
        this.applyColorMap(normalized, width, height);

        // Transfer to visible canvas
        this.ctx.clearRect(0, 0, width, height);
        this.ctx.drawImage(this.offscreenCanvas, 0, 0);
    }

    /**
     * Calculate zoom-linked radius
     */
    calculateRadius(zoom) {
        const { z_ref, r_base, k, r_min_px, r_max_px } = this.params;
        const r_px = r_base * Math.pow(k, z_ref - zoom);
        return Math.max(r_min_px, Math.min(r_max_px, r_px));
    }

    /**
     * Count neighbors within radius (in meters)
     */
    countNeighbors(point, allPoints, radiusPx) {
        // Convert pixel radius to approximate meters
        // At zoom 14, ~1px ≈ 10m (rough approximation)
        const zoom = this.map.getZoom();
        const metersPerPx = 156543.03392 * Math.cos(point.lat * Math.PI / 180) / Math.pow(2, zoom);
        const radiusMeters = radiusPx * metersPerPx;

        let count = 0;
        allPoints.forEach(other => {
            if (other === point) return;
            const dist = this.haversineDistance(point.lat, point.lng, other.lat, other.lng);
            if (dist < radiusMeters) {
                count++;
            }
        });

        return count;
    }

    /**
     * Haversine distance in meters
     */
    haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000; // Earth radius in meters
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Draw Gaussian kernel at specified position
     */
    drawGaussianKernel(densityMap, width, height, cx, cy, radius, intensity, alpha) {
        const r = Math.ceil(radius);
        const sigma = radius / 3; // Standard deviation
        const sigma2 = sigma * sigma;

        for (let y = -r; y <= r; y++) {
            for (let x = -r; x <= r; x++) {
                const px = Math.round(cx + x);
                const py = Math.round(cy + y);

                if (px < 0 || px >= width || py < 0 || py >= height) continue;

                const dist2 = x * x + y * y;
                if (dist2 > r * r) continue;

                // Gaussian function
                const gaussian = Math.exp(-dist2 / (2 * sigma2));
                const value = gaussian * intensity * alpha;

                const idx = py * width + px;
                densityMap[idx] += value;
            }
        }
    }

    /**
     * Normalize density map using percentile clipping
     */
    normalizeDensity(densityMap) {
        // Get non-zero values for percentile calculation
        const nonZero = Array.from(densityMap).filter(v => v > 0).sort((a, b) => a - b);

        if (nonZero.length === 0) {
            return new Float32Array(densityMap.length);
        }

        // Calculate percentiles
        const p_low = this.percentile(nonZero, this.params.percentile_low);
        const p_high = this.percentile(nonZero, this.params.percentile_high);

        // Normalize and apply gamma correction
        const normalized = new Float32Array(densityMap.length);
        const range = p_high - p_low;

        if (range <= 0) {
            return normalized;
        }

        for (let i = 0; i < densityMap.length; i++) {
            if (densityMap[i] > 0) {
                let val = (densityMap[i] - p_low) / range;
                val = Math.max(0, Math.min(1, val));
                // Apply gamma correction
                val = Math.pow(val, 1 / this.params.gamma);
                normalized[i] = val;
            }
        }

        return normalized;
    }

    /**
     * Calculate percentile of sorted array
     */
    percentile(sortedArray, p) {
        if (sortedArray.length === 0) return 0;
        const idx = Math.floor(sortedArray.length * p / 100);
        return sortedArray[Math.min(idx, sortedArray.length - 1)];
    }

    /**
     * Apply color map using LCH interpolation
     */
    applyColorMap(normalized, width, height) {
        const imageData = this.offscreenCtx.createImageData(width, height);
        const data = imageData.data;

        for (let i = 0; i < normalized.length; i++) {
            const value = normalized[i];

            if (value > 0) {
                const color = this.lchInterpolate(value);
                const idx = i * 4;
                data[idx] = color.r;
                data[idx + 1] = color.g;
                data[idx + 2] = color.b;
                data[idx + 3] = Math.round(color.a * 255);
            }
        }

        this.offscreenCtx.putImageData(imageData, 0, 0);
    }

    /**
     * LCH color interpolation
     */
    lchInterpolate(t) {
        const { color_light_L, color_light_C, color_light_H,
                color_dark_L, color_dark_C, color_dark_H } = this.params;

        // Interpolate in LCH space
        const L = color_light_L + (color_dark_L - color_light_L) * t;
        const C = color_light_C + (color_dark_C - color_light_C) * t;
        const H = color_light_H + (color_dark_H - color_light_H) * t;

        // Convert LCH to RGB
        const rgb = this.lchToRgb(L, C, H);

        return {
            r: rgb.r,
            g: rgb.g,
            b: rgb.b,
            a: 1.0 // Full opacity (alpha handled in density)
        };
    }

    /**
     * Convert LCH to RGB
     * L: 0-100, C: 0-100+, H: 0-360
     */
    lchToRgb(l, c, h) {
        // Convert LCH to Lab
        const hRad = h * Math.PI / 180;
        const a = c * Math.cos(hRad);
        const b = c * Math.sin(hRad);

        // Convert Lab to XYZ
        const fy = (l + 16) / 116;
        const fx = a / 500 + fy;
        const fz = fy - b / 200;

        const xr = fx * fx * fx > 0.008856 ? fx * fx * fx : (fx - 16/116) / 7.787;
        const yr = fy * fy * fy > 0.008856 ? fy * fy * fy : (fy - 16/116) / 7.787;
        const zr = fz * fz * fz > 0.008856 ? fz * fz * fz : (fz - 16/116) / 7.787;

        // D65 illuminant
        const x = xr * 95.047;
        const y = yr * 100.000;
        const z = zr * 108.883;

        // Convert XYZ to RGB
        let r = x *  3.2406 + y * -1.5372 + z * -0.4986;
        let g = x * -0.9689 + y *  1.8758 + z *  0.0415;
        let bVal = x *  0.0557 + y * -0.2040 + z *  1.0570;

        // Gamma correction
        r = r > 0.0031308 ? 1.055 * Math.pow(r, 1/2.4) - 0.055 : 12.92 * r;
        g = g > 0.0031308 ? 1.055 * Math.pow(g, 1/2.4) - 0.055 : 12.92 * g;
        bVal = bVal > 0.0031308 ? 1.055 * Math.pow(bVal, 1/2.4) - 0.055 : 12.92 * bVal;

        return {
            r: Math.max(0, Math.min(255, Math.round(r * 255))),
            g: Math.max(0, Math.min(255, Math.round(g * 255))),
            b: Math.max(0, Math.min(255, Math.round(bVal * 255)))
        };
    }

    /**
     * Update heatmap data
     */
    updateData(newData) {
        this.data = newData;
        this.scheduleRender();
    }

    /**
     * Update parameters
     */
    updateParams(newParams) {
        Object.assign(this.params, newParams);
        this.scheduleRender();
    }

    /**
     * Called when overlay is removed
     */
    onRemove() {
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        this.canvas = null;
        this.offscreenCanvas = null;
        this.ctx = null;
        this.offscreenCtx = null;
    }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.HeatmapOverlay = HeatmapOverlay;
}
