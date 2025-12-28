/**
 * AI Copy Magic - Gemini-Powered Dynamic Copy
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Unlocks the full power of Gemini AI for landing page copy:
 * 
 * 1. PERSONALIZED HERO - Headlines that adapt to visitor context
 * 2. SMART SOCIAL PROOF - AI-generated dynamic testimonials  
 * 3. ADAPTIVE CTAs - Copy changes based on visitor behavior
 * 4. LIVE CHAT PREVIEW - Real AI responses in the demo widget
 * 5. HOVER INSIGHTS - "What would Ferni say?" on any element
 * 6. PERSONA VOICES - Each team member speaks in their voice
 * 
 * @module ai-copy-magic
 */

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  const CONFIG = {
    // Backend API - detect environment automatically
    // Development: Direct to API server (localhost:3002)
    // Production: Relative URL proxied through Firebase Hosting → Cloud Run
    apiBase: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:3002/api/landing'
      : '/api/landing',
    aiApiBase: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:3002/api/landing/ai'
      : '/api/landing/ai',
    
    // Feature toggles
    enablePersonalizedHero: true,
    enableSmartSocialProof: true,
    enableAdaptiveCTA: true,
    enableHoverInsights: true,
    enablePersonaVoices: true,
    enableSentimentTracking: true,
    
    // Behavior thresholds
    engagedScrollDepth: 0.4, // 40% scroll = engaged
    hesitantTime: 30000, // 30s without action = hesitant
    veryEngagedTime: 60000, // 60s = very engaged
    
    // Cache settings
    cacheTTL: 5 * 60 * 1000, // 5 minutes
    
    // Debug
    debug: false,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════
  
  const state = {
    initialized: false,
    visitorId: null,
    visitCount: 1,
    isReturning: false,
    scrollDepth: 0,
    timeOnPage: 0,
    currentSection: 'hero',
    sentimentScore: 0.5, // 0 = hesitant, 1 = engaged
    interactions: 0,
    lastInteraction: Date.now(),
    sectionsViewed: new Set(['hero']),
    heroPersonalized: false,
    cache: new Map(),
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════
  
  function log(...args) {
    if (CONFIG.debug) {
      console.log('%c[AI Copy Magic]', 'color: #4a6741; font-weight: bold;', ...args);
    }
  }

  function getVisitorId() {
    let id = localStorage.getItem('ferni_visitor_id');
    if (!id) {
      id = 'fv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('ferni_visitor_id', id);
    }
    return id;
  }

  function getVisitCount() {
    const count = parseInt(localStorage.getItem('ferni_visit_count') || '0', 10) + 1;
    localStorage.setItem('ferni_visit_count', String(count));
    return count;
  }

  function getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 5) return 'late-night';
    if (hour >= 5 && hour < 9) return 'early-morning';
    if (hour >= 9 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 14) return 'lunch';
    if (hour >= 14 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  function getCacheKey(type, params) {
    return `${type}_${JSON.stringify(params)}`;
  }

  function getFromCache(key) {
    const entry = state.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CONFIG.cacheTTL) {
      state.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  function setCache(key, data) {
    state.cache.set(key, { data, timestamp: Date.now() });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // API CALLS
  // ═══════════════════════════════════════════════════════════════════════════
  
  async function fetchAI(endpoint, body = {}) {
    try {
      const response = await fetch(`${CONFIG.aiApiBase}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      log('API error:', error);
      return null;
    }
  }

  async function fetchOptimization() {
    try {
      const response = await fetch(`${CONFIG.apiBase}/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorId: state.visitorId,
          behaviorSignals: {
            scrollDepth: state.scrollDepth,
            timeOnPage: state.timeOnPage,
            sectionsViewed: Array.from(state.sectionsViewed),
            interactions: state.interactions,
          },
          device: window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop',
          currentSection: state.currentSection,
          hour: new Date().getHours(),
        }),
      });
      
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      log('Optimization error:', error);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSONALIZED HERO
  // ═══════════════════════════════════════════════════════════════════════════
  
  const HERO_VARIANTS = {
    // Late night visitors - empathetic, no judgment
    'late-night': {
      tagline: "CAN'T SLEEP? NEITHER CAN I.",
      headline: "I'm here. <span class='hero__headline-accent'>Right now.</span>",
      subhead: 'No judgment about the hour. No tired sighs. Just presence when you need it most.',
      cta: 'Talk to me',
    },
    // Early risers - energizing, fresh start
    'early-morning': {
      tagline: 'EARLY START? GOOD.',
      headline: "Let's make <span class='hero__headline-accent'>today count.</span>",
      subhead: 'Start your day with someone who remembers what you\'re working toward.',
      cta: 'Start your day',
    },
    // Regular morning - warm, inviting
    'morning': {
      tagline: 'GOOD MORNING.',
      headline: "Ready when <span class='hero__headline-accent'>you are.</span>",
      subhead: 'What\'s on your mind? I\'ve got all the time in the world.',
      cta: 'Begin a conversation',
    },
    // Lunch break - quick, respectful of time
    'lunch': {
      tagline: 'QUICK BREAK?',
      headline: "Let's make it <span class='hero__headline-accent'>count.</span>",
      subhead: 'Even a few minutes can shift your perspective.',
      cta: 'Quick check-in',
    },
    // Afternoon - focused, productive
    'afternoon': {
      tagline: 'AFTERNOON CLARITY.',
      headline: "What's <span class='hero__headline-accent'>weighing on you?</span>",
      subhead: 'Sometimes the afternoon slump is really something unspoken. Let\'s explore it.',
      cta: 'Talk it through',
    },
    // Evening - reflective, wind-down
    'evening': {
      tagline: 'HOW WAS YOUR DAY?',
      headline: "Ready to <span class='hero__headline-accent'>unpack it?</span>",
      subhead: 'End your day with someone who actually wants to hear about it.',
      cta: 'Reflect together',
    },
    // Night - calming, supportive
    'night': {
      tagline: 'LATE NIGHT THOUGHTS?',
      headline: "I'm still <span class='hero__headline-accent'>here.</span>",
      subhead: 'The quiet hours often bring the realest conversations.',
      cta: 'Talk to me',
    },
    // Returning visitor - recognition, warmth
    'returning': {
      tagline: 'WELCOME BACK.',
      headline: "Missed you. <span class='hero__headline-accent'>What's new?</span>",
      subhead: 'I still remember where we left off. Ready to pick up?',
      cta: 'Continue our conversation',
    },
    // Loyal visitor (3+ visits) - deep connection
    'loyal': {
      tagline: 'HEY, YOU.',
      headline: "Ready to <span class='hero__headline-accent'>go deeper?</span>",
      subhead: 'You keep coming back. Let\'s figure out what\'s really drawing you here.',
      cta: 'Let\'s talk',
    },
    // Default - powerful brand statement
    'default': {
      tagline: 'BETTER THAN HUMAN.',
      headline: "Finally, someone who <span class='hero__headline-accent'>gets it.</span>",
      subhead: 'Someone who remembers your whole story, hears what you\'re not saying, and shows up at 2am with the same presence as noon.',
      cta: 'Meet Ferni',
    },
  };

  async function personalizeHero() {
    if (!CONFIG.enablePersonalizedHero || state.heroPersonalized) return;
    
    // Determine best variant
    let variantKey = 'default';
    
    if (state.visitCount > 3) {
      variantKey = 'loyal';
    } else if (state.isReturning) {
      variantKey = 'returning';
    } else {
      variantKey = getTimeOfDay();
    }
    
    const variant = HERO_VARIANTS[variantKey] || HERO_VARIANTS.default;
    
    // Apply with animation
    const tagline = document.querySelector('.hero__tagline, .hero__eyebrow, [class*="eyebrow"]');
    const headline = document.querySelector('.hero__headline, .hero__title, [class*="hero"] h1');
    const subhead = document.querySelector('.hero__subhead, .hero__subtitle, [class*="hero"] p');
    const ctaButton = document.querySelector('.hero__cta .btn--primary, .hero .btn--primary, [class*="hero"] .btn');
    
    // Fade out, update, fade in
    const elements = [tagline, headline, subhead, ctaButton].filter(Boolean);
    
    elements.forEach(el => {
      el.style.transition = 'opacity 0.3s ease';
      el.style.opacity = '0';
    });
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    if (tagline) tagline.textContent = variant.tagline;
    if (headline) headline.innerHTML = variant.headline;
    if (subhead) subhead.textContent = variant.subhead;
    if (ctaButton) {
      // Preserve icon if present
      const icon = ctaButton.querySelector('svg');
      ctaButton.textContent = variant.cta + ' ';
      if (icon) ctaButton.appendChild(icon);
    }
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    elements.forEach(el => {
      el.style.opacity = '1';
    });
    
    // Add personalized class for potential styling
    document.body.classList.add('hero-personalized', `hero-variant--${variantKey}`);
    
    state.heroPersonalized = true;
    log('Hero personalized:', variantKey);
    
    // Try to get AI-enhanced copy from backend (non-blocking)
    fetchAI('/personalized-hero', {
      hour: new Date().getHours(),
      isReturning: state.isReturning,
      visitCount: state.visitCount,
      referrer: document.referrer || 'direct',
    }).then(enhanced => {
      if (enhanced && enhanced.headline) {
        log('AI-enhanced hero received:', enhanced);
        
        // Apply AI-generated copy with subtle transition
        const tagline = document.querySelector('.hero__tagline, .hero__eyebrow, [class*="eyebrow"]');
        const headline = document.querySelector('.hero__headline, .hero__title, [class*="hero"] h1');
        const subhead = document.querySelector('.hero__subhead, .hero__subtitle, [class*="hero"] p');
        const ctaButton = document.querySelector('.hero__cta .btn--primary, .hero .btn--primary, [class*="hero"] .btn');
        
        // Smooth update
        const updateWithFade = async () => {
          const elements = [tagline, headline, subhead, ctaButton].filter(Boolean);
          
          elements.forEach(el => {
            el.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            el.style.opacity = '0';
            el.style.transform = 'translateY(-4px)';
          });
          
          await new Promise(resolve => setTimeout(resolve, 400));
          
          if (tagline && enhanced.tagline) tagline.textContent = enhanced.tagline.toUpperCase();
          if (headline && enhanced.headline) headline.innerHTML = enhanced.headline;
          if (subhead && enhanced.subhead) subhead.textContent = enhanced.subhead;
          if (ctaButton && enhanced.ctaText) {
            const icon = ctaButton.querySelector('svg');
            ctaButton.innerHTML = enhanced.ctaText + ' ';
            if (icon) ctaButton.appendChild(icon);
          }
          
          await new Promise(resolve => setTimeout(resolve, 50));
          
          elements.forEach(el => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
          });
          
          document.body.classList.add('hero-ai-enhanced');
          log('Hero updated with AI content');
        };
        
        updateWithFade();
      }
    }).catch(err => {
      log('AI hero fetch failed (using fallback):', err);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SMART SOCIAL PROOF
  // ═══════════════════════════════════════════════════════════════════════════
  
  const SOCIAL_PROOF_MESSAGES = [
    // Memory superpowers
    { text: "That thing you mentioned six months ago? We remember.", type: 'memory', icon: '🧠' },
    { text: "Last night at 2:47am, someone had a breakthrough. I was there.", type: 'presence', icon: '🌙' },
    { text: "Someone said 'I'm fine' three times this week. So I asked what was really going on.", type: 'insight', icon: '👁️' },
    
    // Presence superpowers
    { text: "2am panic? Same warmth as noon. No tired sighs.", type: 'presence', icon: '⏰' },
    { text: "47 minutes talking about a decision. No 'we need to wrap up.'", type: 'presence', icon: '💬' },
    
    // Team superpowers
    { text: "Six perspectives. One conversation. No referrals.", type: 'team', icon: '👥' },
    { text: "You mention stress to Ferni. Maya already knows to ask about your sleep.", type: 'team', icon: '🤝' },
    
    // Better than human
    { text: "Your therapist has 47 other patients. We have just you.", type: 'human', icon: '💚' },
    { text: "Friends forget. Best friends mostly remember. We never forget. Ever.", type: 'memory', icon: '∞' },
    { text: "Zero judgment. Not reduced judgment. Zero.", type: 'human', icon: '🙏' },
  ];

  let socialProofIndex = 0;
  let socialProofInterval = null;

  // Merged messages - static + AI-generated
  let mergedSocialProofMessages = [...SOCIAL_PROOF_MESSAGES];
  
  function initSocialProof() {
    if (!CONFIG.enableSmartSocialProof) return;
    
    // Fetch AI-generated social proof from backend (non-blocking)
    fetch(`${CONFIG.aiApiBase}/social-proof`)
      .then(res => res.json())
      .then(aiMessages => {
        if (Array.isArray(aiMessages) && aiMessages.length > 0) {
          log('AI social proof received:', aiMessages);
          
          // Add AI-generated messages to the rotation
          aiMessages.forEach((msg, i) => {
            if (msg.content || msg.text) {
              mergedSocialProofMessages.splice(
                i * 3, // Intersperse AI messages throughout
                0,
                { 
                  text: msg.content || msg.text, 
                  type: msg.type || 'ai', 
                  icon: '✨',
                  isAI: true
                }
              );
            }
          });
          
          log('Social proof now includes AI messages:', mergedSocialProofMessages.length);
        }
      })
      .catch(err => log('AI social proof fetch failed:', err));
    
    // Find or create social proof element
    let container = document.querySelector('.social-proof-dynamic, .social-proof-ticker');
    
    if (!container) {
      // Create one after the hero section
      const hero = document.querySelector('.hero, [class*="hero"]');
      if (!hero) return;
      
      container = document.createElement('div');
      container.className = 'social-proof-dynamic ai-social-proof';
      container.innerHTML = `
        <div class="social-proof-dynamic__inner">
          <div class="social-proof-dynamic__avatar"><svg class="ferni-eyes-svg" viewBox="0 0 100 100"><ellipse cx="36" cy="50" rx="10" ry="12" fill="white"/><circle cx="33" cy="45" r="2.5" fill="white" opacity="0.9"/><ellipse cx="64" cy="50" rx="10" ry="12" fill="white"/><circle cx="61" cy="45" r="2.5" fill="white" opacity="0.9"/></svg></div>
          <p class="social-proof-dynamic__text"></p>
        </div>
      `;
      hero.after(container);
      
      // Add styles
      injectSocialProofStyles();
    }
    
    const textEl = container.querySelector('.social-proof-dynamic__text, p');
    if (!textEl) return;
    
    // Start rotation
    function updateSocialProof() {
      const message = mergedSocialProofMessages[socialProofIndex % mergedSocialProofMessages.length];
      
      textEl.style.opacity = '0';
      textEl.style.transform = 'translateY(10px)';
      
      setTimeout(() => {
        textEl.textContent = message.text;
        textEl.style.opacity = '1';
        textEl.style.transform = 'translateY(0)';
        
        // Add visual indicator for AI-generated messages
        if (message.isAI) {
          textEl.classList.add('ai-generated');
        } else {
          textEl.classList.remove('ai-generated');
        }
      }, 300);
      
      socialProofIndex = (socialProofIndex + 1) % mergedSocialProofMessages.length;
    }
    
    // Initial update
    updateSocialProof();
    
    // Rotate every 8 seconds
    socialProofInterval = setInterval(updateSocialProof, 8000);
    
    log('Social proof initialized');
  }

  function injectSocialProofStyles() {
    if (document.getElementById('ai-social-proof-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'ai-social-proof-styles';
    style.textContent = `
      .ai-social-proof {
        padding: 16px 0;
        background: linear-gradient(
          90deg, 
          transparent 0%, 
          rgba(74, 103, 65, 0.05) 20%, 
          rgba(74, 103, 65, 0.05) 80%, 
          transparent 100%
        );
        border-top: 1px solid rgba(74, 103, 65, 0.1);
        border-bottom: 1px solid rgba(74, 103, 65, 0.1);
        overflow: hidden;
      }
      
      .ai-social-proof .social-proof-dynamic__inner {
        max-width: 800px;
        margin: 0 auto;
        padding: 0 24px;
        display: flex;
        align-items: center;
        gap: 16px;
      }
      
      .ai-social-proof .social-proof-dynamic__avatar {
        width: 40px;
        height: 40px;
        background: linear-gradient(135deg, #5a7751, #4a6741);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 12px;
        font-weight: 700;
        flex-shrink: 0;
      }
      
      .ai-social-proof .social-proof-dynamic__text {
        margin: 0;
        font-size: 15px;
        color: #2c2520;
        line-height: 1.6;
        font-style: italic;
        transition: opacity 0.3s ease, transform 0.3s ease;
      }
      
      @media (max-width: 768px) {
        .ai-social-proof .social-proof-dynamic__inner {
          flex-direction: column;
          text-align: center;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2AM MOMENT - Dynamic Late Night Scenarios
  // ═══════════════════════════════════════════════════════════════════════════
  
  const LATE_NIGHT_SCENARIOS = [
    // Relationship regrets
    {
      time: '3:47 AM',
      thought: '"I can\'t stop thinking about what I said to her..."',
      category: 'relationship',
    },
    {
      time: '2:23 AM',
      thought: '"Why did I react like that? Now everything\'s ruined..."',
      category: 'relationship',
    },
    {
      time: '4:15 AM',
      thought: '"I should have said something. Now it\'s too late..."',
      category: 'relationship',
    },
    // Career anxiety
    {
      time: '3:12 AM',
      thought: '"What if I\'m not good enough for this job?"',
      category: 'career',
    },
    {
      time: '2:58 AM',
      thought: '"Everyone else seems to have it figured out..."',
      category: 'career',
    },
    {
      time: '4:02 AM',
      thought: '"I don\'t know if I can keep doing this..."',
      category: 'career',
    },
    // Existential
    {
      time: '3:33 AM',
      thought: '"What am I even doing with my life?"',
      category: 'existential',
    },
    {
      time: '2:47 AM',
      thought: '"Is this really all there is?"',
      category: 'existential',
    },
    // Self-doubt
    {
      time: '3:51 AM',
      thought: '"Why do I always mess things up?"',
      category: 'self-doubt',
    },
    {
      time: '4:19 AM',
      thought: '"I\'m never going to change..."',
      category: 'self-doubt',
    },
    // Overwhelm
    {
      time: '2:34 AM',
      thought: '"There\'s just too much. I can\'t handle all of this..."',
      category: 'overwhelm',
    },
    {
      time: '3:07 AM',
      thought: '"How did I let things get this bad?"',
      category: 'overwhelm',
    },
  ];

  const HUMAN_LIMITATIONS = [
    // Coach
    { who: 'Your coach', status: 'Asleep. Next session is Thursday.' },
    { who: 'Your therapist', status: 'Costs $200/session. Can\'t afford another this week.' },
    { who: 'Your mentor', status: 'Too busy. You feel guilty asking.' },
    // Friends & Family
    { who: 'Your best friend', status: 'Has their own problems. You don\'t want to burden them.' },
    { who: 'Your partner', status: 'Sleeping next to you. Wouldn\'t understand anyway.' },
    { who: 'Your mom', status: 'Would just worry. You can\'t put that on her.' },
    { who: 'Your sibling', status: 'Lives far away. You\'ve drifted apart.' },
    // Modern realities
    { who: 'Your journal', status: 'Doesn\'t talk back. You need someone to hear you.' },
    { who: 'The internet', status: 'Generic tips. No one knows your story.' },
    { who: 'AI chatbots', status: 'Forgot everything you told them last week.' },
  ];

  const FERNI_RESPONSES = [
    { says: '"I\'m here. Tell me what\'s on your mind."', sub: 'Same warmth at 3am as 3pm. Every time.' },
    { says: '"I remember you mentioned something like this before..."', sub: 'Unlike humans, I never forget.' },
    { says: '"That sounds really heavy. Want to talk it through?"', sub: 'No judgment. No tired sighs. Just presence.' },
    { says: '"I\'ve got all the time you need."', sub: 'No other patients. No session limits.' },
    { says: '"You don\'t have to carry this alone."', sub: 'I\'m literally always here.' },
  ];

  let currentScenarioIndex = 0;
  let scenarioInterval = null;

  function init2AMMoment() {
    const section = document.querySelector('.two-am');
    if (!section) return;
    
    // Start rotating scenarios
    rotateScenario();
    scenarioInterval = setInterval(rotateScenario, 12000); // Every 12 seconds
    
    // Fetch AI-generated scenarios from backend (non-blocking enhancement)
    fetchAI2AMScenarios();
    
    log('2AM Moment AI initialized');
  }

  function rotateScenario() {
    const timeEl = document.querySelector('.two-am__time');
    const thoughtEl = document.querySelector('.two-am__quote');
    const limitationsEl = document.querySelector('.two-am__limitations');
    const ferniSaysEl = document.querySelector('.two-am__ferni-says');
    const ferniSubEl = document.querySelector('.two-am__ferni-sub');
    
    if (!timeEl || !thoughtEl) return;
    
    // Pick scenario
    const scenario = LATE_NIGHT_SCENARIOS[currentScenarioIndex % LATE_NIGHT_SCENARIOS.length];
    
    // Pick 3 random limitations
    const shuffledLimitations = [...HUMAN_LIMITATIONS].sort(() => Math.random() - 0.5).slice(0, 3);
    
    // Pick Ferni response
    const ferniResponse = FERNI_RESPONSES[Math.floor(Math.random() * FERNI_RESPONSES.length)];
    
    // Fade out
    const elements = [timeEl, thoughtEl, limitationsEl, ferniSaysEl, ferniSubEl].filter(Boolean);
    elements.forEach(el => {
      el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-8px)';
    });
    
    setTimeout(() => {
      // Update content
      timeEl.textContent = scenario.time;
      thoughtEl.textContent = scenario.thought;
      
      // Update limitations
      if (limitationsEl) {
        const limitEls = limitationsEl.querySelectorAll('.two-am__limit');
        limitEls.forEach((el, i) => {
          if (shuffledLimitations[i]) {
            const whoEl = el.querySelector('.two-am__limit-who');
            const statusEl = el.querySelector('.two-am__limit-status');
            if (whoEl) whoEl.textContent = shuffledLimitations[i].who;
            if (statusEl) statusEl.textContent = shuffledLimitations[i].status;
          }
        });
      }
      
      // Update Ferni response
      if (ferniSaysEl) ferniSaysEl.textContent = ferniResponse.says;
      if (ferniSubEl) ferniSubEl.textContent = ferniResponse.sub;
      
      // Fade in
      setTimeout(() => {
        elements.forEach(el => {
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
        });
      }, 50);
    }, 500);
    
    currentScenarioIndex++;
  }

  async function fetchAI2AMScenarios() {
    try {
      const response = await fetch(`${CONFIG.aiApiBase}/late-night-scenario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hour: new Date().getHours(),
          isReturning: state.isReturning,
        }),
      });
      
      if (response.ok) {
        const aiScenario = await response.json();
        if (aiScenario && aiScenario.thought) {
          // Add AI-generated scenario to the rotation
          LATE_NIGHT_SCENARIOS.unshift({
            time: aiScenario.time || '3:17 AM',
            thought: `"${aiScenario.thought}"`,
            category: aiScenario.category || 'ai-generated',
            isAI: true,
          });
          log('AI-generated 2AM scenario added:', aiScenario.thought);
        }
      }
    } catch (err) {
      log('AI 2AM scenario fetch failed (using fallbacks):', err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADAPTIVE CTA
  // ═══════════════════════════════════════════════════════════════════════════
  
  const CTA_VARIANTS = {
    // Hesitant visitor (low sentiment)
    hesitant: {
      text: 'Just try talking',
      subtext: 'No signup needed',
      style: 'btn--ghost',
    },
    // Neutral
    neutral: {
      text: 'Meet Ferni',
      subtext: 'Free to start',
      style: 'btn--primary',
    },
    // Engaged (scrolled, spent time)
    engaged: {
      text: 'Talk to Ferni',
      subtext: 'Join 50,000+ finding clarity',
      style: 'btn--primary',
    },
    // Very engaged (lots of interaction)
    veryEngaged: {
      text: "Let's do this",
      subtext: 'Begin your first conversation',
      style: 'btn--primary btn--glow',
    },
  };

  function updateAdaptiveCTA() {
    if (!CONFIG.enableAdaptiveCTA) return;
    
    // Calculate sentiment based on behavior
    let sentiment = 0.5;
    
    // Scroll depth increases sentiment
    sentiment += state.scrollDepth * 0.2;
    
    // Time on page
    if (state.timeOnPage > CONFIG.veryEngagedTime) {
      sentiment += 0.2;
    } else if (state.timeOnPage > CONFIG.hesitantTime) {
      sentiment += 0.1;
    }
    
    // Interactions boost sentiment
    sentiment += Math.min(state.interactions * 0.05, 0.2);
    
    // Clamp
    sentiment = Math.max(0, Math.min(1, sentiment));
    state.sentimentScore = sentiment;
    
    // Determine variant
    let variantKey = 'neutral';
    if (sentiment < 0.3) {
      variantKey = 'hesitant';
    } else if (sentiment > 0.7) {
      variantKey = 'veryEngaged';
    } else if (sentiment > 0.5) {
      variantKey = 'engaged';
    }
    
    const variant = CTA_VARIANTS[variantKey];
    
    // Update CTAs (non-hero, as hero has its own)
    const ctaButtons = document.querySelectorAll('.section__cta .btn--primary, .cta-section .btn--primary');
    ctaButtons.forEach(btn => {
      const icon = btn.querySelector('svg');
      btn.textContent = variant.text + ' ';
      if (icon) btn.appendChild(icon);
      
      // Update style
      btn.className = btn.className.replace(/btn--primary|btn--ghost|btn--glow/g, '').trim();
      btn.classList.add(variant.style);
    });
    
    log('CTA updated:', variantKey, 'sentiment:', sentiment.toFixed(2));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HOVER INSIGHTS
  // ═══════════════════════════════════════════════════════════════════════════
  
  const HOVER_INSIGHTS = {
    // Team member cards
    'team-card': [
      "Want to ask them something? Go ahead.",
      "Each of us brings something different.",
      "Real conversations, real perspectives.",
    ],
    // Features
    'feature': [
      "Let me show you how this actually works.",
      "This isn't marketing speak. Try it.",
      "Curious? Just ask me about it.",
    ],
    // Testimonials
    'testimonial': [
      "Stories like this happen every day.",
      "This could be you in a few weeks.",
      "Real people. Real breakthroughs.",
    ],
    // FAQ
    'faq': [
      "Have a question? I'm happy to dig deeper.",
      "The real answer is always longer. Let's talk.",
      "Ask me anything. I mean it.",
    ],
    // Pricing
    'pricing': [
      "No pressure. Really.",
      "Free means free. Forever.",
      "Questions about plans? Just ask.",
    ],
    // CTA
    'cta': [
      "Ready when you are.",
      "No signup needed to try.",
      "What's stopping you? Let's talk about it.",
    ],
  };

  let hoverTooltip = null;

  function initHoverInsights() {
    if (!CONFIG.enableHoverInsights) return;
    
    // Create tooltip element
    hoverTooltip = document.createElement('div');
    hoverTooltip.className = 'ai-hover-insight';
    hoverTooltip.innerHTML = `
      <div class="ai-hover-insight__avatar"><svg class="ferni-eyes-svg" viewBox="0 0 100 100"><ellipse cx="36" cy="50" rx="10" ry="12" fill="white"/><circle cx="33" cy="45" r="2.5" fill="white" opacity="0.9"/><ellipse cx="64" cy="50" rx="10" ry="12" fill="white"/><circle cx="61" cy="45" r="2.5" fill="white" opacity="0.9"/></svg></div>
      <span class="ai-hover-insight__text"></span>
    `;
    document.body.appendChild(hoverTooltip);
    
    // Add styles
    injectHoverInsightStyles();
    
    // Track hoverable elements
    const hoverableSelectors = [
      { selector: '.team-card, .team__member', type: 'team-card' },
      { selector: '.feature, .feature-card, [class*="feature"]', type: 'feature' },
      { selector: '.testimonial, .testimonial-card', type: 'testimonial' },
      { selector: '.faq__item, .faq-item', type: 'faq' },
      { selector: '.pricing, .pricing-card', type: 'pricing' },
      { selector: '.btn--primary, .cta-button', type: 'cta' },
    ];
    
    hoverableSelectors.forEach(({ selector, type }) => {
      document.querySelectorAll(selector).forEach(el => {
        el.addEventListener('mouseenter', (e) => showHoverInsight(e, type));
        el.addEventListener('mouseleave', hideHoverInsight);
      });
    });
    
    log('Hover insights initialized');
  }

  function showHoverInsight(event, type) {
    const insights = HOVER_INSIGHTS[type] || HOVER_INSIGHTS.feature;
    const insight = insights[Math.floor(Math.random() * insights.length)];
    
    const textEl = hoverTooltip.querySelector('.ai-hover-insight__text');
    textEl.textContent = insight;
    
    // Position near element
    const rect = event.target.getBoundingClientRect();
    const tooltipRect = hoverTooltip.getBoundingClientRect();
    
    let x = rect.left + rect.width / 2 - tooltipRect.width / 2;
    let y = rect.top - tooltipRect.height - 10;
    
    // Keep on screen
    x = Math.max(10, Math.min(x, window.innerWidth - tooltipRect.width - 10));
    if (y < 10) y = rect.bottom + 10;
    
    hoverTooltip.style.left = x + 'px';
    hoverTooltip.style.top = y + window.scrollY + 'px';
    hoverTooltip.classList.add('is-visible');
  }

  function hideHoverInsight() {
    hoverTooltip.classList.remove('is-visible');
  }

  function injectHoverInsightStyles() {
    if (document.getElementById('ai-hover-insight-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'ai-hover-insight-styles';
    style.textContent = `
      .ai-hover-insight {
        position: absolute;
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 16px;
        background: #2c2520;
        color: #faf8f5;
        border-radius: 20px;
        font-size: 13px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        opacity: 0;
        visibility: hidden;
        transform: translateY(5px);
        transition: all 0.2s ease;
        pointer-events: none;
        max-width: 280px;
      }
      
      .ai-hover-insight.is-visible {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }
      
      .ai-hover-insight__avatar {
        width: 24px;
        height: 24px;
        background: linear-gradient(135deg, #5a7751, #4a6741);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 8px;
        font-weight: 700;
        flex-shrink: 0;
      }
      
      .ai-hover-insight__text {
        line-height: 1.4;
      }
      
      @media (max-width: 768px) {
        .ai-hover-insight {
          display: none;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSONA VOICES
  // ═══════════════════════════════════════════════════════════════════════════
  
  const PERSONA_VOICES = {
    ferni: {
      greeting: "What's on your mind?",
      style: 'warm, present, curious',
      sample: "That's a thoughtful question. What does your gut tell you?",
    },
    maya: {
      greeting: "What small step could we take today?",
      style: 'gentle, practical, encouraging',
      sample: "What if we started with just two minutes? Embarrassingly small is perfect.",
    },
    peter: {
      greeting: "Let's dig into this together.",
      style: 'curious, thorough, analytical',
      sample: "Interesting. I found three perspectives on this we should explore.",
    },
    alex: {
      greeting: "How can I help you communicate?",
      style: 'clear, empathetic, strategic',
      sample: "Let's think about who you're talking to and what outcome you need.",
    },
    jordan: {
      greeting: "What are we planning?",
      style: 'organized, creative, calm',
      sample: "Let's map this out. What matters most to you about this event?",
    },
    nayan: {
      greeting: "What's weighing on your soul?",
      style: 'wise, calm, philosophical',
      sample: "There's an old saying that might resonate here. Would you like to hear it?",
    },
  };

  function initPersonaVoices() {
    if (!CONFIG.enablePersonaVoices) return;
    
    // Add interaction to team cards
    document.querySelectorAll('.team-card, .team__member').forEach(card => {
      const personaId = card.dataset.persona || inferPersonaFromCard(card);
      if (!personaId || !PERSONA_VOICES[personaId]) return;
      
      // Add "Ask me something" input
      const existingInput = card.querySelector('.persona-voice-input');
      if (existingInput) return;
      
      const inputContainer = document.createElement('div');
      inputContainer.className = 'persona-voice-input';
      inputContainer.innerHTML = `
        <input type="text" placeholder="${PERSONA_VOICES[personaId].greeting}" />
        <button class="persona-voice-send">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
          </svg>
        </button>
      `;
      
      // Find a good place to insert
      const content = card.querySelector('.team-card__content, .team__content');
      if (content) {
        content.appendChild(inputContainer);
      } else {
        card.appendChild(inputContainer);
      }
      
      // Handle input
      const input = inputContainer.querySelector('input');
      const sendBtn = inputContainer.querySelector('.persona-voice-send');
      
      const handleSend = async () => {
        const question = input.value.trim();
        if (!question) return;
        
        sendBtn.disabled = true;
        input.disabled = true;
        
        // Try AI response
        const response = await fetchAI('/persona-preview', {
          personaId,
          userInput: question,
        });
        
        // Show response
        const responseEl = document.createElement('div');
        responseEl.className = 'persona-voice-response';
        responseEl.innerHTML = `
          <blockquote>"${response?.response || PERSONA_VOICES[personaId].sample}"</blockquote>
        `;
        
        inputContainer.replaceWith(responseEl);
        
        // Animate in
        requestAnimationFrame(() => {
          responseEl.classList.add('is-visible');
        });
      };
      
      sendBtn.addEventListener('click', handleSend);
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSend();
      });
    });
    
    // Add styles
    injectPersonaVoiceStyles();
    
    log('Persona voices initialized');
  }

  function inferPersonaFromCard(card) {
    const text = card.textContent.toLowerCase();
    if (text.includes('ferni') || text.includes('life coach')) return 'ferni';
    if (text.includes('maya') || text.includes('habit')) return 'maya';
    if (text.includes('peter') || text.includes('research')) return 'peter';
    if (text.includes('alex') || text.includes('communication')) return 'alex';
    if (text.includes('jordan') || text.includes('plan')) return 'jordan';
    if (text.includes('nayan') || text.includes('wisdom')) return 'nayan';
    return null;
  }

  function injectPersonaVoiceStyles() {
    if (document.getElementById('ai-persona-voice-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'ai-persona-voice-styles';
    style.textContent = `
      .persona-voice-input {
        display: flex;
        gap: 8px;
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid rgba(44, 37, 32, 0.1);
      }
      
      .persona-voice-input input {
        flex: 1;
        padding: 10px 14px;
        border: 1px solid rgba(44, 37, 32, 0.15);
        border-radius: 20px;
        font-size: 13px;
        background: white;
        transition: border-color 0.2s;
      }
      
      .persona-voice-input input:focus {
        outline: none;
        border-color: var(--team-color, #4a6741);
      }
      
      .persona-voice-send {
        width: 36px;
        height: 36px;
        background: var(--team-color, #4a6741);
        border: none;
        border-radius: 50%;
        cursor: pointer;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, opacity 0.2s;
      }
      
      .persona-voice-send:hover {
        transform: scale(1.05);
      }
      
      .persona-voice-send:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .persona-voice-response {
        margin-top: 12px;
        padding: 12px;
        background: rgba(44, 37, 32, 0.03);
        border-radius: 12px;
        opacity: 0;
        transform: translateY(10px);
        transition: opacity 0.3s ease, transform 0.3s ease;
      }
      
      .persona-voice-response.is-visible {
        opacity: 1;
        transform: translateY(0);
      }
      
      .persona-voice-response blockquote {
        margin: 0;
        padding: 0;
        border: none;
        font-style: italic;
        color: #2c2520;
        font-size: 14px;
        line-height: 1.5;
      }
    `;
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BEHAVIOR TRACKING
  // ═══════════════════════════════════════════════════════════════════════════
  
  function trackScroll() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    state.scrollDepth = Math.min(1, scrollTop / docHeight);
    
    // Track current section
    const sections = document.querySelectorAll('section[id]');
    const scrollY = window.scrollY + window.innerHeight / 2;
    
    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const bottom = top + rect.height;
      
      if (scrollY >= top && scrollY <= bottom) {
        state.currentSection = section.id;
        state.sectionsViewed.add(section.id);
        break;
      }
    }
    
    // Update CTA if significant scroll
    if (state.scrollDepth > CONFIG.engagedScrollDepth) {
      updateAdaptiveCTA();
    }
  }

  function trackInteraction() {
    state.interactions++;
    state.lastInteraction = Date.now();
    updateAdaptiveCTA();
  }

  function trackTime() {
    state.timeOnPage = Date.now() - state.startTime;
    
    // Check for hesitant behavior
    const timeSinceInteraction = Date.now() - state.lastInteraction;
    if (timeSinceInteraction > CONFIG.hesitantTime && state.scrollDepth < 0.3) {
      // Visitor seems hesitant, might show softer CTA
      updateAdaptiveCTA();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  function init() {
    if (state.initialized) return;
    
    // Get visitor info
    state.visitorId = getVisitorId();
    state.visitCount = getVisitCount();
    state.isReturning = state.visitCount > 1;
    state.startTime = Date.now();
    
    log('Initializing...', {
      visitorId: state.visitorId,
      visitCount: state.visitCount,
      isReturning: state.isReturning,
      timeOfDay: getTimeOfDay(),
    });
    
    // Initialize features
    setTimeout(() => personalizeHero(), 100);
    setTimeout(() => initSocialProof(), 500);
    setTimeout(() => initHoverInsights(), 300);
    setTimeout(() => initPersonaVoices(), 800);
    setTimeout(() => init2AMMoment(), 1000); // Start 2AM moment rotation
    
    // Set up behavior tracking
    window.addEventListener('scroll', throttle(trackScroll, 100));
    document.addEventListener('click', trackInteraction);
    document.addEventListener('keydown', trackInteraction);
    
    // Periodic time tracking
    setInterval(trackTime, 5000);
    
    state.initialized = true;
    
    log('AI Copy Magic initialized');
  }

  // Throttle helper
  function throttle(fn, wait) {
    let last = 0;
    return function(...args) {
      const now = Date.now();
      if (now - last >= wait) {
        last = now;
        fn.apply(this, args);
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORTS
  // ═══════════════════════════════════════════════════════════════════════════
  
  window.FerniAICopyMagic = {
    init,
    getState: () => ({ ...state }),
    personalizeHero,
    updateCTA: updateAdaptiveCTA,
    config: CONFIG,
    
    // Manual controls
    setDebug: (enabled) => { CONFIG.debug = enabled; },
    forceVariant: (variantKey) => {
      const variant = HERO_VARIANTS[variantKey];
      if (variant) {
        state.heroPersonalized = false;
        personalizeHero();
      }
    },
  };

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 50);
  }

  console.log('%c✨ Ferni AI Copy Magic loaded', 'color: #4a6741; font-weight: bold;');
})();

