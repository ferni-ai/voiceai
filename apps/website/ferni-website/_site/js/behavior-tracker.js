/**
 * Behavior Tracker
 *
 * Tracks visitor behavior signals for landing page optimization:
 * - Scroll patterns
 * - Time per section
 * - Mouse movement patterns
 * - CTA interactions
 * - Scroll reversals
 *
 * @module behavior-tracker
 */

(function () {
  'use strict';

  // ============================================================================
  // STATE
  // ============================================================================

  const state = {
    visitorId: null,
    sessionId: null,
    startTime: Date.now(),
    sectionsViewed: new Set(),
    timePerSection: {},
    currentSection: 'hero',
    sectionEnterTime: Date.now(),
    scrollDepth: 0,
    maxScrollDepth: 0,
    scrollPositions: [],
    scrollReversals: 0,
    lastScrollY: 0,
    lastScrollDirection: 'down',
    mousePositions: [],
    clickCount: 0,
    ctaHoverWithoutClick: false,
    ctaHovered: false,
    ctaClicked: false,
  };

  // ============================================================================
  // SCROLL TRACKING
  // ============================================================================

  let scrollTimeout = null;

  function handleScroll() {
    const scrollY = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrollPercent = docHeight > 0 ? Math.round((scrollY / docHeight) * 100) : 0;

    state.scrollDepth = scrollPercent;
    state.maxScrollDepth = Math.max(state.maxScrollDepth, scrollPercent);

    // Track scroll direction changes
    const direction = scrollY > state.lastScrollY ? 'down' : 'up';
    if (direction !== state.lastScrollDirection && Math.abs(scrollY - state.lastScrollY) > 50) {
      state.scrollReversals++;
      state.lastScrollDirection = direction;
    }
    state.lastScrollY = scrollY;

    // Track scroll positions for pattern analysis
    state.scrollPositions.push({
      y: scrollY,
      time: Date.now(),
    });

    // Keep only last 100 positions
    if (state.scrollPositions.length > 100) {
      state.scrollPositions.shift();
    }

    // Update current section
    updateCurrentSection();

    // Debounced analytics
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      sendScrollUpdate();
    }, 500);
  }

  function updateCurrentSection() {
    const sections = document.querySelectorAll('section[id]');
    const scrollY = window.scrollY + window.innerHeight / 3;

    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const bottom = top + rect.height;

      if (scrollY >= top && scrollY <= bottom) {
        const sectionId = section.id;

        if (sectionId !== state.currentSection) {
          // Record time in previous section
          const timeInSection = Date.now() - state.sectionEnterTime;
          state.timePerSection[state.currentSection] =
            (state.timePerSection[state.currentSection] || 0) + timeInSection;

          // Update to new section
          state.currentSection = sectionId;
          state.sectionEnterTime = Date.now();
          state.sectionsViewed.add(sectionId);

          // Notify chat widget of section change
          window.FerniChatWidget?.onSectionChange(sectionId);
        }
        break;
      }
    }
  }

  function sendScrollUpdate() {
    // Update chat widget with context
    const timeOnPage = Math.round((Date.now() - state.startTime) / 1000);
    window.FerniChatWidget?.updateContext({
      section: state.currentSection,
      timeOnPage,
      scrollDepth: state.scrollDepth,
    });
  }

  // ============================================================================
  // MOUSE TRACKING
  // ============================================================================

  let mouseTimeout = null;

  function handleMouseMove(e) {
    state.mousePositions.push({
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
    });

    // Keep only last 50 positions
    if (state.mousePositions.length > 50) {
      state.mousePositions.shift();
    }

    clearTimeout(mouseTimeout);
    mouseTimeout = setTimeout(analyzeMousePattern, 500);
  }

  function analyzeMousePattern() {
    if (state.mousePositions.length < 10) return;

    // Calculate average speed
    let totalDistance = 0;
    let totalTime = 0;

    for (let i = 1; i < state.mousePositions.length; i++) {
      const prev = state.mousePositions[i - 1];
      const curr = state.mousePositions[i];

      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const time = curr.time - prev.time;

      totalDistance += distance;
      totalTime += time;
    }

    const avgSpeed = totalTime > 0 ? totalDistance / totalTime : 0;

    // Classify pattern
    // avgSpeed: pixels per ms
    // calm: < 0.5, decisive: 0.5-1.5, erratic: > 1.5
    state.mousePattern =
      avgSpeed < 0.5 ? 'calm' : avgSpeed < 1.5 ? 'decisive' : 'erratic';
  }

  // ============================================================================
  // CTA TRACKING
  // ============================================================================

  function initCTATracking() {
    const ctaButtons = document.querySelectorAll(
      '.hero__cta a, .nav__cta, .btn--primary, .final-cta__phone'
    );

    ctaButtons.forEach((btn) => {
      btn.addEventListener('mouseenter', () => {
        state.ctaHovered = true;
      });

      btn.addEventListener('mouseleave', () => {
        if (state.ctaHovered && !state.ctaClicked) {
          state.ctaHoverWithoutClick = true;
        }
      });

      btn.addEventListener('click', () => {
        state.ctaClicked = true;
        state.clickCount++;
      });
    });

    // Track all clicks
    document.addEventListener('click', () => {
      state.clickCount++;
    });
  }

  // ============================================================================
  // SCROLL PATTERN ANALYSIS
  // ============================================================================

  function getScrollPattern() {
    if (state.scrollPositions.length < 5) return 'reading';

    // Calculate scroll speeds
    const speeds = [];
    for (let i = 1; i < state.scrollPositions.length; i++) {
      const prev = state.scrollPositions[i - 1];
      const curr = state.scrollPositions[i];

      const distance = Math.abs(curr.y - prev.y);
      const time = curr.time - prev.time;

      if (time > 0) {
        speeds.push(distance / time);
      }
    }

    if (speeds.length === 0) return 'reading';

    const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;

    // Classify pattern
    // scanning: fast, continuous scrolling
    // reading: slow, deliberate scrolling
    // searching: lots of reversals
    // bouncing: very fast, back and forth

    if (state.scrollReversals > 5 && avgSpeed > 0.5) {
      return 'bouncing';
    }
    if (state.scrollReversals > 3) {
      return 'searching';
    }
    if (avgSpeed > 1) {
      return 'scanning';
    }
    return 'reading';
  }

  // ============================================================================
  // DATA COLLECTION
  // ============================================================================

  function collectBehaviorSignals() {
    // Finalize current section time
    const timeInSection = Date.now() - state.sectionEnterTime;
    const timePerSection = { ...state.timePerSection };
    timePerSection[state.currentSection] =
      (timePerSection[state.currentSection] || 0) + timeInSection;

    return {
      scrollPattern: getScrollPattern(),
      sectionsViewed: Array.from(state.sectionsViewed),
      timePerSection,
      scrollDepth: state.maxScrollDepth,
      timeOnPage: Math.round((Date.now() - state.startTime) / 1000),
      clickCount: state.clickCount,
      sectionsHovered: [], // Could track this too
      mousePattern: state.mousePattern || 'calm',
      ctaHoverWithoutClick: state.ctaHoverWithoutClick,
      scrollReversals: state.scrollReversals,
      device: getDeviceType(),
      referrerType: getReferrerType(),
    };
  }

  function getDeviceType() {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }

  function getReferrerType() {
    const referrer = document.referrer;
    if (!referrer) return 'direct';
    if (referrer.includes('google') || referrer.includes('bing')) return 'search';
    if (referrer.includes('facebook') || referrer.includes('twitter')) return 'social';
    if (referrer.includes('gclid') || referrer.includes('utm_')) return 'ad';
    return 'referral';
  }

  // ============================================================================
  // SESSION END TRACKING
  // ============================================================================

  function handleBeforeUnload() {
    const signals = collectBehaviorSignals();
    signals.converted = state.ctaClicked;

    // Use sendBeacon for reliable delivery
    const data = JSON.stringify({
      visitorId: state.visitorId,
      sessionId: state.sessionId,
      signals,
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/landing/track/end', data);
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  function init(visitorId, sessionId) {
    state.visitorId = visitorId;
    state.sessionId = sessionId;
    state.startTime = Date.now();
    state.sectionsViewed.add('hero');

    // Add event listeners
    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Init CTA tracking
    initCTATracking();

    console.log('%c📊 Ferni Behavior Tracker initialized', 'color: #3a6b73;');
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  window.FerniBehaviorTracker = {
    init,
    collectBehaviorSignals,
    getState: () => ({ ...state }),
  };
})();

