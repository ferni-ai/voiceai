/**
 * Cursor Ripple Effect
 * Water-like ripples that spread from clicks
 * Adds a premium, responsive feel to interactions
 */

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  const CONFIG = {
    maxRipples: 10,           // Maximum concurrent ripples
    rippleDuration: 800,      // Duration of ripple animation in ms
    rippleSize: 200,          // Final size of ripple in px
    rippleColor: 'rgba(74, 103, 65, 0.15)', // Ferni green
    rippleColorDark: 'rgba(74, 103, 65, 0.25)',
    enableOnButtons: true,    // Special treatment for buttons
    enableGlobal: true,       // Ripple on any click
    debugMode: false
  };

  // ============================================================================
  // STATE
  // ============================================================================
  
  const state = {
    rippleContainer: null,
    rippleCount: 0,
    initialized: false
  };

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  function init() {
    // Create ripple container
    state.rippleContainer = document.createElement('div');
    state.rippleContainer.className = 'cursor-ripple-container';
    state.rippleContainer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(state.rippleContainer);
    
    // Add click listener
    document.addEventListener('click', handleClick, { capture: true });
    
    // Add mousedown listener for buttons (Material Design style)
    if (CONFIG.enableOnButtons) {
      document.addEventListener('mousedown', handleButtonDown, { capture: true });
    }
    
    state.initialized = true;
    logDebug('Cursor Ripple initialized');
  }

  // ============================================================================
  // CLICK HANDLER
  // ============================================================================
  
  function handleClick(e) {
    if (!CONFIG.enableGlobal) return;
    
    // Don't create global ripples on buttons (they have their own)
    if (e.target.closest('button, .btn, a, input, [data-ripple]')) return;
    
    createRipple(e.clientX, e.clientY);
  }
  
  function handleButtonDown(e) {
    const button = e.target.closest('button, .btn, [data-ripple]');
    if (!button) return;
    
    // Get button position
    const rect = button.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    createButtonRipple(button, x, y);
  }

  // ============================================================================
  // RIPPLE CREATION
  // ============================================================================
  
  function createRipple(x, y, options = {}) {
    // Limit concurrent ripples
    if (state.rippleCount >= CONFIG.maxRipples) return;
    
    state.rippleCount++;
    
    const ripple = document.createElement('div');
    ripple.className = 'cursor-ripple';
    
    // Position ripple
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    
    // Custom size if provided
    if (options.size) {
      ripple.style.setProperty('--ripple-size', `${options.size}px`);
    }
    
    // Custom color if provided
    if (options.color) {
      ripple.style.setProperty('--ripple-color', options.color);
    }
    
    state.rippleContainer.appendChild(ripple);
    
    // Trigger animation
    requestAnimationFrame(() => {
      ripple.classList.add('is-animating');
    });
    
    // Remove after animation
    setTimeout(() => {
      ripple.remove();
      state.rippleCount--;
    }, CONFIG.rippleDuration);
    
    logDebug('Created ripple at', x, y);
  }
  
  function createButtonRipple(button, x, y) {
    // Ensure button has position relative
    const position = window.getComputedStyle(button).position;
    if (position === 'static') {
      button.style.position = 'relative';
    }
    
    // Ensure overflow hidden for contained ripple
    button.style.overflow = 'hidden';
    
    const ripple = document.createElement('span');
    ripple.className = 'button-ripple';
    
    // Calculate size (should cover entire button)
    const diameter = Math.max(button.clientWidth, button.clientHeight) * 2;
    
    ripple.style.width = `${diameter}px`;
    ripple.style.height = `${diameter}px`;
    ripple.style.left = `${x - diameter / 2}px`;
    ripple.style.top = `${y - diameter / 2}px`;
    
    button.appendChild(ripple);
    
    // Trigger animation
    requestAnimationFrame(() => {
      ripple.classList.add('is-animating');
    });
    
    // Remove after animation
    setTimeout(() => {
      ripple.remove();
    }, 600);
  }

  // ============================================================================
  // PROGRAMMATIC RIPPLE
  // ============================================================================
  
  function triggerRipple(x, y, options = {}) {
    createRipple(x, y, options);
  }
  
  function triggerRippleOnElement(element, options = {}) {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    
    createRipple(x, y, {
      size: Math.max(rect.width, rect.height) * 1.5,
      ...options
    });
  }

  // ============================================================================
  // UTILITY
  // ============================================================================
  
  function logDebug(...args) {
    if (CONFIG.debugMode) {
      console.log('[CursorRipple]', ...args);
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  
  window.FerniCursorRipple = {
    init,
    trigger: triggerRipple,
    triggerOn: triggerRippleOnElement,
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

