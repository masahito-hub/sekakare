# Canvas版ヒートマップ実装ドキュメント

## 概要

セカカレのヒートマップをCircleベースからCanvas 2D APIベースに改善しました。ズーム連動の高品質なヒートマップ実装により、広域表示時の視認性と都市密集地での粒度感が向上しています。

## 技術スタック

- **Google Maps OverlayView** + Canvas 2D API
- **OffscreenCanvas**でパフォーマンス最適化（フォールバック付き）
- **LCH色空間**で美しいグラデーション

## コア仕様

### 1. ズーム連動半径計算

```javascript
const r_px = clamp(r_min_px, r_max_px, r_base * Math.pow(k, (z_ref - zoom)));
```

**推奨初期パラメータ：**
- `z_ref = 14`（基準ズームレベル）
- `r_base = 14`（基準半径 [px]）
- `k = 1.28`（広域側の伸び係数）
- `r_min_px = 16`（最小画面半径）
- `r_max_px = 48`（最大画面半径）

### 2. 密度ベースの透明度調整

```javascript
const n = countNeighbors(pt, radius_in_meters);
const alpha = (n < tau) ? alpha_base * 1.25 : alpha_base;
```

**パラメータ：**
- `alpha_base = 0.55`（基本透明度）
- `tau = 3`（孤立ブーストの閾値）
- 孤立ブースト：`alpha *= 1.25`（旅先単点の視認性向上）

### 3. 色マップ（LCH補間）

**黄→琥珀の単系統グラデーション：**
- 最薄: `L=95, C=45, H=95`（淡い黄色）
- 最濃: `L=72, C=65, H=80`（琥珀色）
- ガンマ補正：`γ = 1.45`（中間濃度を持ち上げ）

### 4. 正規化とブレンド

- **クリップ正規化**：p5–p95パーセンタイル
- **通常合成**（加算合成でなく）で都市部の白飛び防止

## ズームレベル別の表示

| ズーム | 用途 | 半径（目安） | 期待する見え方 |
|--------|------|--------------|----------------|
| z=5-8 | 日本広域 | 32-36px | 旅先単点が**しっかり視認** |
| z=10-11 | 都市圏 | 22-26px | 密集でも**濁り過ぎない** |
| z=14 | 街区 | 14-16px | **店単位の粒度**がわかる |
| z=17+ | 路面 | 12-16px | 過拡大を防ぐ（下限張り付き） |

## 実装済み機能

### Phase 1: 基盤実装
- ✅ `HeatmapOverlay` クラス作成（OverlayView継承）
- ✅ Canvas初期化とGoogle Mapsへの統合
- ✅ 座標変換（緯度経度 → Canvas座標）

### Phase 2: 描画ロジック
- ✅ ズーム連動半径計算の実装
- ✅ ガウシアンカーネル描画（各訪問地点）
- ✅ 近傍カウント＋孤立ブースト
- ✅ オフスクリーンCanvasでの累積描画

### Phase 3: 色マップ＆正規化
- ✅ LCH色空間補間関数の実装
- ✅ p5-p95 パーセンタイル正規化
- ✅ ガンマ補正適用
- ✅ 最終Canvas転送

### Phase 4: パフォーマンス最適化
- ✅ `requestAnimationFrame`でのレンダリング
- ✅ ズーム/ドラッグ中の間引き描画（150msデバウンス）
- ✅ LRUキャッシュによる近傍カウントの最適化（MAX_SIZE=1000）
- ✅ レースコンディション対策（isRenderingフラグ）

### Phase 5: 品質＆セキュリティ
- ✅ パラメータバリデーション
- ✅ マジックナンバーの定数化
- ✅ メモリリーク対策（イベントリスナーのクリーンアップ）
- ✅ デバッグツールのアクセス制限（.htaccess）
- ✅ localStorage parseエラーハンドリング

## 技術的注意事項

### CSP準拠
- インラインスタイル不使用
- Canvas APIは問題なし（既存のCircleより安全）

### ブラウザ互換性
- Canvas 2D API：全モダンブラウザ対応
- OffscreenCanvas：フォールバック実装を用意

### デバッグ支援
- パラメータをlocalStorageで調整可能（`/heatmap-debug.html`）
- デバッグモードで各ステップを可視化

## パフォーマンス制限（v1.0）

### 現在の制限事項

- **推奨データ数**: 500点以下
- **500点超の場合**: パフォーマンス低下の可能性あり（特にズーム変更時）
  - 近傍カウント処理がO(n²)のため、データ数が増えると遅延が発生
  - LRUキャッシュ（MAX_SIZE=1000）で部分的に軽減
- **スマホ中級機**: 500点で30-45fps程度を想定

### 将来の改善予定

以下の条件を満たした場合、次のIssueとして対応します：

**トリガー条件：**
- ユーザー数50人超 または
- 訪問記録合計500件超

**改善案：**
1. **Quadtree等の空間インデックス導入**
   - O(n²) → O(n log n) に改善
   - 1000点以上でも高速な近傍検索が可能

2. **ImageData方式への移行**
   - `drawGaussianKernel()`をImageData直接操作に変更
   - 放射状グラデーション作成のオーバーヘッド削減

3. **WebWorkerによる並列化**
   - 近傍カウントをバックグラウンド処理
   - UI スレッドのブロックを防止

## 使用方法

### 基本的な使い方

1. **通常利用**: そのまま使えます！既存のヒートマップ機能と同じように動作
2. **パラメータ調整**: `/heatmap-debug.html` にアクセスして微調整可能（開発環境のみ）
3. **フォールバック**: HeatmapOverlayが読み込まれない場合、自動的にCircleベースに切り替わり

### デバッグツールの使い方

1. `/heatmap-debug.html` にアクセス（開発環境のみ）
2. スライダーでパラメータをリアルタイム調整
3. 「💾 パラメータを保存」でlocalStorageに保存
4. メインアプリで自動的に反映

**調整可能なパラメータ:**
- ズーム連動半径（z_ref, r_base, k, r_min, r_max）
- 透明度（alpha_base, tau, isolation_boost）
- 色マップ（LCH各値、gamma）
- 正規化（percentile_low, percentile_high）

## ファイル構成

```
sekakare/
├── assets/
│   └── js/
│       ├── heatmap-overlay.js    # HeatmapOverlayクラス（本体）
│       └── app.js                # 統合ロジック＋localStorage修正
├── heatmap-debug.html            # デバッグツール
├── index.html                    # スクリプトタグ追加
├── .htaccess                     # デバッグツールのアクセス制限
└── HEATMAP_IMPLEMENTATION.md     # このドキュメント
```

## 受け入れ基準

### 必須条件
✅ 広域（z=7-8）で旅先単点が直径24-32pxで視認できる
✅ 都市部（z=12-13）で濁らず階調がある
✅ 詳細ズーム（z=17+）で過度なベタ塗りにならない
✅ スマホ中級機で45fps以上（500点以下）
✅ CSP準拠（インラインスタイル/スクリプト不使用）
✅ メモリリーク対策済み
✅ レースコンディション対策済み

### 微調整の余地
- `k`値の±0.02調整
- `alpha_base`の0.5-0.6範囲調整
- p95をp90に変更（ハイ側切り詰め）

## 参考リソース

- [Google Maps OverlayView](https://developers.google.com/maps/documentation/javascript/customoverlays)
- [Canvas 2D API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [LCH色空間](https://lea.verou.me/2020/04/lch-colors-in-css-what-why-and-how/)

---

**実装日**: 2025-10-05
**バージョン**: v1.0
**作成者**: Claude (Anthropic)
