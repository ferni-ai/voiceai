/**
 * Scroll-Linked Hero Transformation
 * Dramatic cinematic effects as user scrolls through hero
 * 
 * Effects:
 * - Ferni orb rises and grows
 * - Background layers separate (parallax)
 * - Text fades and scales down
 * - Rings expand outward
 * - Glow intensifies then fades
 */

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  const CONFIG = {
    scrollMultiplier: 1.5,       // How much scroll affects the transformation
    heroHeight: 1.2,             // Hero takes 120% of viewport for scroll room
    orbRiseDistance: 80,         // How many px the orb rises
    orbMaxScale: 1.3,            // Maximum scale of orb
    textFadeSpeed: 0.8,          // How fast text fades (higher = earlier)
    ringExpansion: 1.5,          // How much rings expand
    parallaxLayers: 3,           // Number of parallax layers
    smoothing: 0.1,              // Scroll smoothing factor
    debugMode: false
  };

  // ============================================================================
  // STATE
  // ============================================================================
  
  const state = {
    scrollY: 0,
    smoothScrollY: 0,
    heroProgress: 0,            // 0 = top of hero, 1 = bottom of hero
    viewportHeight: window.innerHeight,
    heroHeight: 0,
    initialized: false,
    ticking: false
  };

  // ============================================================================
  // DOM REFERENCES
  // ============================================================================
  
  let heroEl = null;
  let orbEl = null;
  let glowEl = null;
  let ringsEl = [];
  let headlineEl = null;
  let subheadEl = null;
  let ctaEl = null;
  let taglineEl = null;
  let bgLayers = [];

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  function init() {
    // Find hero elements
    heroEl = document.querySelector('.hero, [data-hero]');
    if (!heroEl) {
      logDebug('Hero element not found');
      return;
    }
    
    // Cache DOM references
    orbEl = heroEl.querySelector('.hero-ferni__orb, [data-ferni-orb]');
    glowEl = heroEl.querySelector('.hero-ferni__glow, [data-ferni-glow]');
    ringsEl = heroEl.querySelectorAll('.hero-ferni__ring, [data-ferni-ring]');
    headlineEl = heroEl.querySelector('.hero__headline, [data-hero-headline]');
    subheadEl = heroEl.querySelector('.hero__subhead, [data-hero-subhead]');
    ctaEl = heroEl.querySelector('.hero__cta, [data-hero-cta]');
    taglineEl = heroEl.querySelector('.hero__tagline, [data-hero-tagline]');
    bgLayers = heroEl.querySelectorAll('.hero__bg-layer, [data-parallax]');
    
    // Calculate hero height
    state.heroHeight = heroEl.offsetHeight;
    state.viewportHeight = window.innerHeight;
    
    // Add scroll-hero class
    heroEl.classList.add('scroll-hero');
    
    // Create CSS custom properties for scroll-linked animations
    document.documentElement.style.setProperty('--scroll-hero-progress', '0');
    
    // Set up event listeners
    setupEventListeners();
    
    // Start animation loop
    requestAnimationFrame(animationLoop);
    
    state.initialized = true;
    logDebug('Scroll Hero initialized');
  }

  // ============================================================================
  // EVENT LISTENERS
  // ============================================================================
  
  function setupEventListeners() {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
  }
  
  function onScroll() {
    state.scrollY = window.scrollY;
    requestTick();
  }
  
  function onResize() {
    state.viewportHeight = window.innerHeight;
    state.heroHeight = heroEl ? heroEl.offsetHeight : 0;
  }
  
  function requestTick() {
    if (!state.ticking) {
      state.ticking = true;
    }
  }

  // ============================================================================
  // ANIMATION LOOP
  // ============================================================================
  
  function animationLoop() {
    if (state.ticking) {
      update();
      state.ticking = false;
    }
    
    requestAnimationFrame(animationLoop);
  }
  
  function update() {
    // Smooth the scroll value
    state.smoothScrollY += (state.scrollY - state.smoothScrollY) * CONFIG.smoothing;
    
    // Calculate progress through hero (0 to 1)
    const scrollEnd = state.heroHeight * 0.7; // Transform completes at 70% of hero height
    state.heroProgress = Math.min(1, Math.max(0, state.smoothScrollY / scrollEnd));
    
    // Apply transformations
    applyTransformations(state.heroProgress);
    
    // Update CSS custom property for CSS-based animations
    document.documentElement.style.setProperty('--scroll-hero-progress', state.heroProgress.toFixed(3));
  }

  // ============================================================================
  // TRANSFORMATIONS - The magic happens here
  // ============================================================================
  
  function applyTransformations(progress) {
    // Easing function for smoother curves
    const easeOut = t => 1 - Math.pow(1 - t, 3);
    const easeIn = t => t * t;
    
    const easedProgress = easeOut(progress);
    const reverseProgress = 1 - easedProgress;
    
    // ----- ORB TRANSFORMATION -----
    if (orbEl) {
      // Rise up and scale
      const rise = easedProgress * CONFIG.orbRiseDistance;
      const scale = 1 + (easedProgress * (CONFIG.orbMaxScale - 1));
      
      orbEl.style.transform = `translateY(${-rise}px) scale(${scale})`;
      
      // Slight rotation for drama
      const rotation = easedProgress * 5;
      orbEl.style.setProperty('--scroll-rotation', `${rotation}deg`);
    }
    
    // ----- GLOW TRANSFORMATION -----
    if (glowEl) {
      // Intensify then fade
      const glowIntensity = progress < 0.5 
        ? 1 + (progress * 2 * 0.5)  // Grow to 1.5x
        : 1.5 - ((progress - 0.5) * 2 * 0.5); // Back to 1x
      
      const glowOpacity = 0.35 + (easedProgress * 0.3);
      
      glowEl.style.transform = `scale(${1 + easedProgress * 0.5})`;
      glowEl.style.opacity = glowOpacity;
    }
    
    // ----- RINGS TRANSFORMATION -----
    ringsEl.forEach((ring, index) => {
      const delay = index * 0.1;
      const ringProgress = Math.max(0, Math.min(1, (progress - delay) / (1 - delay)));
      const ringEased = easeOut(ringProgress);
      
      const expansion = 1 + (ringEased * (CONFIG.ringExpansion - 1));
      const ringOpacity = (0.3 - ringProgress * 0.2);
      
      ring.style.transform = `scale(${expansion})`;
      ring.style.opacity = Math.max(0, ringOpacity);
    });
    
    // ----- TEXT TRANSFORMATION -----
    const textProgress = Math.min(1, progress * CONFIG.textFadeSpeed);
    const textEased = easeIn(textProgress);
    
    // Tagline
    if (taglineEl) {
      const taglineY = textEased * 30;
      taglineEl.style.transform = `translateY(${-taglineY}px)`;
      taglineEl.style.opacity = reverseProgress;
    }
    
    // Headline
    if (headlineEl) {
      const headlineScale = 1 - (textEased * 0.1);
      const headlineY = textEased * 40;
      headlineEl.style.transform = `translateY(${-headlineY}px) scale(${headlineScale})`;
      headlineEl.style.opacity = reverseProgress;
    }
    
    // Subhead
    if (subheadEl) {
      const subheadY = textEased * 50;
      subheadEl.style.transform = `translateY(${-subheadY}px)`;
      subheadEl.style.opacity = reverseProgress;
    }
    
    // CTA
    if (ctaEl) {
      const ctaY = textEased * 60;
      ctaEl.style.transform = `translateY(${-ctaY}px)`;
      ctaEl.style.opacity = reverseProgress;
    }
    
    // ----- BACKGROUND PARALLAX -----
    bgLayers.forEach((layer, index) => {
      const depth = (index + 1) / CONFIG.parallaxLayers;
      const layerY = state.smoothScrollY * depth * 0.5;
      const layerOpacity = 1 - (easedProgress * 0.3 * depth);
      
      layer.style.transform = `translateY(${layerY}px)`;
      layer.style.opacity = Math.max(0.5, layerOpacity);
    });
    
    // ----- BODY CLASS FOR CSS HOOKS -----
    document.body.classList.toggle('hero-scrolled', progress > 0.1);
    document.body.classList.toggle('hero-half-scrolled', progress > 0.5);
    document.body.classList.toggle('hero-fully-scrolled', progress > 0.9);
  }

  // ============================================================================
  // UTILITY
  // ============================================================================
  
  function logDebug(...args) {
    if (CONFIG.debugMode) {
      console.log('[ScrollHero]', ...args);
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  
  window.FerniScrollHero = {
    init,
    getProgress: () => state.heroProgress,
    getState: () => ({ ...state }),
    setDebug: (enabled) => { CONFIG.debugMode = enabled; }
  };

  // ============================================================================
  // AUTO-INIT
  // ============================================================================
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

