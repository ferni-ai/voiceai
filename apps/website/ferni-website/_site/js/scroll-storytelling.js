/**
 * Scroll-Driven Storytelling
 * Cinematic scroll experiences with physics-based motion
 * 
 * Features:
 * - Parallax depth layers with damped spring physics
 * - Scroll momentum with natural deceleration
 * - Chapter indicators with progress
 * - Section pinning for narrative moments
 * - Content reveals with orchestrated stagger
 * - Smooth scroll velocity tracking
 * - Scroll-linked CSS variable animations
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
    enableChapterNumbers: true,
    enableStickyStory: true,
    enableCinematicTransitions: true,
    enableVelocityEffects: true,
    enableScrollLinkedCSS: true,
    parallaxIntensity: 0.3,       // How strong the parallax effect is
    momentumDecay: 0.92,          // How quickly momentum fades (lower = slower decay)
    smoothingFactor: 0.12,        // For smooth interpolation (higher = snappier)
    revealThreshold: 0.15,        // How much of element must be visible to trigger
    staggerDelay: 60,             // ms between staggered reveals
    velocitySmoothing: 0.2,       // Velocity interpolation factor
    maxVelocity: 50,              // Cap velocity for effects
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
  // STATE - Enhanced with physics tracking
  // ============================================================================
  
  const state = {
    // Position tracking
    scrollY: 0,
    lastScrollY: 0,
    smoothScrollY: 0,        // Interpolated scroll position for smooth effects
    targetScrollY: 0,
    
    // Velocity with smoothing
    velocity: 0,
    smoothVelocity: 0,       // Smoothed velocity for effects
    direction: 0,            // 1 = down, -1 = up
    
    // Momentum physics
    momentum: 0,
    isDecelerating: false,
    lastScrollTime: 0,
    
    // Page metrics
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
    docHeight: document.documentElement.scrollHeight,
    progress: 0,
    
    // Section tracking
    currentSection: null,
    currentSectionIndex: 0,
    sectionProgress: 0,      // Progress within current section
    
    // Elements
    revealed: new Set(),
    parallaxElements: [],
    stickyElements: [],
    
    // Animation frame
    lastFrameTime: 0,
    deltaTime: 0,
    
    // Flags
    initialized: false,
    prefersReducedMotion: false,
    ticking: false,
    isVisible: true
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
  // SCROLL HANDLER (Physics-based core loop)
  // ============================================================================
  
  function handleScroll() {
    const now = performance.now();
    const timeDelta = now - state.lastScrollTime;
    state.lastScrollTime = now;
    
    // Calculate raw velocity
    const newScrollY = window.scrollY;
    const rawVelocity = (newScrollY - state.scrollY) / Math.max(timeDelta, 16) * 16;
    
    // Smooth velocity with exponential moving average
    state.smoothVelocity = state.smoothVelocity + (rawVelocity - state.smoothVelocity) * CONFIG.velocitySmoothing;
    
    // Clamp velocity for effects
    state.velocity = Math.max(-CONFIG.maxVelocity, Math.min(CONFIG.maxVelocity, state.smoothVelocity));
    
    // Update positions
    state.lastScrollY = state.scrollY;
    state.scrollY = newScrollY;
    
    // Direction with hysteresis to prevent jitter
    if (Math.abs(state.velocity) > 0.5) {
      state.direction = state.velocity > 0 ? 1 : -1;
    }
    
    // Calculate progress
    const maxScroll = state.docHeight - state.viewportHeight;
    state.progress = maxScroll > 0 ? state.scrollY / maxScroll : 0;
    
    // Update momentum
    if (Math.abs(state.velocity) > 1) {
      state.momentum = state.velocity * 0.5;
      state.isDecelerating = false;
    } else if (Math.abs(state.momentum) > 0.1) {
      state.momentum *= CONFIG.momentumDecay;
      state.isDecelerating = true;
    } else {
      state.momentum = 0;
      state.isDecelerating = false;
    }
    
    // Request animation frame for smooth updates
    if (!state.ticking) {
      state.ticking = true;
      requestAnimationFrame(updateFrame);
    }
  }
  
  function updateFrame(timestamp) {
    // Calculate delta time
    state.deltaTime = state.lastFrameTime ? (timestamp - state.lastFrameTime) / 16.67 : 1;
    state.lastFrameTime = timestamp;
    
    // Smooth scroll position for effects
    state.smoothScrollY += (state.scrollY - state.smoothScrollY) * CONFIG.smoothingFactor * state.deltaTime;
    
    // Update all systems
    if (CONFIG.enableParallax && !state.prefersReducedMotion) {
      updateParallax();
    }
    
    if (CONFIG.enableProgressIndicator) {
      updateProgressIndicator();
    }
    
    if (CONFIG.enableStickyStory) {
      updateStickyStory();
    }
    
    if (CONFIG.enableScrollLinkedCSS) {
      updateScrollLinkedCSS();
    }
    
    // Track current section
    updateCurrentSection();
    
    // Continue animation if momentum
    if (state.isDecelerating && Math.abs(state.momentum) > 0.1) {
      requestAnimationFrame(updateFrame);
    } else {
      state.ticking = false;
    }
  }
  
  function updateScrollLinkedCSS() {
    const root = document.documentElement;
    
    // Set scroll-linked CSS variables
    root.style.setProperty('--scroll-progress', state.progress.toFixed(4));
    root.style.setProperty('--scroll-velocity', (state.velocity / CONFIG.maxVelocity).toFixed(4));
    root.style.setProperty('--scroll-direction', state.direction.toString());
    root.style.setProperty('--scroll-y', state.scrollY + 'px');
    
    // Section-specific variables
    root.style.setProperty('--section-progress', state.sectionProgress.toFixed(4));
    root.style.setProperty('--section-index', state.currentSectionIndex.toString());
  }
  
  function handleResize() {
    updateMetrics();
    cacheElements();
    
    // Recalculate positions
    if (CONFIG.enableChapterNumbers) {
      updateChapterPositions();
    }
  }

  // ============================================================================
  // PARALLAX SYSTEM - With momentum physics
  // ============================================================================
  
  const parallaxState = new Map(); // Per-element smooth positions
  
  function setupParallax() {
    // Add data attributes to hero elements for depth layering
    const heroOrbs = document.querySelectorAll('.hero__bg-orb');
    heroOrbs.forEach((orb, i) => {
      orb.dataset.parallaxSpeed = (0.1 + i * 0.15).toString();
      orb.dataset.parallaxDirection = i % 2 === 0 ? '1' : '-1';
      orb.dataset.parallaxRotate = 'true'; // Enable rotation effect
      
      // Initialize smooth state
      parallaxState.set(orb, { y: 0, rotate: 0 });
    });
    
    // Ferni avatar has its own parallax (more subtle)
    const ferni = document.querySelector('.hero-ferni');
    if (ferni) {
      ferni.dataset.parallaxSpeed = '0.05';
      ferni.dataset.parallaxFloat = 'true'; // Floating effect
      parallaxState.set(ferni, { y: 0, rotate: 0 });
    }
    
    // Background elements
    document.querySelectorAll('[data-parallax]').forEach(el => {
      parallaxState.set(el, { y: 0, rotate: 0 });
    });
  }
  
  function updateParallax() {
    const scrollProgress = state.smoothScrollY / state.viewportHeight;
    const velocityFactor = state.velocity / CONFIG.maxVelocity;
    
    state.parallaxElements.forEach(el => {
      const speed = parseFloat(el.dataset.parallaxSpeed) || 0.2;
      const direction = parseFloat(el.dataset.parallaxDirection) || 1;
      const enableRotate = el.dataset.parallaxRotate === 'true';
      const enableFloat = el.dataset.parallaxFloat === 'true';
      
      // Target position
      const targetY = state.smoothScrollY * speed * direction * CONFIG.parallaxIntensity;
      
      // Get or create smooth state for this element
      let smoothState = parallaxState.get(el) || { y: 0, rotate: 0 };
      
      // Smooth interpolation with momentum
      const smoothing = CONFIG.smoothingFactor * state.deltaTime;
      smoothState.y += (targetY - smoothState.y) * smoothing;
      
      // Velocity-based effects
      let transform = `translateY(${smoothState.y.toFixed(2)}px)`;
      
      // Subtle skew based on velocity (momentum feel)
      if (CONFIG.enableVelocityEffects && Math.abs(velocityFactor) > 0.1) {
        const skew = velocityFactor * 1.5;
        transform += ` skewY(${skew.toFixed(2)}deg)`;
      }
      
      // Rotation effect for decorative elements
      if (enableRotate) {
        const targetRotate = state.smoothScrollY * 0.02 * direction;
        smoothState.rotate += (targetRotate - smoothState.rotate) * smoothing * 0.5;
        transform += ` rotate(${smoothState.rotate.toFixed(2)}deg)`;
      }
      
      // Floating effect (subtle sine wave)
      if (enableFloat) {
        const floatOffset = Math.sin(state.smoothScrollY * 0.002) * 5;
        transform += ` translateY(${floatOffset.toFixed(2)}px)`;
      }
      
      el.style.transform = transform;
      
      parallaxState.set(el, smoothState);
    });
    
    // Hero content fade and scale
    const hero = document.querySelector('.hero__content');
    if (hero) {
      const fadeStart = 0;
      const fadeEnd = 0.6;
      const progress = Math.min(1, Math.max(0, (scrollProgress - fadeStart) / (fadeEnd - fadeStart)));
      
      // Use easing for cinematic feel
      const easedProgress = EASING.smooth(progress);
      const opacity = 1 - easedProgress;
      const scale = 1 - easedProgress * 0.15;
      const translateY = easedProgress * 50;
      
      hero.style.opacity = opacity.toFixed(3);
      hero.style.transform = `scale(${scale.toFixed(3)}) translateY(${translateY.toFixed(1)}px)`;
    }
  }

  // ============================================================================
  // PROGRESS INDICATOR WITH CHAPTER NUMBERS
  // ============================================================================
  
  function createProgressIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'scroll-progress';
    indicator.setAttribute('role', 'navigation');
    indicator.setAttribute('aria-label', 'Page sections');
    
    indicator.innerHTML = `
      <div class="scroll-progress__track">
        <div class="scroll-progress__fill"></div>
        <div class="scroll-progress__glow"></div>
      </div>
      <div class="scroll-progress__chapters"></div>
      <div class="scroll-progress__current">
        <span class="scroll-progress__chapter-num">01</span>
        <span class="scroll-progress__chapter-title"></span>
      </div>
    `;
    document.body.appendChild(indicator);
    
    // Add chapter markers with numbers
    const chaptersContainer = indicator.querySelector('.scroll-progress__chapters');
    state.sections.forEach((section, i) => {
      const sectionTitle = section.querySelector('h2, .section-title')?.textContent || 
                          section.dataset.title || 
                          formatSectionId(section.id);
      
      const marker = document.createElement('button');
      marker.className = 'scroll-progress__marker';
      marker.dataset.section = section.id;
      marker.dataset.index = i.toString();
      marker.setAttribute('aria-label', `Go to ${sectionTitle}`);
      
      marker.innerHTML = `
        <span class="scroll-progress__marker-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="scroll-progress__marker-dot"></span>
        <span class="scroll-progress__marker-label">${sectionTitle}</span>
      `;
      
      // Click to scroll
      marker.addEventListener('click', () => {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      
      chaptersContainer.appendChild(marker);
    });
    
    state.progressIndicator = indicator;
  }
  
  function formatSectionId(id) {
    // Convert "about-us" to "About Us"
    return id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  
  function updateProgressIndicator() {
    if (!state.progressIndicator) return;
    
    const fill = state.progressIndicator.querySelector('.scroll-progress__fill');
    const glow = state.progressIndicator.querySelector('.scroll-progress__glow');
    
    if (fill) {
      // Smooth fill with velocity-based glow
      fill.style.transform = `scaleY(${state.progress})`;
      
      // Glow intensity based on scroll velocity
      if (glow && CONFIG.enableVelocityEffects) {
        const glowIntensity = Math.min(1, Math.abs(state.velocity) / 20);
        glow.style.opacity = glowIntensity.toFixed(3);
        glow.style.transform = `scaleY(${state.progress})`;
      }
    }
    
    // Update active chapter marker
    const markers = state.progressIndicator.querySelectorAll('.scroll-progress__marker');
    markers.forEach((marker, i) => {
      const sectionId = marker.dataset.section;
      const isActive = sectionId === state.currentSection?.id;
      const isPassed = i < state.currentSectionIndex;
      
      marker.classList.toggle('is-active', isActive);
      marker.classList.toggle('is-passed', isPassed);
    });
    
    // Update current chapter display
    updateCurrentChapterDisplay();
  }
  
  function updateCurrentChapterDisplay() {
    if (!state.progressIndicator || !state.currentSection) return;
    
    const numEl = state.progressIndicator.querySelector('.scroll-progress__chapter-num');
    const titleEl = state.progressIndicator.querySelector('.scroll-progress__chapter-title');
    
    if (numEl) {
      numEl.textContent = String(state.currentSectionIndex + 1).padStart(2, '0');
    }
    
    if (titleEl) {
      const title = state.currentSection.querySelector('h2, .section-title')?.textContent ||
                   state.currentSection.dataset.title ||
                   formatSectionId(state.currentSection.id);
      titleEl.textContent = title;
    }
  }
  
  function updateChapterPositions() {
    // Recalculate marker positions after resize
    const markers = state.progressIndicator?.querySelectorAll('.scroll-progress__marker');
    if (!markers) return;
    
    markers.forEach((marker, i) => {
      const section = state.sections[i];
      if (section) {
        const sectionTop = section.offsetTop;
        const progress = sectionTop / (state.docHeight - state.viewportHeight);
        marker.style.setProperty('--marker-position', `${progress * 100}%`);
      }
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
  // SECTION TRACKING - With progress calculation
  // ============================================================================
  
  function updateCurrentSection() {
    const viewportMiddle = state.scrollY + state.viewportHeight / 2;
    
    let currentSection = null;
    let currentIndex = 0;
    let minDistance = Infinity;
    
    state.sections.forEach((section, i) => {
      const rect = section.getBoundingClientRect();
      const sectionTop = state.scrollY + rect.top;
      const sectionMiddle = sectionTop + rect.height / 2;
      const distance = Math.abs(viewportMiddle - sectionMiddle);
      
      if (distance < minDistance) {
        minDistance = distance;
        currentSection = section;
        currentIndex = i;
      }
    });
    
    // Calculate progress within current section
    if (currentSection) {
      const rect = currentSection.getBoundingClientRect();
      const sectionTop = state.scrollY + rect.top;
      const sectionHeight = rect.height;
      
      // Progress: 0 when section enters, 1 when section leaves
      const relativeScroll = state.scrollY - sectionTop + state.viewportHeight * 0.3;
      state.sectionProgress = Math.max(0, Math.min(1, relativeScroll / sectionHeight));
    }
    
    if (currentSection !== state.currentSection) {
      const previousSection = state.currentSection;
      const previousIndex = state.currentSectionIndex;
      
      // Update state
      state.currentSection = currentSection;
      state.currentSectionIndex = currentIndex;
      
      // Update classes
      if (previousSection) {
        previousSection.classList.remove('is-current-section');
        previousSection.classList.add('is-passed-section');
      }
      
      currentSection?.classList.add('is-current-section');
      currentSection?.classList.remove('is-passed-section');
      
      // Dispatch event for other systems
      document.dispatchEvent(new CustomEvent('section-change', {
        detail: { 
          section: currentSection,
          index: currentIndex,
          previousSection,
          previousIndex,
          direction: currentIndex > previousIndex ? 'down' : 'up'
        }
      }));
      
      logDebug('Section changed to:', currentSection?.id, `(${currentIndex + 1}/${state.sections.length})`);
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

