# Canvas-based Heatmap Implementation

## 概要

セカカレのヒートマップをCircleベースからCanvas 2D APIベースの実装に改善しました。

## 実装内容

### 新規ファイル

1. **assets/js/heatmap-overlay.js**
   - `HeatmapOverlay` クラス（Google Maps OverlayViewを継承）
   - ズーム連動半径計算
   - ガウシアンカーネル描画
   - 密度ベースの透明度調整
   - LCH色空間補間
   - パーセンタイル正規化とガンマ補正
   - requestAnimationFrameによるパフォーマンス最適化

2. **heatmap-debug.html**
   - パラメータ調整用デバッグツール
   - localStorageに設定を保存
   - リアルタイムでパラメータを微調整可能

### 変更ファイル

1. **assets/js/app.js**
   - `displayHeatmap()` 関数を更新してCanvas-based実装を使用
   - 既存のCircleベース実装を `displayHeatmapLegacy()` として保持（フォールバック用）

2. **index.html**
   - `heatmap-overlay.js` スクリプトを追加

## 主要機能

### 1. ズーム連動半径計算

```javascript
r_px = clamp(r_min_px, r_max_px, r_base * k^(z_ref - zoom))
```

**デフォルトパラメータ:**
- `z_ref = 14` (基準ズームレベル)
- `r_base = 14` (基準半径 px)
- `k = 1.28` (広域側の伸び係数)
- `r_min_px = 16` (最小半径)
- `r_max_px = 48` (最大半径)

### 2. 密度ベース透明度調整

- 近傍カウント: 半径内の他の点を数える
- 孤立ブースト: `tau = 3` 未満の場合、`alpha *= 1.25`
- 旅先単点の視認性向上

### 3. LCH色空間補間

**黄→琥珀グラデーション:**
- 最薄: `L=95, C=45, H=95` (淡い黄色)
- 最濃: `L=72, C=65, H=80` (琥珀色)
- ガンマ補正: `γ = 1.45`

### 4. 正規化とブレンド

- p5-p95パーセンタイルクリップ正規化
- 通常合成（加算合成でなく）で都市部の白飛び防止

## 期待される表示

| ズーム | 用途 | 半径（目安） | 期待する見え方 |
|--------|------|--------------|----------------|
| z=5-8 | 日本広域 | 32-36px | 旅先単点がしっかり視認 |
| z=10-11 | 都市圏 | 22-26px | 密集でも濁り過ぎない |
| z=14 | 街区 | 14-16px | 店単位の粒度がわかる |
| z=17+ | 路面 | 12-16px | 過拡大を防ぐ |

## パフォーマンス

- **requestAnimationFrame**: スムーズな描画
- **デバウンス**: 150msでズーム/ドラッグ中の間引き
- **OffscreenCanvas**: サポートブラウザで性能向上
- **目標**: 1,000点で60fps（デスクトップ）、45fps（スマホ中級機）

## CSP準拠

- インラインスタイル不使用
- Canvas APIは既存のCircleより安全
- すべてのスクリプトは外部ファイル

## ブラウザ互換性

- **Canvas 2D API**: 全モダンブラウザ対応
- **OffscreenCanvas**: フォールバック実装を用意（非対応時は通常Canvasを使用）

## デバッグ方法

1. **デバッグツールへアクセス**
   ```
   http://localhost/heatmap-debug.html
   ```

2. **パラメータを調整**
   - UIでパラメータを変更
   - 「保存して適用」ボタンをクリック

3. **メインページで確認**
   - メインページ（index.html）をリロード
   - ヒートマップの変化を確認

4. **コンソールログ**
   ```javascript
   // ブラウザのコンソールで確認
   [HeatmapOverlay] Loaded debug parameters: {...}
   Canvas-based ヒートマップを作成: N 箇所
   ```

## トラブルシューティング

### ヒートマップが表示されない

1. ブラウザのコンソールをチェック
2. `HeatmapOverlay class not loaded` と表示された場合:
   - `heatmap-overlay.js` が正しく読み込まれているか確認
   - ネットワークタブで404エラーがないか確認

3. フォールバック動作:
   - HeatmapOverlayが読み込まれない場合、自動的にCircleベースに切り替わる

### パラメータが反映されない

1. localStorageを確認:
   ```javascript
   localStorage.getItem('sekakare_heatmap_params')
   ```

2. ページをハードリロード（Ctrl+Shift+R / Cmd+Shift+R）

3. デバッグツールで再保存

## 今後の改善案

- [ ] WebGLバージョンの実装（より高速な描画）
- [ ] 複数の色マッププリセット
- [ ] アニメーション付き密度変化
- [ ] ヒートマップの表示/非表示トグル

## 参考資料

- [Google Maps OverlayView](https://developers.google.com/maps/documentation/javascript/customoverlays)
- [Canvas 2D API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [LCH色空間](https://lea.verou.me/2020/04/lch-colors-in-css-what-why-and-how/)
- [ガウシアンブラー](https://en.wikipedia.org/wiki/Gaussian_blur)
