/**
 * Magnetic Cursor System
 * Premium button interactions inspired by Apple and Stripe
 * 
 * Features:
 * - Buttons subtly attract the cursor as it approaches
 * - Magnetic pull effect on hover
 * - Content follows cursor within button bounds
 * - Smooth spring physics for natural feel
 * - Glow effects that track cursor position
 * - Touch-friendly (degrades gracefully)
 * 
 * Philosophy: Micro-interactions should feel delightful, not distracting.
 */

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  const CONFIG = {
    enableMagnetic: true,
    enableGlow: true,
    magneticStrength: 0.35,      // How strongly buttons pull (0-1)
    magneticRadius: 100,         // Pixels - how far the effect reaches
    springStiffness: 0.15,       // Spring response (higher = snappier)
    springDamping: 0.75,         // Spring friction
    glowSize: 120,               // Glow diameter
    glowOpacity: 0.15,           // Base glow opacity
    selectors: '.btn, .nav__cta, [data-magnetic], .hero-cta a, .demo-widget__cta',
    excludeSelectors: '.btn--disabled, [disabled], .demo-widget__close',
    debugMode: false
  };

  // ============================================================================
  // STATE
  // ============================================================================
  
  const state = {
    mouseX: 0,
    mouseY: 0,
    elements: [],
    activeElement: null,
    rafId: null,
    initialized: false,
    prefersReducedMotion: false,
    isTouchDevice: false
  };

  // ============================================================================
  // ELEMENT STATE TRACKING
  // ============================================================================
  
  class MagneticElement {
    constructor(el) {
      this.el = el;
      this.rect = null;
      this.centerX = 0;
      this.centerY = 0;
      
      // Current animated values
      this.translateX = 0;
      this.translateY = 0;
      this.velocityX = 0;
      this.velocityY = 0;
      
      // Target values
      this.targetX = 0;
      this.targetY = 0;
      
      // Glow tracking
      this.glowX = 0;
      this.glowY = 0;
      
      // State
      this.isHovered = false;
      this.isInRange = false;
      
      // Create glow element
      if (CONFIG.enableGlow) {
        this.createGlow();
      }
      
      // Initial bounds calculation
      this.updateBounds();
    }
    
    createGlow() {
      this.glowEl = document.createElement('div');
      this.glowEl.className = 'magnetic-glow';
      this.glowEl.style.cssText = `
        position: absolute;
        width: ${CONFIG.glowSize}px;
        height: ${CONFIG.glowSize}px;
        border-radius: 50%;
        background: radial-gradient(circle, var(--color-ferni, #4a6741) 0%, transparent 70%);
        opacity: 0;
        pointer-events: none;
        transform: translate(-50%, -50%);
        transition: opacity 0.3s ease;
        z-index: 0;
      `;
      
      // Ensure parent is positioned
      const style = window.getComputedStyle(this.el);
      if (style.position === 'static') {
        this.el.style.position = 'relative';
      }
      
      this.el.style.overflow = 'hidden';
      this.el.insertBefore(this.glowEl, this.el.firstChild);
    }
    
    updateBounds() {
      this.rect = this.el.getBoundingClientRect();
      this.centerX = this.rect.left + this.rect.width / 2;
      this.centerY = this.rect.top + this.rect.height / 2;
    }
    
    update(mouseX, mouseY, deltaTime) {
      // Distance from center
      const dx = mouseX - this.centerX;
      const dy = mouseY - this.centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Check if in range
      this.isInRange = distance < CONFIG.magneticRadius;
      
      if (this.isInRange || this.isHovered) {
        // Calculate magnetic pull
        const strength = this.isHovered ? CONFIG.magneticStrength * 1.5 : CONFIG.magneticStrength;
        const pull = 1 - Math.min(distance / CONFIG.magneticRadius, 1);
        const easedPull = easeOutCubic(pull);
        
        // Target position with magnetic effect
        const maxOffset = this.rect.width * 0.15; // Max 15% of button width
        this.targetX = (dx / CONFIG.magneticRadius) * maxOffset * strength * easedPull;
        this.targetY = (dy / CONFIG.magneticRadius) * maxOffset * strength * easedPull;
        
        // Update glow position (follows cursor within bounds)
        if (this.glowEl && this.isHovered) {
          const localX = mouseX - this.rect.left;
          const localY = mouseY - this.rect.top;
          this.glowEl.style.left = `${localX}px`;
          this.glowEl.style.top = `${localY}px`;
          this.glowEl.style.opacity = CONFIG.glowOpacity.toString();
        }
      } else {
        // Return to center
        this.targetX = 0;
        this.targetY = 0;
        
        if (this.glowEl) {
          this.glowEl.style.opacity = '0';
        }
      }
      
      // Spring physics
      const forceX = (this.targetX - this.translateX) * CONFIG.springStiffness;
      const forceY = (this.targetY - this.translateY) * CONFIG.springStiffness;
      
      this.velocityX = (this.velocityX + forceX) * CONFIG.springDamping;
      this.velocityY = (this.velocityY + forceY) * CONFIG.springDamping;
      
      this.translateX += this.velocityX * deltaTime;
      this.translateY += this.velocityY * deltaTime;
      
      // Apply transform
      this.el.style.transform = `translate(${this.translateX.toFixed(2)}px, ${this.translateY.toFixed(2)}px)`;
    }
    
    onEnter() {
      this.isHovered = true;
      this.el.classList.add('is-magnetic-hover');
    }
    
    onLeave() {
      this.isHovered = false;
      this.el.classList.remove('is-magnetic-hover');
    }
    
    destroy() {
      if (this.glowEl) {
        this.glowEl.remove();
      }
      this.el.style.transform = '';
      this.el.classList.remove('is-magnetic-hover');
    }
  }

  // ============================================================================
  // EASING
  // ============================================================================
  
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  function init() {
    // Check for reduced motion
    state.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    // Check for touch device
    state.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // Skip on touch devices or reduced motion
    if (state.prefersReducedMotion || state.isTouchDevice || !CONFIG.enableMagnetic) {
      logDebug('Magnetic cursor disabled (touch device or reduced motion)');
      return;
    }
    
    // Find all magnetic elements
    const elements = document.querySelectorAll(CONFIG.selectors);
    const excluded = document.querySelectorAll(CONFIG.excludeSelectors);
    const excludedSet = new Set(excluded);
    
    elements.forEach(el => {
      if (!excludedSet.has(el)) {
        const magneticEl = new MagneticElement(el);
        state.elements.push(magneticEl);
        
        // Hover events
        el.addEventListener('mouseenter', () => magneticEl.onEnter());
        el.addEventListener('mouseleave', () => magneticEl.onLeave());
      }
    });
    
    // Mouse tracking
    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    
    // Scroll handler (update bounds)
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // Resize handler
    window.addEventListener('resize', debounce(handleResize, 200), { passive: true });
    
    // Start animation loop
    startLoop();
    
    state.initialized = true;
    logDebug(`Magnetic cursor initialized with ${state.elements.length} elements`);
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================
  
  function handleMouseMove(e) {
    state.mouseX = e.clientX;
    state.mouseY = e.clientY;
  }
  
  function handleScroll() {
    // Debounced bounds update
    updateAllBounds();
  }
  
  function handleResize() {
    updateAllBounds();
  }
  
  function updateAllBounds() {
    state.elements.forEach(el => el.updateBounds());
  }

  // ============================================================================
  // ANIMATION LOOP
  // ============================================================================
  
  let lastTime = 0;
  
  function startLoop() {
    function loop(currentTime) {
      const deltaTime = lastTime ? Math.min((currentTime - lastTime) / 16.67, 2) : 1;
      lastTime = currentTime;
      
      // Update all elements
      state.elements.forEach(el => {
        el.update(state.mouseX, state.mouseY, deltaTime);
      });
      
      state.rafId = requestAnimationFrame(loop);
    }
    
    state.rafId = requestAnimationFrame(loop);
  }
  
  function stopLoop() {
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
  }

  // ============================================================================
  // UTILITY
  // ============================================================================
  
  function debounce(fn, delay) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), delay);
    };
  }
  
  function logDebug(...args) {
    if (CONFIG.debugMode) {
      console.log('[MagneticCursor]', ...args);
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  
  window.FerniMagnetic = {
    init,
    refresh: () => {
      state.elements.forEach(el => el.destroy());
      state.elements = [];
      init();
    },
    destroy: () => {
      stopLoop();
      state.elements.forEach(el => el.destroy());
      state.elements = [];
      state.initialized = false;
    },
    addElement: (el) => {
      if (el && !state.elements.find(m => m.el === el)) {
        const magneticEl = new MagneticElement(el);
        state.elements.push(magneticEl);
        el.addEventListener('mouseenter', () => magneticEl.onEnter());
        el.addEventListener('mouseleave', () => magneticEl.onLeave());
      }
    },
    getState: () => ({ ...state, elements: state.elements.length })
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

