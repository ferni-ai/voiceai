/**
 * Shared Navigation Component
 * ===========================
 * Unified navigation and footer for all brand pages.
 * Uses CSS classes from brand-components.css.
 *
 * Include this script in all brand pages:
 * <script src="shared/nav.js" defer></script>
 *
 * Or for subdirectories:
 * <script src="../shared/nav.js" defer></script>
 *
 * Version: 2.0.0
 */

(function() {
  'use strict';

  // Detect path prefix based on current URL depth
  function getPathPrefix() {
    const path = window.location.pathname;
    const brandIndex = path.indexOf('/brand/');
    if (brandIndex === -1) return '';

    const afterBrand = path.substring(brandIndex + 7); // after "/brand/"
    const depth = (afterBrand.match(/\//g) || []).length;
    return '../'.repeat(depth);
  }

  // Get current page for active state
  function getCurrentPage() {
    const path = window.location.pathname;
    if (path.endsWith('index.html') || path.endsWith('/brand/') || path.endsWith('/brand')) return 'home';
    if (path.includes('/capabilities/')) return 'capabilities';
    if (path.includes('/characters/') || path.includes('expressions')) return 'team';
    if (path.includes('brand-book') || path.includes('universe-bible')) return 'story';
    if (path.includes('/visualizations/')) return 'visualizations';
    if (path.includes('brand-kit') || path.includes('icons') || path.includes('components')) return 'build';
    return '';
  }

  // Navigation links - Story Order: Home → Capabilities → Team → Story → Visualizations → Build
  const NAV_LINKS = [
    { id: 'capabilities', href: 'capabilities/index.html', label: 'Capabilities' },
    { id: 'team', href: 'characters/ferni/expressions.html', label: 'Team' },
    { id: 'story', href: 'universe-bible.html', label: 'Story' },
    { id: 'visualizations', href: 'visualizations/index.html', label: 'Visualizations' },
    { id: 'build', href: 'brand-kit.html', label: 'Build' },
  ];

  // Build the navigation HTML with unified classes
  function buildNavHTML(prefix, currentPage) {
    const linksHTML = NAV_LINKS.map(link => {
      const isActive = link.id === currentPage;
      const activeClass = isActive ? 'brand-nav-link active' : 'brand-nav-link';
      const ariaCurrent = isActive ? ' aria-current="page"' : '';
      return `<a href="${prefix}${link.href}" class="${activeClass}"${ariaCurrent}>${link.label}</a>`;
    }).join('\n        ');

    return `
  <!-- Skip to Content -->
  <a href="#main" class="skip-link">Skip to content</a>

  <!-- Scroll Progress -->
  <div class="scroll-progress" id="scrollProgress"></div>

  <!-- Navigation -->
  <nav class="brand-nav" role="navigation" aria-label="Main navigation">
    <a href="${prefix}index.html" class="brand-nav-logo" aria-label="Ferni Brand Library Home">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id="navGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="var(--color-ferni-light)"/>
            <stop offset="100%" stop-color="var(--color-ferni-dark)"/>
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="46" fill="url(#navGrad)"/>
        <!-- Eyes - LUXO STYLE (opaque white, no pupils) -->
        <ellipse cx="36" cy="48" rx="7" ry="9" fill="white"/>
        <ellipse cx="64" cy="48" rx="7" ry="9" fill="white"/>
      </svg>
      <span>Ferni</span>
    </a>

    <div class="brand-nav-links">
        ${linksHTML}
    </div>

    <div class="brand-nav-actions">
      <button class="theme-toggle" id="themeToggle" aria-label="Switch theme" title="Toggle theme: Light → Dark → Zen">
        <!-- Sun icon (shown in dark/zen mode, click for light) -->
        <svg class="sun-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/>
          <line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
        <!-- Moon icon (shown in light mode, click for dark) -->
        <svg class="moon-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
        <!-- Zen/Leaf icon (shown in dark mode, click for zen) -->
        <svg class="zen-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 5.324 17.678 2 12 2z"/>
          <circle cx="7.5" cy="10" r="1.5" fill="currentColor"/>
          <circle cx="12" cy="7.5" r="1.5" fill="currentColor"/>
          <circle cx="16.5" cy="10" r="1.5" fill="currentColor"/>
        </svg>
      </button>
    </div>
  </nav>
`;
  }

  // Footer categories - Story-organized sections
  const FOOTER_CATEGORIES = {
    discover: {
      title: 'Discover',
      links: [
        { href: 'capabilities/index.html', label: 'Capabilities' },
        { href: 'brand-book.html', label: 'Brand Book' },
        { href: 'universe-bible.html', label: 'Universe Bible' },
      ]
    },
    explore: {
      title: 'Explore',
      links: [
        { href: 'characters/ferni/expressions.html', label: 'Expressions' },
        { href: 'motion/demo.html', label: 'Motion Language' },
        { href: 'visualizations/index.html', label: 'Data Visualizations' },
      ]
    },
    build: {
      title: 'Build',
      links: [
        { href: 'components.html', label: 'Components' },
        { href: 'icons.html', label: 'Icons' },
        { href: 'brand-kit.html', label: 'Brand Kit' },
      ]
    },
    connect: {
      title: 'Connect',
      links: [
        { href: 'characters/ferni/expressions.html', label: 'Meet the Team' },
        { href: 'accessibility.html', label: 'Accessibility' },
        { href: 'sound-design.html', label: 'Sound Design' },
      ]
    },
  };

  // Build the footer HTML with unified classes
  function buildFooterHTML(prefix) {
    // Build category sections
    const sectionsHTML = Object.values(FOOTER_CATEGORIES).map(category => {
      const linksHTML = category.links.map(link =>
        `<a href="${prefix}${link.href}" class="brand-footer-link">${link.label}</a>`
      ).join('\n          ');

      return `
        <div class="brand-footer-section">
          <h3 class="brand-footer-section-title">${category.title}</h3>
          ${linksHTML}
        </div>`;
    }).join('');

    return `
  <footer class="brand-footer">
    <div class="brand-footer-inner">
      <!-- Logo + Tagline -->
      <div class="brand-footer-top">
        <div class="brand-footer-logo">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <defs>
              <linearGradient id="footerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="var(--color-ferni-light)"/>
                <stop offset="100%" stop-color="var(--color-ferni-dark)"/>
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="46" fill="url(#footerGrad)"/>
            <!-- LUXO STYLE: opaque white eyes, no pupils -->
            <ellipse cx="36" cy="48" rx="7" ry="9" fill="white"/>
            <ellipse cx="64" cy="48" rx="7" ry="9" fill="white"/>
          </svg>
        </div>
        <p class="brand-footer-tagline">"Friends forget. Ferni doesn't."</p>
      </div>

      <!-- Navigation Categories -->
      <nav class="brand-footer-nav" aria-label="Footer navigation">
        ${sectionsHTML}
      </nav>

      <!-- CTA Section -->
      <div class="brand-footer-cta">
        <div class="brand-footer-cta-content">
          <p class="brand-footer-cta-label">Continue Your Journey</p>
          <h3 class="brand-footer-cta-title">Ready to explore the full Ferni experience?</h3>
          <p class="brand-footer-cta-description">Discover how AI can feel more human, understand your life, and support your growth.</p>
        </div>
        <a href="${prefix}capabilities/index.html" class="brand-footer-cta-button">
          Explore Capabilities
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </a>
      </div>

      <!-- Copyright -->
      <div class="brand-footer-bottom">
        <p class="brand-footer-copyright">Ferni Brand Library</p>
        <p class="brand-footer-version">v2.0</p>
      </div>
    </div>
  </footer>
`;
  }

  // Theme cycle: light → dark → zen → light
  const THEME_CYCLE = ['light', 'dark', 'zen'];

  function getNextTheme(current) {
    const index = THEME_CYCLE.indexOf(current);
    const nextIndex = (index + 1) % THEME_CYCLE.length;
    return THEME_CYCLE[nextIndex];
  }

  // Initialize theme toggle with 3-way cycling
  function initThemeToggle() {
    const toggle = document.getElementById('themeToggle');
    if (!toggle) return;

    toggle.addEventListener('click', () => {
      const html = document.documentElement;
      const current = html.getAttribute('data-theme') || 'light';
      const next = getNextTheme(current);
      html.setAttribute('data-theme', next);
      localStorage.setItem('ferni-theme', next);
      updateThemeToggleState(next);
    });

    // Load saved theme
    const savedTheme = localStorage.getItem('ferni-theme');
    if (savedTheme && THEME_CYCLE.includes(savedTheme)) {
      document.documentElement.setAttribute('data-theme', savedTheme);
      updateThemeToggleState(savedTheme);
    } else {
      // Default to light if no saved theme
      updateThemeToggleState('light');
    }
  }

  // Update toggle button appearance based on current theme
  function updateThemeToggleState(theme) {
    const toggle = document.getElementById('themeToggle');
    if (!toggle) return;

    // Update data attribute for CSS styling
    toggle.setAttribute('data-current-theme', theme);

    // Update aria-label to announce next theme
    const nextTheme = getNextTheme(theme);
    toggle.setAttribute('aria-label', `Switch to ${nextTheme} theme`);
  }

  // Initialize scroll behaviors
  function initScrollBehaviors() {
    const scrollProgress = document.getElementById('scrollProgress');
    const nav = document.querySelector('.brand-nav');

    if (scrollProgress || nav) {
      window.addEventListener('scroll', () => {
        const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = height > 0 ? (winScroll / height) : 0;

        if (scrollProgress) {
          scrollProgress.style.transform = `scaleX(${scrolled})`;
        }

        if (nav) {
          if (window.scrollY > 50) {
            nav.classList.add('scrolled');
          } else {
            nav.classList.remove('scrolled');
          }
        }
      });
    }
  }

  // Inject navigation into the page
  function injectNav() {
    const prefix = getPathPrefix();
    const currentPage = getCurrentPage();

    // Find or create nav placeholder
    let navPlaceholder = document.getElementById('nav-placeholder');
    if (!navPlaceholder) {
      // Insert at the start of body
      navPlaceholder = document.createElement('div');
      navPlaceholder.id = 'nav-placeholder';
      document.body.insertBefore(navPlaceholder, document.body.firstChild);
    }

    navPlaceholder.outerHTML = buildNavHTML(prefix, currentPage);
  }

  // Inject footer into the page
  function injectFooter() {
    const prefix = getPathPrefix();

    let footerPlaceholder = document.getElementById('footer-placeholder');
    if (!footerPlaceholder) {
      // Append to end of body
      footerPlaceholder = document.createElement('div');
      footerPlaceholder.id = 'footer-placeholder';
      document.body.appendChild(footerPlaceholder);
    }

    footerPlaceholder.outerHTML = buildFooterHTML(prefix);
  }

  // Initialize when DOM is ready
  function init() {
    // Only inject if placeholders exist (opt-in)
    if (document.getElementById('nav-placeholder')) {
      injectNav();
    }
    if (document.getElementById('footer-placeholder')) {
      injectFooter();
    }

    initThemeToggle();
    initScrollBehaviors();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export for manual use
  window.FerniNav = {
    injectNav,
    injectFooter,
    getPathPrefix,
    getCurrentPage,
  };
})();
