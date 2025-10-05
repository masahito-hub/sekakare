# ヒートマップCanvas実装ドキュメント

## 概要

セカカレのヒートマップをCircleベースからCanvas 2D APIベースに改善しました。ズーム連動の美しいグラデーション表示を実現します。

---

## 実装仕様

### 技術スタック
- **Google Maps OverlayView** + Canvas 2D API
- **OffscreenCanvas** でパフォーマンス最適化（フォールバック付き）
- **LCH色空間** で美しいグラデーション

### コア機能

#### 1. ズーム連動半径計算
```javascript
r_px = clamp(r_min_px, r_max_px, r_base * k^(z_ref - zoom))
```

**デフォルトパラメータ:**
- `z_ref = 14` (基準ズームレベル)
- `r_base = 14` (基準半径 [px])
- `k = 1.28` (広域側の伸び係数)
- `r_min_px = 16` (最小画面半径)
- `r_max_px = 48` (最大画面半径)

#### 2. 密度ベース透明度調整
```javascript
neighborCount = countNeighbors(pt, radius_in_meters)
alpha = (neighborCount < tau) ? alpha_base * isolation_boost : alpha_base
```

**パラメータ:**
- `alpha_base = 0.55` (基本透明度)
- `tau = 3` (孤立ブーストの閾値)
- `isolation_boost = 1.25` (旅先単点の視認性向上)

#### 3. 色マップ（LCH補間）

**黄→琥珀の単系統グラデーション:**
- 最薄: `L=95, C=45, H=95` (淡い黄色)
- 最濃: `L=72, C=65, H=80` (琥珀色)
- ガンマ補正: `γ = 1.45` (中間濃度を持ち上げ)

#### 4. 正規化とブレンド
- **クリップ正規化**: p5–p95パーセンタイル
- **通常合成** (加算合成でなく) で都市部の白飛び防止

---

## ズームレベル別の表示

| ズーム | 用途 | 半径（目安） | 期待する見え方 |
|--------|------|--------------|----------------|
| z=5-8 | 日本広域 | 32-36px | 旅先単点が**しっかり視認** |
| z=10-11 | 都市圏 | 22-26px | 密集でも**濁り過ぎない** |
| z=14 | 街区 | 14-16px | **店単位の粒度**がわかる |
| z=17+ | 路面 | 12-16px | 過拡大を防ぐ（下限張り付き） |

---

## パフォーマンス

### 最適化施策
1. **requestAnimationFrame** でスムーズなレンダリング
2. **150msデバウンス** でズーム/ドラッグ中の間引き描画
3. **OffscreenCanvas** でメインスレッド負荷軽減
4. **近傍カウントキャッシュ** で計算量削減

### パフォーマンス制限

⚠️ **重要な制限事項:**

- **推奨データ数**: **1,000点以下**
- **1,000点超の場合**: パフォーマンス低下の可能性（30-40fps程度）
  - `countNeighbors()` がO(n²)のため、大量データでは計算コストが高い
  - 現在の実装ではキャッシュで緩和していますが、初回計算時は負荷がかかります

- **目標パフォーマンス**:
  - デスクトップ: 60fps (1,000点)
  - スマホ中級機: 45fps以上 (1,000点)
  - 1,000点超: 30-40fps (ズーム変更時は遅延あり)

### 将来の改善案

データ数が1,000点を大幅に超える場合、以下の最適化を検討:

1. **Quadtree / R-tree** 等の空間インデックス導入
   - 近傍検索をO(log n)に改善
   - 10,000点以上のデータでも高速動作

2. **WebWorker** での並列計算
   - メインスレッドをブロックせずに計算

3. **レベル別プリ集約**
   - ズームレベルごとにデータを事前集約
   - 表示時の計算を削減

現時点では、セカカレの想定利用シーン（個人のカレー訪問記録）では1,000点以下が一般的なため、現在の実装で十分なパフォーマンスを発揮します。

---

## 使い方

### 基本的な使用

```javascript
// ヒートマップデータを準備
const heatmapPoints = Object.values(heatmapData).map(data => ({
    lat: data.lat,
    lng: data.lng,
    count: data.count
}));

// HeatmapOverlayを作成
const heatmapOverlay = new HeatmapOverlay(map, heatmapPoints);
```

### データ更新

