/**
 * Hamburger Menu Controller
 * CSP準拠のハンバーガーメニュー実装
 */

(function() {
    'use strict';

    // DOM要素の取得
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const menuOverlay = document.getElementById('menuOverlay');
    const slideMenu = document.getElementById('slideMenu');
    const menuClose = document.getElementById('menuClose');
    const aboutLink = document.getElementById('aboutLink');
    const body = document.body;

    // メニュー内のフォーカス可能な要素
    let focusableElements = [];
    let firstFocusableElement = null;
    let lastFocusableElement = null;

    /**
     * メニューを開く
     */
    function openMenu() {
        slideMenu.classList.add('active');
        menuOverlay.classList.add('active');
        hamburgerBtn.classList.add('active');
        body.classList.add('menu-open');
        hamburgerBtn.setAttribute('aria-expanded', 'true');

        // フォーカス可能な要素を取得
        updateFocusableElements();

        // メニューの最初の要素にフォーカス
        if (firstFocusableElement) {
            firstFocusableElement.focus();
        }
    }

    /**
     * メニューを閉じる
     */
    function closeMenu() {
        slideMenu.classList.remove('active');
        menuOverlay.classList.remove('active');
        hamburgerBtn.classList.remove('active');
        body.classList.remove('menu-open');
        hamburgerBtn.setAttribute('aria-expanded', 'false');

        // ハンバーガーボタンにフォーカスを戻す
        hamburgerBtn.focus();
    }

    /**
     * フォーカス可能な要素を更新
     */
    function updateFocusableElements() {
        focusableElements = Array.from(
            slideMenu.querySelectorAll(
                'a[href], button, textarea, input[type="text"], input[type="radio"], input[type="checkbox"], select'
            )
        ).filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));

        firstFocusableElement = focusableElements[0];
        lastFocusableElement = focusableElements[focusableElements.length - 1];
    }

    /**
     * 「セカカレについて」を既存のポップアップで表示
     */
    function showAbout(e) {
        e.preventDefault();

        // 既存のポップアップ要素を利用
        const popupOverlay = document.getElementById('popupOverlay');
        const popupTitle = document.getElementById('popupTitle');
        const popupAddress = document.getElementById('popupAddress');
        const btnDetails = document.getElementById('btnDetails');
        const btnAte = document.getElementById('btnAte');

        if (!popupOverlay || !popupTitle || !popupAddress) {
            // privacy.htmlなどでポップアップ要素が存在しない場合のフォールバック
            console.warn('Popup elements not found');
            return;
        }

        // 「セカカレについて」の内容を設定
        popupTitle.textContent = '🍛 セカカレについて';
        popupAddress.innerHTML = '世界をカレーで塗り尽くそう！<br>カレー店訪問記録アプリです。<br><br>訪れたカレー店を記録して、あなただけのカレーマップを作成しましょう。';

        // 「食べた」「詳細を見る」ボタンは非表示
        if (btnDetails) btnDetails.style.display = 'none';
        if (btnAte) btnAte.style.display = 'none';

        // ポップアップを表示
        popupOverlay.style.display = 'flex';

        // メニューを閉じる
        closeMenu();
    }

    /**
     * ポップアップを閉じる際の処理（ボタン復元）
     */
    function handlePopupClose() {
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
     * フォーカストラップ（メニュー内でフォーカスを循環）
     */
    function trapFocus(e) {
        if (e.key === 'Tab' || e.keyCode === 9) {
            if (e.shiftKey) {
                // Shift + Tab
                if (document.activeElement === firstFocusableElement) {
                    lastFocusableElement.focus();
                    e.preventDefault();
                }
            } else {
                // Tab
                if (document.activeElement === lastFocusableElement) {
                    firstFocusableElement.focus();
                    e.preventDefault();
                }
            }
        }
    }

    /**
     * キーボードイベントハンドラ
     */
    function handleKeydown(e) {
        // ESCキーでメニューを閉じる
        if (e.key === 'Escape' || e.keyCode === 27) {
            if (slideMenu.classList.contains('active')) {
                closeMenu();
            }
        }

        // メニューが開いているときのみフォーカストラップを有効化
        if (slideMenu.classList.contains('active')) {
            trapFocus(e);
        }
    }

    /**
     * イベントリスナーの設定
     */
    function initEventListeners() {
        // ハンバーガーボタンのクリック
        if (hamburgerBtn) {
            hamburgerBtn.addEventListener('click', function() {
                if (slideMenu.classList.contains('active')) {
                    closeMenu();
                } else {
                    openMenu();
                }
            });
        }

        // メニュー閉じるボタンのクリック
        if (menuClose) {
            menuClose.addEventListener('click', closeMenu);
        }

        // オーバーレイのクリック
        if (menuOverlay) {
            menuOverlay.addEventListener('click', closeMenu);
        }

        // 「セカカレについて」リンク
        if (aboutLink) {
            aboutLink.addEventListener('click', showAbout);
        }

        // ポップアップ閉じるボタン
        const btnClose = document.getElementById('btnClose');
        if (btnClose) {
            // 既存のイベントリスナーがある場合は保持し、新しいハンドラも追加
            btnClose.addEventListener('click', handlePopupClose);
        }

        // ポップアップオーバーレイのクリック
        const popupOverlay = document.getElementById('popupOverlay');
        if (popupOverlay) {
            popupOverlay.addEventListener('click', function(e) {
                if (e.target === popupOverlay) {
                    handlePopupClose();
                }
            });
        }

        // キーボードイベント
        document.addEventListener('keydown', handleKeydown);

        // メニューリンクのEnterキー対応
        const menuLinks = slideMenu.querySelectorAll('a');
        menuLinks.forEach(link => {
            link.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.keyCode === 13) {
                    this.click();
                }
            });
        });
    }

    /**
     * 初期化
     */
    function init() {
        // 要素が存在する場合のみイベントリスナーを設定
        if (hamburgerBtn && menuOverlay && slideMenu && menuClose) {
            initEventListeners();
        }
    }

    // DOMContentLoaded後に初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
