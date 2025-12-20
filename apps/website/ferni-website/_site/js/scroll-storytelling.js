/**
 * 🎬 Scroll-Driven Storytelling
 * Apple-style cinematic scroll experiences
 * 
 * Features:
 * - Parallax depth layers in hero
 * - Scroll-linked progress animations
 * - Section transitions with momentum physics
 * - Content reveals with stagger timing
 * - "Sticky storytelling" sections
 * - Progress indicator that shows journey
 * 
 * Philosophy: The page is a story. Scrolling is reading. Every section is a chapter.
 */

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  const CONFIG = {
    enableParallax: true,
    enableMomentum: true,
    enableProgressIndicator: true,
    enableStickyStory: true,
    enableCinematicTransitions: true,
    parallaxIntensity: 0.3,      // How strong the parallax effect is
    momentumDecay: 0.95,          // How quickly momentum fades
    revealThreshold: 0.15,        // How much of element must be visible to trigger
    staggerDelay: 80,             // ms between staggered reveals
    debugMode: false
  };

  // ============================================================================
  // EASING FUNCTIONS (Pixar-quality curves)
  // ============================================================================
  
  const EASING = {
    // Dramatic deceleration (Apple's favorite)
    expoOut: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
    
    // Spring with overshoot (Pixar bounce)
    spring: t => {
      const c4 = (2 * Math.PI) / 3;
      return t === 0 ? 0 : t === 1 ? 1 : 
        Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
    
    // Smooth in-out
    smooth: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
    
    // Cinematic (slow start, fast middle, slow end)
    cinematic: t => {
      if (t < 0.2) return 2.5 * t * t;
      if (t > 0.8) return 1 - Math.pow(-2 * t + 2, 2) / 2 + 0.5;
      return 0.1 + (t - 0.2) * 1.33;
    }
  };

  // ============================================================================
  // STATE
  // ============================================================================
  
  const state = {
    scrollY: 0,
    lastScrollY: 0,
    velocity: 0,
    direction: 0, // 1 = down, -1 = up
    viewportHeight: window.innerHeight,
    docHeight: document.documentElement.scrollHeight,
    progress: 0,
    currentSection: null,
    revealed: new Set(),
    parallaxElements: [],
    stickyElements: [],
    initialized: false,
    prefersReducedMotion: false,
    ticking: false
  };

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  function init() {
    state.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    // Cache elements
    cacheElements();
    
    // Set up systems
    if (CONFIG.enableParallax && !state.prefersReducedMotion) {
      setupParallax();
    }
    
    if (CONFIG.enableProgressIndicator) {
      createProgressIndicator();
    }
    
    if (CONFIG.enableCinematicTransitions) {
      setupCinematicReveals();
    }
    
    if (CONFIG.enableStickyStory) {
      setupStickyStory();
    }
    
    // Scroll listener
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
    
    // Initial update
    updateMetrics();
    handleScroll();
    
    state.initialized = true;
    logDebug('Scroll Storytelling initialized');
  }

  // ============================================================================
  // ELEMENT CACHING
  // ============================================================================
  
  function cacheElements() {
    // Parallax elements
    state.parallaxElements = [
      ...document.querySelectorAll('[data-parallax]'),
      ...document.querySelectorAll('.hero__bg-orb'),
      ...document.querySelectorAll('.hero-ferni')
    ];
    
    // Sticky story elements
    state.stickyElements = document.querySelectorAll('[data-sticky-story]');
    
    // Sections for progress tracking
    state.sections = document.querySelectorAll('section[id]');
  }
  
  function updateMetrics() {
    state.viewportHeight = window.innerHeight;
    state.docHeight = document.documentElement.scrollHeight;
  }

  // ============================================================================
  // SCROLL HANDLER (The core loop)
  // ============================================================================
  
  function handleScroll() {
    if (state.ticking) return;
    
    state.ticking = true;
    requestAnimationFrame(() => {
      state.lastScrollY = state.scrollY;
      state.scrollY = window.scrollY;
      state.velocity = state.scrollY - state.lastScrollY;
      state.direction = state.velocity > 0 ? 1 : state.velocity < 0 ? -1 : 0;
      state.progress = state.scrollY / (state.docHeight - state.viewportHeight);
      
      // Update all systems
      if (CONFIG.enableParallax && !state.prefersReducedMotion) {
        updateParallax();
      }
      
      if (CONFIG.enableProgressIndicator) {
        updateProgressIndicator();
      }
      
      // Cinematic reveals handled by Intersection Observer (setupCinematicReveals)
      
      if (CONFIG.enableStickyStory) {
        updateStickyStory();
      }
      
      // Track current section
      updateCurrentSection();
      
      state.ticking = false;
    });
  }
  
  function handleResize() {
    updateMetrics();
    cacheElements();
  }

  // ============================================================================
  // PARALLAX SYSTEM
  // ============================================================================
  
  function setupParallax() {
    // Add data attributes to hero elements for depth layering
    const heroOrbs = document.querySelectorAll('.hero__bg-orb');
    heroOrbs.forEach((orb, i) => {
      orb.dataset.parallaxSpeed = (0.1 + i * 0.15).toString();
      orb.dataset.parallaxDirection = i % 2 === 0 ? '1' : '-1';
    });
    
    // Ferni avatar has its own parallax
    const ferni = document.querySelector('.hero-ferni');
    if (ferni) {
      ferni.dataset.parallaxSpeed = '0.08';
    }
  }
  
  function updateParallax() {
    const scrollProgress = state.scrollY / state.viewportHeight;
    
    state.parallaxElements.forEach(el => {
      const speed = parseFloat(el.dataset.parallaxSpeed) || 0.2;
      const direction = parseFloat(el.dataset.parallaxDirection) || 1;
      const offset = state.scrollY * speed * direction * CONFIG.parallaxIntensity;
      
      // Add velocity-based skew for momentum feel
      const skew = CONFIG.enableMomentum ? state.velocity * 0.02 : 0;
      
      el.style.transform = `translateY(${offset}px) skewY(${skew}deg)`;
    });
    
    // Hero fade out on scroll
    const hero = document.querySelector('.hero__content');
    if (hero) {
      const fadeStart = 0;
      const fadeEnd = 0.5;
      const opacity = 1 - Math.min(1, Math.max(0, (scrollProgress - fadeStart) / (fadeEnd - fadeStart)));
      const scale = 1 - (1 - opacity) * 0.1;
      
      hero.style.opacity = opacity;
      hero.style.transform = `scale(${scale})`;
    }
  }

  // ============================================================================
  // PROGRESS INDICATOR
  // ============================================================================
  
  function createProgressIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'scroll-progress';
    indicator.innerHTML = `
      <div class="scroll-progress__track">
        <div class="scroll-progress__fill"></div>
      </div>
      <div class="scroll-progress__sections"></div>
    `;
    document.body.appendChild(indicator);
    
    // Add section markers
    const sectionsContainer = indicator.querySelector('.scroll-progress__sections');
    state.sections.forEach((section, i) => {
      const marker = document.createElement('div');
      marker.className = 'scroll-progress__marker';
      marker.dataset.section = section.id;
      marker.title = section.querySelector('h2')?.textContent || section.id;
      sectionsContainer.appendChild(marker);
    });
    
    state.progressIndicator = indicator;
  }
  
  function updateProgressIndicator() {
    if (!state.progressIndicator) return;
    
    const fill = state.progressIndicator.querySelector('.scroll-progress__fill');
    if (fill) {
      fill.style.transform = `scaleY(${state.progress})`;
    }
    
    // Update active section marker
    const markers = state.progressIndicator.querySelectorAll('.scroll-progress__marker');
    markers.forEach(marker => {
      const sectionId = marker.dataset.section;
      marker.classList.toggle('is-active', sectionId === state.currentSection?.id);
    });
  }

  // ============================================================================
  // CINEMATIC REVEALS
  // ============================================================================
  
  function setupCinematicReveals() {
    // Find all revealable elements
    const revealables = document.querySelectorAll(
      '.section, .card, .testimonial, .feature, .pricing-card, .faq-item, ' +
      '[data-reveal], .reveal-cinematic'
    );
    
    revealables.forEach((el, i) => {
      if (!el.classList.contains('hero')) {
        el.classList.add('cinematic-reveal');
        el.style.setProperty('--reveal-index', i.toString());
      }
    });
    
    // Set up intersection observer
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !state.revealed.has(entry.target)) {
          revealElement(entry.target);
          state.revealed.add(entry.target);
        }
      });
    }, {
      threshold: CONFIG.revealThreshold,
      rootMargin: '0px 0px -50px 0px'
    });
    
    revealables.forEach(el => observer.observe(el));
  }
  
  function revealElement(el) {
    // Calculate stagger delay based on position in viewport
    const rect = el.getBoundingClientRect();
    const viewportCenter = state.viewportHeight / 2;
    const elementCenter = rect.top + rect.height / 2;
    const distanceFromCenter = Math.abs(elementCenter - viewportCenter);
    const normalizedDistance = distanceFromCenter / state.viewportHeight;
    
    // Elements closer to center reveal first
    const delay = normalizedDistance * 200;
    
    setTimeout(() => {
      el.classList.add('is-revealed');
      
      // Reveal children with stagger
      const children = el.querySelectorAll('.reveal-child, [data-reveal-child]');
      children.forEach((child, i) => {
        setTimeout(() => {
          child.classList.add('is-revealed');
        }, i * CONFIG.staggerDelay);
      });
    }, delay);
  }

  // ============================================================================
  // STICKY STORY SECTIONS
  // ============================================================================
  
  function setupStickyStory() {
    // Find sticky story containers (like the memory demo)
    const containers = document.querySelectorAll('[data-sticky-story]');
    
    containers.forEach(container => {
      const stages = container.querySelectorAll('[data-story-stage]');
      container.dataset.totalStages = stages.length.toString();
    });
  }
  
  function updateStickyStory() {
    const containers = document.querySelectorAll('[data-sticky-story]');
    
    containers.forEach(container => {
      const rect = container.getBoundingClientRect();
      const containerHeight = rect.height;
      const containerTop = rect.top;
      
      // Calculate progress through the sticky section
      const progress = Math.max(0, Math.min(1, 
        -containerTop / (containerHeight - state.viewportHeight)
      ));
      
      // Determine current stage
      const totalStages = parseInt(container.dataset.totalStages) || 1;
      const currentStage = Math.floor(progress * totalStages);
      
      // Update stages
      const stages = container.querySelectorAll('[data-story-stage]');
      stages.forEach((stage, i) => {
        const isActive = i <= currentStage;
        const isCurrent = i === currentStage;
        stage.classList.toggle('is-active', isActive);
        stage.classList.toggle('is-current', isCurrent);
        
        // Calculate per-stage progress
        const stageProgress = (progress * totalStages) - i;
        stage.style.setProperty('--stage-progress', Math.max(0, Math.min(1, stageProgress)).toString());
      });
      
      container.style.setProperty('--story-progress', progress.toString());
    });
  }

  // ============================================================================
  // SECTION TRACKING
  // ============================================================================
  
  function updateCurrentSection() {
    const viewportMiddle = state.scrollY + state.viewportHeight / 2;
    
    let currentSection = null;
    let minDistance = Infinity;
    
    state.sections.forEach(section => {
      const rect = section.getBoundingClientRect();
      const sectionMiddle = state.scrollY + rect.top + rect.height / 2;
      const distance = Math.abs(viewportMiddle - sectionMiddle);
      
      if (distance < minDistance) {
        minDistance = distance;
        currentSection = section;
      }
    });
    
    if (currentSection !== state.currentSection) {
      // Section changed
      if (state.currentSection) {
        state.currentSection.classList.remove('is-current-section');
      }
      
      currentSection?.classList.add('is-current-section');
      state.currentSection = currentSection;
      
      // Dispatch event for other systems
      document.dispatchEvent(new CustomEvent('section-change', {
        detail: { section: currentSection }
      }));
      
      logDebug('Section changed to:', currentSection?.id);
    }
  }

  // ============================================================================
  // UTILITY
  // ============================================================================
  
  function logDebug(...args) {
    if (CONFIG.debugMode) {
      console.log('[ScrollStory]', ...args);
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  
  window.FerniScrollStory = {
    init,
    getState: () => ({ ...state }),
    getProgress: () => state.progress,
    getCurrentSection: () => state.currentSection,
    scrollToSection: (sectionId, smooth = true) => {
      const section = document.getElementById(sectionId);
      if (section) {
        section.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
      }
    },
    reveal: revealElement
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

