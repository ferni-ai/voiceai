/**
 * Holographic Text Effect
 * Prismatic shimmer that shifts with mouse position
 * Like light refracting through glass
 */

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  const CONFIG = {
    intensity: 0.5,           // How strong the effect is
    speed: 0.1,               // How fast it follows mouse
    hueRange: 30,             // Range of hue shift in degrees
    saturationBoost: 0.1,     // How much to boost saturation
    refreshRate: 16,          // ~60fps
    debugMode: false
  };

  // ============================================================================
  // STATE
  // ============================================================================
  
  const state = {
    mouseX: 0,
    mouseY: 0,
    currentX: 0,
    currentY: 0,
    elements: [],
    initialized: false,
    animationId: null
  };

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  function init() {
    // Find all holographic text elements
    state.elements = document.querySelectorAll(
      '.holographic-text, [data-holographic], .hero__headline-accent'
    );
    
    if (state.elements.length === 0) {
      logDebug('No holographic elements found');
      return;
    }
    
    // Prepare elements
    state.elements.forEach(prepareElement);
    
    // Track mouse position
    document.addEventListener('mousemove', onMouseMove, { passive: true });
    
    // Start animation loop
    animate();
    
    state.initialized = true;
    logDebug('Holographic Text initialized with', state.elements.length, 'elements');
  }

  // ============================================================================
  // ELEMENT PREPARATION
  // ============================================================================
  
  function prepareElement(el) {
    // Add holographic class if not present
    el.classList.add('holographic-text');
    
    // Store original text for splitting if needed
    const text = el.textContent;
    
    // Create shimmer overlay
    const shimmer = document.createElement('span');
    shimmer.className = 'holographic-text__shimmer';
    shimmer.setAttribute('aria-hidden', 'true');
    
    // Make element position relative if not already
    const position = window.getComputedStyle(el).position;
    if (position === 'static') {
      el.style.position = 'relative';
    }
    
    // Add shimmer
    el.appendChild(shimmer);
    
    // Store reference
    el._holoShimmer = shimmer;
  }

  // ============================================================================
  // MOUSE TRACKING
  // ============================================================================
  
  function onMouseMove(e) {
    state.mouseX = e.clientX;
    state.mouseY = e.clientY;
  }

  // ============================================================================
  // ANIMATION LOOP
  // ============================================================================
  
  function animate() {
    // Smooth follow
    state.currentX += (state.mouseX - state.currentX) * CONFIG.speed;
    state.currentY += (state.mouseY - state.currentY) * CONFIG.speed;
    
    // Update each element
    state.elements.forEach(updateElement);
    
    state.animationId = requestAnimationFrame(animate);
  }
  
  function updateElement(el) {
    const shimmer = el._holoShimmer;
    if (!shimmer) return;
    
    // Get element bounds
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Calculate relative position (-1 to 1)
    const relX = (state.currentX - centerX) / (window.innerWidth / 2);
    const relY = (state.currentY - centerY) / (window.innerHeight / 2);
    
    // Calculate shimmer position
    const shimmerX = relX * 100 * CONFIG.intensity;
    const shimmerY = relY * 100 * CONFIG.intensity;
    
    // Calculate hue shift based on position
    const hueShift = relX * CONFIG.hueRange;
    
    // Apply to shimmer
    shimmer.style.setProperty('--shimmer-x', `${50 + shimmerX}%`);
    shimmer.style.setProperty('--shimmer-y', `${50 + shimmerY}%`);
    shimmer.style.setProperty('--hue-shift', `${hueShift}deg`);
    
    // Also set on parent for additional CSS effects
    el.style.setProperty('--holo-x', relX.toFixed(3));
    el.style.setProperty('--holo-y', relY.toFixed(3));
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================
  
  function destroy() {
    if (state.animationId) {
      cancelAnimationFrame(state.animationId);
    }
    
    document.removeEventListener('mousemove', onMouseMove);
    
    state.elements.forEach(el => {
      if (el._holoShimmer) {
        el._holoShimmer.remove();
        delete el._holoShimmer;
      }
    });
    
    state.elements = [];
    state.initialized = false;
  }

  // ============================================================================
  // UTILITY
  // ============================================================================
  
  function logDebug(...args) {
    if (CONFIG.debugMode) {
      console.log('[HolographicText]', ...args);
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  
  window.FerniHolographicText = {
    init,
    destroy,
    refresh: () => {
      destroy();
      init();
    },
    setIntensity: (val) => { CONFIG.intensity = val; },
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

