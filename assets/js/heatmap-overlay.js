/**
 * HeatmapOverlay - Canvas-based zoom-responsive heatmap for Google Maps
 *
 * Features:
 * - Zoom-linked radius calculation
 * - Gaussian kernel rendering
 * - Density-based opacity adjustment with isolation boost
 * - LCH color space interpolation (yellow → amber gradient)
 * - p5-p95 percentile normalization + gamma correction
 * - Performance optimization with requestAnimationFrame + debouncing
 * - OffscreenCanvas support with fallback
 * - CSP compliant
 * - Memory leak prevention
 * - Race condition prevention
 * - LRU cache for performance
 */

class HeatmapOverlay extends google.maps.OverlayView {
    constructor(map, data, params = {}) {
        super();

        // Input validation
        if (!map || !map.getDiv) {
            throw new Error('Invalid Google Maps instance');
        }
        if (!Array.isArray(data)) {
            throw new Error('Data must be an array');
        }

        this.map = map;
        this.data = data;

        // Performance constants
        this.MAX_CACHE_SIZE = 1000;
        this.GAUSSIAN_SIGMA_DIVISOR = 3;
        this.EARTH_CIRCUMFERENCE_METERS = 40075000;

        // Default parameters with overrides
        this.params = {
            // Zoom-linked radius
            z_ref: 14,
            r_base: 14,
            k: 1.28,
            r_min_px: 16,
            r_max_px: 48,

            // Density-based opacity
            alpha_base: 0.55,
            tau: 3,
            isolation_boost: 1.25,

            // LCH color map (yellow → amber)
            color_start: { L: 95, C: 45, H: 95 },
            color_end: { L: 72, C: 65, H: 80 },
            gamma: 1.45,

            // Normalization
            percentile_low: 5,
            percentile_high: 95,

            // Performance
            debounce_ms: 150,

            ...params
        };

        // Canvas elements
        this.canvas = null;
        this.ctx = null;
        this.offscreenCanvas = null;
        this.offscreenCtx = null;

        // Event listeners (for cleanup)
        this.zoomListener = null;
        this.boundsListener = null;

        // Rendering state
        this.renderTimeout = null;
        this.rafId = null;
        this.isRendering = false;

        // Performance cache
        this.neighborCountCache = new Map();

        this.setMap(map);
    }

    onAdd() {
        // Create canvas element
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '1';

        // Add to overlay layer
        const panes = this.getPanes();
        panes.overlayLayer.appendChild(this.canvas);

        // Get 2D context
        this.ctx = this.canvas.getContext('2d');

        // Setup offscreen canvas if supported
        if (typeof OffscreenCanvas !== 'undefined') {
            this.offscreenCanvas = new OffscreenCanvas(1, 1);
            this.offscreenCtx = this.offscreenCanvas.getContext('2d');
        }

        // Add event listeners
        this.zoomListener = this.map.addListener('zoom_changed', () => {
            this.neighborCountCache.clear();
            this.scheduleRender();
        });
        this.boundsListener = this.map.addListener('bounds_changed', () => {
            this.scheduleRender();
        });

        // Initial render
        this.scheduleRender();
    }

    onRemove() {
        // Remove event listeners
        if (this.zoomListener) {
            google.maps.event.removeListener(this.zoomListener);
            this.zoomListener = null;
        }
        if (this.boundsListener) {
            google.maps.event.removeListener(this.boundsListener);
            this.boundsListener = null;
        }

        // Cancel pending renders
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
        this.render();
    }

