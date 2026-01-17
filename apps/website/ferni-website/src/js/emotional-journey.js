/**
 * Emotional Journey Visualization
 * A beautiful flowing timeline showing how conversations evolve emotionally
 * Demonstrates Ferni's emotional intelligence and depth
 */

(function() {
  'use strict';

  // ============================================================================
  // SAMPLE JOURNEY DATA - Demonstrates emotional arc
  // ============================================================================
  
  const SAMPLE_JOURNEY = [
    {
      time: 'Week 1',
      emotion: 'anxious',
      intensity: 0.7,
      message: "I've been feeling overwhelmed with everything...",
      response: "That sounds like a lot to carry. Let's take it one thing at a time."
    },
    {
      time: 'Week 2',
      emotion: 'uncertain',
      intensity: 0.5,
      message: "I'm not sure if I can handle this new project",
      response: "What if we broke it into smaller pieces? What's the first tiny step?"
    },
    {
      time: 'Week 3',
      emotion: 'hopeful',
      intensity: 0.6,
      message: "The approach you suggested is actually working",
      response: "That's wonderful! You've been putting in real effort. How does it feel?"
    },
    {
      time: 'Week 4',
      emotion: 'confident',
      intensity: 0.8,
      message: "I presented the project and it went great!",
      response: "I remember how worried you were three weeks ago. Look how far you've come."
    },
    {
      time: 'Week 6',
      emotion: 'reflective',
      intensity: 0.6,
      message: "It's interesting looking back at where I started",
      response: "Growth often happens when we're not watching. What did you learn about yourself?"
    }
  ];

  // ============================================================================
  // EMOTION COLORS
  // ============================================================================
  
  const EMOTION_COLORS = {
    anxious: { color: '#a67a6a', label: 'Anxious' },
    uncertain: { color: '#8a7a6a', label: 'Uncertain' },
    hopeful: { color: '#7a9a7a', label: 'Hopeful' },
    confident: { color: '#4a6741', label: 'Confident' },
    reflective: { color: '#3a6b73', label: 'Reflective' },
    neutral: { color: '#5C544A', label: 'Neutral' }
  };

  // ============================================================================
  // STATE
  // ============================================================================
  
  const state = {
    container: null,
    journey: SAMPLE_JOURNEY,
    initialized: false,
    animationPlayed: false
  };

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  function init() {
    // Find or create container
    state.container = document.querySelector('.emotional-journey, [data-emotional-journey]');
    
    if (!state.container) {
      logDebug('No emotional journey container found');
      return;
    }
    
    // Build visualization
    buildVisualization();
    
    // Set up intersection observer for animation
    setupObserver();
    
    state.initialized = true;
    logDebug('Emotional Journey initialized');
  }

  // ============================================================================
  // BUILD VISUALIZATION
  // ============================================================================
  
  function buildVisualization() {
    state.container.innerHTML = `
      <div class="emotional-journey__header">
        <h3 class="emotional-journey__title">The Journey</h3>
        <p class="emotional-journey__subtitle">How conversations evolve over time</p>
      </div>
      
      <div class="emotional-journey__timeline">
        ${buildTimeline()}
      </div>
      
      <div class="emotional-journey__wave">
        <svg viewBox="0 0 600 100" preserveAspectRatio="none">
          ${buildWavePath()}
        </svg>
      </div>
      
      <div class="emotional-journey__legend">
        ${buildLegend()}
      </div>
    `;
    
    // Add interactive listeners
    setupInteractions();
  }
  
  function buildTimeline() {
    return state.journey.map((point, index) => {
      const emotionData = EMOTION_COLORS[point.emotion] || EMOTION_COLORS.neutral;
      const delay = index * 200;
      
      return `
        <div class="emotional-journey__point" 
             data-index="${index}"
             style="--emotion-color: ${emotionData.color}; --animation-delay: ${delay}ms">
          <div class="emotional-journey__marker">
            <div class="emotional-journey__dot"></div>
            <div class="emotional-journey__pulse"></div>
          </div>
          <div class="emotional-journey__content">
            <span class="emotional-journey__time">${point.time}</span>
            <span class="emotional-journey__emotion">${emotionData.label}</span>
            <div class="emotional-journey__preview">
              <p class="emotional-journey__message">"${point.message}"</p>
              <p class="emotional-journey__response">${point.response}</p>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
  
  function buildWavePath() {
    const width = 600;
    const height = 100;
    const points = state.journey.length;
    const segmentWidth = width / (points - 1);
    
    // Build SVG path
    let pathD = `M 0 ${height / 2}`;
    
    state.journey.forEach((point, index) => {
      const x = index * segmentWidth;
      const y = height - (point.intensity * height * 0.8) - 10;
      
      if (index === 0) {
        pathD = `M ${x} ${y}`;
      } else {
        const prevX = (index - 1) * segmentWidth;
        const prevY = height - (state.journey[index - 1].intensity * height * 0.8) - 10;
        const cpX = (prevX + x) / 2;
        pathD += ` C ${cpX} ${prevY}, ${cpX} ${y}, ${x} ${y}`;
      }
    });
    
    // Create gradient stops
    const gradientStops = state.journey.map((point, index) => {
      const emotionData = EMOTION_COLORS[point.emotion] || EMOTION_COLORS.neutral;
      const offset = (index / (state.journey.length - 1)) * 100;
      return `<stop offset="${offset}%" stop-color="${emotionData.color}" />`;
    }).join('');
    
    return `
      <defs>
        <linearGradient id="emotion-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          ${gradientStops}
        </linearGradient>
      </defs>
      <path class="emotional-journey__wave-path" 
            d="${pathD}" 
            fill="none" 
            stroke="url(#emotion-gradient)" 
            stroke-width="3"
            stroke-linecap="round" />
      <path class="emotional-journey__wave-fill" 
            d="${pathD} L ${width} ${height} L 0 ${height} Z" 
            fill="url(#emotion-gradient)"
            opacity="0.1" />
    `;
  }
  
  function buildLegend() {
    const usedEmotions = [...new Set(state.journey.map(p => p.emotion))];
    
    return usedEmotions.map(emotion => {
      const data = EMOTION_COLORS[emotion];
      return `
        <div class="emotional-journey__legend-item">
          <span class="emotional-journey__legend-dot" style="background: ${data.color}"></span>
          <span class="emotional-journey__legend-label">${data.label}</span>
        </div>
      `;
    }).join('');
  }

  // ============================================================================
  // INTERACTIONS
  // ============================================================================
  
  function setupInteractions() {
    const points = state.container.querySelectorAll('.emotional-journey__point');
    
    points.forEach(point => {
      point.addEventListener('mouseenter', () => {
        points.forEach(p => p.classList.remove('is-active'));
        point.classList.add('is-active');
      });
      
      point.addEventListener('mouseleave', () => {
        point.classList.remove('is-active');
      });
    });
  }

  // ============================================================================
  // ANIMATION
  // ============================================================================
  
  function setupObserver() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !state.animationPlayed) {
          state.animationPlayed = true;
          state.container.classList.add('is-animating');
        }
      });
    }, {
      threshold: 0.3
    });
    
    observer.observe(state.container);
  }

  // ============================================================================
  // UTILITY
  // ============================================================================
  
  function logDebug(...args) {
    console.log('[EmotionalJourney]', ...args);
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  
  window.FerniEmotionalJourney = {
    init,
    setJourney: (journey) => {
      state.journey = journey;
      if (state.initialized) {
        buildVisualization();
      }
    },
    replay: () => {
      state.animationPlayed = false;
      state.container.classList.remove('is-animating');
      requestAnimationFrame(() => {
        state.container.classList.add('is-animating');
        state.animationPlayed = true;
      });
    }
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

