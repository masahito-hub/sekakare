# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/ja/1.0.0/).

## [Unreleased]
### Planned
- 再訪問記録機能の改善（訪問済み店舗へのアクセス方法）
- 日付・メニュー・写真・メモの記録機能
- IndexedDBへのデータ移行
- 訪問履歴一覧ページ

## [0.3.0] - 2025-09-30
### Added
- ヘッダーティッカー機能（ニュース配信・広告枠基盤）
  - CSV形式でのニュース管理（`/assets/data/ticker-data.csv`）
  - 5秒間隔での自動ローテーション
  - priority順・日付順のソート機能
  - クリックでURL遷移
- 新発見特化モード
  - 訪問済み店舗を自動検索結果から除外
  - 未訪問店舗のみを評価順で表示
  - 都心部以外のエリアで効果的

### Fixed
- CSP（Content Security Policy）設定による外部ライブラリ読み込み問題
  - PapaParseをローカル配置に変更
  - Google Sheets CORS問題の解決
- 訪問済み店舗の「食べた」ボタンが押せなかった問題
  - 再訪問記録が可能に

### Technical
- PapaParseライブラリをCDNからローカル配置に変更
- セキュリティ強化（XSS対策、URL検証、HTMLエスケープ）
- パフォーマンス最適化（DOM要素のキャッシュ、メモリリーク防止）

## [0.2.0] - 2025-09
### Added
- 訪問済み店舗の視覚的区別
  - ✅アイコンでの表示
  - グラデーション塗りつぶし
  - スケールアニメーション
- 動的検索半径（ズームレベル連動）
- 訪問回数の表示機能

### Changed
- Places API (New) への移行
- ID生成を`Date.now()`から`crypto.randomUUID()`に変更

## [0.1.0] - 2025-09
### Added
- 基本的な地図表示機能
- Google Maps JavaScript API統合
- カレー店検索機能（Places API）
- 現在地取得機能
- 1本指での地図操作
- localStorage による訪問記録
- 訪問済み店舗の記録・表示

### Technical
- ファイル分離構成（index.html + assets/css,js）
- GitHub Actions自動デプロイ（Xserver向け）
- SSL対応（.htaccess設定）
- APIキー管理システム（GitHub Secrets + config.template.js）

## Known Issues
### 再訪問記録へのアクセス
- 新発見特化モードで訪問済み店舗が地図上に表示されないため、店舗詳細を開けず再訪問記録ができない
- 解決策を検討中（モード切り替え機能、訪問履歴画面の追加等）

### Places API制約
- 20件/リクエスト上限のため、都心部では全店舗を取得できない
- ページネーション非対応
- 店舗情報変更（店名変更・閉店）への完全同期は困難