```javascript
// 新しいデータをセット
heatmapOverlay.setData(newHeatmapPoints);
```

### パラメータ調整

```javascript
// パラメータを動的に変更
heatmapOverlay.setParams({
    alpha_base: 0.6,
    tau: 4,
    gamma: 1.5
});
```

### フォールバック実装

```javascript
// HeatmapOverlayが利用できない場合はCircleにフォールバック
function displayHeatmap() {
    if (typeof HeatmapOverlay !== 'undefined') {
        // Canvas実装を使用
        const heatmapPoints = Object.values(heatmapData).map(data => ({
            lat: data.lat,
            lng: data.lng,
            count: data.count
        }));

        if (window.heatmapOverlay) {
            window.heatmapOverlay.setData(heatmapPoints);
        } else {
            window.heatmapOverlay = new HeatmapOverlay(map, heatmapPoints);
        }
    } else {
        // フォールバック: Circle実装
        displayHeatmapWithCircles();
    }
}
```

---

## デバッグツール

`/heatmap-debug.html` にアクセスすると、以下のパラメータをリアルタイムで調整できます:

### 調整可能なパラメータ

**ズーム連動半径:**
- `z_ref`: 基準ズームレベル (デフォルト: 14)
- `r_base`: 基準半径 [px] (デフォルト: 14)
- `k`: 広域側の伸び係数 (デフォルト: 1.28)
- `r_min_px`: 最小画面半径 [px] (デフォルト: 16)
- `r_max_px`: 最大画面半径 [px] (デフォルト: 48)

**透明度:**
- `alpha_base`: 基本透明度 (デフォルト: 0.55)
- `tau`: 孤立ブーストの閾値 (デフォルト: 3)
- `isolation_boost`: 孤立ブースト倍率 (デフォルト: 1.25)

**色マップ (LCH):**
- `color_light_L/C/H`: 淡色のLCH値
- `color_dark_L/C/H`: 濃色のLCH値
- `gamma`: ガンマ補正 (デフォルト: 1.45)

**正規化:**
- `percentile_low`: 下限パーセンタイル (デフォルト: 5)
- `percentile_high`: 上限パーセンタイル (デフォルト: 95)

---

## ブラウザ互換性

### サポート状況
- ✅ Chrome 90+ (完全サポート)
- ✅ Firefox 90+ (完全サポート)
- ✅ Safari 14+ (完全サポート)
- ✅ Edge 90+ (完全サポート)

### OffscreenCanvas
- Chrome/Edge: フル対応
- Firefox: フル対応
- Safari: 未対応 → 自動的に通常Canvasにフォールバック

### CSP準拠
- ✅ インラインスタイル不使用
- ✅ インラインスクリプト不使用
- ✅ すべて外部スクリプトファイル

---

## トラブルシューティング

### ヒートマップが表示されない

1. **コンソールエラーを確認**
   - HeatmapOverlayのコンストラクタエラーがないか確認

2. **データが空でないか確認**
   ```javascript
   console.log('Heatmap data:', heatmapData);
   ```

3. **CanvasがDOMに追加されているか確認**
   ```javascript
   console.log('Canvas element:', document.querySelector('canvas'));
   ```

### パフォーマンスが低い

1. **データ数を確認**
   - 1,000点以下が推奨
   - 超える場合はデータを間引くか、将来の最適化を検討

2. **デバウンス時間を調整**
   ```javascript
   heatmapOverlay.setParams({ debounce_ms: 300 }); // デフォルト: 150ms
   ```

3. **ブラウザのパフォーマンスプロファイラで確認**
   - Chrome DevTools → Performance タブ

### 色が期待通りでない

1. **デバッグツールで調整**
   - `/heatmap-debug.html` でパラメータを微調整

2. **ガンマ値を調整**
   ```javascript
   heatmapOverlay.setParams({ gamma: 1.2 }); // より明るく
   heatmapOverlay.setParams({ gamma: 1.8 }); // より暗く
   ```

---

## 参考リソース

- [Google Maps OverlayView](https://developers.google.com/maps/documentation/javascript/customoverlays)
- [Canvas 2D API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
- [LCH色空間](https://lea.verou.me/2020/04/lch-colors-in-css-what-why-and-how/)

---

## ライセンス

セカカレプロジェクトのライセンスに従います。
