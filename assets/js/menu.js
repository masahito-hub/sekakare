// ハンバーガーメニュー機能

(function() {
    'use strict';

    let hamburgerBtn;
    let menuOverlay;
    let slideMenu;
    let menuClose;
    let aboutLink;
    let focusableElements;
    let firstFocusable;
    let lastFocusable;

    // メニューを開く
    function openMenu() {
        hamburgerBtn.classList.add('active');
        menuOverlay.classList.add('active');
        slideMenu.classList.add('active');
        document.body.classList.add('menu-open');

        // フォーカス可能な要素を取得
        focusableElements = slideMenu.querySelectorAll('a, button');
        firstFocusable = focusableElements[0];
        lastFocusable = focusableElements[focusableElements.length - 1];

        // 最初の要素（閉じるボタン）にフォーカス
        if (menuClose) {
            menuClose.focus();
        }
    }

    // メニューを閉じる
    function closeMenu() {
        hamburgerBtn.classList.remove('active');
        menuOverlay.classList.remove('active');
        slideMenu.classList.remove('active');
        document.body.classList.remove('menu-open');

        // ハンバーガーボタンにフォーカスを戻す
        hamburgerBtn.focus();
    }

    // メニューのトグル
    function toggleMenu() {
        if (slideMenu.classList.contains('active')) {
            closeMenu();
        } else {
            openMenu();
        }
    }

    // フォーカストラップ（メニュー内でフォーカスを循環）
    function trapFocus(e) {
        if (e.key !== 'Tab' || !slideMenu.classList.contains('active')) {
            return;
        }

        if (e.shiftKey) {
            // Shift + Tab
            if (document.activeElement === firstFocusable) {
                e.preventDefault();
                lastFocusable.focus();
            }
        } else {
            // Tab
            if (document.activeElement === lastFocusable) {
                e.preventDefault();
                firstFocusable.focus();
            }
        }
    }

    // ESCキーでメニューを閉じる
    function handleEscape(e) {
        if (e.key === 'Escape' && slideMenu.classList.contains('active')) {
            closeMenu();
        }
    }

    // 「セカカレについて」のモーダル表示
    function showAbout(e) {
        e.preventDefault();
        alert('セカカレ - 世界をカレーで塗り尽くそう！カレー店訪問記録アプリです。');
    }

    // 初期化
    function init() {
        // 要素を取得
        hamburgerBtn = document.getElementById('hamburgerBtn');
        menuOverlay = document.getElementById('menuOverlay');
        slideMenu = document.getElementById('slideMenu');
        menuClose = document.getElementById('menuClose');
        aboutLink = document.getElementById('aboutLink');

        // 要素が存在しない場合は処理を中断
        if (!hamburgerBtn || !menuOverlay || !slideMenu || !menuClose) {
            console.warn('ハンバーガーメニューの要素が見つかりません');
            return;
        }

        // イベントリスナーを設定
        hamburgerBtn.addEventListener('click', toggleMenu);
        menuClose.addEventListener('click', closeMenu);
        menuOverlay.addEventListener('click', closeMenu);

        // 「セカカレについて」リンク
        if (aboutLink) {
            aboutLink.addEventListener('click', showAbout);
        }

        // キーボードイベント
        document.addEventListener('keydown', handleEscape);
        document.addEventListener('keydown', trapFocus);

        // ARIA属性を設定
        hamburgerBtn.setAttribute('aria-label', 'メニューを開く');
        hamburgerBtn.setAttribute('aria-expanded', 'false');
        slideMenu.setAttribute('aria-label', 'ナビゲーションメニュー');

        // メニューの状態に応じてARIA属性を更新
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.attributeName === 'class') {
                    const isActive = slideMenu.classList.contains('active');
                    hamburgerBtn.setAttribute('aria-expanded', isActive ? 'true' : 'false');
                    hamburgerBtn.setAttribute('aria-label', isActive ? 'メニューを閉じる' : 'メニューを開く');
                }
            });
        });

        observer.observe(slideMenu, { attributes: true });
    }

    // DOMContentLoadedイベントで初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
