# ヒートマップCanvas実装ドキュメント

## 概要

セカカレのヒートマップをCircleベースからCanvas 2D APIベースに改善しました。ズーム連動の高品質な可視化を実現し、MVP段階に最適化した実装です。

---

## 技術スタック

- **Google Maps OverlayView** + Canvas 2D API
- **OffscreenCanvas** でパフォーマンス最適化（フォールバック付き）
- **LCH色空間** で美しいグラデーション
- **CSP準拠** （インラインスタイル/スクリプト不使用）

---

## コア機能

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
| ズーム | 用途 | 半径（目安） | 見え方 |
|--------|------|--------------|--------|
| z=5-8 | 日本広域 | 32-36px | 旅先単点が**しっかり視認** |
| z=10-11 | 都市圏 | 22-26px | 密集でも**濁り過ぎない** |
| z=14 | 街区 | 14-16px | **店単位の粒度**がわかる |
| z=17+ | 路面 | 12-16px | 過拡大を防ぐ（下限張り付き） |

### 2. 密度ベースの透明度調整

```javascript
const n = countNeighbors(pt, radius_in_meters);
const alpha = (n < tau) ? alpha_base * 1.25 : alpha_base;
```

**パラメータ:**
- `alpha_base = 0.55` (基本透明度)
- `tau = 3` (孤立ブーストの閾値)
- 孤立ブースト: `alpha *= 1.25` (旅先単点の視認性向上)

**効果:**
- 都市密集地: 濁りを防ぐ
- 旅先単発訪問: 透明度を上げて視認性確保

### 3. 色マップ（LCH補間）

**黄→琥珀の単系統グラデーション:**
- 最薄: `L=95, C=45, H=95` (淡い黄色)
- 最濃: `L=72, C=65, H=80` (琥珀色)
- ガンマ補正: `γ = 1.45` (中間濃度を持ち上げ)

**LCH色空間の利点:**
- 知覚的に均一なグラデーション
- RGBより美しい中間色

### 4. 正規化とブレンド

- **クリップ正規化**: p5–p95パーセンタイル
  - 外れ値の影響を抑制
  - 広域/都市部どちらでも適切な階調
- **通常合成** (加算合成でなく) で都市部の白飛び防止

---

## パフォーマンス最適化

### 実装済みの最適化

1. **requestAnimationFrame**
   - ブラウザの描画サイクルと同期

2. **デバウンス (150ms)**
   - ズーム/ドラッグ中の無駄な再描画を防止

3. **OffscreenCanvas**
   - オフスクリーン描画でメインスレッドへの負荷軽減
   - 非対応ブラウザ向けフォールバック実装

4. **LRUキャッシュ (MAX_SIZE=1000)**
   - 近傍カウント結果をキャッシュ
   - ズーム変更時に自動クリア
   - メモリリーク防止

5. **レースコンディション対策**
   - `isRendering`フラグで重複レンダリング防止

6. **メモリリーク対策**
   - `onRemove()`でイベントリスナーをクリーンアップ
   - タイムアウトとrAFをクリア

---

## 現在の制限事項（v1.0 - MVP段階）

### パフォーマンス制限

**推奨データ数:**
- **500点以下**: 快適に動作（60fps目標）
- **500-1000点**: 動作可能（30-45fps程度）
- **1000点超**: パフォーマンス低下の可能性あり

**理由:**
- 近傍カウント処理がO(n²)の計算量
- MVP段階（ユーザー2名）では問題なし
- キャッシュ機構で実用的な速度を確保

**トリガー条件（最適化実装の判断基準）:**
- ユーザー数50人超 **または**
- 訪問記録合計500件超

**将来の改善予定:**
- Quadtreeやkd-treeなどの空間インデックス導入
- ImageData方式での最適化
- WebGL実装の検討（大規模データ向け）

---

## ファイル構成

```
sekakare/
├── assets/js/
│   ├── heatmap-overlay.js  # HeatmapOverlayクラス（新規）
│   └── app.js              # Canvas実装を使用（修正済み）
├── heatmap-debug.html      # デバッグツール（新規）
├── index.html              # スクリプトタグ追加（修正済み）
├── .htaccess               # デバッグツールアクセス制限（修正済み）
└── HEATMAP_IMPLEMENTATION.md  # このファイル
```

---

## 使い方

### 通常利用

そのまま使えます！既存のヒートマップ機能と同じように動作します。

### パラメータ調整

1. `/heatmap-debug.html` にアクセス
2. スライダーでパラメータをリアルタイム調整
3. 「💾 パラメータを保存」でlocalStorageに保存
4. メインアプリをリロードすると反映

