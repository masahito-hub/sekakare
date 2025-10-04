# セカカレ 🍛

世界をカレーで塗り尽くそう！カレー店訪問記録アプリ

**本番環境**: https://sekakare.life/

## プロジェクト概要

セカカレは、カレー店への訪問を記録し「思い出・気付き」を残すことを重視したログ機能特化型のWebアプリケーションです。新しい店舗の発見よりも、自分が訪れた店舗の記録と振り返りに価値を置いています。

### コアコンセプト
- **「思い出・気付き」重視**: 完璧なデータ同期より使いやすさ優先
- **段階的成長**: 初期100ユーザー → MAU 1,000でマネタイズ → ネイティブアプリ化検討
- **技術的妥協の受容**: MVP段階では過剰な機能追加を避け、実用性を優先

## 技術スタック

- **フロントエンド**: Vanilla HTML/CSS/JavaScript
- **地図API**: Google Maps JavaScript API + Places API (New)
- **データ保存**: localStorage（将来的にIndexedDB移行予定）
- **デプロイ**: GitHub Actions → Xserver自動デプロイ
- **開発ツール**: Claude Code + GitHub連携
- **アナリティクス**: Google Analytics 4

## 主要機能

### 完成済み機能
- ✅ 地図上でのカレー店検索・表示
- ✅ 訪問済み店舗の記録（✅アイコン表示）
- ✅ 現在地取得・1本指地図操作
- ✅ 動的検索半径（ズームレベル連動）
- ✅ 新発見特化モード（訪問済み店舗を自動検索から除外）
- ✅ ヘッダーティッカー（ニュース配信・広告枠）
- ✅ フッター（コピーライト表示）
- ✅ プライバシーポリシーページ
- ✅ ハンバーガーメニュー（アクセシビリティ対応）
- ✅ favicon/PWAアイコン設定

### 開発予定機能
- 📝 日付・メニュー・写真・メモの記録機能
- 📝 IndexedDBへのデータ移行
- 📝 地図以外での訪問履歴一覧ページ
- 📝 バックアップ・インポート機能
- 📝 利用規約ページ
- 📝 お問い合わせページ

## 開発フロー

確立された開発フローにより、効率的な機能追加が可能です：

1. **masahito-hub**: 企画・相談・PR判断
2. **Claude Code**: 実装・ブランチ作成・PR作成・自動レビュー
3. **Web Claude**: 設計相談・コードレビュー・改善提案
4. **GitHub Actions**: 自動デプロイ（APIキー自動注入）

### レビュー運用ルール
- 複雑な変更時: Web Claudeが指示に「事前レビュー推奨」を明記
- 簡単な修正: Claude Codeのレビューで判断
- 判断困難: 都度Web Claudeに相談

## 重要な技術的注意事項

### Content Security Policy (CSP)
- **外部CDNは基本的にブロックされる**
- 必要なライブラリは`/assets/js/`にローカル配置すること
- `.htaccess`のCSP設定を適切に管理
- 新しいAPIやライブラリ追加時はCSP設定の更新を確認
- **インラインスタイル・スクリプトは使用禁止**

### Google Places API制約
- **20件/リクエスト上限**、ページネーション非対応
- 都心部では店舗密集により改善効果が見えにくい
- 店名変更・閉店時の完全同期は困難（「思い出記録」として割り切り）

### APIキー管理
- 本番: `config.js`に自動注入
- 開発: `config.template.js`を手動コピー
- GitHub Secretsで管理、絶対にコミットしない

## セットアップ

### 開発環境
```bash
# リポジトリのクローン
git clone https://github.com/masahito-hub/sekakare.git
cd sekakare

# config.jsの作成
cp assets/js/config.template.js assets/js/config.js
# config.jsにAPIキーを設定

# ローカルサーバーで起動（例: Python）
python -m http.server 8000
```

### デプロイ
GitHub Actionsが自動的に本番環境へデプロイします。
- トリガー: `main`ブランチへのpush
- デプロイ先: Xserver
- SSL証明書: 自動更新設定済み

## プロジェクト構造

```
sekakare/
├── index.html              # メインHTML
├── privacy.html            # プライバシーポリシー
├── manifest.json           # PWA設定
├── assets/
│   ├── css/
│   │   └── style.css       # スタイルシート
│   ├── js/
│   │   ├── app.js          # メインロジック
│   │   ├── ticker.js       # ティッカー機能
│   │   ├── menu.js         # ハンバーガーメニュー
│   │   ├── config.js       # APIキー（.gitignore）
│   │   ├── config.template.js  # 設定テンプレート
│   │   └── papaparse.min.js    # CSV解析ライブラリ
│   ├── data/
│   │   └── ticker-data.csv # ニュース配信用データ
│   └── icons/              # favicon・アプリアイコン
│       ├── favicon.ico
│       ├── apple-touch-icon.png
│       └── android-chrome-*.png
├── .github/
│   └── workflows/
│       └── deploy.yml      # 自動デプロイ設定
├── .htaccess               # SSL・CSP設定
└── CHANGELOG.md            # 変更履歴

```

## 最近の更新（2024年10月）

### v0.4.0
- ハンバーガーメニューの実装
  - アクセシビリティ対応（ARIA属性、キーボード操作）
  - フォーカストラップ実装
  - レスポンシブ対応
- フッターとプライバシーポリシーページ追加
- PWA基本設定（manifest.json）
- favicon/アイコン設定の復旧と最適化

## トラブルシューティング

### よくある問題

**1. ティッカーが表示されない**
- CSP設定を確認（外部CDNがブロックされていないか）
- `papaparse.min.js`がローカルに配置されているか
- ブラウザコンソールでエラーを確認

**2. Places API エラー**
- APIキーが正しく設定されているか
- Google Cloud Consoleでの請求設定
- APIの利用制限を確認

**3. 訪問済み店舗が表示されない**
- 新発見特化モードが有効の場合、意図的に除外されます
- 再訪問記録については別途機能追加予定

**4. ハンバーガーメニューが動作しない**
- CSPエラーを確認（インラインスクリプトは禁止）
- menu.jsが正しく読み込まれているか確認
- コンソールでJavaScriptエラーを確認

## ライセンス

このプロジェクトは非公開です。

## 連絡先

- 公式X: [@sekakare](https://x.com/sekakare)
- サイト: https://sekakare.life/
