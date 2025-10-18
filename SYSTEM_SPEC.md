# セカカレ システム仕様書

## システム概要

カレー屋訪問履歴を記録・管理するWebアプリケーション

**技術スタック**
- フロントエンド: HTML, CSS, Vanilla JavaScript
- データ保存: localStorage (クライアントサイド)
- 地図API: Google Maps JavaScript API
- ホスティング: GitHub Pages

**確立済み機能**
- ✅ Google Maps連携（店舗検索・地図表示）
- ✅ 訪問ログの保存・表示
- ✅ ログの編集・削除
- ✅ メニュー・メモ機能
- ✅ ログの並び替え（日付/地域/再訪回数）

---

## ファイル構成と役割

### ページ構成
```
index.html              - トップページ（地図表示・店舗検索）
logs.html               - 訪問履歴ページ（ログ一覧・編集）
info.html               - このアプリについて
```

### JavaScript
```
assets/js/
├── index.js            - トップページ（Google Maps連携）
├── logs.js             - ログ一覧・編集・ソート機能
└── menu.js             - ハンバーガーメニュー
```

### CSS
```
assets/css/
├── common.css          - 共通スタイル
├── index.css           - トップページ専用
├── logs.css            - ログページ専用
└── info.css            - infoページ専用
```

---

## データ構造

### localStorage キー

**`visits`** - 訪問履歴配列
```javascript
[
  {
    id: "unique-id",              // ユニークID
    name: "店舗名",
    address: "住所",
    lat: 35.691964,               // 緯度
    lng: 139.674259,              // 経度
    placeId: "ChIJ...",           // Google Place ID
    visitedAt: "2025-10-17",      // 訪問日（YYYY-MM-DD）
    menu: "カレー名",             // 注文メニュー（任意）
    memo: "メモ内容",             // メモ（任意）
    createdAt: "ISO8601",         // 作成日時
    editedAt: "ISO8601"           // 編集日時（任意）
  }
]
```

**`sortType`** - ソート設定
```javascript
"date-desc"   // 日付順（新→旧）デフォルト
"date-asc"    // 日付順（旧→新）
"region"      // 地域別（都道府県）
"visit-count" // 再訪回数順
```

---

## 主要機能仕様

### 1. 店舗検索・保存（index.html/index.js）

**Google Maps Autocomplete**
- 店舗名での検索
- 予測候補の表示
- Place Details APIで詳細情報取得

**保存処理**
```javascript
function saveVisit(place) {
  const visit = {
    id: generateUniqueId(),
    name: place.name,
    address: place.formatted_address,
    lat: place.geometry.location.lat(),
    lng: place.geometry.location.lng(),
    placeId: place.place_id,
    visitedAt: getCurrentDate(),
    createdAt: new Date().toISOString()
  };
  // localStorageに保存
}
```

### 2. ログ表示・編集（logs.html/logs.js）

**表示モード**
- デフォルト: 月別グループ表示
- 地域別ソート時: 都道府県別グループ表示（Issue #112で修正中）

**編集機能**
- 訪問日の変更（任意・空欄可）
- メニューの追加
- メモの追加
- XSS対策: `escapeHtml()` で全てエスケープ

**削除機能**
- 確認ダイアログ表示
- localStorage から削除

### 3. ソート機能（logs.js）

**実装アルゴリズム**
```javascript
// visit-count: O(n log n) - Map使用で最適化
// region: 都道府県の50音順
// date: ISO8601形式の文字列比較
```

**ソートの種類**
- 日付順（新→旧）: デフォルト、最新の訪問が上
- 日付順（旧→新）: 古い訪問から表示
- 地域別: 都道府県の50音順でグループ化
- 再訪回数順: 同じ店舗の訪問回数でソート

---

## セキュリティ対策

### XSS防止
```javascript
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
```

**適用箇所**
- ユーザー入力（店舗名、メニュー、メモ）
- Google Maps API レスポンス

### localStorage エラーハンドリング
```javascript
try {
    const data = localStorage.getItem('visits');
} catch (e) {
    console.warn('localStorage unavailable:', e);
    // プライベートブラウジングモード対応
}
```

---

## 開発・デプロイ

### ローカル開発
```bash
# Live Serverなどで起動
# index.htmlをブラウザで開く
```

### GitHub Pages デプロイ
```bash
git push origin main
# 自動的に https://masahito-hub.github.io/sekakare/ にデプロイ
```

### 環境変数
- `GOOGLE_MAPS_API_KEY`: Google Maps API キー（index.htmlに記載）

---

## 既知の問題と対処

### 地域別ソート時の表示バグ
**Issue**: #112  
**状態**: 修正中  
**内容**: 地域別ソート時も月別グループ表示になる  
**対処**: displayLogs()関数を分岐し、地域別は都道府県グループ表示に変更

---

## Phase進行状況

### Phase 1-A: 基本機能（完了）
- ✅ Google Maps連携
- ✅ 店舗検索・保存
- ✅ ログ一覧表示
- ✅ 基本的な編集・削除

### Phase 1-B: 編集機能拡充（進行中）
- ✅ Phase 1-B-1: 編集モーダルUI
- ✅ Phase 1-B-2: データ編集機能（menu/memo）
- ✅ Phase 1-B-4: 並び替え機能
- 📝 Phase 1-B-3: 写真アップロード（未実装）

### Phase 2（予定）
- データエクスポート/インポート
- 統計・グラフ表示
- PWA対応

---

## トラブルシューティング

### localStorage が表示されない
**原因**: プライベートブラウジングモード  
**対処**: 通常ブラウジングモードで使用

### Google Maps が表示されない
**原因**: API キーの制限  
**対処**: Google Cloud Console でドメイン制限を確認

### ソートが正しく動作しない
**原因**: データ構造の不整合  
**対処**: ブラウザのDevToolsでlocalStorageを確認

---

**最終更新**: 2025-10-18  
**プロジェクト状態**: Phase 1-B進行中  
**次のマイルストーン**: Phase 1-B-3（写真アップロード）
