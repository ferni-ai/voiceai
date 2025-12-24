/**
 * Hero Sequence - Apple-Style Orchestrated Entrance
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Creates a cinematic, perfectly timed entrance animation for the landing page.
 * Inspired by Apple's keynote and product page animations.
 * 
 * Sequence:
 * 1. Page fade in from black (0-400ms)
 * 2. Ferni orb emerges with gentle scale + glow (400-1000ms)
 * 3. Eyebrow text reveals with typewriter effect (1000-1400ms)
 * 4. Headline animates word by word (1400-2200ms)
 * 5. Subheadline fades up (2200-2600ms)
 * 6. CTA buttons spring in (2600-3000ms)
 * 7. Secondary elements fade in (3000-3400ms)
 * 
 * @module hero-sequence
 */

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  const CONFIG = {
    // Timing (milliseconds)
    timing: {
      pageReveal: 400,
      orbDelay: 400,
      orbDuration: 600,
      eyebrowDelay: 1000,
      eyebrowDuration: 400,
      headlineDelay: 1400,
      headlineWordGap: 100,
      subheadlineDelay: 2200,
      subheadlineDuration: 400,
      ctaDelay: 2600,
      ctaDuration: 500,
      secondaryDelay: 3000,
    },
    
    // Easings
    easing: {
      spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
      dramatic: 'cubic-bezier(0.16, 1, 0.3, 1)',
    },
    
    // Skip animation if user prefers reduced motion
    respectsReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    
    // Skip if already visited in this session
    skipIfReturning: true,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════
  
  const state = {
    hasPlayed: false,
    elements: {},
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ELEMENT DISCOVERY
  // ═══════════════════════════════════════════════════════════════════════════
  
  function discoverElements() {
    state.elements = {
      hero: document.querySelector('.hero'),
      orb: document.querySelector('.hero-ferni, .hero__orb, [data-hero-orb]'),
      eyebrow: document.querySelector('.hero__eyebrow'),
      headline: document.querySelector('.hero__headline'),
      subheadline: document.querySelector('.hero__subheadline'),
      cta: document.querySelector('.hero__cta'),
      secondary: document.querySelector('.hero__secondary'),
      nav: document.querySelector('.nav'),
    };
    
    return Object.values(state.elements).some(el => el !== null);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ANIMATION UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════
  
  function setInitialState(element, styles) {
    if (!element) return;
    Object.assign(element.style, styles);
  }

  function animateTo(element, keyframes, options) {
    if (!element || CONFIG.respectsReducedMotion) {
      // If reduced motion, just set final state
      if (element && keyframes.length > 0) {
        const finalState = keyframes[keyframes.length - 1];
        Object.keys(finalState).forEach(key => {
          element.style[key] = finalState[key];
        });
      }
      return Promise.resolve();
    }
    
    return new Promise(resolve => {
      const animation = element.animate(keyframes, {
        duration: options.duration || 500,
        easing: options.easing || CONFIG.easing.smooth,
        fill: 'forwards',
        ...options,
      });
      
      animation.onfinish = resolve;
    });
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ANIMATION SEQUENCES
  // ═══════════════════════════════════════════════════════════════════════════
  
  async function animatePageReveal() {
    const { hero } = state.elements;
    if (!hero) return;
    
    // Create overlay for fade-in effect
    const overlay = document.createElement('div');
    overlay.className = 'hero-sequence-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: var(--color-background, #faf8f5);
      z-index: 10000;
      pointer-events: none;
    `;
    document.body.appendChild(overlay);
    
    // Fade out overlay
    await animateTo(overlay, [
      { opacity: 1 },
      { opacity: 0 },
    ], {
      duration: CONFIG.timing.pageReveal,
      easing: CONFIG.easing.smooth,
    });
    
    overlay.remove();
  }

  async function animateOrb() {
    const { orb } = state.elements;
    if (!orb) return;
    
    // Set initial state
    setInitialState(orb, {
      opacity: '0',
      transform: 'scale(0.8) translateY(20px)',
    });
    
    await delay(CONFIG.timing.orbDelay);
    
    // Animate in with spring
    await animateTo(orb, [
      { opacity: 0, transform: 'scale(0.8) translateY(20px)', filter: 'blur(10px)' },
      { opacity: 1, transform: 'scale(1.02) translateY(-5px)', filter: 'blur(0px)', offset: 0.7 },
      { opacity: 1, transform: 'scale(1) translateY(0)', filter: 'blur(0px)' },
    ], {
      duration: CONFIG.timing.orbDuration,
      easing: CONFIG.easing.spring,
    });
    
    // Add glow pulse
    orb.animate([
      { boxShadow: '0 0 40px rgba(74, 103, 65, 0.3)' },
      { boxShadow: '0 0 60px rgba(74, 103, 65, 0.5)' },
      { boxShadow: '0 0 40px rgba(74, 103, 65, 0.3)' },
    ], {
      duration: 2000,
      easing: 'ease-in-out',
      iterations: 2,
    });
  }

  async function animateEyebrow() {
    const { eyebrow } = state.elements;
    if (!eyebrow) return;
    
    const text = eyebrow.textContent;
    
    // Set initial state
    setInitialState(eyebrow, {
      opacity: '0',
    });
    
    await delay(CONFIG.timing.eyebrowDelay);
    
    // Simple fade in with slight move
    await animateTo(eyebrow, [
      { opacity: 0, transform: 'translateY(10px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], {
      duration: CONFIG.timing.eyebrowDuration,
      easing: CONFIG.easing.smooth,
    });
  }

  async function animateHeadline() {
    const { headline } = state.elements;
    if (!headline) return;
    
    // Get words
    const originalText = headline.textContent;
    const words = originalText.split(' ');
    
    // Wrap each word in a span
    headline.innerHTML = words.map(word => 
      `<span class="hero-word" style="opacity: 0; display: inline-block; transform: translateY(20px);">${word}</span>`
    ).join(' ');
    
    headline.style.opacity = '1';
    
    await delay(CONFIG.timing.headlineDelay);
    
    // Animate words one by one
    const wordSpans = headline.querySelectorAll('.hero-word');
    for (let i = 0; i < wordSpans.length; i++) {
      animateTo(wordSpans[i], [
        { opacity: 0, transform: 'translateY(20px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ], {
        duration: 300,
        easing: CONFIG.easing.spring,
      });
      await delay(CONFIG.timing.headlineWordGap);
    }
  }

  async function animateSubheadline() {
    const { subheadline } = state.elements;
    if (!subheadline) return;
    
    setInitialState(subheadline, {
      opacity: '0',
      transform: 'translateY(15px)',
    });
    
    await delay(CONFIG.timing.subheadlineDelay);
    
    await animateTo(subheadline, [
      { opacity: 0, transform: 'translateY(15px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], {
      duration: CONFIG.timing.subheadlineDuration,
      easing: CONFIG.easing.smooth,
    });
  }

  async function animateCTA() {
    const { cta } = state.elements;
    if (!cta) return;
    
    // Find buttons within CTA
    const buttons = cta.querySelectorAll('.btn, button, a');
    
    setInitialState(cta, {
      opacity: '0',
    });
    
    buttons.forEach(btn => {
      setInitialState(btn, {
        opacity: '0',
        transform: 'scale(0.9) translateY(10px)',
      });
    });
    
    await delay(CONFIG.timing.ctaDelay);
    
    cta.style.opacity = '1';
    
    // Animate buttons with stagger
    for (let i = 0; i < buttons.length; i++) {
      animateTo(buttons[i], [
        { opacity: 0, transform: 'scale(0.9) translateY(10px)' },
        { opacity: 1, transform: 'scale(1.02) translateY(-2px)', offset: 0.7 },
        { opacity: 1, transform: 'scale(1) translateY(0)' },
      ], {
        duration: CONFIG.timing.ctaDuration,
        easing: CONFIG.easing.spring,
      });
      await delay(100);
    }
  }

  async function animateSecondary() {
    const { secondary, nav } = state.elements;
    
    // Animate secondary content
    if (secondary) {
      setInitialState(secondary, { opacity: '0' });
      await delay(CONFIG.timing.secondaryDelay);
      await animateTo(secondary, [
        { opacity: 0 },
        { opacity: 1 },
      ], {
        duration: 400,
        easing: CONFIG.easing.smooth,
      });
    }
    
    // Ensure nav is visible
    if (nav) {
      nav.style.opacity = '1';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN SEQUENCE
  // ═══════════════════════════════════════════════════════════════════════════
  
  async function playSequence() {
    if (state.hasPlayed) return;
    if (CONFIG.respectsReducedMotion) {
      // Just ensure everything is visible
      showAllImmediately();
      return;
    }
    
    // Check if returning visitor (skip animation)
    if (CONFIG.skipIfReturning && sessionStorage.getItem('ferni_hero_played')) {
      showAllImmediately();
      return;
    }
    
    state.hasPlayed = true;
    sessionStorage.setItem('ferni_hero_played', 'true');
    
    // Run animations in sequence
    try {
      await animatePageReveal();
      
      // These can overlap slightly for a more dynamic feel
      animateOrb();
      await delay(200);
      animateEyebrow();
      await delay(200);
      animateHeadline();
      await delay(400);
      animateSubheadline();
      await delay(200);
      animateCTA();
      await delay(200);
      animateSecondary();
      
    } catch (error) {
      console.error('[Hero Sequence] Animation error:', error);
      showAllImmediately();
    }
  }

  function showAllImmediately() {
    const { orb, eyebrow, headline, subheadline, cta, secondary, nav } = state.elements;
    
    [orb, eyebrow, headline, subheadline, cta, secondary, nav].forEach(el => {
      if (el) {
        el.style.opacity = '1';
        el.style.transform = 'none';
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CSS INJECTION
  // ═══════════════════════════════════════════════════════════════════════════
  
  function injectStyles() {
    if (document.getElementById('hero-sequence-styles')) return;
    
    const styles = document.createElement('style');
    styles.id = 'hero-sequence-styles';
    styles.textContent = `
      /* Hero sequence animation preparation */
      .hero-sequence-ready .hero-ferni,
      .hero-sequence-ready .hero__orb,
      .hero-sequence-ready [data-hero-orb],
      .hero-sequence-ready .hero__eyebrow,
      .hero-sequence-ready .hero__headline,
      .hero-sequence-ready .hero__subheadline,
      .hero-sequence-ready .hero__cta,
      .hero-sequence-ready .hero__secondary {
        opacity: 0;
      }
      
      /* Word-by-word headline animation */
      .hero-word {
        transition: opacity 0.3s ease, transform 0.3s ease;
      }
      
      /* Reduced motion - show everything immediately */
      @media (prefers-reduced-motion: reduce) {
        .hero-sequence-ready .hero-ferni,
        .hero-sequence-ready .hero__orb,
        .hero-sequence-ready [data-hero-orb],
        .hero-sequence-ready .hero__eyebrow,
        .hero-sequence-ready .hero__headline,
        .hero-sequence-ready .hero__subheadline,
        .hero-sequence-ready .hero__cta,
        .hero-sequence-ready .hero__secondary {
          opacity: 1 !important;
          transform: none !important;
        }
      }
    `;
    
    document.head.appendChild(styles);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  function init() {
    // Inject styles first
    injectStyles();
    
    // Find elements
    if (!discoverElements()) {
      console.log('[Hero Sequence] Hero elements not found, skipping');
      return;
    }
    
    // Add ready class to prepare elements
    if (state.elements.hero) {
      state.elements.hero.classList.add('hero-sequence-ready');
    }
    
    // Play sequence after a tiny delay to ensure everything is rendered
    requestAnimationFrame(() => {
      setTimeout(playSequence, 50);
    });
    
    console.log('%c✨ Hero Sequence loaded', 'color: #4a6741; font-weight: bold;');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for debugging
  window.HeroSequence = {
    replay: () => {
      sessionStorage.removeItem('ferni_hero_played');
      state.hasPlayed = false;
      location.reload();
    },
    state: () => ({ ...state }),
  };

})();

