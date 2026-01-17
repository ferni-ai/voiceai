/**
 * Ferni Showcase - Landing Page Magic
 * 
 * Aligned with brand/characters/ferni/expressions.html
 * LUXO STYLE: opaque white eyes, NO pupils. Emotion from EYE SHAPE.
 * 
 * Expression comes from the EYES:
 * - scaleY controls openness (wider = attentive, narrower = thinking/warm)
 * - scaleX for subtle width changes
 * - Asymmetric left/right for personality (curious, playful, winking)
 * - Gaze direction via eyes-group translate
 * 
 * NO bouncy joy celebrations - subtle, eye-focused expressions only
 * 
 * "Better than human" - Every micro-expression matters
 */

(function() {
  'use strict';
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════════
  
  const avatar = document.getElementById('heroFerni');
  const glowRing = document.getElementById('glowRing');
  const eyesGroup = avatar?.querySelector('.eyes-group');
  const eyeLeft = avatar?.querySelector('.eye-left');
  const eyeRight = avatar?.querySelector('.eye-right');
  const smileCreaseLeft = avatar?.querySelector('.smile-crease.crease-left');
  const smileCreaseRight = avatar?.querySelector('.smile-crease.crease-right');
  
  if (!avatar) {
    console.log('🌟 Ferni Showcase: No avatar found');
    return;
  }
  
  let blinkInterval = null;
  let cycleInterval = null;
  let currentMoodIndex = 0;
  let isPaused = false;
  
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // EMOTIONS - Subtle, eye-focused expressions (NO bouncy celebrations)
  // Cycle through expressions that showcase Ferni's emotional range via EYES
  // ═══════════════════════════════════════════════════════════════════════════════
  
  // Luxo-style expression cycle - subtle but expressive
  // Each expression should be noticeably different but not jarring
  const emotions = [
    'curious',      // Asymmetric eyes, head tilt - "what's this?"
    'listening',    // Eyes wider, attentive - "I hear you"
    'warm',         // Squinted happy eyes - "I care"
    'thinking',     // Narrowed, gaze shifted - "hmm..."
    'attentive',    // Engaged, wide eyes - "tell me more"
    'caring',       // Soft eyes, slight tilt - "I understand"
    'interested',   // Focused eyes - "fascinating"
    'playful',      // Asymmetric wink-like - "let's have fun"
    'pondering',    // Deep thought, eyes narrow - "considering..."
    'happy',        // Squinted smile - "joy"
    'neutral'       // Reset - calm and ready
  ];
  
  // Glow color families (from expressions.html)
  const glowColors = {
    // Sage family - default/listening
    neutral: 'rgba(74, 103, 65, 0.4)',
    listening: 'rgba(74, 103, 65, 0.45)',
    attentive: 'rgba(74, 103, 65, 0.5)',
    
    // Teal family - thinking/curiosity
    thinking: 'rgba(58, 107, 115, 0.45)',
    pondering: 'rgba(58, 107, 115, 0.5)',
    curious: 'rgba(58, 107, 115, 0.45)',
    interested: 'rgba(58, 107, 115, 0.4)',
    confused: 'rgba(58, 107, 115, 0.45)',
    
    // Warm family - caring/empathy
    warm: 'rgba(255, 180, 120, 0.45)',
    caring: 'rgba(255, 180, 120, 0.5)',
    empathetic: 'rgba(255, 180, 120, 0.45)',
    happy: 'rgba(255, 180, 120, 0.45)',
    
    // Golden family - playful/confident
    playful: 'rgba(196, 162, 101, 0.5)',
    winking: 'rgba(196, 162, 101, 0.5)',
    confident: 'rgba(196, 162, 101, 0.45)',
    
    // Protective family - concern
    concerned: 'rgba(154, 123, 90, 0.5)',
    worried: 'rgba(154, 123, 90, 0.5)',
    sad: 'rgba(154, 123, 90, 0.45)',
    
    // Others
    surprised: 'rgba(200, 100, 100, 0.45)',
    sleepy: 'rgba(140, 180, 160, 0.4)'
  };
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // BLINKING SYSTEM - Natural, random intervals
  // ═══════════════════════════════════════════════════════════════════════════════
  
  function triggerBlink() {
    avatar.classList.add('blinking');
    setTimeout(() => avatar.classList.remove('blinking'), 150);
  }
  
  function scheduleBlink() {
    // Random interval between 3-7 seconds (natural blink rate)
    const delay = 3000 + Math.random() * 4000;
    blinkInterval = setTimeout(() => {
      triggerBlink();
      scheduleBlink();
    }, delay);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // MICRO-EXPRESSIONS - Subliminal trust building (40-150ms)
  // These are brief flashes that build unconscious rapport
  // ═══════════════════════════════════════════════════════════════════════════════
  
  function triggerMicroExpression(type, duration = 100) {
    avatar.classList.add(`micro-${type}`);
    setTimeout(() => avatar.classList.remove(`micro-${type}`), duration);
  }
  
  // Random micro-expression chance based on context
  function maybePlayMicroExpression(context) {
    const chance = Math.random();
    
    // Only play micro-expressions occasionally (20% chance)
    if (chance > 0.2) return;
    
    switch(context) {
      case 'recognition':
        triggerMicroExpression('recognition', 80);
        break;
      case 'interest':
        triggerMicroExpression('interest', 90);
        break;
      case 'warmth':
        triggerMicroExpression('warmth', 100);
        break;
      case 'understanding':
        triggerMicroExpression('understanding', 120);
        break;
      case 'noticing':
        triggerMicroExpression('noticing', 100);
        break;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // GLOW SYSTEM - Subtle ambient emotional light
  // ═══════════════════════════════════════════════════════════════════════════════
  
  function updateGlow(color) {
    if (glowRing) {
      glowRing.style.stroke = color;
      glowRing.style.filter = 'blur(5px)';
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // EYE ATTRIBUTE MODIFICATION - Direct SVG manipulation for Luxo-style expressions
  // Base eye dimensions: rx="7" ry="10"
  // ═══════════════════════════════════════════════════════════════════════════════
  
  const BASE_EYE_RX = 7;
  const BASE_EYE_RY = 10;
  
  // Expression configs: [leftRx, leftRy, rightRx, rightRy, avatarTransform, eyesGroupTranslate, dimpleOpacity]
  const EYE_CONFIGS = {
    neutral:    { lRy: 10, lRx: 7, rRy: 10, rRx: 7, avatar: '', eyes: '', dimple: 0 },
    listening:  { lRy: 11, lRx: 7, rRy: 11, rRx: 7, avatar: 'translateY(-3px)', eyes: '', dimple: 0 },
    curious:    { lRy: 12, lRx: 7, rRy: 10, rRx: 7, avatar: 'rotate(10deg) translateY(-4px)', eyes: 'translate(3px, -2px)', dimple: 0 },
    thinking:   { lRy: 7, lRx: 6, rRy: 7, rRx: 6, avatar: 'rotate(6deg)', eyes: 'translate(6px, -2px)', dimple: 0 },
    pondering:  { lRy: 6, lRx: 5.5, rRy: 6.5, rRx: 5.5, avatar: 'rotate(10deg) translateY(-3px)', eyes: 'translate(8px, -3px)', dimple: 0 },
    warm:       { lRy: 6, lRx: 8, rRy: 6, rRx: 8, avatar: 'translateY(-2px)', eyes: '', dimple: 0.8 },
    attentive:  { lRy: 12, lRx: 7.5, rRy: 12, rRx: 7.5, avatar: 'translateY(-4px)', eyes: '', dimple: 0 },
    interested: { lRy: 11, lRx: 7, rRy: 11, rRx: 7, avatar: 'translateY(-2px)', eyes: '', dimple: 0 },
    caring:     { lRy: 7, lRx: 7.5, rRy: 7.5, rRx: 7.5, avatar: 'rotate(-4deg) translateY(-2px)', eyes: '', dimple: 0.7 },
    empathetic: { lRy: 7, lRx: 7, rRy: 7.5, rRx: 7, avatar: 'rotate(-2deg)', eyes: '', dimple: 0.5 },
    happy:      { lRy: 5, lRx: 8, rRy: 5, rRx: 8, avatar: 'translateY(-2px)', eyes: '', dimple: 0.9 },
    playful:    { lRy: 6, lRx: 7.5, rRy: 9, rRx: 7, avatar: 'rotate(5deg) translateY(-3px)', eyes: 'translate(2px, 0)', dimple: 0.5 },
    confident:  { lRy: 8, lRx: 7, rRy: 8, rRx: 7, avatar: 'translateY(-1px)', eyes: '', dimple: 0.4 },
    surprised:  { lRy: 13, lRx: 8, rRy: 13, rRx: 8, avatar: '', eyes: '', dimple: 0 },
    winking:    { lRy: 1, lRx: 8, rRy: 11, rRx: 7, avatar: 'rotate(4deg) translateY(-2px)', eyes: '', dimple: 0.6 },
    sleepy:     { lRy: 4, lRx: 7, rRy: 4, rRx: 7, avatar: '', eyes: '', dimple: 0 }
  };
  
  function setMood(mood) {
    avatar.dataset.mood = mood;
    
    // Get the eye config
    const config = EYE_CONFIGS[mood] || EYE_CONFIGS.neutral;
    
    // DIRECTLY MODIFY SVG ELLIPSE ATTRIBUTES for visible eye changes!
    if (eyeLeft) {
      eyeLeft.setAttribute('ry', config.lRy);
      eyeLeft.setAttribute('rx', config.lRx);
    }
    if (eyeRight) {
      eyeRight.setAttribute('ry', config.rRy);
      eyeRight.setAttribute('rx', config.rRx);
    }
    
    // Avatar body transform (tilt, bounce)
    avatar.style.transform = config.avatar;
    
    // Eyes group translate (gaze direction)
    if (eyesGroup) eyesGroup.style.transform = config.eyes;
    
    // Smile creases (dimples)
    if (smileCreaseLeft) smileCreaseLeft.style.opacity = config.dimple;
    if (smileCreaseRight) smileCreaseRight.style.opacity = config.dimple;
    
    // Update glow color to match emotional family
    const glowColor = glowColors[mood] || glowColors.neutral;
    updateGlow(glowColor);
    
    // Occasionally trigger a micro-expression based on mood type
    if (mood === 'listening' || mood === 'attentive') {
      maybePlayMicroExpression('interest');
    } else if (mood === 'warm' || mood === 'caring' || mood === 'empathetic') {
      maybePlayMicroExpression('warmth');
    } else if (mood === 'thinking' || mood === 'pondering') {
      maybePlayMicroExpression('noticing');
    }
    
    console.log(`🎭 Ferni: ${mood}`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // EMOTION CYCLING - Showcase Ferni's expressive range
  // ═══════════════════════════════════════════════════════════════════════════════
  
  function nextEmotion() {
    if (isPaused) return;
    
    currentMoodIndex = (currentMoodIndex + 1) % emotions.length;
    setMood(emotions[currentMoodIndex]);
  }
  
  function startEmotionCycle() {
    // Change emotion every 4 seconds - gives time to appreciate each expression
    cycleInterval = setInterval(nextEmotion, 4000);
  }
  
  function pauseCycle() {
    isPaused = true;
  }
  
  function resumeCycle() {
    isPaused = false;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // INTERACTIVE REACTIONS - Subtle, eye-focused
  // ═══════════════════════════════════════════════════════════════════════════════
  
  function setupInteractions() {
    // Hover: Pause cycling, show attentive state
    avatar.addEventListener('mouseenter', () => {
      pauseCycle();
      triggerMicroExpression('recognition', 80);
      setMood('attentive');
    });
    
    avatar.addEventListener('mouseleave', () => {
      resumeCycle();
      setMood('neutral');
    });
    
    // Click: Playful wink reaction (NOT bouncy joy celebration)
    avatar.addEventListener('click', () => {
      // Brief wink, then return to curious
      setMood('winking');
      triggerBlink();
      
      // Return to normal flow after wink
      setTimeout(() => {
        if (!isPaused) {
          setMood('curious');
          setTimeout(() => {
            if (!isPaused) {
              setMood(emotions[currentMoodIndex]);
            }
          }, 1500);
        }
      }, 600);
    });
    
    // Touch support
    avatar.addEventListener('touchstart', (e) => {
      e.preventDefault();
      pauseCycle();
      setMood('winking');
    }, { passive: false });
    
    avatar.addEventListener('touchend', () => {
      setTimeout(() => {
        setMood('warm');
        setTimeout(() => {
          resumeCycle();
        }, 1000);
      }, 500);
    });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // SCROLL REACTIONS - Subtle awareness of user activity
  // ═══════════════════════════════════════════════════════════════════════════════
  
  function setupScrollReactions() {
    let lastScrollY = window.scrollY;
    let scrollTimeout = null;
    
    window.addEventListener('scroll', () => {
      // Clear existing timeout
      if (scrollTimeout) clearTimeout(scrollTimeout);
      
      const currentScrollY = window.scrollY;
      const delta = currentScrollY - lastScrollY;
      
      // Trigger micro-expression based on scroll direction
      if (Math.abs(delta) > 50) {
        if (delta > 0) {
          // Scrolling down - curious about what's next
          maybePlayMicroExpression('interest');
        } else {
          // Scrolling up - recognition of return
          maybePlayMicroExpression('recognition');
        }
      }
      
      lastScrollY = currentScrollY;
      
      // Debounce
      scrollTimeout = setTimeout(() => {
        scrollTimeout = null;
      }, 200);
    }, { passive: true });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // TAB VISIBILITY - Welcome back with warmth
  // ═══════════════════════════════════════════════════════════════════════════════
  
  function setupVisibilityReactions() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // Welcome back - recognition then warmth
        triggerMicroExpression('recognition', 80);
        setTimeout(() => {
          setMood('warm');
          setTimeout(() => {
            if (!isPaused) {
              setMood(emotions[currentMoodIndex]);
            }
          }, 2000);
        }, 100);
      }
    });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // IDLE GAZE SHIFT - Occasional natural eye movement
  // ═══════════════════════════════════════════════════════════════════════════════
  
  function setupIdleGazeShift() {
    setInterval(() => {
      if (isPaused) return;
      
      // 30% chance to shift gaze briefly
      if (Math.random() < 0.3) {
        maybePlayMicroExpression('noticing');
      }
    }, 6000);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // INITIALIZE
  // ═══════════════════════════════════════════════════════════════════════════════
  
  function init() {
    console.log('🌟 Ferni Showcase initialized (eye-focused expressions)');
    
    // Enable natural behaviors
    avatar.classList.add('breathing', 'gazing', 'anticipation');
    
    // Start natural behaviors
    scheduleBlink();
    startEmotionCycle();
    
    // Setup interactions
    setupInteractions();
    setupScrollReactions();
    setupVisibilityReactions();
    setupIdleGazeShift();
    
    // Start with curious - the classic Luxo look
    setTimeout(() => {
      setMood('curious');
    }, 500);
  }
  
  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
