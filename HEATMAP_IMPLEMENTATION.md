# ヒートマップ実装ドキュメント

## 概要

セカカレのヒートマップをCircleベースからCanvas 2D API + Google Maps OverlayViewベースに改善しました。

## 技術スタック

- **Google Maps OverlayView** - カスタムオーバーレイの基盤
- **Canvas 2D API** - 高速なビットマップ描画
- **OffscreenCanvas** - パフォーマンス最適化（フォールバック付き）
- **LCH色空間** - 美しいグラデーション

## 主要機能

### 1. ズーム連動半径計算

```javascript
r_px = clamp(r_min_px, r_max_px, r_base * k^(z_ref - zoom))
```

**デフォルトパラメータ:**
- `z_ref = 14` (基準ズームレベル)
- `r_base = 14` (基準半径 [px])
- `k = 1.28` (広域側の伸び係数)
- `r_min_px = 16` (最小画面半径)
- `r_max_px = 48` (最大画面半径)

**期待される表示:**

| ズームレベル | 用途 | 半径（目安） | 見え方 |
|------------|------|-------------|--------|
| z=5-8 | 日本広域 | 32-36px | 旅先単点がしっかり視認 |
| z=10-11 | 都市圏 | 22-26px | 密集でも濁らない |
| z=14 | 街区 | 14-16px | 店単位の粒度 |
| z=17+ | 路面 | 12-16px | 過拡大防止（下限張り付き） |

### 2. 密度ベース透明度調整

```javascript
const n = countNeighbors(pt, radius_in_meters);
const alpha = (n < tau) ? alpha_base * isolation_boost : alpha_base;
```

**パラメータ:**
- `alpha_base = 0.55` (基本透明度)
- `tau = 3` (孤立ブースト閾値)
- `isolation_boost = 1.25` (孤立点の視認性向上)

### 3. LCH色空間補間

**黄→琥珀の単系統グラデーション:**

- **最薄**: `L=95, C=45, H=95` (淡い黄色)
- **最濃**: `L=72, C=65, H=80` (琥珀色)
- **ガンマ補正**: `γ = 1.45` (中間濃度を持ち上げ)

### 4. 正規化とブレンド

- **クリップ正規化**: p5–p95パーセンタイル
- **通常合成**: 加算合成でなく通常合成で都市部の白飛び防止

## パフォーマンス最適化

### 実装済み最適化

1. **requestAnimationFrame** - 描画タイミングの最適化
2. **150msデバウンス** - ズーム/ドラッグ中の間引き
3. **OffscreenCanvas** - オフスクリーン描画（フォールバック付き）
4. **近傍カウントキャッシュ** - O(n²)計算の最適化
5. **LRUキャッシュ** - キャッシュサイズ制限（MAX_SIZE=1000）
6. **レースコンディション対策** - isRenderingフラグで重複レンダリング防止

### パフォーマンス制限

- **推奨データ数**: 1,000点以下
- **1,000点超の場合**: パフォーマンス低下の可能性（30-40fps程度）
  - ズーム変更時は近傍カウント再計算のため遅延あり
- **将来の改善**: Quadtree等の空間インデックス導入を検討

## セキュリティ

### CSP準拠

- ✅ インラインスタイル不使用
- ✅ インラインスクリプト不使用
- ✅ Canvas APIは安全（既存のCircleより安全）

### デバッグツールセキュリティ

`heatmap-debug.html` は `.htaccess` でアクセス制限:

```apache
<Files "heatmap-debug.html">
    Require ip 127.0.0.1
    # 本番環境ではローカルのみアクセス可能
</Files>
```

## ブラウザ互換性

- **Canvas 2D API**: 全モダンブラウザ対応
- **OffscreenCanvas**: Chrome 69+, Firefox 105+ (フォールバック実装あり)
- **LCH色空間**: JavaScript実装（ブラウザ依存なし）

## 使い方

### 基本的な使用

```javascript
// ヒートマップデータを準備
const heatmapPoints = Object.values(heatmapData).map(d => ({
    lat: d.lat,
    lng: d.lng
}));

// HeatmapOverlayを作成
if (typeof HeatmapOverlay !== 'undefined' && heatmapPoints.length > 0) {
    const overlay = new HeatmapOverlay(map, heatmapPoints);
}
```

### パラメータカスタマイズ

```javascript
// カスタムパラメータで作成
const overlay = new HeatmapOverlay(map, heatmapPoints, {
    z_ref: 14,
    r_base: 14,
    k: 1.28,
    alpha_base: 0.55,
    gamma: 1.45
});

// 実行時にパラメータ更新
overlay.updateParams({
    k: 1.30,
    alpha_base: 0.60
});
```

### デバッグツール

`/heatmap-debug.html` にアクセスすると、以下が可能:

1. スライダーでパラメータをリアルタイム調整
2. localStorageに設定を保存
3. メインアプリで自動的に反映

## ファイル構成

```
sekakare/
├── assets/js/
│   ├── heatmap-overlay.js    # HeatmapOverlayクラス
│   └── app.js                 # メインアプリ（統合済み）
├── heatmap-debug.html         # パラメータ調整ツール
├── .htaccess                  # セキュリティ設定
└── HEATMAP_IMPLEMENTATION.md  # このファイル
```

## トラブルシューティング

### ヒートマップが表示されない

1. `HeatmapOverlay` クラスが読み込まれているか確認
2. コンソールでエラーチェック
3. データが空でないか確認

### パフォーマンスが悪い

1. データ点数を確認（1000点以下を推奨）
2. デバウンス時間を増やす（150ms → 300ms）
3. キャッシュサイズを確認

### 色が期待と違う

1. `heatmap-debug.html` でパラメータ調整
2. LCH値を微調整
3. ガンマ補正を変更（1.3〜1.6）

## 今後の改善案

1. **空間インデックス**: Quadtreeで近傍検索をO(log n)に改善
2. **WebGL対応**: より大規模データセットへの対応
3. **タイルベースレンダリング**: 超広域表示の最適化
4. **アニメーション**: 時系列での変化を可視化

## 参考リソース

- [Google Maps OverlayView](https://developers.google.com/maps/documentation/javascript/customoverlays)
- [Canvas 2D API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [LCH色空間](https://lea.verou.me/2020/04/lch-colors-in-css-what-why-and-how/)
- [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)

---

**実装日**: 2025-10-05
**バージョン**: 1.0.0
**担当**: Claude + masahito-hub