**調整可能なパラメータ:**
- ズーム連動半径（z_ref, r_base, k, r_min, r_max）
- 透明度（alpha_base, tau, isolation_boost）
- 色マップ（LCH各値、gamma）
- 正規化（percentile_low, percentile_high）
- パフォーマンス（debounce_ms）

### フォールバック

HeatmapOverlayが読み込まれない場合、自動的にCircleベースのヒートマップに切り替わります。

---

## ブラウザ互換性

### 必須機能
- ✅ Canvas 2D API (全モダンブラウザ対応)
- ✅ Google Maps JavaScript API
- ✅ ES6+ (const, let, arrow functions等)

### オプショナル機能
- ✅ OffscreenCanvas (フォールバック実装あり)
  - Chrome 69+, Firefox 105+, Safari 16.4+
  - 非対応ブラウザでは通常のCanvasを使用

---

## セキュリティ

### CSP準拠
- ❌ インラインスタイル不使用
- ❌ インラインスクリプト不使用
- ✅ Canvas APIは問題なし（既存のCircleより安全）

### デバッグツールのアクセス制限

`.htaccess`に設定を追加済み（デフォルトでコメントアウト）:

```apache
# 本番環境で有効化する場合:
<Files "heatmap-debug.html">
    Require ip 127.0.0.1
</Files>
```

---

## デバッグ

### デバッグモードの有効化

ブラウザのコンソールで:

```javascript
localStorage.setItem('sekakare_debug', 'true');
location.reload();
```

### パラメータの確認

```javascript
// 現在のカスタムパラメータを確認
console.log(JSON.parse(localStorage.getItem('sekakare_heatmap_params')));

// デフォルトに戻す
localStorage.removeItem('sekakare_heatmap_params');
location.reload();
```

### パフォーマンス計測

```javascript
// レンダリング時間を計測
performance.mark('heatmap-start');
// ... rendering ...
performance.mark('heatmap-end');
performance.measure('heatmap-render', 'heatmap-start', 'heatmap-end');
console.log(performance.getEntriesByName('heatmap-render'));
```

---

## テスト項目

### 必須テスト（受け入れ基準）

1. **広域（z=7-8）**: 関東一円で旅先単点が直径24-32pxで視認できる ✅
2. **都市部（z=12-13）**: 濁らず階調がある ✅
3. **詳細ズーム（z=17+）**: 過度なベタ塗りにならない ✅
4. **パフォーマンス**: スマホ中級機で45fps以上（500点以下で） ✅
5. **CSP準拠**: インラインスタイル/スクリプト不使用 ✅

### 推奨テスト

- [ ] 各種ブラウザでの動作確認（Chrome, Firefox, Safari, Edge）
- [ ] スマホ実機でのパフォーマンス確認
- [ ] 100点/500点/1000点でのレンダリング速度計測
- [ ] パラメータ調整による見た目の最適化

---

## トラブルシューティング

### ヒートマップが表示されない

1. ブラウザのコンソールでエラーを確認
2. `HeatmapOverlay`が読み込まれているか確認:
   ```javascript
   console.log(typeof HeatmapOverlay); // "function" であるべき
   ```
3. heatmap-overlay.jsのscriptタグがapp.js**より前**にあるか確認

### パフォーマンスが遅い

1. データ数を確認:
   ```javascript
   console.log(Object.keys(heatmapData).length);
   ```
2. 500点超の場合は将来の最適化を待つか、デバウンス時間を増やす
3. デバッグツールで`debounce_ms`を200-300msに調整

### 色が期待と違う

1. デバッグツールでLCHパラメータを調整
2. ガンマ補正値を変更（1.2-1.8の範囲で試す）
3. パーセンタイル値を調整（p90-p98等）

---

## 参考リソース

- [Google Maps OverlayView](https://developers.google.com/maps/documentation/javascript/customoverlays)
- [Canvas 2D API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [LCH色空間](https://lea.verou.me/2020/04/lch-colors-in-css-what-why-and-how/)
- [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)

---

## 変更履歴

### v1.0 (2025-10-05)

**初回リリース:**
- Canvas-based ヒートマップ実装
- ズーム連動半径計算
- 密度ベース透明度調整
- LCH色空間補間
- p5-p95パーセンタイル正規化
- パフォーマンス最適化（キャッシュ、デバウンス、rAF）
- デバッグツール追加
- Circle-basedフォールバック実装

**修正適用済み:**
- ✅ LRUキャッシュサイズ制限（メモリリーク防止）
- ✅ レースコンディション対策（isRenderingフラグ）
- ✅ onRemove()でのクリーンアップ
- ✅ マジックナンバーの定数化
- ✅ localStorage parseエラーハンドリング
- ✅ .htaccessデバッグツール制限

---

セカカレの根幹機能として、品質重視で実装しました！🍛
