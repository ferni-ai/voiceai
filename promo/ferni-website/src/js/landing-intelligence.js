/**
 * Landing Intelligence - Main Orchestrator
 *
 * Coordinates all Gemini-powered landing page optimizations:
 * - Behavior tracking
 * - Time-aware content
 * - Adaptive layout
 * - Returning visitor personalization
 * - Chat widget
 *
 * @module landing-intelligence
 */

(function () {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const CONFIG = {
    apiBase: '/api/landing',
    enableAI: true,
    enableTracking: true,
    enableChatWidget: true,
    enableTimeAware: true,
    enableReturningVisitor: true,
    debugMode: false,
  };

  // ============================================================================
  // STATE
  // ============================================================================

  const state = {
    visitorId: null,
    sessionId: null,
    isReturning: false,
    visitCount: 1,
    optimization: null,
    initialized: false,
    startTime: Date.now(),
  };

  // ============================================================================
  // VISITOR ID MANAGEMENT
  // ============================================================================

  function getVisitorId() {
    let visitorId = localStorage.getItem('ferni_visitor_id');
    if (!visitorId) {
      visitorId = 'fv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('ferni_visitor_id', visitorId);
    }
    return visitorId;
  }

  function getSessionId() {
    return 'fs_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  // ============================================================================
  // API CALLS
  // ============================================================================

  async function fetchOptimization(behaviorSignals) {
    try {
      const response = await fetch(CONFIG.apiBase + '/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorId: state.visitorId,
          behaviorSignals: behaviorSignals,
          device: getDeviceType(),
          currentSection: getCurrentSection(),
          hour: new Date().getHours(),
        }),
      });

      if (!response.ok) {
        throw new Error('Optimization request failed');
      }

      return await response.json();
    } catch (error) {
      console.warn('[LandingIntelligence] Optimization failed:', error);
      return null;
    }
  }

  async function fetchTimeContent() {
    try {
      const response = await fetch(CONFIG.apiBase + '/time-content');
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.warn('[LandingIntelligence] Time content failed:', error);
      return null;
    }
  }

  async function fetchChatGreeting(section, timeOnPage, scrollDepth) {
    try {
      const response = await fetch(CONFIG.apiBase + '/chat-greeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, timeOnPage, scrollDepth }),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.warn('[LandingIntelligence] Chat greeting failed:', error);
      return null;
    }
  }

  async function trackBehavior(signals, isEnd = false) {
    if (!CONFIG.enableTracking) return;

    try {
      const endpoint = isEnd ? '/track/end' : '/track';
      await fetch(CONFIG.apiBase + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorId: state.visitorId,
          sessionId: state.sessionId,
          signals: {
            startTime: state.startTime,
            ...signals,
          },
        }),
      });
    } catch (error) {
      console.warn('[LandingIntelligence] Tracking failed:', error);
    }
  }

  // ============================================================================
  // DEVICE & SECTION DETECTION
  // ============================================================================

  function getDeviceType() {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }

  function getCurrentSection() {
    const sections = document.querySelectorAll('section[id]');
    const scrollY = window.scrollY + window.innerHeight / 2;

    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const bottom = top + rect.height;

      if (scrollY >= top && scrollY <= bottom) {
        return section.id;
      }
    }

    return 'hero';
  }

  // ============================================================================
  // CONTENT APPLICATION
  // ============================================================================

  function applyTimeAwareContent(content) {
    if (!content || !CONFIG.enableTimeAware) return;

    // Apply hero overrides
    if (content.hero) {
      const tagline = document.querySelector('.hero__tagline');
      const headline = document.querySelector('.hero__headline');
      const subhead = document.querySelector('.hero__subhead');

      if (tagline && content.hero.tagline) {
        tagline.textContent = content.hero.tagline;
      }
      if (headline && content.hero.headline) {
        headline.innerHTML = content.hero.headline;
      }
      if (subhead && content.hero.subhead) {
        subhead.textContent = content.hero.subhead;
      }
    }

    // Apply CTA override
    if (content.ctaOverride) {
      const ctaButton = document.querySelector('.hero__cta .btn--primary');
      if (ctaButton) {
        const icon = ctaButton.querySelector('svg');
        ctaButton.textContent = content.ctaOverride.text + ' ';
        if (icon) ctaButton.appendChild(icon);

        ctaButton.classList.remove('btn--primary', 'btn--secondary', 'btn--ghost');
        ctaButton.classList.add('btn--' + content.ctaOverride.style);
      }
    }

    // Apply visual mode
    if (content.visualMode === 'dark') {
      document.body.classList.add('theme--dark', 'time-mode--night');
    }

    // Apply background treatment
    if (content.backgroundTreatment && content.backgroundTreatment !== 'default') {
      document.body.classList.add('bg-treatment--' + content.backgroundTreatment);
    }

    if (CONFIG.debugMode) {
      console.log('[LandingIntelligence] Time-aware content applied:', content.mode);
    }
  }

  function applyReturningVisitorExperience(experience) {
    if (!experience || !CONFIG.enableReturningVisitor) return;

    // Apply welcome message
    if (experience.welcomeMessage) {
      const badge = document.createElement('div');
      badge.className = 'returning-visitor-badge';
      badge.textContent = experience.welcomeMessage;
      badge.style.cssText = `
        position: fixed;
        top: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--color-background-elevated, #fffdfb);
        color: var(--color-text-primary, #2c2520);
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 14px;
        box-shadow: var(--shadow-md);
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.3s ease;
      `;
      document.body.appendChild(badge);

      // Fade in
      requestAnimationFrame(() => {
        badge.style.opacity = '1';
      });

      // Fade out and remove after 4 seconds
      setTimeout(() => {
        badge.style.opacity = '0';
        setTimeout(() => badge.remove(), 300);
      }, 4000);
    }

    // Apply hero override
    if (experience.heroOverride) {
      const tagline = document.querySelector('.hero__tagline');
      const headline = document.querySelector('.hero__headline');
      const subhead = document.querySelector('.hero__subhead');

      if (tagline && experience.heroOverride.tagline) {
        tagline.textContent = experience.heroOverride.tagline;
      }
      if (headline && experience.heroOverride.headline) {
        headline.innerHTML = experience.heroOverride.headline;
      }
      if (subhead && experience.heroOverride.subhead) {
        subhead.textContent = experience.heroOverride.subhead;
      }
    }

    // Surface section first
    if (experience.surfaceFirst) {
      const section = document.getElementById(experience.surfaceFirst);
      if (section) {
        // Add highlight
        section.classList.add('section--highlighted');
      }
    }

    // Apply special offer
    if (experience.specialOffer) {
      window.FerniLandingIntelligence.specialOffer = experience.specialOffer;
      // Trigger custom event for offer display
      window.dispatchEvent(
        new CustomEvent('ferni:special-offer', {
          detail: experience.specialOffer,
        })
      );
    }

    if (CONFIG.debugMode) {
      console.log('[LandingIntelligence] Returning visitor experience applied');
    }
  }

  function applyLayoutOptimization(layout) {
    if (!layout || !layout.order) return;

    // Apply section emphasis
    if (layout.emphasis) {
      for (const emphasis of layout.emphasis) {
        const section = document.getElementById(emphasis.section);
        if (section) {
          section.classList.add(emphasis.treatment);
        }
      }
    }

    // Hide sections
    if (layout.hide) {
      for (const sectionId of layout.hide) {
        const section = document.getElementById(sectionId);
        if (section) {
          section.style.display = 'none';
        }
      }
    }

    // Note: Section reordering is complex with CSS grid layouts
    // For now, we just emphasize/hide sections

    if (CONFIG.debugMode) {
      console.log('[LandingIntelligence] Layout optimization applied');
    }
  }

  function applyGeneratedVariant(variant) {
    if (!variant || !variant.content) return;

    const { tagline, headline, subhead, ctaText, ctaStyle } = variant.content;

    if (tagline) {
      const el = document.querySelector('.hero__tagline');
      if (el) el.textContent = tagline;
    }

    if (headline) {
      const el = document.querySelector('.hero__headline');
      if (el) el.innerHTML = headline;
    }

    if (subhead) {
      const el = document.querySelector('.hero__subhead');
      if (el) el.textContent = subhead;
    }

    if (ctaText) {
      const btn = document.querySelector('.hero__cta .btn--primary');
      if (btn) {
        const icon = btn.querySelector('svg');
        btn.textContent = ctaText + ' ';
        if (icon) btn.appendChild(icon);

        if (ctaStyle) {
          btn.classList.remove('btn--primary', 'btn--secondary', 'btn--ghost');
          btn.classList.add('btn--' + ctaStyle);
        }
      }
    }

    // Store for A/B tracking
    if (variant.id) {
      window.FerniLandingIntelligence.currentVariant = variant.id;
    }

    if (CONFIG.debugMode) {
      console.log('[LandingIntelligence] Variant applied:', variant.id);
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async function initialize() {
    if (state.initialized) return;

    state.visitorId = getVisitorId();
    state.sessionId = getSessionId();
    state.startTime = Date.now();

    // Check if returning visitor (simple check based on previous visit count)
    const visitCount = parseInt(localStorage.getItem('ferni_visit_count') || '0', 10) + 1;
    localStorage.setItem('ferni_visit_count', String(visitCount));
    state.visitCount = visitCount;
    state.isReturning = visitCount > 1;

    if (CONFIG.debugMode) {
      console.log('[LandingIntelligence] Initializing...', {
        visitorId: state.visitorId,
        visitCount: state.visitCount,
        isReturning: state.isReturning,
      });
    }

    // Quick time-aware content (no network call needed for basic version)
    if (CONFIG.enableTimeAware) {
      const hour = new Date().getHours();
      if (hour >= 0 && hour < 5) {
        // Late night - immediate local treatment
        document.body.classList.add('time-mode--late-night');
      }
    }

    // Fetch full optimization (async, will apply when ready)
    fetchOptimization({
      scrollDepth: 0,
      timeOnPage: 0,
      sectionsViewed: ['hero'],
      timePerSection: { hero: 0 },
      scrollPattern: 'reading',
      mousePattern: 'calm',
      ctaHoverWithoutClick: false,
      scrollReversals: 0,
      device: getDeviceType(),
      referrerType: getReferrerType(),
      clickCount: 0,
    }).then((optimization) => {
      if (optimization) {
        state.optimization = optimization;

        // Apply optimizations in order
        if (optimization.timeContent) {
          applyTimeAwareContent(optimization.timeContent);
        }

        if (optimization.returningExperience) {
          applyReturningVisitorExperience(optimization.returningExperience);
        }

        if (optimization.variant) {
          applyGeneratedVariant(optimization.variant);
        }

        if (optimization.layout) {
          applyLayoutOptimization(optimization.layout);
        }

        // Initialize chat widget with greeting
        if (optimization.chatGreeting && CONFIG.enableChatWidget) {
          window.FerniChatWidget?.setGreeting(
            optimization.chatGreeting.message,
            optimization.chatGreeting.timing
          );
        }
      }
    });

    // Initialize sub-modules
    window.FerniBehaviorTracker?.init(state.visitorId, state.sessionId);
    window.FerniChatWidget?.init();

    state.initialized = true;

    if (CONFIG.debugMode) {
      console.log('[LandingIntelligence] Initialized');
    }
  }

  function getReferrerType() {
    const referrer = document.referrer;
    if (!referrer) return 'direct';

    if (referrer.includes('google') || referrer.includes('bing') || referrer.includes('duckduckgo')) {
      return 'search';
    }
    if (
      referrer.includes('facebook') ||
      referrer.includes('twitter') ||
      referrer.includes('linkedin') ||
      referrer.includes('instagram')
    ) {
      return 'social';
    }
    if (referrer.includes('gclid') || referrer.includes('utm_')) {
      return 'ad';
    }
    return 'referral';
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  window.FerniLandingIntelligence = {
    init: initialize,
    getState: () => ({ ...state }),
    applyTimeAwareContent,
    applyReturningVisitorExperience,
    applyLayoutOptimization,
    applyGeneratedVariant,
    fetchOptimization,
    fetchChatGreeting,
    trackBehavior,
    config: CONFIG,
    currentVariant: null,
    specialOffer: null,
  };

  // Auto-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    // Small delay to let other scripts load
    setTimeout(initialize, 50);
  }

  console.log('%c🧠 Ferni Landing Intelligence loaded', 'color: #4a6741; font-weight: bold;');
})();

