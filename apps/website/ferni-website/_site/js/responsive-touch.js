/**
 * Responsive & Touch - Ferni Landing Page
 * ========================================
 * Touch gestures, orientation handling, and responsive behaviors
 */

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // TOUCH GESTURE DETECTION
  // Swipe, pinch, and tap gestures
  // ═══════════════════════════════════════════════════════════════════════════

  function initTouchGestures() {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;

    const minSwipeDistance = 50;

    // Swipe detection
    document.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      touchEndY = e.changedTouches[0].screenY;
      handleSwipe(e.target);
    }, { passive: true });

    function handleSwipe(target) {
      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;

      // Check if it's a horizontal swipe
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
        const direction = deltaX > 0 ? 'right' : 'left';
        
        // Dispatch custom event
        target.dispatchEvent(new CustomEvent('ferni:swipe', {
          bubbles: true,
          detail: { direction, deltaX, deltaY }
        }));

        // Handle carousel swipes
        const carousel = target.closest('[data-swipe-carousel]');
        if (carousel) {
          if (direction === 'left') {
            carousel.scrollBy({ left: carousel.offsetWidth, behavior: 'smooth' });
          } else {
            carousel.scrollBy({ left: -carousel.offsetWidth, behavior: 'smooth' });
          }
        }

        // Handle mobile menu swipe close
        const menu = document.querySelector('.mobile-menu.open');
        if (menu && direction === 'right') {
          menu.classList.remove('open');
          document.querySelector('.mobile-menu-backdrop')?.classList.remove('open');
        }
      }
    }

    // Double tap detection
    let lastTap = 0;
    document.addEventListener('touchend', (e) => {
      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTap;
      
      if (tapLength < 300 && tapLength > 0) {
        e.target.dispatchEvent(new CustomEvent('ferni:doubletap', {
          bubbles: true
        }));
      }
      lastTap = currentTime;
    }, { passive: true });

    // Long press detection
    let longPressTimer;
    document.addEventListener('touchstart', (e) => {
      longPressTimer = setTimeout(() => {
        e.target.dispatchEvent(new CustomEvent('ferni:longpress', {
          bubbles: true
        }));
      }, 500);
    }, { passive: true });

    document.addEventListener('touchend', () => {
      clearTimeout(longPressTimer);
    }, { passive: true });

    document.addEventListener('touchmove', () => {
      clearTimeout(longPressTimer);
    }, { passive: true });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PULL TO REFRESH (Custom implementation)
  // ═══════════════════════════════════════════════════════════════════════════

  function initPullToRefresh() {
    const pullElement = document.querySelector('[data-pull-refresh]');
    if (!pullElement) return;

    let startY = 0;
    let currentY = 0;
    const threshold = 100;

    const indicator = document.createElement('div');
    indicator.className = 'pull-refresh-indicator';
    indicator.innerHTML = `
      <div class="pull-spinner"></div>
      <span>Pull to refresh</span>
    `;
    pullElement.insertBefore(indicator, pullElement.firstChild);

    pullElement.addEventListener('touchstart', (e) => {
      if (window.scrollY === 0) {
        startY = e.touches[0].pageY;
      }
    }, { passive: true });

    pullElement.addEventListener('touchmove', (e) => {
      if (startY === 0) return;
      
      currentY = e.touches[0].pageY;
      const pullDistance = currentY - startY;

      if (pullDistance > 0 && window.scrollY === 0) {
        indicator.style.transform = `translateY(${Math.min(pullDistance * 0.5, threshold)}px)`;
        indicator.style.opacity = Math.min(pullDistance / threshold, 1);
        
        if (pullDistance > threshold) {
          indicator.querySelector('span').textContent = 'Release to refresh';
        }
      }
    }, { passive: true });

    pullElement.addEventListener('touchend', () => {
      const pullDistance = currentY - startY;
      
      if (pullDistance > threshold) {
        indicator.querySelector('span').textContent = 'Refreshing...';
        indicator.classList.add('refreshing');
        
        // Trigger refresh
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        indicator.style.transform = '';
        indicator.style.opacity = '0';
      }
      
      startY = 0;
      currentY = 0;
    }, { passive: true });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ORIENTATION CHANGE HANDLING
  // ═══════════════════════════════════════════════════════════════════════════

  function initOrientationHandling() {
    let currentOrientation = getOrientation();

    function getOrientation() {
      return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
    }

    function handleOrientationChange() {
      const newOrientation = getOrientation();
      
      if (newOrientation !== currentOrientation) {
        currentOrientation = newOrientation;
        
        // Update body class
        document.body.classList.remove('portrait', 'landscape');
        document.body.classList.add(newOrientation);
        
        // Dispatch custom event
        document.dispatchEvent(new CustomEvent('ferni:orientation', {
          detail: { orientation: newOrientation }
        }));
        
        // Recalculate any fixed elements
        document.querySelectorAll('[data-recalc-on-orientation]').forEach(el => {
          el.style.height = `${window.innerHeight}px`;
        });
      }
    }

    // Listen for resize (more reliable than orientationchange)
    window.addEventListener('resize', debounce(handleOrientationChange, 100));
    
    // Initial setup
    handleOrientationChange();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SAFE AREA INSETS
  // Handle notched devices (iPhone X+, etc)
  // ═══════════════════════════════════════════════════════════════════════════

  function initSafeAreaInsets() {
    // Apply safe area insets via CSS custom properties
    document.documentElement.style.setProperty(
      '--safe-area-inset-top',
      'env(safe-area-inset-top, 0px)'
    );
    document.documentElement.style.setProperty(
      '--safe-area-inset-bottom',
      'env(safe-area-inset-bottom, 0px)'
    );
    document.documentElement.style.setProperty(
      '--safe-area-inset-left',
      'env(safe-area-inset-left, 0px)'
    );
    document.documentElement.style.setProperty(
      '--safe-area-inset-right',
      'env(safe-area-inset-right, 0px)'
    );

    // Add helper classes
    const style = document.createElement('style');
    style.textContent = `
      .safe-top { padding-top: var(--safe-area-inset-top); }
      .safe-bottom { padding-bottom: var(--safe-area-inset-bottom); }
      .safe-left { padding-left: var(--safe-area-inset-left); }
      .safe-right { padding-right: var(--safe-area-inset-right); }
      .safe-x { padding-left: var(--safe-area-inset-left); padding-right: var(--safe-area-inset-right); }
      .safe-y { padding-top: var(--safe-area-inset-top); padding-bottom: var(--safe-area-inset-bottom); }
      .safe-all { 
        padding: var(--safe-area-inset-top) var(--safe-area-inset-right) var(--safe-area-inset-bottom) var(--safe-area-inset-left);
      }
    `;
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEWPORT HEIGHT FIX
  // Fix for mobile browser address bar affecting 100vh
  // ═══════════════════════════════════════════════════════════════════════════

  function initViewportHeightFix() {
    function setVH() {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    }

    setVH();
    window.addEventListener('resize', debounce(setVH, 100));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TABLET-SPECIFIC OPTIMIZATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  function initTabletOptimizations() {
    const isTablet = window.innerWidth >= 768 && window.innerWidth <= 1024;
    
    if (isTablet) {
      document.body.classList.add('is-tablet');
      
      // Increase tap targets
      document.querySelectorAll('button, a, [role="button"]').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.height < 44 || rect.width < 44) {
          el.style.minHeight = '44px';
          el.style.minWidth = '44px';
        }
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOUCH-FRIENDLY HOVER STATES
  // Disable hover effects on touch devices
  // ═══════════════════════════════════════════════════════════════════════════

  function initTouchFriendlyHover() {
    // Detect touch device
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    if (isTouchDevice) {
      document.body.classList.add('touch-device');
      
      // Add CSS to disable hover on touch
      const style = document.createElement('style');
      style.textContent = `
        .touch-device *:hover {
          /* Reset hover styles on touch devices */
        }
        
        @media (hover: none) {
          .hover-only {
            display: none !important;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BREAKPOINT OBSERVER
  // Notify when breakpoints change
  // ═══════════════════════════════════════════════════════════════════════════

  function initBreakpointObserver() {
    const breakpoints = {
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
      '2xl': 1536
    };

    let currentBreakpoint = getCurrentBreakpoint();

    function getCurrentBreakpoint() {
      const width = window.innerWidth;
      if (width >= breakpoints['2xl']) return '2xl';
      if (width >= breakpoints.xl) return 'xl';
      if (width >= breakpoints.lg) return 'lg';
      if (width >= breakpoints.md) return 'md';
      if (width >= breakpoints.sm) return 'sm';
      return 'xs';
    }

    function handleResize() {
      const newBreakpoint = getCurrentBreakpoint();
      
      if (newBreakpoint !== currentBreakpoint) {
        const oldBreakpoint = currentBreakpoint;
        currentBreakpoint = newBreakpoint;
        
        document.dispatchEvent(new CustomEvent('ferni:breakpoint', {
          detail: { 
            from: oldBreakpoint, 
            to: newBreakpoint,
            width: window.innerWidth
          }
        }));
        
        // Update body class
        document.body.className = document.body.className
          .replace(/\bbp-\w+\b/g, '')
          .trim() + ` bp-${newBreakpoint}`;
      }
    }

    window.addEventListener('resize', debounce(handleResize, 100));
    handleResize();

    // Expose for JS use
    window.ferniBreakpoint = () => currentBreakpoint;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  function debounce(fn, delay) {
    let timeoutId;
    return function(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INJECT STYLES
  // ═══════════════════════════════════════════════════════════════════════════

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* Full height using CSS variable */
      .h-screen-dynamic {
        height: calc(var(--vh, 1vh) * 100);
      }
      
      .min-h-screen-dynamic {
        min-height: calc(var(--vh, 1vh) * 100);
      }
      
      /* Pull to refresh indicator */
      .pull-refresh-indicator {
        position: absolute;
        top: 0;
        left: 50%;
        transform: translateX(-50%) translateY(-100%);
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 1rem;
        opacity: 0;
        transition: transform 0.2s ease, opacity 0.2s ease;
      }
      
      .pull-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid rgba(74, 103, 65, 0.2);
        border-top-color: #4a6741;
        border-radius: 50%;
      }
      
      .pull-refresh-indicator.refreshing .pull-spinner {
        animation: spin 0.8s linear infinite;
      }
      
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      
      /* Orientation-specific styles */
      .landscape .hide-landscape { display: none !important; }
      .portrait .hide-portrait { display: none !important; }
      
      /* Tablet optimizations */
      .is-tablet .tablet-grid-3 {
        grid-template-columns: repeat(3, 1fr);
      }
    `;
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZE
  // ═══════════════════════════════════════════════════════════════════════════

  function init() {
    injectStyles();
    initTouchGestures();
    initPullToRefresh();
    initOrientationHandling();
    initSafeAreaInsets();
    initViewportHeightFix();
    initTabletOptimizations();
    initTouchFriendlyHover();
    initBreakpointObserver();
    
    console.log('%c📱 Responsive & touch loaded', 'color: #4a6741; font-weight: bold;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

