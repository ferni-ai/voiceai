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
    
    // Listen for changes to motion preference
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      state.prefersReducedMotion = e.matches;
    });
    
    // Find the hero Ferni avatar
    avatarEl = document.querySelector('.hero-ferni');
    if (!avatarEl) {
      // Try alternate selectors
      avatarEl = document.querySelector('[data-ferni-avatar]');
      if (!avatarEl) {
        logDebug('No avatar element found, skipping initialization');
        return;
      }
    }
    
    // Cache DOM references
    orbEl = avatarEl.querySelector('.hero-ferni__orb') || avatarEl.querySelector('[data-orb]');
    glowEl = avatarEl.querySelector('.hero-ferni__glow') || avatarEl.querySelector('[data-glow]');
    textEl = avatarEl.querySelector('.hero-ferni__text') || avatarEl.querySelector('[data-text]');
    ringsEl = avatarEl.querySelectorAll('.hero-ferni__ring, [data-ring]');
    
    // Add living class
    avatarEl.classList.add('hero-ferni--living');
    
    // Load emotional memory from session
    loadEmotionalMemory();
    
    // Set up event listeners
    setupEventListeners();
    
    // Start unified animation loop (replaces separate loops)
    if (!state.prefersReducedMotion) {
      startAnimationLoop();
      startBlinking();
      startBreathing();
    }
    
    // Check for returning visitor
    checkReturningVisitor();
    
    // Track visibility
    setupVisibilityTracking();
    
    state.initialized = true;
    logDebug('Avatar initialized with spring physics');
  }
  
  function loadEmotionalMemory() {
    if (!CONFIG.enableEmotionalMemory) return;
    
    try {
      const stored = sessionStorage.getItem('ferni_emotional_memory');
      if (stored) {
        const memory = JSON.parse(stored);
        state.emotionalMemory = { ...state.emotionalMemory, ...memory };
        state.emotionalMemory.interactionCount++;
      }
    } catch (e) {
      logDebug('Could not load emotional memory');
    }
  }
  
  function saveEmotionalMemory() {
    if (!CONFIG.enableEmotionalMemory) return;
    
    try {
      sessionStorage.setItem('ferni_emotional_memory', JSON.stringify(state.emotionalMemory));
    } catch (e) {
      logDebug('Could not save emotional memory');
    }
  }
  
  function setupVisibilityTracking() {
    // Pause animations when tab not visible
    document.addEventListener('visibilitychange', () => {
      state.isVisible = document.visibilityState === 'visible';
      if (state.isVisible) {
        // Reset timing on visibility restore
        state.lastFrameTime = performance.now();
      }
    });
    
    // Track window focus
    window.addEventListener('focus', () => { state.isFocused = true; });
    window.addEventListener('blur', () => { state.isFocused = false; });
  }
  
  function logDebug(...args) {
    if (window.FERNI_DEBUG) {
      console.log('[LivingAvatar]', ...args);
    }
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
  // MOUSE TRACKING - Spring physics for organic movement
  // ============================================================================
  
  function handleMouseMove(e) {
    state.mouseX = e.clientX;
    state.mouseY = e.clientY;
    
    // Update attention based on movement
    state.attentionLevel = Math.min(1, state.attentionLevel + 0.1);
    state.lastInteractionTime = Date.now();
    
    if (!state.attentionTarget) {
      updateTargetFromMouse();
    }
    
    // Update pupil dilation based on cursor speed
    if (CONFIG.enablePupilDilation) {
      const speed = Math.sqrt(
        Math.pow(e.movementX || 0, 2) + 
        Math.pow(e.movementY || 0, 2)
      );
      // Fast movement = slight dilation (alertness)
      state.targetPupilScale = 1.0 + Math.min(speed / 100, 0.15);
    }
  }
  
  function handleTouchMove(e) {
    if (e.touches.length > 0) {
      state.mouseX = e.touches[0].clientX;
      state.mouseY = e.touches[0].clientY;
      state.attentionLevel = Math.min(1, state.attentionLevel + 0.15);
      updateTargetFromMouse();
    }
  }
  
  function updateTargetFromMouse() {
    if (!avatarEl) return;
    
    const rect = avatarEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const dx = state.mouseX - centerX;
    const dy = state.mouseY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Deadzone - ignore very small movements
    if (distance < PHYSICS.gazeDeadzone) {
      return;
    }
    
    const maxDistance = Math.max(window.innerWidth, window.innerHeight) / 2;
    
    // Non-linear intensity curve (more responsive at edges)
    const normalizedDist = Math.min(distance / maxDistance, 1);
    const intensity = easeOutCubic(normalizedDist);
    
    // Calculate target with anticipation
    const anticipatedX = dx + (dx - state.targetX * maxDistance / PHYSICS.maxGazeOffset) * PHYSICS.anticipationFactor;
    const anticipatedY = dy + (dy - state.targetY * maxDistance / PHYSICS.maxGazeOffset) * PHYSICS.anticipationFactor;
    
    state.targetX = (anticipatedX / maxDistance) * PHYSICS.maxGazeOffset * intensity;
    state.targetY = (anticipatedY / maxDistance) * PHYSICS.maxGazeOffset * intensity;
  }
  
  // Easing function for natural movement
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }
  
  function startAnimationLoop() {
    let lastTime = performance.now();
    
    function update(currentTime) {
      // Calculate delta time for frame-rate independent animation
      state.deltaTime = Math.min((currentTime - lastTime) / 16.67, 2); // Cap at 2x normal
      lastTime = currentTime;
      
      if (!state.prefersReducedMotion && state.isVisible) {
        updateGazePhysics();
        updatePupil();
        updateBreathing();
        updateAttention();
        updateSaccades();
        applyTransforms();
      }
      
      requestAnimationFrame(update);
    }
    
    requestAnimationFrame(update);
  }
  
  function updateGazePhysics() {
    // Spring physics: F = -kx - cv
    // where k = stiffness, x = displacement, c = damping, v = velocity
    
    const dx = state.targetX - state.currentX;
    const dy = state.targetY - state.currentY;
    
    // Spring force
    const forceX = dx * PHYSICS.stiffness;
    const forceY = dy * PHYSICS.stiffness;
    
    // Apply force to velocity (with damping)
    state.velocityX = (state.velocityX + forceX) * PHYSICS.damping;
    state.velocityY = (state.velocityY + forceY) * PHYSICS.damping;
    
    // Apply velocity to position
    state.currentX += state.velocityX * state.deltaTime;
    state.currentY += state.velocityY * state.deltaTime;
    
    // Snap to target if very close and slow
    const speed = Math.sqrt(state.velocityX * state.velocityX + state.velocityY * state.velocityY);
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (speed < PHYSICS.velocityThreshold && dist < PHYSICS.positionThreshold) {
      state.currentX = state.targetX;
      state.currentY = state.targetY;
      state.velocityX = 0;
      state.velocityY = 0;
    }
  }
  
  function updatePupil() {
    if (!CONFIG.enablePupilDilation) return;
    
    // Smooth pupil dilation
    state.pupilScale += (state.targetPupilScale - state.pupilScale) * CONFIG.pupilDilationSpeed * state.deltaTime;
    
    // Clamp
    state.pupilScale = Math.max(CONFIG.minPupilScale, Math.min(CONFIG.maxPupilScale, state.pupilScale));
    
    // Decay target back to normal
    state.targetPupilScale += (1.0 - state.targetPupilScale) * 0.02 * state.deltaTime;
  }
  
  function updateSaccades() {
    // Random micro-saccades for realism
    if (!state.inSaccade && Math.random() < PHYSICS.saccadeChance * state.deltaTime) {
      state.inSaccade = true;
      state.saccadeStartTime = performance.now();
      state.saccadeOffsetX = (Math.random() - 0.5) * PHYSICS.saccadeDistance * 2;
      state.saccadeOffsetY = (Math.random() - 0.5) * PHYSICS.saccadeDistance * 2;
      
      // Sometimes blink during saccade
      if (CONFIG.blinkOnSaccade && Math.random() < 0.3) {
        blink();
      }
    }
    
    if (state.inSaccade) {
      const elapsed = performance.now() - state.saccadeStartTime;
      if (elapsed > PHYSICS.saccadeDuration) {
        state.inSaccade = false;
        state.saccadeOffsetX = 0;
        state.saccadeOffsetY = 0;
      }
    }
  }
  
  function updateAttention() {
    // Decay attention over time
    state.attentionLevel *= Math.pow(CONFIG.attentionDecay, state.deltaTime);
    
    // Trigger idle behaviors when attention is low
    if (state.attentionLevel < CONFIG.attentionThreshold) {
      // Occasional "looking around"
      if (Math.random() < 0.001 * state.deltaTime) {
        const randomX = (Math.random() - 0.5) * PHYSICS.maxGazeOffset;
        const randomY = (Math.random() - 0.5) * PHYSICS.maxGazeOffset * 0.5;
        state.targetX = randomX;
        state.targetY = randomY;
      }
    }
  }
  
  function applyTransforms() {
    if (!orbEl) return;
    
    // Combine gaze position with saccade offset
    const finalX = state.currentX + state.saccadeOffsetX;
    const finalY = state.currentY + state.saccadeOffsetY;
    
    // Apply to orb with subtle 3D rotation for depth
    const rotateY = finalX * 0.3;
    const rotateX = -finalY * 0.3;
    
    orbEl.style.transform = `
      translate(${finalX}px, ${finalY}px)
      rotateX(${rotateX}deg)
      rotateY(${rotateY}deg)
      scale(${state.pupilScale})
    `;
    
    // Parallax rings with depth layering
    ringsEl.forEach((ring, i) => {
      const depth = 0.3 + (i * 0.15);
      const ringX = finalX * depth;
      const ringY = finalY * depth;
      const ringRotate = finalX * 0.1 * (i + 1);
      ring.style.transform = `translate(${ringX}px, ${ringY}px) rotate(${ringRotate}deg)`;
    });
    
    // Glow follows with even more lag (atmospheric)
    if (glowEl) {
      const glowX = finalX * 0.15;
      const glowY = finalY * 0.15;
      glowEl.style.transform = `translate(${glowX}px, ${glowY}px)`;
    }
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
  // BREATHING - Variable rate with natural pauses
  // ============================================================================
  
  function updateBreathing() {
    if (!avatarEl) return;
    
    // Breathing phase progression (0 to 1 to 0)
    const breathSpeed = (1 / state.currentBreathDuration) * 16.67 * state.deltaTime;
    
    if (!state.breathHolding) {
      state.breathPhase += breathSpeed * state.breathDirection;
      
      // Reverse direction at peaks
      if (state.breathPhase >= 1) {
        state.breathPhase = 1;
        state.breathDirection = -1;
        
        // Chance to hold breath at peak (anticipation)
        if (Math.random() < CONFIG.breathPauseChance) {
          state.breathHolding = true;
          setTimeout(() => {
            state.breathHolding = false;
          }, 200 + Math.random() * 300);
        }
      } else if (state.breathPhase <= 0) {
        state.breathPhase = 0;
        state.breathDirection = 1;
        
        // Vary breath duration each cycle
        state.currentBreathDuration = CONFIG.breathDurationBase + 
          (Math.random() - 0.5) * CONFIG.breathDurationVariance * 2;
      }
    }
    
    // Smooth sine curve for natural breathing
    const breathCurve = Math.sin(state.breathPhase * Math.PI);
    const breathScale = 1 + (CONFIG.breathScale - 1) * breathCurve;
    
    // Apply breath scale via CSS variable
    avatarEl.style.setProperty('--breath-scale', breathScale.toFixed(4));
    
    // Breathing affects glow intensity too
    if (glowEl) {
      const glowIntensity = 0.4 + breathCurve * 0.15;
      glowEl.style.opacity = glowIntensity.toFixed(3);
    }
  }
  
  function startBreathing() {
    // Initial setup
    if (avatarEl) {
      avatarEl.classList.add('hero-ferni--breathing');
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

