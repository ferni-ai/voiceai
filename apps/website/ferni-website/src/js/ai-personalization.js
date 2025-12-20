/**
 * AI-Aware Personalization System
 * "Better than human" - because we notice things humans forget to notice
 * 
 * Features:
 * - Time-aware greetings with emotional intelligence
 * - Visitor memory with behavioral profiling
 * - Scroll-depth adaptive CTAs with urgency calibration
 * - Mood-based color temperature shifts
 * - Engagement velocity tracking
 * - Hesitation detection (pausing = uncertainty)
 * - Section dwell time analysis
 * - Predictive intent modeling
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
    enableEngagementTracking: true,
    enableHesitationDetection: true,
    enablePredictiveHints: true,
    hesitationThreshold: 3000, // ms of inactivity = hesitation
    dwellTimeThreshold: 2000,  // ms to count as "reading" a section
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
  // STATE - Comprehensive behavioral tracking
  // ============================================================================
  
  const state = {
    // Time
    currentHour: new Date().getHours(),
    currentMinute: new Date().getMinutes(),
    
    // Visitor profile
    visitCount: 0,
    lastVisit: null,
    isReturning: false,
    visitorTier: null,
    totalTimeOnSite: 0,
    
    // Current session
    sessionStart: Date.now(),
    currentTimeBlock: null,
    maxScrollDepth: 0,
    scrollVelocity: 0,
    lastScrollTime: 0,
    
    // Engagement metrics
    engagement: {
      sectionsViewed: [],
      dwellTimes: {},         // section -> ms spent
      interactionCount: 0,
      hoverCount: 0,
      lastActivity: Date.now(),
      isHesitating: false,
      hesitationCount: 0,
      readingSpeed: 'normal', // slow, normal, fast
    },
    
    // Behavioral signals
    behavior: {
      scrollDirection: 'down',
      scrollPatterns: [],     // Track scroll behavior over time
      revisitedSections: [],  // Sections scrolled back to
      mouseIdleTime: 0,
      cursorHeatmap: [],      // Areas of high cursor activity
    },
    
    // Intent prediction
    intent: {
      interest: 'unknown',    // high, medium, low
      readiness: 0,           // 0-100 score
      friction: [],           // Detected friction points
      predicted: null,        // Predicted next action
    },
    
    initialized: false
  };
  
  // ============================================================================
  // ENGAGEMENT VELOCITY TRACKING
  // ============================================================================
  
  const engagementHistory = [];
  const ENGAGEMENT_WINDOW = 30000; // 30 second window

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
    
    // New enhanced features
    if (CONFIG.enableEngagementTracking) {
      setupEngagementTracking();
    }
    
    if (CONFIG.enableHesitationDetection) {
      setupHesitationDetection();
    }
    
    if (CONFIG.enablePredictiveHints) {
      setupPredictiveHints();
    }
    
    // Setup section observation for dwell time
    setupSectionObserver();
    
    // Track session duration
    setupSessionTracking();
    
    // Late night special treatment
    if (isLateNight()) {
      applyLateNightSpecial();
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
  // ENGAGEMENT TRACKING - Measure how users interact
  // ============================================================================
  
  function setupEngagementTracking() {
    // Track mouse movements for engagement velocity
    let lastMouseMove = Date.now();
    let moveCount = 0;
    
    document.addEventListener('mousemove', throttle(() => {
      const now = Date.now();
      moveCount++;
      
      // Calculate engagement velocity (moves per second)
      const elapsed = now - lastMouseMove;
      if (elapsed > 1000) {
        const velocity = moveCount / (elapsed / 1000);
        recordEngagement('mousemove', velocity);
        moveCount = 0;
        lastMouseMove = now;
      }
      
      state.engagement.lastActivity = now;
      state.behavior.mouseIdleTime = 0;
    }, 100), { passive: true });
    
    // Track clicks
    document.addEventListener('click', (e) => {
      state.engagement.interactionCount++;
      recordEngagement('click', 1);
      
      // Track what was clicked
      const target = e.target.closest('a, button, [data-action]');
      if (target) {
        logDebug('Interaction', { element: target.tagName, text: target.textContent?.slice(0, 30) });
      }
    });
    
    // Track hovers on important elements
    document.querySelectorAll('.btn, .testimonial, .feature, .pricing-card').forEach(el => {
      el.addEventListener('mouseenter', () => {
        state.engagement.hoverCount++;
        recordEngagement('hover', 0.5);
      });
    });
    
    // Periodically calculate engagement score
    setInterval(updateEngagementScore, 5000);
  }
  
  function recordEngagement(type, value) {
    const now = Date.now();
    engagementHistory.push({ type, value, time: now });
    
    // Prune old entries
    while (engagementHistory.length > 0 && engagementHistory[0].time < now - ENGAGEMENT_WINDOW) {
      engagementHistory.shift();
    }
  }
  
  function updateEngagementScore() {
    const now = Date.now();
    
    // Calculate weighted engagement from recent activity
    let score = 0;
    const weights = { click: 10, hover: 3, mousemove: 0.5, scroll: 1 };
    
    for (const entry of engagementHistory) {
      const age = (now - entry.time) / ENGAGEMENT_WINDOW;
      const decay = 1 - age; // More recent = higher weight
      score += (weights[entry.type] || 1) * entry.value * decay;
    }
    
    // Normalize to 0-100
    state.intent.readiness = Math.min(100, Math.round(score));
    
    // Determine interest level
    if (state.intent.readiness > 70) {
      state.intent.interest = 'high';
    } else if (state.intent.readiness > 30) {
      state.intent.interest = 'medium';
    } else {
      state.intent.interest = 'low';
    }
    
    // Trigger UI updates based on engagement
    if (state.intent.readiness > 80 && !state.intent.highEngagementShown) {
      state.intent.highEngagementShown = true;
      showHighEngagementHint();
    }
    
    logDebug('Engagement score', { 
      readiness: state.intent.readiness, 
      interest: state.intent.interest 
    });
  }
  
  function showHighEngagementHint() {
    // User is highly engaged - subtly encourage conversion
    const ctas = document.querySelectorAll('.btn--primary');
    ctas.forEach(cta => {
      cta.classList.add('btn--engaged');
    });
    
    // Could also trigger a subtle animation or highlight
  }
  
  // ============================================================================
  // HESITATION DETECTION - Notice when users pause
  // ============================================================================
  
  function setupHesitationDetection() {
    let hesitationTimer = null;
    
    const resetHesitation = () => {
      if (hesitationTimer) {
        clearTimeout(hesitationTimer);
      }
      
      if (state.engagement.isHesitating) {
        state.engagement.isHesitating = false;
        document.body.classList.remove('user-hesitating');
      }
      
      hesitationTimer = setTimeout(() => {
        state.engagement.isHesitating = true;
        state.engagement.hesitationCount++;
        document.body.classList.add('user-hesitating');
        
        onHesitationDetected();
      }, CONFIG.hesitationThreshold);
    };
    
    // Reset hesitation timer on any activity
    ['mousemove', 'scroll', 'keydown', 'click', 'touchstart'].forEach(event => {
      document.addEventListener(event, resetHesitation, { passive: true });
    });
    
    resetHesitation();
  }
  
  function onHesitationDetected() {
    logDebug('Hesitation detected', { count: state.engagement.hesitationCount });
    
    // After multiple hesitations, offer help
    if (state.engagement.hesitationCount >= 3) {
      showHelpfulNudge();
    }
    
    // Track which section they hesitated on
    const currentSection = getCurrentVisibleSection();
    if (currentSection) {
      state.intent.friction.push({
        section: currentSection,
        time: Date.now(),
        scrollDepth: state.maxScrollDepth
      });
    }
  }
  
  function showHelpfulNudge() {
    // Don't show if already shown this session
    if (state.helpfulNudgeShown) return;
    state.helpfulNudgeShown = true;
    
    // Find a good place to show a subtle nudge
    const nudgeTarget = document.querySelector('.hero__cta .btn--secondary');
    if (nudgeTarget) {
      nudgeTarget.classList.add('btn--attention');
      
      // Create a subtle tooltip
      const nudge = document.createElement('span');
      nudge.className = 'helpful-nudge';
      nudge.textContent = 'Questions? I can help.';
      nudge.setAttribute('role', 'tooltip');
      nudgeTarget.style.position = 'relative';
      nudgeTarget.appendChild(nudge);
      
      // Auto-hide after 5 seconds
      setTimeout(() => {
        nudge.classList.add('helpful-nudge--fading');
        setTimeout(() => nudge.remove(), 500);
      }, 5000);
    }
  }
  
  // ============================================================================
  // SECTION OBSERVATION - Track which sections user reads
  // ============================================================================
  
  function setupSectionObserver() {
    const sections = document.querySelectorAll('section[id], [data-section]');
    if (sections.length === 0) return;
    
    const sectionTimers = new Map();
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const id = entry.target.id || entry.target.dataset.section || 'unknown';
        
        if (entry.isIntersecting) {
          // Start timing
          sectionTimers.set(id, Date.now());
          
          // Mark as viewed
          if (!state.engagement.sectionsViewed.includes(id)) {
            state.engagement.sectionsViewed.push(id);
          }
        } else {
          // Stop timing and record dwell time
          const startTime = sectionTimers.get(id);
          if (startTime) {
            const dwellTime = Date.now() - startTime;
            state.engagement.dwellTimes[id] = (state.engagement.dwellTimes[id] || 0) + dwellTime;
            sectionTimers.delete(id);
            
            // Check if this was meaningful engagement
            if (dwellTime > CONFIG.dwellTimeThreshold) {
              logDebug('Section read', { id, dwellTime: Math.round(dwellTime / 1000) + 's' });
            }
          }
        }
      });
    }, {
      threshold: 0.5 // 50% visible
    });
    
    sections.forEach(section => observer.observe(section));
  }
  
  function getCurrentVisibleSection() {
    const sections = document.querySelectorAll('section[id], [data-section]');
    const viewportMiddle = window.innerHeight / 2;
    
    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      if (rect.top < viewportMiddle && rect.bottom > viewportMiddle) {
        return section.id || section.dataset.section;
      }
    }
    return null;
  }
  
  // ============================================================================
  // PREDICTIVE HINTS - Anticipate what user needs
  // ============================================================================
  
  function setupPredictiveHints() {
    // Predict based on scroll behavior
    window.addEventListener('scroll', throttle(() => {
      predictUserIntent();
    }, 1000), { passive: true });
  }
  
  function predictUserIntent() {
    const signals = [];
    
    // Signal: Rapid scrolling past content = not interested
    if (state.scrollVelocity > 500) {
      signals.push({ signal: 'skimming', weight: -1 });
    }
    
    // Signal: Slow, methodical scrolling = interested
    if (state.scrollVelocity > 0 && state.scrollVelocity < 100) {
      signals.push({ signal: 'reading', weight: 1 });
    }
    
    // Signal: Revisited sections = comparison shopping
    if (state.behavior.revisitedSections.length > 2) {
      signals.push({ signal: 'comparing', weight: 0.5 });
    }
    
    // Signal: Spent time on pricing = purchase intent
    if ((state.engagement.dwellTimes['pricing'] || 0) > 5000) {
      signals.push({ signal: 'pricing_interested', weight: 2 });
    }
    
    // Signal: Read testimonials = seeking validation
    if ((state.engagement.dwellTimes['testimonials'] || 0) > 3000) {
      signals.push({ signal: 'seeking_validation', weight: 1.5 });
    }
    
    // Calculate predicted action
    const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
    
    if (totalWeight > 3) {
      state.intent.predicted = 'likely_to_convert';
      highlightConversionPath();
    } else if (totalWeight < -1) {
      state.intent.predicted = 'may_bounce';
      showRetentionElement();
    }
  }
  
  function highlightConversionPath() {
    // Subtle enhancement of CTAs for interested users
    document.querySelectorAll('.btn--primary').forEach(btn => {
      if (!btn.classList.contains('btn--highlighted')) {
        btn.classList.add('btn--highlighted');
      }
    });
  }
  
  function showRetentionElement() {
    // For users who might leave, show a value proposition
    // This is subtle - not a popup, just enhanced visibility
    const valueProps = document.querySelector('.value-props, .benefits');
    if (valueProps && !valueProps.classList.contains('retention-highlight')) {
      valueProps.classList.add('retention-highlight');
    }
  }
  
  // ============================================================================
  // SESSION TRACKING
  // ============================================================================
  
  function setupSessionTracking() {
    // Track total time on page
    setInterval(() => {
      state.totalTimeOnSite = Date.now() - state.sessionStart;
    }, 1000);
    
    // Save session data before leaving
    window.addEventListener('beforeunload', () => {
      saveSessionData();
    });
  }
  
  function saveSessionData() {
    try {
      const sessionData = {
        duration: Date.now() - state.sessionStart,
        maxScrollDepth: state.maxScrollDepth,
        sectionsViewed: state.engagement.sectionsViewed,
        interactionCount: state.engagement.interactionCount,
        readiness: state.intent.readiness
      };
      
      // Append to session history
      const history = JSON.parse(localStorage.getItem('ferni_session_history') || '[]');
      history.push(sessionData);
      
      // Keep only last 10 sessions
      while (history.length > 10) {
        history.shift();
      }
      
      localStorage.setItem('ferni_session_history', JSON.stringify(history));
    } catch (e) {
      logDebug('Could not save session data');
    }
  }
  
  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================
  
  function throttle(fn, delay) {
    let lastCall = 0;
    return function(...args) {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        return fn.apply(this, args);
      }
    };
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

