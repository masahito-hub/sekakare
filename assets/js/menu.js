/**
 * ハンバーガーメニュー機能
 * - メニューの開閉
 * - キーボード操作対応
 * - フォーカストラップ
 * - アクセシビリティ対応
 */

(function() {
    'use strict';

    console.log('menu.js loaded');

    // DOM要素の取得
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const menuOverlay = document.getElementById('menuOverlay');
    const slideMenu = document.getElementById('slideMenu');
    const menuClose = document.getElementById('menuClose');
    const aboutLink = document.getElementById('aboutLink');

    console.log('DOM elements:', {
        hamburgerBtn: hamburgerBtn,
        menuOverlay: menuOverlay,
        slideMenu: slideMenu,
        menuClose: menuClose,
        aboutLink: aboutLink
    });

    // フォーカス可能要素のキャッシュ
    let focusableElementsCache = null;
    let focusableElements = [];
    let firstFocusableElement = null;
    let lastFocusableElement = null;

    /**
     * メニューを開く
     */
    function openMenu() {
        console.log('openMenu() called');
        slideMenu.classList.add('active');
        menuOverlay.classList.add('active');
        hamburgerBtn.classList.add('active');
        document.body.classList.add('menu-open');

        // ARIA属性の更新
        hamburgerBtn.setAttribute('aria-expanded', 'true');
        slideMenu.setAttribute('aria-hidden', 'false');
        menuOverlay.setAttribute('aria-hidden', 'false');

        // フォーカス可能要素を更新
        updateFocusableElements();

        // 最初の要素にフォーカス
        if (firstFocusableElement) {
            firstFocusableElement.focus();
        }
    }

    /**
     * メニューを閉じる
     */
    function closeMenu() {
        console.log('closeMenu() called');
        slideMenu.classList.remove('active');
        menuOverlay.classList.remove('active');
        hamburgerBtn.classList.remove('active');
        document.body.classList.remove('menu-open');

        // ARIA属性の更新
        hamburgerBtn.setAttribute('aria-expanded', 'false');
        slideMenu.setAttribute('aria-hidden', 'true');
        menuOverlay.setAttribute('aria-hidden', 'true');

        // ハンバーガーボタンにフォーカスを戻す
        hamburgerBtn.focus();
    }

    /**
     * フォーカス可能要素を更新（キャッシュ最適化付き）
     */
    function updateFocusableElements() {
        // キャッシュがあり、要素がまだDOM内に存在する場合はそれを使用
        if (focusableElementsCache && focusableElementsCache.length > 0 && slideMenu.contains(focusableElementsCache[0])) {
            focusableElements = focusableElementsCache;
        } else {
            // 初回またはDOM変更時のみ再取得
            focusableElements = Array.from(
                slideMenu.querySelectorAll(
                    'a[href], button, textarea, input[type="text"], input[type="radio"], input[type="checkbox"], select'
                )
            ).filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));
            focusableElementsCache = focusableElements;
        }

        firstFocusableElement = focusableElements[0];
        lastFocusableElement = focusableElements[focusableElements.length - 1];
    }

    /**
     * 「セカカレについて」を表示（改善されたエラーハンドリング付き）
     */
    function showAbout(e) {
        e.preventDefault();

        const popupOverlay = document.getElementById('popupOverlay');
        const popupTitle = document.getElementById('popupTitle');
        const popupAddress = document.getElementById('popupAddress');

        // privacy.htmlなど、ポップアップ要素がないページでのフォールバック処理
        if (!popupOverlay || !popupTitle || !popupAddress) {
            console.warn('Popup elements not found, using fallback');

            // フォールバック：確認ダイアログで表示
            const message = 'セカカレについて\n\n' +
                           '世界をカレーで塗り尽くそう！\n' +
                           'カレー店訪問記録アプリです。\n\n' +
                           '訪れたカレー店を記録して、\n' +
                           'あなただけのカレーマップを作成しましょう。';

            if (window.location.pathname !== '/') {
                // トップページ以外の場合、移動オプションを提示
                if (window.confirm(message + '\n\n詳細はトップページをご覧ください。\nトップページに移動しますか？')) {
                    window.location.href = '/';
                }
            } else {
                // トップページの場合はメッセージのみ
                window.alert(message);
            }

            closeMenu();
            return;
        }

        // 既存の処理（index.htmlでの動作）
        const btnDetails = document.getElementById('btnDetails');
        const btnAte = document.getElementById('btnAte');

        popupTitle.textContent = '🍛 セカカレについて';
        popupAddress.innerHTML = '世界をカレーで塗り尽くそう！<br>' +
                                'カレー店訪問記録アプリです。<br><br>' +
                                '訪れたカレー店を記録して、<br>' +
                                'あなただけのカレーマップを作成しましょう。';

        if (btnDetails) btnDetails.style.display = 'none';
        if (btnAte) btnAte.style.display = 'none';

        popupOverlay.style.display = 'flex';
        closeMenu();
    }

    /**
     * フォーカストラップ（メニュー内でフォーカスを循環）
     */
    function trapFocus(e) {
        if (e.key !== 'Tab') return;

        if (e.shiftKey) {
            // Shift + Tab（戻る方向）
            if (document.activeElement === firstFocusableElement) {
                e.preventDefault();
                lastFocusableElement.focus();
            }
        } else {
            // Tab（進む方向）
            if (document.activeElement === lastFocusableElement) {
                e.preventDefault();
                firstFocusableElement.focus();
            }
        }
    }

    /**
     * キーボードイベント処理
     */
    function handleKeyDown(e) {
        if (e.key === 'Escape' && slideMenu.classList.contains('active')) {
            closeMenu();
        }
    }

    /**
     * ポップアップを閉じる際の処理（ボタンを再表示）
     */
    function setupPopupCloseHandlers() {
        const popupOverlay = document.getElementById('popupOverlay');
        const btnClose = document.getElementById('btnClose');

        if (popupOverlay) {
            // オーバーレイクリックで閉じる
            popupOverlay.addEventListener('click', function(e) {
                if (e.target === popupOverlay) {
                    closePopup();
                }
            });
        }

        if (btnClose) {
            // 閉じるボタン
            btnClose.addEventListener('click', closePopup);
        }
    }

    /**
     * ポップアップを閉じる
     */
    function closePopup() {
        const popupOverlay = document.getElementById('popupOverlay');
        const btnDetails = document.getElementById('btnDetails');
        const btnAte = document.getElementById('btnAte');

        if (popupOverlay) {
            popupOverlay.style.display = 'none';
        }

        // ボタンを再表示（次回の店舗情報表示用）
        if (btnDetails) btnDetails.style.display = '';
        if (btnAte) btnAte.style.display = '';
    }

    /**
     * イベントリスナーの設定
     */
    function init() {
        console.log('menu.js init() called');

        // 必須要素のチェック
        if (!hamburgerBtn || !slideMenu || !menuOverlay || !menuClose) {
            console.error('Required menu elements not found!', {
                hamburgerBtn: !!hamburgerBtn,
                slideMenu: !!slideMenu,
                menuOverlay: !!menuOverlay,
                menuClose: !!menuClose
            });
            return;
        }

        // ハンバーガーボタンクリック
        if (hamburgerBtn) {
            hamburgerBtn.addEventListener('click', function() {
                console.log('Hamburger button clicked!');
                if (slideMenu.classList.contains('active')) {
                    console.log('Closing menu...');
                    closeMenu();
                } else {
                    console.log('Opening menu...');
                    openMenu();
                }
            });
        }

        // メニュー閉じるボタン
        if (menuClose) {
            menuClose.addEventListener('click', closeMenu);
        }

        // オーバーレイクリック
        if (menuOverlay) {
            menuOverlay.addEventListener('click', closeMenu);
        }

        // 「セカカレについて」リンク
        if (aboutLink) {
            aboutLink.addEventListener('click', showAbout);
        }

        // キーボード操作
        document.addEventListener('keydown', handleKeyDown);

        // フォーカストラップ
        if (slideMenu) {
            slideMenu.addEventListener('keydown', trapFocus);
        }

        // ポップアップ閉じる処理の設定
        setupPopupCloseHandlers();
    }

    // DOMContentLoaded後に初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // グローバルスコープに公開（必要に応じて）
    window.closeMenu = closeMenu;
    window.openMenu = openMenu;
})();
