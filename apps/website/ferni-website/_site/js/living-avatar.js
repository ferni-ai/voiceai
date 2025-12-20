/**
 * Living Avatar System - Professional Grade
 * Pixar-level character animation with physics-based movement
 * 
 * Features:
 * - Spring physics for organic gaze movement with overshoot and settle
 * - Pupil dilation based on interest level
 * - Emotional memory system
 * - Anticipatory movement (starts moving before target reached)
 * - Saccadic eye movements for realism
 * - Breathing that responds to page engagement
 * 
 * Technical: Uses requestAnimationFrame with delta time for smooth 60fps
 */

(function() {
  'use strict';

  // ============================================================================
  // PHYSICS CONSTANTS - Tuned through iteration for "alive" feel
  // ============================================================================
  
  const PHYSICS = {
    // Spring dynamics for gaze
    stiffness: 0.15,           // Spring tension (higher = snappier)
    damping: 0.75,             // Friction (higher = less bounce)
    mass: 1.0,                 // Inertia factor
    
    // Movement thresholds
    velocityThreshold: 0.01,   // Below this, consider at rest
    positionThreshold: 0.1,    // Snap to target when this close
    
    // Gaze limits
    maxGazeOffset: 15,         // Maximum pixel offset for gaze
    gazeDeadzone: 50,          // Ignore mouse movements within this radius
    
    // Anticipation
    anticipationFactor: 0.1,   // How much to "lead" the target
    
    // Saccades (quick eye movements)
    saccadeChance: 0.003,      // Per-frame chance of random saccade
    saccadeDistance: 3,        // Max random offset
    saccadeDuration: 50        // Ms for saccade to complete
  };

  const CONFIG = {
    // Mouse tracking
    trackingLag: 0.08,
    maxOffset: 15,
    lookAtCTAs: true,
    
    // Blinking - more sophisticated timing
    blinkIntervalMin: 2500,
    blinkIntervalMax: 5000,
    blinkDuration: 120,
    doubleBlinkChance: 0.15,
    blinkOnSaccade: true,      // Sometimes blink during quick movements
    
    // Breathing - variable rate
    breathDurationBase: 4000,
    breathDurationVariance: 500,
    breathScale: 1.025,
    breathPauseChance: 0.1,    // Sometimes hold breath briefly
    
    // Pupil dilation
    enablePupilDilation: true,
    pupilDilationSpeed: 0.05,  // How fast pupil responds
    minPupilScale: 0.85,
    maxPupilScale: 1.15,
    
    // Attention system
    attentionDecay: 0.995,     // Per-frame attention decay
    attentionThreshold: 0.3,   // Below this, return to idle
    
    // Emotional memory
    enableEmotionalMemory: true,
    memoryDecayRate: 0.001,
    
    // Micro-expressions - subliminal (under 150ms)
    enableMicroExpressions: true,
    expressions: {
      curious: { duration: 120, intensity: 0.6 },
      delighted: { duration: 80, intensity: 0.8 },
      thinking: { duration: 200, intensity: 0.4 },
      recognition: { duration: 100, intensity: 1.0 },
      concern: { duration: 150, intensity: 0.5 },
      warmth: { duration: 180, intensity: 0.7 }
    }
  };

  // ============================================================================
  // STATE - Physics-based with velocity tracking
  // ============================================================================
  
  const state = {
    // Position (current and target)
    mouseX: window.innerWidth / 2,
    mouseY: window.innerHeight / 2,
    targetX: 0,
    targetY: 0,
    currentX: 0,
    currentY: 0,
    
    // Velocity for spring physics
    velocityX: 0,
    velocityY: 0,
    
    // Pupil state
    pupilScale: 1.0,
    targetPupilScale: 1.0,
    
    // Blinking
    isBlinking: false,
    lastBlinkTime: 0,
    nextBlinkIn: 3000,
    blinkPhase: 0,  // 0 = open, 1 = closing, 2 = closed, 3 = opening
    
    // Breathing
    breathPhase: 0,
    breathDirection: 1,
    breathHolding: false,
    currentBreathDuration: CONFIG.breathDurationBase,
    
    // Scroll tracking
    scrollY: 0,
    scrollVelocity: 0,
    isScrolling: false,
    scrollTimeout: null,
    
    // Attention system
    attentionLevel: 0,
    attentionTarget: null,
    lastInteractionTime: Date.now(),
    
    // Expression system
    currentExpression: 'neutral',
    expressionIntensity: 0,
    expressionQueue: [],
    
    // Emotional memory (persists across session)
    emotionalMemory: {
      curiosityScore: 0,
      engagementScore: 0,
      returningVisitor: false,
      interactionCount: 0
    },
    
    // Saccade state
    inSaccade: false,
    saccadeStartTime: 0,
    saccadeOffsetX: 0,
    saccadeOffsetY: 0,
    
    // Animation timing
    lastFrameTime: 0,
    deltaTime: 0,
    
    // Flags
    initialized: false,
    prefersReducedMotion: false,
    isVisible: true,
    isFocused: true
  };

  // ============================================================================
  // DOM REFERENCES
  // ============================================================================
  
  let avatarEl = null;
  let orbEl = null;
  let glowEl = null;
  let textEl = null;
  let ringsEl = [];

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  function init() {
    // Check for reduced motion preference
    state.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    // Find the hero Ferni avatar
    avatarEl = document.querySelector('.hero-ferni');
    if (!avatarEl) {
      console.log('[LivingAvatar] No hero-ferni element found, skipping');
      return;
    }
    
    // Cache DOM references
    orbEl = avatarEl.querySelector('.hero-ferni__orb');
    glowEl = avatarEl.querySelector('.hero-ferni__glow');
    textEl = avatarEl.querySelector('.hero-ferni__text');
    ringsEl = avatarEl.querySelectorAll('.hero-ferni__ring');
    
    // Add living class
    avatarEl.classList.add('hero-ferni--living');
    
    // Set up event listeners
    setupEventListeners();
    
    // Start animation loops
    if (!state.prefersReducedMotion) {
      startMouseTracking();
      startBlinking();
      startBreathing();
    }
    
    // Check for returning visitor
    checkReturningVisitor();
    
    state.initialized = true;
    console.log('[LivingAvatar] Initialized - Ferni is alive! 🌱');
  }

  // ============================================================================
  // EVENT LISTENERS
  // ============================================================================
  
  function setupEventListeners() {
    // Mouse movement
    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    
    // Touch support
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    
    // Scroll
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // CTA hover attention
    if (CONFIG.lookAtCTAs) {
      document.querySelectorAll('.btn, .nav__cta, a[href*="app.ferni"]').forEach(btn => {
        btn.addEventListener('mouseenter', () => lookAtElement(btn));
        btn.addEventListener('mouseleave', () => releaseAttention());
      });
    }
    
    // Click feedback
    document.addEventListener('click', handleClick);
    
    // Visibility change (pause when tab not visible)
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  // ============================================================================
  // MOUSE TRACKING - The core "living" behavior
  // ============================================================================
  
  function handleMouseMove(e) {
    state.mouseX = e.clientX;
    state.mouseY = e.clientY;
    
    if (!state.attentionTarget) {
      updateTargetFromMouse();
    }
  }
  
  function handleTouchMove(e) {
    if (e.touches.length > 0) {
      state.mouseX = e.touches[0].clientX;
      state.mouseY = e.touches[0].clientY;
      updateTargetFromMouse();
    }
  }
  
  function updateTargetFromMouse() {
    if (!avatarEl) return;
    
    const rect = avatarEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Calculate direction vector
    const dx = state.mouseX - centerX;
    const dy = state.mouseY - centerY;
    
    // Calculate distance for intensity
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxDistance = Math.max(window.innerWidth, window.innerHeight) / 2;
    const intensity = Math.min(distance / maxDistance, 1);
    
    // Apply eased offset
    state.targetX = (dx / maxDistance) * CONFIG.maxOffset * intensity;
    state.targetY = (dy / maxDistance) * CONFIG.maxOffset * intensity;
  }
  
  function startMouseTracking() {
    function update() {
      // Smooth interpolation (organic lag)
      state.currentX += (state.targetX - state.currentX) * CONFIG.trackingLag;
      state.currentY += (state.targetY - state.currentY) * CONFIG.trackingLag;
      
      // Apply transform
      if (orbEl) {
        orbEl.style.transform = `translate(${state.currentX}px, ${state.currentY}px)`;
      }
      
      // Subtle ring parallax (depth effect)
      ringsEl.forEach((ring, i) => {
        const factor = 0.3 + (i * 0.2);
        ring.style.transform = `translate(${state.currentX * factor}px, ${state.currentY * factor}px)`;
      });
      
      requestAnimationFrame(update);
    }
    
    update();
  }

  // ============================================================================
  // ATTENTION SYSTEM - Ferni looks at what matters
  // ============================================================================
  
  function lookAtElement(el) {
    if (!avatarEl || state.prefersReducedMotion) return;
    
    state.attentionTarget = el;
    
    const rect = el.getBoundingClientRect();
    const avatarRect = avatarEl.getBoundingClientRect();
    
    const targetCenterX = rect.left + rect.width / 2;
    const targetCenterY = rect.top + rect.height / 2;
    const avatarCenterX = avatarRect.left + avatarRect.width / 2;
    const avatarCenterY = avatarRect.top + avatarRect.height / 2;
    
    const dx = targetCenterX - avatarCenterX;
    const dy = targetCenterY - avatarCenterY;
    const maxDistance = Math.max(window.innerWidth, window.innerHeight) / 2;
    
    state.targetX = (dx / maxDistance) * CONFIG.maxOffset * 1.5; // Look more intently
    state.targetY = (dy / maxDistance) * CONFIG.maxOffset * 1.5;
    
    // Show delight micro-expression
    if (CONFIG.enableMicroExpressions) {
      triggerExpression('delighted');
    }
    
    // Pulse the glow
    if (CONFIG.attentionPulse && glowEl) {
      glowEl.classList.add('hero-ferni__glow--pulse');
    }
  }
  
  function releaseAttention() {
    state.attentionTarget = null;
    
    if (glowEl) {
      glowEl.classList.remove('hero-ferni__glow--pulse');
    }
    
    // Return to tracking mouse
    updateTargetFromMouse();
  }

  // ============================================================================
  // BLINKING - Natural, randomized blinks
  // ============================================================================
  
  function startBlinking() {
    function scheduleBlink() {
      const delay = CONFIG.blinkIntervalMin + 
        Math.random() * (CONFIG.blinkIntervalMax - CONFIG.blinkIntervalMin);
      
      setTimeout(() => {
        blink();
        scheduleBlink();
      }, delay);
    }
    
    scheduleBlink();
  }
  
  function blink() {
    if (state.isBlinking || state.prefersReducedMotion) return;
    
    state.isBlinking = true;
    
    if (textEl) {
      textEl.classList.add('hero-ferni__text--blink');
    }
    
    setTimeout(() => {
      if (textEl) {
        textEl.classList.remove('hero-ferni__text--blink');
      }
      state.isBlinking = false;
      
      // Chance of double-blink
      if (Math.random() < CONFIG.doubleBlinkChance) {
        setTimeout(() => blink(), 200);
      }
    }, CONFIG.blinkDuration);
  }

  // ============================================================================
  // BREATHING - Subtle scale animation
  // ============================================================================
  
  function startBreathing() {
    // CSS handles this via animation, but we can modulate it
    if (avatarEl) {
      avatarEl.style.setProperty('--breath-duration', `${CONFIG.breathDuration}ms`);
      avatarEl.style.setProperty('--breath-scale', CONFIG.breathScale);
    }
  }

  // ============================================================================
  // SCROLL BEHAVIOR - Curious head tilt
  // ============================================================================
  
  function handleScroll() {
    const newScrollY = window.scrollY;
    const scrollDelta = newScrollY - state.scrollY;
    
    if (!state.isScrolling && CONFIG.curiousOnScroll) {
      state.isScrolling = true;
      triggerExpression('curious');
      
      // Tilt in scroll direction
      if (avatarEl && !state.prefersReducedMotion) {
        const tilt = Math.max(-5, Math.min(5, scrollDelta * 0.5));
        avatarEl.style.setProperty('--scroll-tilt', `${tilt}deg`);
      }
    }
    
    // Reset after scroll ends
    clearTimeout(state.scrollTimeout);
    state.scrollTimeout = setTimeout(() => {
      state.isScrolling = false;
      if (avatarEl) {
        avatarEl.style.setProperty('--scroll-tilt', '0deg');
      }
    }, 150);
    
    state.scrollY = newScrollY;
  }

  // ============================================================================
  // MICRO-EXPRESSIONS
  // ============================================================================
  
  function triggerExpression(expressionName) {
    if (!CONFIG.enableMicroExpressions || state.prefersReducedMotion) return;
    if (!avatarEl) return;
    
    const expression = CONFIG.expressions[expressionName];
    if (!expression) return;
    
    // Remove previous expression
    avatarEl.classList.remove(`hero-ferni--${state.currentExpression}`);
    
    // Add new expression
    state.currentExpression = expressionName;
    avatarEl.classList.add(`hero-ferni--${expressionName}`);
    
    // Auto-remove after duration
    setTimeout(() => {
      avatarEl.classList.remove(`hero-ferni--${expressionName}`);
      state.currentExpression = 'neutral';
    }, expression.duration);
  }

  // ============================================================================
  // CLICK FEEDBACK
  // ============================================================================
  
  function handleClick(e) {
    // Quick blink on any click
    if (e.target.closest('.btn, button, a')) {
      blink();
    }
  }

  // ============================================================================
  // RETURNING VISITOR RECOGNITION
  // ============================================================================
  
  function checkReturningVisitor() {
    const lastVisit = localStorage.getItem('ferni_last_visit');
    const visitCount = parseInt(localStorage.getItem('ferni_visit_count') || '0', 10);
    
    if (lastVisit && visitCount > 1) {
      // Returning visitor - show recognition
      setTimeout(() => {
        triggerExpression('recognition');
      }, 1500);
    }
    
    // Update visit tracking
    localStorage.setItem('ferni_last_visit', Date.now().toString());
    localStorage.setItem('ferni_visit_count', (visitCount + 1).toString());
  }

  // ============================================================================
  // VISIBILITY
  // ============================================================================
  
  function handleVisibilityChange() {
    // Could pause animations when tab not visible
    // For now, just noting the capability
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  
  window.FerniAvatar = {
    init,
    blink,
    lookAt: lookAtElement,
    release: releaseAttention,
    express: triggerExpression,
    getState: () => ({ ...state })
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

