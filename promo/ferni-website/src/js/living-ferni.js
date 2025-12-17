/**
 * Living Ferni - Expressive Avatar matching the App
 * 
 * Bringing the app's animated spirit to the landing page!
 * Uses the exact same structure: avatar-container + avatar-ring + avatar-orb
 * 
 * 🎬 PIXAR PRINCIPLES:
 * - Squash & Stretch: Natural breathing deformation
 * - Anticipation: Wind-up before reactions
 * - Follow-through: Overshoot and settle
 * - Secondary Action: Ring pulses, heart beats
 * - Timing: Emotion-specific animation speeds
 * - Appeal: Warm, inviting, ALIVE
 */

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const CONFIG = {
    // Timing (ms)
    DURATION: {
      MICRO: 80,
      FAST: 150,
      NORMAL: 300,
      SLOW: 500,
      BREATH_CYCLE: 6000, // Match the app's 6s breathing
      EXPRESSION_HOLD: 2000,
    },
    
    // Spontaneous expression timing
    SPONTANEOUS: {
      MIN_INTERVAL: 6000,
      MAX_INTERVAL: 15000,
      CHANCE: 0.6,
    },
  };

  // ============================================================================
  // EMOTION CONFIGURATIONS
  // ============================================================================

  const EMOTIONS = {
    neutral: {
      ringOpacity: 0.35,
      ringScale: 1,
      brightness: 1,
      scale: 1,
    },
    happy: {
      ringOpacity: 0.45,
      ringScale: 1.02,
      brightness: 1.05,
      scale: 1.02,
    },
    excited: {
      ringOpacity: 0.55,
      ringScale: 1.05,
      brightness: 1.08,
      scale: 1.04,
    },
    curious: {
      ringOpacity: 0.4,
      ringScale: 1.03,
      brightness: 1.03,
      scale: 1,
      tilt: 4,
    },
    thinking: {
      ringOpacity: 0.3,
      ringScale: 0.98,
      brightness: 0.97,
      scale: 0.99,
      offsetX: -2,
    },
    listening: {
      ringOpacity: 0.4,
      ringScale: 1.01,
      brightness: 1.02,
      scale: 1.01,
    },
    warm: {
      ringOpacity: 0.5,
      ringScale: 1.02,
      brightness: 1.04,
      scale: 1.01,
    },
  };

  // ============================================================================
  // STATE
  // ============================================================================

  let ferniInstances = [];
  let prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ============================================================================
  // LIVING FERNI CLASS
  // ============================================================================

  class LivingFerni {
    constructor(container) {
      this.container = container;
      this.ring = container.querySelector('.avatar-ring');
      this.orb = container.querySelector('.avatar-orb');
      this.heart = container.querySelector('.avatar-heart');
      this.text = container.querySelector('.avatar-text');
      
      // State
      this.currentEmotion = 'neutral';
      this.isHovered = false;
      this.isVisible = false;
      this.breathPhase = 0;
      
      // Animation
      this.animationId = null;
      this.lastTimestamp = 0;
      this.targetValues = { ...EMOTIONS.neutral };
      this.currentValues = { ...EMOTIONS.neutral };
      
      // Mouse tracking
      this.lookX = 0;
      this.lookY = 0;
      this.targetLookX = 0;
      this.targetLookY = 0;
      
      this.init();
    }

    init() {
      if (prefersReducedMotion) {
        this.container.classList.add('reduced-motion');
        return;
      }

      this.setupEventListeners();
      this.setupVisibilityObserver();
      this.startAnimation();
      this.scheduleSpontaneousExpression();
      
      // Mark as alive
      this.container.classList.add('is-alive');
    }

    // =========================================================================
    // EVENT LISTENERS
    // =========================================================================

    setupEventListeners() {
      // Hover: Ferni becomes curious and perks up
      this.container.addEventListener('mouseenter', () => this.onHover(true));
      this.container.addEventListener('mouseleave', () => this.onHover(false));
      
      // Click: Ferni bounces with delight
      this.container.addEventListener('click', () => this.onClick());
      
      // Mouse tracking for "looking at you" effect
      document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    }

    setupVisibilityObserver() {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          this.isVisible = entry.isIntersecting;
          if (this.isVisible && !this.animationId) {
            this.startAnimation();
          }
        });
      }, { threshold: 0.1 });
      
      observer.observe(this.container);
    }

    // =========================================================================
    // INTERACTION HANDLERS
    // =========================================================================

    onHover(isHovering) {
      this.isHovered = isHovering;
      
      if (isHovering) {
        this.setEmotion('curious');
        this.playReaction('attention');
      } else {
        this.setEmotion('neutral');
      }
    }

    onClick() {
      this.setEmotion('excited');
      this.playReaction('bounce');
      this.spawnSparkles(6);
      
      // Return to happy, then neutral
      setTimeout(() => {
        if (!this.isHovered) {
          this.setEmotion('happy');
          setTimeout(() => this.setEmotion('neutral'), CONFIG.DURATION.EXPRESSION_HOLD);
        }
      }, CONFIG.DURATION.EXPRESSION_HOLD);
    }

    onMouseMove(e) {
      if (!this.isVisible || !this.orb) return;
      
      const rect = this.container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      // Calculate offset (subtle - max 3px like the app)
      const maxOffset = 3;
      const deltaX = (e.clientX - centerX) / window.innerWidth;
      const deltaY = (e.clientY - centerY) / window.innerHeight;
      
      this.targetLookX = deltaX * maxOffset;
      this.targetLookY = deltaY * maxOffset;
    }

    // =========================================================================
    // EXPRESSION SYSTEM
    // =========================================================================

    setEmotion(emotion) {
      if (!EMOTIONS[emotion]) return;
      
      this.currentEmotion = emotion;
      this.targetValues = { ...EMOTIONS[emotion] };
      
      // Update data attribute for CSS hooks
      this.container.setAttribute('data-emotion', emotion);
    }

    playMicroExpression(emotion) {
      const previous = this.currentEmotion;
      this.setEmotion(emotion);
      
      setTimeout(() => {
        this.setEmotion(previous);
      }, CONFIG.DURATION.MICRO + Math.random() * 100);
    }

    playReaction(type) {
      // Remove existing reaction classes
      const reactions = ['bounce', 'attention', 'nod', 'curious', 'pulse', 'joy'];
      reactions.forEach(r => this.container.classList.remove(`react-${r}`));
      
      // Force reflow
      void this.container.offsetWidth;
      
      // Add new reaction
      this.container.classList.add(`react-${type}`);
      
      // Remove after animation completes
      setTimeout(() => {
        this.container.classList.remove(`react-${type}`);
      }, 600);
    }

    scheduleSpontaneousExpression() {
      const delay = CONFIG.SPONTANEOUS.MIN_INTERVAL + 
                    Math.random() * (CONFIG.SPONTANEOUS.MAX_INTERVAL - CONFIG.SPONTANEOUS.MIN_INTERVAL);
      
      setTimeout(() => {
        if (this.isVisible && !this.isHovered && Math.random() < CONFIG.SPONTANEOUS.CHANCE) {
          const expressions = ['happy', 'curious', 'thinking', 'warm'];
          const reactions = ['nod', 'pulse', null, null];
          
          const expr = expressions[Math.floor(Math.random() * expressions.length)];
          const reaction = reactions[Math.floor(Math.random() * reactions.length)];
          
          this.playMicroExpression(expr);
          if (reaction) {
            setTimeout(() => this.playReaction(reaction), 100);
          }
        }
        
        this.scheduleSpontaneousExpression();
      }, delay);
    }

    // =========================================================================
    // SPARKLE PARTICLES
    // =========================================================================

    spawnSparkles(count = 5) {
      const rect = this.container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      for (let i = 0; i < count; i++) {
        const sparkle = document.createElement('div');
        sparkle.className = 'ferni-sparkle';
        
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const distance = 45 + Math.random() * 35;
        const size = 4 + Math.random() * 4;
        
        sparkle.style.cssText = `
          position: fixed;
          left: ${centerX}px;
          top: ${centerY}px;
          width: ${size}px;
          height: ${size}px;
          background: #4a6741;
          border-radius: 50%;
          pointer-events: none;
          z-index: 1000;
          opacity: 0;
        `;
        
        document.body.appendChild(sparkle);
        
        const endX = Math.cos(angle) * distance;
        const endY = Math.sin(angle) * distance - 20;
        
        sparkle.animate([
          { transform: 'translate(-50%, -50%) scale(0)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(1.2)', opacity: 0.9, offset: 0.2 },
          { transform: `translate(calc(-50% + ${endX}px), calc(-50% + ${endY}px)) scale(0.3)`, opacity: 0 }
        ], {
          duration: 650,
          easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
          fill: 'forwards'
        }).onfinish = () => sparkle.remove();
      }
    }

    // =========================================================================
    // ANIMATION ENGINE
    // =========================================================================

    startAnimation() {
      if (this.animationId) return;
      
      this.lastTimestamp = performance.now();
      
      const animate = (timestamp) => {
        if (!this.isVisible) {
          this.animationId = null;
          return;
        }
        
        const deltaTime = Math.min(timestamp - this.lastTimestamp, 50);
        this.lastTimestamp = timestamp;
        
        this.updateBreathing(deltaTime);
        this.updateLookAt(deltaTime);
        this.updateEmotionValues(deltaTime);
        this.applyTransforms();
        
        this.animationId = requestAnimationFrame(animate);
      };
      
      this.animationId = requestAnimationFrame(animate);
    }

    updateBreathing(deltaTime) {
      // Progress breath phase (6s cycle like the app)
      this.breathPhase += (deltaTime / CONFIG.DURATION.BREATH_CYCLE) * Math.PI * 2;
      if (this.breathPhase > Math.PI * 2) this.breathPhase -= Math.PI * 2;
    }

    updateLookAt(deltaTime) {
      // Smooth interpolation toward target look position
      const smoothing = 0.08;
      this.lookX += (this.targetLookX - this.lookX) * smoothing;
      this.lookY += (this.targetLookY - this.lookY) * smoothing;
    }

    updateEmotionValues(deltaTime) {
      // Smoothly interpolate current values toward target values
      const smoothing = 0.06;
      
      for (const key in this.targetValues) {
        if (typeof this.currentValues[key] === 'number') {
          this.currentValues[key] += (this.targetValues[key] - this.currentValues[key]) * smoothing;
        }
      }
    }

    applyTransforms() {
      if (!this.orb) return;
      
      // Calculate breath-based transforms (match app's humanBreathing keyframes)
      const breathProgress = (Math.sin(this.breathPhase) + 1) / 2;
      
      // Subtle breathing like the app: scale(1.015) translateY(-0.5px) at peak
      const breathScale = 1 + (breathProgress * 0.015 * this.currentValues.scale);
      const breathY = -breathProgress * 0.5;
      
      // Emotion-based transforms
      const tilt = this.currentValues.tilt || 0;
      const offsetX = this.currentValues.offsetX || 0;
      
      // Apply to orb
      this.orb.style.transform = `
        translate(${this.lookX + offsetX}px, ${this.lookY + breathY}px)
        scale(${breathScale})
        rotate(${tilt}deg)
      `;
      this.orb.style.filter = `brightness(${this.currentValues.brightness || 1})`;
      
      // Apply to ring
      if (this.ring) {
        const ringPulse = this.currentValues.ringScale + (breathProgress * 0.02);
        this.ring.style.opacity = this.currentValues.ringOpacity + (breathProgress * 0.1);
        this.ring.style.transform = `scale(${ringPulse})`;
      }
    }

    // =========================================================================
    // CLEANUP
    // =========================================================================

    destroy() {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
      }
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  function init() {
    // Find all avatar containers (using the new class name matching the app)
    const containers = document.querySelectorAll('.avatar-container--hero');
    
    containers.forEach(container => {
      // Don't initialize twice
      if (container.classList.contains('is-alive')) return;
      
      const instance = new LivingFerni(container);
      ferniInstances.push(instance);
    });
    
    if (ferniInstances.length > 0) {
      console.log(`[LivingFerni] Initialized ${ferniInstances.length} avatar(s) - App-matched design`);
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  window.LivingFerni = {
    init,
    setEmotion: (emotion) => {
      ferniInstances.forEach(instance => instance.setEmotion(emotion));
    },
    playReaction: (type) => {
      ferniInstances.forEach(instance => instance.playReaction(type));
    },
    celebrate: () => {
      ferniInstances.forEach(instance => {
        instance.setEmotion('excited');
        instance.playReaction('joy');
        instance.spawnSparkles(8);
      });
    },
  };

  // Auto-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