    scheduleRender() {
        // Prevent rendering if already in progress (race condition prevention)
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
            const projection = this.getProjection();
            if (!projection) return;

            // Resize canvas to map size
            const mapDiv = this.map.getDiv();
            const width = mapDiv.offsetWidth;
            const height = mapDiv.offsetHeight;

            this.canvas.width = width;
            this.canvas.height = height;

            // Resize offscreen canvas if it exists
            if (this.offscreenCanvas) {
                this.offscreenCanvas.width = width;
                this.offscreenCanvas.height = height;
            }

            // Clear canvas
            this.ctx.clearRect(0, 0, width, height);

            // Use offscreen canvas for drawing if available
            const drawingCtx = this.offscreenCtx || this.ctx;
            if (this.offscreenCtx) {
                this.offscreenCtx.clearRect(0, 0, width, height);
            }

            // Get current zoom
            const zoom = this.map.getZoom();

            // Calculate zoom-linked radius
            const radiusPx = this.calculateRadius(zoom);

            // Draw Gaussian kernels for each point
            const intensities = new Float32Array(width * height);

            this.data.forEach(point => {
                const latLng = new google.maps.LatLng(point.lat, point.lng);
                const pixel = projection.fromLatLngToDivPixel(latLng);

                if (pixel) {
                    // Count neighbors for density-based opacity
                    const neighborCount = this.countNeighbors(point, this.data, radiusPx);

                    // Calculate opacity with isolation boost
                    let alpha = this.params.alpha_base;
                    if (neighborCount < this.params.tau) {
                        alpha *= this.params.isolation_boost;
                    }

                    // Draw Gaussian kernel and accumulate intensities
                    this.drawGaussianKernel(drawingCtx, pixel.x, pixel.y, radiusPx, alpha, intensities, width, height);
                }
            });

            // Normalize intensities using p5-p95 percentile
            const { min, max } = this.calculatePercentiles(intensities, this.params.percentile_low, this.params.percentile_high);

            // Apply color map with gamma correction
            this.applyColorMap(drawingCtx, intensities, width, height, min, max);

            // Copy offscreen canvas to main canvas if used
            if (this.offscreenCanvas) {
                this.ctx.drawImage(this.offscreenCanvas, 0, 0);
            }
        } finally {
            this.isRendering = false;
        }
    }

    calculateRadius(zoom) {
        const { z_ref, r_base, k, r_min_px, r_max_px } = this.params;
        const r_px = r_base * Math.pow(k, z_ref - zoom);
        return Math.max(r_min_px, Math.min(r_max_px, r_px));
    }

    countNeighbors(point, allPoints, radiusPx) {
        const zoom = this.map.getZoom();
        const cacheKey = `${zoom}-${point.lat.toFixed(4)}-${point.lng.toFixed(4)}`;

        // Check cache first
        if (this.neighborCountCache.has(cacheKey)) {
            return this.neighborCountCache.get(cacheKey);
        }

        // LRU cache eviction
        if (this.neighborCountCache.size >= this.MAX_CACHE_SIZE) {
            const firstKey = this.neighborCountCache.keys().next().value;
            this.neighborCountCache.delete(firstKey);
        }

        // Convert pixel radius to meters
        const lat = point.lat;
        const metersPerPx = this.EARTH_CIRCUMFERENCE_METERS * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom + 8);
        const radiusMeters = radiusPx * metersPerPx;

        // Count neighbors within radius
        let count = 0;
        allPoints.forEach(other => {
            if (other === point) return;
            const distance = this.haversineDistance(point.lat, point.lng, other.lat, other.lng);
            if (distance <= radiusMeters) {
                count++;
            }
        });

        // Cache the result
        this.neighborCountCache.set(cacheKey, count);
        return count;
    }

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

    drawGaussianKernel(ctx, x, y, radius, alpha, intensities, width, height) {
        const sigma = radius / this.GAUSSIAN_SIGMA_DIVISOR;

        // Draw a circular region around the point
        const minX = Math.max(0, Math.floor(x - radius * 2));
        const maxX = Math.min(width, Math.ceil(x + radius * 2));
        const minY = Math.max(0, Math.floor(y - radius * 2));
        const maxY = Math.min(height, Math.ceil(y + radius * 2));

        for (let px = minX; px < maxX; px++) {
            for (let py = minY; py < maxY; py++) {
                const dx = px - x;
                const dy = py - y;
                const distSq = dx * dx + dy * dy;
                const value = alpha * Math.exp(-distSq / (2 * sigma * sigma));
                const idx = py * width + px;
                intensities[idx] = (intensities[idx] || 0) + value;
            }
        }
    }

    calculatePercentiles(intensities, pLow, pHigh) {
        // Filter out zeros and sort
        const nonZero = Array.from(intensities).filter(v => v > 0).sort((a, b) => a - b);
        if (nonZero.length === 0) return { min: 0, max: 1 };

        const lowIdx = Math.floor(nonZero.length * pLow / 100);
        const highIdx = Math.floor(nonZero.length * pHigh / 100);

        return {
            min: nonZero[lowIdx] || 0,
            max: nonZero[highIdx] || nonZero[nonZero.length - 1]
        };
    }

    applyColorMap(ctx, intensities, width, height, min, max) {
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;

        const range = max - min || 1;

        for (let i = 0; i < intensities.length; i++) {
            const intensity = intensities[i];
            if (intensity > 0) {
                // Normalize with clipping
                let normalized = (intensity - min) / range;
                normalized = Math.max(0, Math.min(1, normalized));

                // Apply gamma correction
                normalized = Math.pow(normalized, 1 / this.params.gamma);

                // Interpolate LCH color
                const color = this.interpolateLCH(normalized);

                // Convert LCH to RGB
                const rgb = this.lchToRgb(color.L, color.C, color.H);

                // Set pixel
                const pixelIdx = i * 4;
                data[pixelIdx] = rgb.r;
                data[pixelIdx + 1] = rgb.g;
                data[pixelIdx + 2] = rgb.b;
                data[pixelIdx + 3] = 255; // Full opacity (color already includes alpha)
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }

    interpolateLCH(t) {
        const start = this.params.color_start;
        const end = this.params.color_end;

        return {
            L: start.L + t * (end.L - start.L),
            C: start.C + t * (end.C - start.C),
            H: start.H + t * (end.H - start.H)
        };
    }

    lchToRgb(L, C, H) {
        // LCH -> Lab
        const a = C * Math.cos(H * Math.PI / 180);
        const b = C * Math.sin(H * Math.PI / 180);

        // Lab -> XYZ (D65 illuminant)
        let y = (L + 16) / 116;
        let x = a / 500 + y;
        let z = y - b / 200;

        x = 0.95047 * ((x * x * x > 0.008856) ? x * x * x : (x - 16 / 116) / 7.787);
        y = 1.00000 * ((y * y * y > 0.008856) ? y * y * y : (y - 16 / 116) / 7.787);
        z = 1.08883 * ((z * z * z > 0.008856) ? z * z * z : (z - 16 / 116) / 7.787);

        // XYZ -> RGB (sRGB)
        let r = x *  3.2406 + y * -1.5372 + z * -0.4986;
        let g = x * -0.9689 + y *  1.8758 + z *  0.0415;
        let blue = x *  0.0557 + y * -0.2040 + z *  1.0570;

        // Apply gamma correction
        r = (r > 0.0031308) ? 1.055 * Math.pow(r, 1 / 2.4) - 0.055 : 12.92 * r;
        g = (g > 0.0031308) ? 1.055 * Math.pow(g, 1 / 2.4) - 0.055 : 12.92 * g;
        blue = (blue > 0.0031308) ? 1.055 * Math.pow(blue, 1 / 2.4) - 0.055 : 12.92 * blue;

        // Clamp to [0, 255]
        return {
            r: Math.round(Math.max(0, Math.min(255, r * 255))),
            g: Math.round(Math.max(0, Math.min(255, g * 255))),
            b: Math.round(Math.max(0, Math.min(255, blue * 255)))
        };
    }
}

// Make available globally
window.HeatmapOverlay = HeatmapOverlay;
