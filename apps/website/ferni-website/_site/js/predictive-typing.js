/**
 * Predictive Typing Response System
 * Ferni shows micro-expressions AS you type, not after
 * 
 * The magic: We detect emotional keywords forming and react
 * BEFORE you finish typing. This creates an uncanny feeling
 * that Ferni is actually reading your mind.
 */

(function() {
  'use strict';

  // ============================================================================
  // EMOTIONAL KEYWORD PATTERNS - Partial matches trigger early reactions
  // ============================================================================
  
  const EMOTION_PATTERNS = {
    // Negative emotions - trigger concern
    concern: {
      partials: ['str', 'anx', 'worr', 'scar', 'afra', 'lone', 'sad', 'depr', 'over', 'exha', 'tire', 'burn'],
      fullWords: ['stress', 'stressed', 'anxious', 'anxiety', 'worried', 'worry', 'scared', 'afraid', 
                  'lonely', 'alone', 'sad', 'depressed', 'depression', 'overwhelmed', 'exhausted', 
                  'tired', 'burnout', 'burnt', 'panic', 'lost', 'stuck', 'confused', 'hurt', 'pain'],
      expression: 'concern',
      intensity: 0.7
    },
    
    // Positive emotions - trigger warmth/delight
    delight: {
      partials: ['hap', 'exc', 'ama', 'gre', 'won', 'love', 'joy'],
      fullWords: ['happy', 'excited', 'amazing', 'great', 'wonderful', 'love', 'loved', 'joyful', 
                  'grateful', 'thankful', 'blessed', 'awesome', 'fantastic', 'incredible'],
      expression: 'delighted',
      intensity: 0.8
    },
    
    // Questions/uncertainty - trigger curiosity
    curiosity: {
      partials: ['why', 'how', 'what', 'wond', 'curi', 'conf'],
      fullWords: ['why', 'how', 'what', 'wonder', 'wondering', 'curious', 'confused', 'uncertain', 
                  'maybe', 'perhaps', 'question', 'understand'],
      expression: 'curious',
      intensity: 0.6
    },
    
    // Deep topics - trigger thoughtfulness
    thoughtful: {
      partials: ['mean', 'purp', 'life', 'death', 'futu', 'past', 'rela'],
      fullWords: ['meaning', 'purpose', 'life', 'death', 'future', 'past', 'relationship', 
                  'career', 'family', 'identity', 'self', 'soul', 'believe', 'faith'],
      expression: 'thinking',
      intensity: 0.5
    },
    
    // Work/productivity - trigger interest
    interest: {
      partials: ['work', 'job', 'boss', 'proj', 'dead', 'meet'],
      fullWords: ['work', 'working', 'job', 'boss', 'project', 'deadline', 'meeting', 
                  'career', 'promotion', 'colleague', 'office', 'team'],
      expression: 'curious',
      intensity: 0.5
    }
  };

  // ============================================================================
  // STATE
  // ============================================================================
  
  const state = {
    currentInput: '',
    lastDetectedEmotion: null,
    detectionCooldown: false,
    typingStartTime: null,
    characterCount: 0,
    initialized: false
  };

  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  const CONFIG = {
    minCharsForDetection: 2,      // Start detecting after 2 chars
    cooldownMs: 1500,             // Don't re-trigger same emotion within 1.5s
    partialMatchBoost: 0.3,       // How much earlier to trigger on partials
    debugMode: false
  };

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  function init() {
    // Find demo widget input
    const demoInput = document.querySelector('.demo-widget__input');
    if (demoInput) {
      setupInputListener(demoInput);
    }
    
    // Also watch for dynamically created inputs
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            const input = node.querySelector?.('.demo-widget__input') || 
                          (node.classList?.contains('demo-widget__input') ? node : null);
            if (input && !input.dataset.predictiveTyping) {
              setupInputListener(input);
            }
          }
        });
      });
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    state.initialized = true;
    logDebug('Predictive Typing initialized');
  }

  // ============================================================================
  // INPUT LISTENER - The core magic
  // ============================================================================
  
  function setupInputListener(input) {
    input.dataset.predictiveTyping = 'true';
    
    input.addEventListener('input', (e) => {
      const value = e.target.value.toLowerCase();
      state.currentInput = value;
      state.characterCount = value.length;
      
      if (!state.typingStartTime && value.length > 0) {
        state.typingStartTime = Date.now();
      }
      
      if (value.length === 0) {
        state.typingStartTime = null;
        resetExpression();
        return;
      }
      
      // Only start detecting after minimum characters
      if (value.length < CONFIG.minCharsForDetection) return;
      
      // Detect emotion from partial input
      const detection = detectEmotionFromPartial(value);
      
      if (detection && !state.detectionCooldown) {
        triggerPredictiveExpression(detection);
      }
    });
    
    // Reset on blur
    input.addEventListener('blur', () => {
      setTimeout(() => {
        resetExpression();
      }, 500);
    });
  }

  // ============================================================================
  // EMOTION DETECTION - Partial matching for early triggers
  // ============================================================================
  
  function detectEmotionFromPartial(input) {
    const words = input.split(/\s+/);
    const lastWord = words[words.length - 1];
    const recentText = words.slice(-3).join(' '); // Last 3 words
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const [emotionType, pattern] of Object.entries(EMOTION_PATTERNS)) {
      // Check full words first (higher confidence)
      for (const word of pattern.fullWords) {
        if (recentText.includes(word)) {
          const score = pattern.intensity * 1.0;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = {
              type: emotionType,
              expression: pattern.expression,
              confidence: score,
              trigger: 'full',
              word: word
            };
          }
        }
      }
      
      // Check partial matches (earlier trigger, lower confidence)
      if (!bestMatch || bestMatch.trigger !== 'full') {
        for (const partial of pattern.partials) {
          if (lastWord.startsWith(partial) && lastWord.length >= partial.length) {
            const score = pattern.intensity * (0.6 + (lastWord.length / 10));
            if (score > bestScore) {
              bestScore = score;
              bestMatch = {
                type: emotionType,
                expression: pattern.expression,
                confidence: score,
                trigger: 'partial',
                word: lastWord
              };
            }
          }
        }
      }
    }
    
    return bestMatch;
  }

  // ============================================================================
  // EXPRESSION TRIGGERING - Communicate with Living Avatar
  // ============================================================================
  
  function triggerPredictiveExpression(detection) {
    // Don't re-trigger same emotion
    if (state.lastDetectedEmotion === detection.type && state.detectionCooldown) {
      return;
    }
    
    state.lastDetectedEmotion = detection.type;
    state.detectionCooldown = true;
    
    // Trigger the expression via FerniAvatar API
    if (window.FerniAvatar && window.FerniAvatar.express) {
      window.FerniAvatar.express(detection.expression);
      logDebug('Triggered expression', detection);
    }
    
    // Also update demo widget avatar if it exists
    updateDemoWidgetAvatar(detection);
    
    // Also dispatch event for other listeners
    document.dispatchEvent(new CustomEvent('ferni:predictive-emotion', {
      detail: detection
    }));
    
    // Reset cooldown
    setTimeout(() => {
      state.detectionCooldown = false;
    }, CONFIG.cooldownMs);
  }
  
  function updateDemoWidgetAvatar(detection) {
    const demoAvatar = document.querySelector('.demo-widget__mini-orb');
    if (!demoAvatar) return;
    
    // Remove previous emotion classes
    demoAvatar.classList.remove(
      'demo-widget__mini-orb--concern',
      'demo-widget__mini-orb--delight',
      'demo-widget__mini-orb--curious',
      'demo-widget__mini-orb--thinking'
    );
    
    // Add new emotion class
    demoAvatar.classList.add(`demo-widget__mini-orb--${detection.expression}`);
    
    // Also pulse the glow
    const glow = demoAvatar.querySelector('.demo-widget__mini-orb-glow');
    if (glow) {
      glow.classList.add('demo-widget__mini-orb-glow--pulse');
      setTimeout(() => {
        glow.classList.remove('demo-widget__mini-orb-glow--pulse');
      }, 600);
    }
    
    // Remove class after animation
    setTimeout(() => {
      demoAvatar.classList.remove(`demo-widget__mini-orb--${detection.expression}`);
    }, 800);
  }
  
  function resetExpression() {
    state.lastDetectedEmotion = null;
    
    // Dispatch reset event
    document.dispatchEvent(new CustomEvent('ferni:predictive-emotion', {
      detail: { type: 'neutral', expression: 'neutral' }
    }));
  }

  // ============================================================================
  // UTILITY
  // ============================================================================
  
  function logDebug(...args) {
    if (CONFIG.debugMode) {
      console.log('[PredictiveTyping]', ...args);
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  
  window.FerniPredictiveTyping = {
    init,
    getState: () => ({ ...state }),
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

