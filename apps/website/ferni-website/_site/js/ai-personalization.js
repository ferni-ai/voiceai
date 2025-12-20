/**
 * 🧠 AI-Aware Personalization
 * "Better than human" - because we notice things humans forget to notice
 * 
 * Features:
 * - Time-aware greetings: "It's 3:47 AM. Still up?"
 * - Returning visitor recognition with memory
 * - Scroll-depth adaptive CTAs
 * - Mood-based color temperature shifts
 * - Contextual testimonial selection
 * 
 * Philosophy: The best AI doesn't show off—it just... notices.
 */

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  const CONFIG = {
    enableTimeAware: true,
    enableVisitorMemory: true,
    enableAdaptiveCTAs: true,
    enableMoodShift: true,
    enablePersonalizedTestimonials: true,
    debugMode: false
  };

  // ============================================================================
  // TIME-AWARE COPY SYSTEM
  // ============================================================================
  
  const TIME_COPY = {
    // Late night (11 PM - 4 AM) - Vulnerable, intimate
    lateNight: {
      hours: [23, 0, 1, 2, 3, 4],
      tagline: "Still up?",
      headline: "Finally, someone who <span class='hero__headline-accent'>gets it.</span>",
      subhead: "It's late. You're still thinking about something. That's okay—I'm here.",
      ctaPrimary: "Let's Talk",
      ctaSecondary: "Just Listen",
      mood: 'intimate',
      testimonialTags: ['anxiety', 'sleep', 'overthinking']
    },
    
    // Early morning (5 AM - 7 AM) - Quiet determination
    earlyMorning: {
      hours: [5, 6, 7],
      tagline: "You're up early.",
      headline: "Finally, someone who <span class='hero__headline-accent'>gets it.</span>",
      subhead: "The quiet hours are for people who are working on something. What's yours?",
      ctaPrimary: "Start Today",
      ctaSecondary: "Call Me",
      mood: 'determined',
      testimonialTags: ['productivity', 'goals', 'habits']
    },
    
    // Morning (8 AM - 11 AM) - Fresh energy
    morning: {
      hours: [8, 9, 10, 11],
      tagline: "Good morning.",
      headline: "Finally, someone who <span class='hero__headline-accent'>gets it.</span>",
      subhead: "A fresh day. No judgment about yesterday. Just: what do you need today?",
      ctaPrimary: "Start Free",
      ctaSecondary: "Call Now",
      mood: 'energized',
      testimonialTags: ['motivation', 'clarity', 'focus']
    },
    
    // Midday (12 PM - 2 PM) - Reflective pause
    midday: {
      hours: [12, 13, 14],
      tagline: "Taking a moment?",
      headline: "Finally, someone who <span class='hero__headline-accent'>gets it.</span>",
      subhead: "The middle of the day is a good time to check in. How are you really doing?",
      ctaPrimary: "Let's Chat",
      ctaSecondary: "Quick Call",
      mood: 'reflective',
      testimonialTags: ['stress', 'work-life', 'pause']
    },
    
    // Afternoon (3 PM - 5 PM) - Productive energy
    afternoon: {
      hours: [15, 16, 17],
      tagline: "Afternoon check-in.",
      headline: "Finally, someone who <span class='hero__headline-accent'>gets it.</span>",
      subhead: "The day's not over. Neither is your momentum. What's on your mind?",
      ctaPrimary: "Start Free",
      ctaSecondary: "Schedule Call",
      mood: 'productive',
      testimonialTags: ['career', 'decisions', 'growth']
    },
    
    // Evening (6 PM - 8 PM) - Winding down
    evening: {
      hours: [18, 19, 20],
      tagline: "Evening.",
      headline: "Finally, someone who <span class='hero__headline-accent'>gets it.</span>",
      subhead: "The day's settling. Time to process what happened—or plan what's next.",
      ctaPrimary: "Talk It Out",
      ctaSecondary: "Call Ferni",
      mood: 'unwinding',
      testimonialTags: ['reflection', 'relationships', 'processing']
    },
    
    // Night (9 PM - 10 PM) - Thoughtful
    night: {
      hours: [21, 22],
      tagline: "Quiet night.",
      headline: "Finally, someone who <span class='hero__headline-accent'>gets it.</span>",
      subhead: "The noise of the day fades. This is when the real thoughts come. I'm ready.",
      ctaPrimary: "Start Talking",
      ctaSecondary: "Call Now",
      mood: 'thoughtful',
      testimonialTags: ['anxiety', 'planning', 'dreams']
    }
  };

  // ============================================================================
  // RETURNING VISITOR MEMORY
  // ============================================================================
  
  const RETURNING_VISITOR_COPY = {
    // Second visit
    returning: {
      minVisits: 2,
      maxVisits: 3,
      taglinePrefix: "You came back.",
      subheadSuffix: " I'm glad you're here again."
    },
    
    // Regular visitor (4-10 visits)
    familiar: {
      minVisits: 4,
      maxVisits: 10,
      taglinePrefix: "Hey again.",
      subheadSuffix: " Ready when you are."
    },
    
    // Loyal visitor (10+ visits)
    loyal: {
      minVisits: 11,
      maxVisits: Infinity,
      taglinePrefix: "Welcome home.",
      subheadSuffix: " I remember you."
    }
  };

  // ============================================================================
  // SCROLL-DEPTH ADAPTIVE CTAS
  // ============================================================================
  
  const SCROLL_CTAS = {
    // Haven't scrolled much - still browsing
    shallow: {
      maxDepth: 20,
      text: "See How It Works",
      style: 'secondary'
    },
    
    // Read the story section
    engaged: {
      maxDepth: 50,
      text: "Start Talking to Ferni",
      style: 'primary'
    },
    
    // Seen most of the page
    convinced: {
      maxDepth: 80,
      text: "Try Free - No Credit Card",
      style: 'primary-emphasized'
    },
    
    // Scrolled to bottom
    ready: {
      maxDepth: 100,
      text: "Start Your Conversation",
      style: 'primary-urgent'
    }
  };

  // ============================================================================
  // STATE
  // ============================================================================
  
  const state = {
    currentHour: new Date().getHours(),
    visitCount: 0,
    lastVisit: null,
    maxScrollDepth: 0,
    currentTimeBlock: null,
    isReturning: false,
    visitorTier: null,
    initialized: false
  };

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  function init() {
    // Load visitor data
    loadVisitorData();
    
    // Determine time block
    state.currentTimeBlock = getTimeBlock(state.currentHour);
    
    // Apply personalizations
    if (CONFIG.enableTimeAware) {
      applyTimeCopy();
    }
    
    if (CONFIG.enableVisitorMemory && state.isReturning) {
      applyReturningVisitorCopy();
    }
    
    if (CONFIG.enableMoodShift) {
      applyMoodShift();
    }
    
    if (CONFIG.enableAdaptiveCTAs) {
      setupScrollTracking();
    }
    
    // Save visit
    saveVisitorData();
    
    state.initialized = true;
    logDebug('AI Personalization initialized', {
      hour: state.currentHour,
      timeBlock: state.currentTimeBlock?.mood,
      visitCount: state.visitCount,
      isReturning: state.isReturning
    });
  }

  // ============================================================================
  // VISITOR DATA PERSISTENCE
  // ============================================================================
  
  function loadVisitorData() {
    try {
      const stored = localStorage.getItem('ferni_visitor_profile');
      if (stored) {
        const data = JSON.parse(stored);
        state.visitCount = data.visitCount || 0;
        state.lastVisit = data.lastVisit ? new Date(data.lastVisit) : null;
        state.isReturning = state.visitCount > 0;
        
        // Determine visitor tier
        for (const [tier, config] of Object.entries(RETURNING_VISITOR_COPY)) {
          if (state.visitCount >= config.minVisits && state.visitCount <= config.maxVisits) {
            state.visitorTier = tier;
            break;
          }
        }
      }
    } catch (e) {
      logDebug('Could not load visitor data', e);
    }
  }
  
  function saveVisitorData() {
    try {
      const data = {
        visitCount: state.visitCount + 1,
        lastVisit: new Date().toISOString(),
        lastHour: state.currentHour,
        lastTimeBlock: state.currentTimeBlock?.mood
      };
      localStorage.setItem('ferni_visitor_profile', JSON.stringify(data));
    } catch (e) {
      logDebug('Could not save visitor data', e);
    }
  }

  // ============================================================================
  // TIME-BASED COPY
  // ============================================================================
  
  function getTimeBlock(hour) {
    for (const [name, block] of Object.entries(TIME_COPY)) {
      if (block.hours.includes(hour)) {
        return { name, ...block };
      }
    }
    return TIME_COPY.morning; // Fallback
  }
  
  function applyTimeCopy() {
    const block = state.currentTimeBlock;
    if (!block) return;
    
    // Update tagline
    const taglineEl = document.querySelector('.hero__tagline');
    if (taglineEl) {
      taglineEl.textContent = block.tagline;
      taglineEl.classList.add('ai-personalized');
    }
    
    // Update headline
    const headlineEl = document.querySelector('.hero__headline');
    if (headlineEl) {
      headlineEl.innerHTML = block.headline;
    }
    
    // Update subhead
    const subheadEl = document.querySelector('.hero__subhead');
    if (subheadEl) {
      subheadEl.textContent = block.subhead;
      subheadEl.classList.add('ai-personalized');
    }
    
    // Update CTA text
    const primaryCTA = document.querySelector('.hero__cta .btn--primary');
    if (primaryCTA) {
      // Keep the arrow icon, just update text
      const arrow = primaryCTA.querySelector('svg');
      primaryCTA.textContent = block.ctaPrimary + ' ';
      if (arrow) primaryCTA.appendChild(arrow);
    }
    
    const secondaryCTA = document.querySelector('.hero__cta .btn--secondary');
    if (secondaryCTA) {
      // Keep the phone icon, just update text
      const icon = secondaryCTA.querySelector('svg');
      if (icon) {
        secondaryCTA.innerHTML = '';
        secondaryCTA.appendChild(icon);
        secondaryCTA.appendChild(document.createTextNode(' ' + block.ctaSecondary));
      } else {
        secondaryCTA.textContent = block.ctaSecondary;
      }
    }
    
    logDebug('Applied time-aware copy', { mood: block.mood, tagline: block.tagline });
  }

  // ============================================================================
  // RETURNING VISITOR COPY
  // ============================================================================
  
  function applyReturningVisitorCopy() {
    if (!state.visitorTier) return;
    
    const tierConfig = RETURNING_VISITOR_COPY[state.visitorTier];
    if (!tierConfig) return;
    
    // Modify tagline with prefix
    const taglineEl = document.querySelector('.hero__tagline');
    if (taglineEl) {
      const currentTagline = taglineEl.textContent;
      taglineEl.textContent = tierConfig.taglinePrefix;
      taglineEl.classList.add('ai-returning-visitor');
    }
    
    // Modify subhead with suffix
    const subheadEl = document.querySelector('.hero__subhead');
    if (subheadEl) {
      const currentSubhead = subheadEl.textContent;
      subheadEl.textContent = currentSubhead.replace(/\.$/, '') + '.' + tierConfig.subheadSuffix;
    }
    
    logDebug('Applied returning visitor copy', { tier: state.visitorTier, visits: state.visitCount });
  }

  // ============================================================================
  // MOOD-BASED COLOR SHIFT
  // ============================================================================
  
  function applyMoodShift() {
    const block = state.currentTimeBlock;
    if (!block) return;
    
    const root = document.documentElement;
    
    // Subtle temperature shifts based on time
    const moodStyles = {
      intimate: {
        '--hero-bg-warmth': '1.05',
        '--hero-glow-opacity': '0.6',
        '--hero-glow-spread': '120px'
      },
      determined: {
        '--hero-bg-warmth': '1.02',
        '--hero-glow-opacity': '0.4',
        '--hero-glow-spread': '80px'
      },
      energized: {
        '--hero-bg-warmth': '1.0',
        '--hero-glow-opacity': '0.5',
        '--hero-glow-spread': '100px'
      },
      reflective: {
        '--hero-bg-warmth': '1.0',
        '--hero-glow-opacity': '0.45',
        '--hero-glow-spread': '90px'
      },
      productive: {
        '--hero-bg-warmth': '0.98',
        '--hero-glow-opacity': '0.4',
        '--hero-glow-spread': '70px'
      },
      unwinding: {
        '--hero-bg-warmth': '1.03',
        '--hero-glow-opacity': '0.5',
        '--hero-glow-spread': '100px'
      },
      thoughtful: {
        '--hero-bg-warmth': '1.04',
        '--hero-glow-opacity': '0.55',
        '--hero-glow-spread': '110px'
      }
    };
    
    const styles = moodStyles[block.mood];
    if (styles) {
      for (const [prop, value] of Object.entries(styles)) {
        root.style.setProperty(prop, value);
      }
      
      // Add mood class to body
      document.body.classList.add(`mood-${block.mood}`);
    }
    
    logDebug('Applied mood shift', { mood: block.mood });
  }

  // ============================================================================
  // SCROLL-ADAPTIVE CTAS
  // ============================================================================
  
  function setupScrollTracking() {
    let ticking = false;
    
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          updateScrollDepth();
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }
  
  function updateScrollDepth() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const depth = Math.round((scrollTop / docHeight) * 100);
    
    if (depth > state.maxScrollDepth) {
      state.maxScrollDepth = depth;
      updateAdaptiveCTAs(depth);
    }
  }
  
  function updateAdaptiveCTAs(depth) {
    // Find the sticky CTA bar if it exists
    const stickyCTA = document.querySelector('.mobile-cta__btn, .sticky-cta');
    if (!stickyCTA) return;
    
    let selectedCTA = null;
    for (const [level, config] of Object.entries(SCROLL_CTAS)) {
      if (depth <= config.maxDepth) {
        selectedCTA = config;
        break;
      }
    }
    
    if (selectedCTA) {
      // Update CTA text
      const textNode = Array.from(stickyCTA.childNodes)
        .find(node => node.nodeType === Node.TEXT_NODE);
      if (textNode) {
        textNode.textContent = selectedCTA.text + ' ';
      }
      
      // Update style class
      stickyCTA.className = stickyCTA.className.replace(/btn--primary\S*/g, '');
      stickyCTA.classList.add(`btn--${selectedCTA.style}`);
      
      logDebug('Updated adaptive CTA', { depth, text: selectedCTA.text });
    }
  }

  // ============================================================================
  // LATE NIGHT SPECIAL - The 2am moment
  // ============================================================================
  
  function isLateNight() {
    return [23, 0, 1, 2, 3, 4].includes(state.currentHour);
  }
  
  function applyLateNightSpecial() {
    if (!isLateNight()) return;
    
    // Add special class for extra styling
    document.body.classList.add('late-night-mode');
    
    // Could also:
    // - Dim the overall brightness slightly
    // - Soften transitions
    // - Show the "2am moment" section more prominently
    
    const twoAmSection = document.querySelector('.two-am');
    if (twoAmSection) {
      twoAmSection.classList.add('two-am--highlighted');
    }
    
    logDebug('Applied late night special mode');
  }

  // ============================================================================
  // UTILITY
  // ============================================================================
  
  function logDebug(...args) {
    if (CONFIG.debugMode) {
      console.log('[AI-Personalization]', ...args);
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  
  window.FerniPersonalization = {
    init,
    getState: () => ({ ...state }),
    getTimeBlock: () => state.currentTimeBlock,
    isReturning: () => state.isReturning,
    getVisitorTier: () => state.visitorTier,
    isLateNight,
    forceTimeBlock: (hour) => {
      state.currentHour = hour;
      state.currentTimeBlock = getTimeBlock(hour);
      applyTimeCopy();
      applyMoodShift();
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

