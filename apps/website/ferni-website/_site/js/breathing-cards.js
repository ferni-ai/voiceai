/**
 * Breathing Testimonial Cards
 * Cards that subtly "breathe" and react to hover with depth
 * Creates a living, organic feel
 */

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  const CONFIG = {
    breatheDuration: 4000,       // Full breath cycle in ms
    breatheScale: 1.01,          // How much cards scale on breath
    hoverRotation: 5,            // Max rotation on hover in degrees
    hoverScale: 1.03,            // Scale on hover
    hoverPerspective: 1000,      // 3D perspective
    shadowIntensity: 0.15,       // Shadow opacity
    staggerDelay: 200,           // Delay between card breath phases
    debugMode: false
  };

  // ============================================================================
  // STATE
  // ============================================================================
  
  const state = {
    cards: [],
    observer: null,
    initialized: false
  };

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  function init() {
    // Find all testimonial cards
    state.cards = document.querySelectorAll(
      '.testimonial-card, .card--testimonial, [data-breathing-card]'
    );
    
    if (state.cards.length === 0) {
      logDebug('No breathing cards found');
      return;
    }
    
    // Prepare each card
    state.cards.forEach((card, index) => {
      prepareCard(card, index);
    });
    
    // Set up intersection observer for performance
    setupObserver();
    
    state.initialized = true;
    logDebug('Breathing Cards initialized with', state.cards.length, 'cards');
  }

  // ============================================================================
  // CARD PREPARATION
  // ============================================================================
  
  function prepareCard(card, index) {
    // Add breathing class
    card.classList.add('breathing-card');
    
    // Set staggered animation delay
    const delay = (index * CONFIG.staggerDelay) % CONFIG.breatheDuration;
    card.style.setProperty('--breath-delay', `${delay}ms`);
    
    // Add hover listeners
    card.addEventListener('mouseenter', handleMouseEnter);
    card.addEventListener('mousemove', handleMouseMove);
    card.addEventListener('mouseleave', handleMouseLeave);
    
    // Create glow layer
    const glow = document.createElement('div');
    glow.className = 'breathing-card__glow';
    glow.setAttribute('aria-hidden', 'true');
    card.appendChild(glow);
    
    // Store reference
    card._breathingGlow = glow;
  }

  // ============================================================================
  // HOVER INTERACTIONS
  // ============================================================================
  
  function handleMouseEnter(e) {
    const card = e.currentTarget;
    card.classList.add('is-hovered');
  }
  
  function handleMouseMove(e) {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    
    // Calculate mouse position relative to card center (-0.5 to 0.5)
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    
    // Calculate rotation (inverted for natural feel)
    const rotateX = y * CONFIG.hoverRotation * -1;
    const rotateY = x * CONFIG.hoverRotation;
    
    // Apply 3D transform
    card.style.transform = `
      perspective(${CONFIG.hoverPerspective}px)
      rotateX(${rotateX}deg)
      rotateY(${rotateY}deg)
      scale(${CONFIG.hoverScale})
    `;
    
    // Move glow to mouse position
    if (card._breathingGlow) {
      card._breathingGlow.style.left = `${(x + 0.5) * 100}%`;
      card._breathingGlow.style.top = `${(y + 0.5) * 100}%`;
    }
    
    // Update shadow based on rotation
    const shadowX = rotateY * 2;
    const shadowY = rotateX * -2;
    card.style.boxShadow = `
      ${shadowX}px ${shadowY + 4}px 20px rgba(0, 0, 0, ${CONFIG.shadowIntensity}),
      0 2px 8px rgba(0, 0, 0, 0.05)
    `;
  }
  
  function handleMouseLeave(e) {
    const card = e.currentTarget;
    card.classList.remove('is-hovered');
    
    // Reset transform with transition
    card.style.transform = '';
    card.style.boxShadow = '';
  }

  // ============================================================================
  // INTERSECTION OBSERVER - Pause breathing when not visible
  // ============================================================================
  
  function setupObserver() {
    state.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-breathing');
        } else {
          entry.target.classList.remove('is-breathing');
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '50px'
    });
    
    state.cards.forEach(card => {
      state.observer.observe(card);
    });
  }

  // ============================================================================
  // UTILITY
  // ============================================================================
  
  function logDebug(...args) {
    if (CONFIG.debugMode) {
      console.log('[BreathingCards]', ...args);
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  
  window.FerniBreathingCards = {
    init,
    refresh: () => {
      state.cards.forEach(card => {
        card.classList.remove('breathing-card', 'is-breathing', 'is-hovered');
        if (card._breathingGlow) {
          card._breathingGlow.remove();
        }
      });
      init();
    },
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

