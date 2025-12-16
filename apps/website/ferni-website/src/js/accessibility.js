/**
 * Accessibility Features - Ferni Landing Page
 * ============================================
 * WCAG 2.1 AA compliant interactions
 */

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // SKIP LINK ENHANCEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  function initSkipLinks() {
    const skipLink = document.querySelector('[data-skip-link]');
    if (!skipLink) return;

    skipLink.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = skipLink.getAttribute('href').substring(1);
      const target = document.getElementById(targetId);
      
      if (target) {
        target.setAttribute('tabindex', '-1');
        target.focus();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FOCUS TRAP FOR MODALS
  // ═══════════════════════════════════════════════════════════════════════════

  function createFocusTrap(element) {
    const focusableElements = element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    function handleKeydown(e) {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
        }
      }
    }

    element.addEventListener('keydown', handleKeydown);
    
    return {
      activate: () => firstFocusable?.focus(),
      deactivate: () => element.removeEventListener('keydown', handleKeydown)
    };
  }

  // Export for use in modals
  window.ferniFocusTrap = createFocusTrap;

  // ═══════════════════════════════════════════════════════════════════════════
  // KEYBOARD NAVIGATION
  // ═══════════════════════════════════════════════════════════════════════════

  function initKeyboardNav() {
    // Arrow key navigation for card groups
    const cardGroups = document.querySelectorAll('[data-card-group]');
    
    cardGroups.forEach(group => {
      const cards = group.querySelectorAll('[data-card]');
      let currentIndex = 0;

      group.addEventListener('keydown', (e) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;

        e.preventDefault();

        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          currentIndex = (currentIndex + 1) % cards.length;
        } else {
          currentIndex = (currentIndex - 1 + cards.length) % cards.length;
        }

        cards[currentIndex].focus();
      });
    });

    // Escape key closes modals/menus
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // Close mobile menu
        const mobileMenu = document.querySelector('[data-mobile-menu].open');
        if (mobileMenu) {
          mobileMenu.classList.remove('open');
          document.querySelector('[data-mobile-menu-btn]')?.focus();
        }

        // Close modals
        const openModal = document.querySelector('[data-modal].open');
        if (openModal) {
          openModal.classList.remove('open');
        }
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ARIA LIVE REGIONS
  // ═══════════════════════════════════════════════════════════════════════════

  function createLiveRegion() {
    const region = document.createElement('div');
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    region.className = 'sr-only';
    region.id = 'ferni-announcer';
    document.body.appendChild(region);

    return {
      announce: (message) => {
        region.textContent = '';
        setTimeout(() => {
          region.textContent = message;
        }, 100);
      }
    };
  }

  const announcer = createLiveRegion();
  window.ferniAnnounce = announcer.announce;

  // ═══════════════════════════════════════════════════════════════════════════
  // HIGH CONTRAST MODE TOGGLE
  // ═══════════════════════════════════════════════════════════════════════════

  function initHighContrastToggle() {
    const toggle = document.querySelector('[data-contrast-toggle]');
    if (!toggle) return;

    // Check saved preference
    const savedPreference = localStorage.getItem('ferni-high-contrast');
    if (savedPreference === 'true') {
      document.documentElement.classList.add('high-contrast');
    }

    toggle.addEventListener('click', () => {
      const isHighContrast = document.documentElement.classList.toggle('high-contrast');
      localStorage.setItem('ferni-high-contrast', isHighContrast);
      
      // Announce change
      window.ferniAnnounce?.(
        isHighContrast ? 'High contrast mode enabled' : 'High contrast mode disabled'
      );
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REDUCED MOTION PREFERENCE
  // ═══════════════════════════════════════════════════════════════════════════

  function initReducedMotion() {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    
    function handleChange(e) {
      document.documentElement.classList.toggle('reduce-motion', e.matches);
    }

    handleChange(mediaQuery);
    mediaQuery.addEventListener('change', handleChange);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FOCUS VISIBLE STYLING
  // ═══════════════════════════════════════════════════════════════════════════

  function initFocusVisible() {
    // Add class when using keyboard navigation
    let usingKeyboard = false;

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        usingKeyboard = true;
        document.body.classList.add('using-keyboard');
      }
    });

    document.addEventListener('mousedown', () => {
      usingKeyboard = false;
      document.body.classList.remove('using-keyboard');
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INJECT ACCESSIBILITY STYLES
  // ═══════════════════════════════════════════════════════════════════════════

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* Screen reader only */
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      
      /* Focus visible when using keyboard */
      .using-keyboard *:focus {
        outline: 3px solid #4a6741;
        outline-offset: 3px;
      }
      
      /* High contrast mode */
      .high-contrast {
        --color-paper: #ffffff;
        --color-ink: #000000;
        --color-ferni: #2d5a25;
      }
      
      .high-contrast a,
      .high-contrast button {
        text-decoration: underline;
      }
      
      .high-contrast .glass,
      .high-contrast .glass-subtle {
        background: rgba(255, 255, 255, 0.95);
        border: 2px solid #000000;
      }
      
      /* Reduced motion */
      .reduce-motion * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
      
      /* Skip link */
      [data-skip-link] {
        position: absolute;
        top: -100%;
        left: 50%;
        transform: translateX(-50%);
        padding: 1rem 2rem;
        background: #4a6741;
        color: white;
        border-radius: 0 0 0.5rem 0.5rem;
        z-index: 9999;
        transition: top 0.3s ease;
      }
      
      [data-skip-link]:focus {
        top: 0;
      }
    `;
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZE
  // ═══════════════════════════════════════════════════════════════════════════

  function init() {
    injectStyles();
    initSkipLinks();
    initKeyboardNav();
    initHighContrastToggle();
    initReducedMotion();
    initFocusVisible();
    
    console.log('%c♿ Accessibility features loaded', 'color: #4a6741; font-weight: bold;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

