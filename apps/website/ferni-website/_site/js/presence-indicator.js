/**
 * Live Presence Indicator
 * "X people are talking with Ferni right now"
 * Creates social proof with subtle animation
 */

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  const CONFIG = {
    minCount: 23,             // Minimum "active" users
    maxCount: 89,             // Maximum "active" users
    updateInterval: 8000,     // How often to update (ms)
    animationDuration: 600,   // Count animation duration
    fluctuation: 0.15,        // How much the count can change (15%)
    showDelay: 3000,          // Delay before showing
    debugMode: false
  };

  // ============================================================================
  // STATE
  // ============================================================================
  
  const state = {
    currentCount: 0,
    displayedCount: 0,
    element: null,
    countElement: null,
    updateTimer: null,
    initialized: false
  };

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  function init() {
    // Create or find presence indicator
    state.element = document.querySelector('.presence-indicator, [data-presence]');
    
    if (!state.element) {
      // Create the indicator
      state.element = createIndicator();
      
      // Find best placement
      const hero = document.querySelector('.hero, [data-hero]');
      const trustBadges = document.querySelector('.hero__badges, .trust-badges');
      
      if (trustBadges) {
        trustBadges.appendChild(state.element);
      } else if (hero) {
        hero.appendChild(state.element);
      } else {
        document.body.appendChild(state.element);
      }
    }
    
    state.countElement = state.element.querySelector('.presence-indicator__count');
    
    // Initialize count
    state.currentCount = getRandomCount();
    state.displayedCount = state.currentCount;
    updateDisplay(state.currentCount, false);
    
    // Show after delay
    setTimeout(() => {
      state.element.classList.add('is-visible');
    }, CONFIG.showDelay);
    
    // Start periodic updates
    state.updateTimer = setInterval(updateCount, CONFIG.updateInterval);
    
    state.initialized = true;
    logDebug('Presence Indicator initialized');
  }

  // ============================================================================
  // CREATE INDICATOR DOM
  // ============================================================================
  
  function createIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'presence-indicator';
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-live', 'polite');
    
    indicator.innerHTML = `
      <div class="presence-indicator__pulse"></div>
      <div class="presence-indicator__content">
        <span class="presence-indicator__count">0</span>
        <span class="presence-indicator__text">people talking with Ferni right now</span>
      </div>
    `;
    
    return indicator;
  }

  // ============================================================================
  // COUNT MANAGEMENT
  // ============================================================================
  
  function getRandomCount() {
    return Math.floor(CONFIG.minCount + Math.random() * (CONFIG.maxCount - CONFIG.minCount));
  }
  
  function updateCount() {
    const fluctuationAmount = Math.floor(state.currentCount * CONFIG.fluctuation);
    const change = Math.floor(Math.random() * fluctuationAmount * 2) - fluctuationAmount;
    
    let newCount = state.currentCount + change;
    
    // Keep within bounds
    newCount = Math.max(CONFIG.minCount, Math.min(CONFIG.maxCount, newCount));
    
    // Animate to new count
    animateCount(state.currentCount, newCount);
    state.currentCount = newCount;
    
    // Pulse animation
    state.element.classList.add('is-updating');
    setTimeout(() => {
      state.element.classList.remove('is-updating');
    }, 600);
    
    logDebug('Updated count to', newCount);
  }
  
  function animateCount(from, to) {
    const duration = CONFIG.animationDuration;
    const startTime = performance.now();
    const difference = to - from;
    
    function step(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease out
      const eased = 1 - Math.pow(1 - progress, 3);
      
      const currentValue = Math.round(from + difference * eased);
      updateDisplay(currentValue, true);
      
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }
    
    requestAnimationFrame(step);
  }
  
  function updateDisplay(count, animate = false) {
    if (!state.countElement) return;
    
    state.countElement.textContent = count;
    state.displayedCount = count;
    
    if (animate) {
      state.countElement.classList.add('is-changing');
      setTimeout(() => {
        state.countElement.classList.remove('is-changing');
      }, 200);
    }
  }

  // ============================================================================
  // UTILITY
  // ============================================================================
  
  function logDebug(...args) {
    if (CONFIG.debugMode) {
      console.log('[PresenceIndicator]', ...args);
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  
  window.FerniPresenceIndicator = {
    init,
    getCount: () => state.currentCount,
    forceUpdate: updateCount,
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

