/**
 * AI Storytelling - Superhuman Narrative Generation
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Brings the landing page to life with rotating, AI-enhanced stories:
 * 
 * 1. MEMORY TIMELINE - Different memory scenarios showing Ferni's range
 * 2. SHOWCASE CHAT - Rotating "reading between the lines" conversations
 * 3. USE CASE VOICES - Dynamic user quotes that feel real
 * 4. JOURNEY STORIES - User experiences at each stage
 * 5. 2AM SCENARIOS - Different late-night moments
 * 6. FINAL INVITATION - Time and visitor-aware closing
 * 
 * @module ai-storytelling
 */

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  const CONFIG = {
    // Rotation intervals
    memoryRotationInterval: 15000,     // 15 seconds
    showcaseRotationInterval: 12000,   // 12 seconds
    useCaseRotationInterval: 10000,    // 10 seconds per use case
    
    // Backend API - relative URL proxied through Firebase Hosting → Cloud Run
    apiBase: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:3002/api/landing/ai'
      : '/api/landing/ai',
    
    // Enable/disable features
    enableMemoryStories: true,
    enableShowcaseRotation: true,
    enableUseCaseVoices: true,
    enableJourneyStories: true,
    enableFinalCTA: true,
    enableComparisonEnhancement: true,
    
    debug: false,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // MEMORY TIMELINE STORIES
  // Different memory scenarios showing Ferni's superhuman recall
  // ═══════════════════════════════════════════════════════════════════════════
  
  const MEMORY_STORIES = [
    // Health Journey (original)
    {
      id: 'health',
      moments: [
        {
          date: '6 months ago',
          speaker: 'user',
          text: '"I\'m worried about my mom\'s health. She\'s been having these headaches..."',
        },
        {
          date: '2 weeks ago',
          speaker: 'user',
          text: '"Good news—mom saw a specialist. They found what was causing the headaches."',
        },
        {
          date: 'Today',
          speaker: 'ferni',
          text: '"How\'s your mom doing? Last time we talked, she\'d just gotten that diagnosis. Has the treatment been helping with the headaches?"',
        },
      ],
    },
    // Career Journey
    {
      id: 'career',
      moments: [
        {
          date: '8 months ago',
          speaker: 'user',
          text: '"I\'m thinking about asking for a raise, but I\'m terrified..."',
        },
        {
          date: '5 months ago',
          speaker: 'user',
          text: '"I did it! They said no, but at least I tried. Feeling discouraged."',
        },
        {
          date: 'Today',
          speaker: 'ferni',
          text: '"Remember when you asked for that raise 5 months ago? I was proud of you for trying. Have things shifted since then? Sometimes these conversations plant seeds that bloom later."',
        },
      ],
    },
    // Relationship Journey
    {
      id: 'relationship',
      moments: [
        {
          date: '4 months ago',
          speaker: 'user',
          text: '"I had a huge fight with my sister. I said things I regret..."',
        },
        {
          date: '6 weeks ago',
          speaker: 'user',
          text: '"We\'re talking again, but it\'s awkward. I don\'t know how to bring up what happened."',
        },
        {
          date: 'Today',
          speaker: 'ferni',
          text: '"You mentioned your sister\'s birthday is coming up. I remember how much repairing that relationship meant to you. Could this be a moment to reconnect more deeply?"',
        },
      ],
    },
    // Personal Growth Journey
    {
      id: 'growth',
      moments: [
        {
          date: '1 year ago',
          speaker: 'user',
          text: '"I want to learn guitar but I\'m 35. Is it too late?"',
        },
        {
          date: '6 months ago',
          speaker: 'user',
          text: '"I finally bought a guitar. Haven\'t played it much though..."',
        },
        {
          date: 'Today',
          speaker: 'ferni',
          text: '"I remember when you bought that guitar 6 months ago. You were worried about starting at 35. Have you been playing? Even 5 minutes counts as a win."',
        },
      ],
    },
    // Anxiety Management Journey
    {
      id: 'anxiety',
      moments: [
        {
          date: '3 months ago',
          speaker: 'user',
          text: '"I get these panic attacks at work. Nobody knows..."',
        },
        {
          date: '5 weeks ago',
          speaker: 'user',
          text: '"The breathing technique you suggested actually helped during a meeting today."',
        },
        {
          date: 'Today',
          speaker: 'ferni',
          text: '"You mentioned that big presentation is coming up—the one that used to trigger your panic. Remember the breathing technique that worked in that meeting 5 weeks ago? You\'ve got this."',
        },
      ],
    },
    // Life Decision Journey
    {
      id: 'decision',
      moments: [
        {
          date: '9 months ago',
          speaker: 'user',
          text: '"I\'m thinking about moving to a new city for this job. It\'s exciting but scary."',
        },
        {
          date: '4 months ago',
          speaker: 'user',
          text: '"I decided to stay. Not sure if it was the right call..."',
        },
        {
          date: 'Today',
          speaker: 'ferni',
          text: '"You made that decision to stay 4 months ago. You were weighing adventure against stability. How does it feel now? Sometimes our choices make more sense in hindsight."',
        },
      ],
    },
    // Financial Freedom Journey
    {
      id: 'financial',
      moments: [
        {
          date: '11 months ago',
          speaker: 'user',
          text: '"I\'m in debt and I don\'t know how to get out. It feels hopeless."',
        },
        {
          date: '4 months ago',
          speaker: 'user',
          text: '"I paid off my first credit card! Small win but it felt huge."',
        },
        {
          date: 'Today',
          speaker: 'ferni',
          text: '"You paid off that first credit card 4 months ago. I remember how hopeless you felt 11 months ago. Look how far you\'ve come. What\'s next on the list?"',
        },
      ],
    },
    // Parenting Challenge
    {
      id: 'parenting',
      moments: [
        {
          date: '7 months ago',
          speaker: 'user',
          text: '"My teenager won\'t talk to me anymore. I don\'t know what I did wrong."',
        },
        {
          date: '2 months ago',
          speaker: 'user',
          text: '"We had an actual conversation last night. First one in months."',
        },
        {
          date: 'Today',
          speaker: 'ferni',
          text: '"That conversation 2 months ago was a turning point. You mentioned wanting to understand their world better. Has that curiosity opened any new doors?"',
        },
      ],
    },
    // Friendship Loss
    {
      id: 'friendship',
      moments: [
        {
          date: '1 year ago',
          speaker: 'user',
          text: '"My best friend and I had a falling out. I miss them but I\'m too proud to reach out."',
        },
        {
          date: '3 months ago',
          speaker: 'user',
          text: '"They texted me happy birthday. Just two words. I didn\'t know what to say back."',
        },
        {
          date: 'Today',
          speaker: 'ferni',
          text: '"That birthday text was 3 months ago. You said you didn\'t know what to say. Have you thought about what you\'d want to say now?"',
        },
      ],
    },
    // Health Transformation
    {
      id: 'health-transform',
      moments: [
        {
          date: '10 months ago',
          speaker: 'user',
          text: '"The doctor said I need to make changes or face serious consequences. I\'m scared."',
        },
        {
          date: '3 months ago',
          speaker: 'user',
          text: '"Down 15 pounds. My numbers are improving. Doctor couldn\'t believe it."',
        },
        {
          date: 'Today',
          speaker: 'ferni',
          text: '"10 months ago you were scared after that doctor visit. Now? 15 pounds down, better numbers. You did this. How does it feel to prove yourself wrong?"',
        },
      ],
    },
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // SHOWCASE CONVERSATIONS
  // Different "reading between the lines" moments
  // ═══════════════════════════════════════════════════════════════════════════
  
  const SHOWCASE_CONVERSATIONS = [
    // Original - Work tired
    {
      id: 'work-tired',
      messages: [
        { speaker: 'user', text: 'I\'m fine, just tired from work again' },
        { 
          speaker: 'ferni', 
          insight: 'Reading between the lines...',
          text: 'You said "fine" but I noticed something. You\'ve mentioned being tired from work three times this week. Is there something bigger going on?',
        },
        { speaker: 'user', text: '...I didn\'t realize I kept saying that' },
        { speaker: 'ferni', text: 'That\'s why I\'m here. Sometimes patterns are easier to see from the outside. Want to talk about what\'s really happening at work?' },
      ],
    },
    // Relationship deflection
    {
      id: 'relationship-deflection',
      messages: [
        { speaker: 'user', text: 'Had dinner with my parents last night. It was whatever.' },
        { 
          speaker: 'ferni', 
          insight: 'Noticing what\'s unsaid...',
          text: '"Whatever" is doing a lot of work in that sentence. Last time you mentioned your parents, you were nervous about telling them something. Did it come up?',
        },
        { speaker: 'user', text: 'How do you remember that?' },
        { speaker: 'ferni', text: 'Because it mattered to you. I remember what matters. What happened at dinner?' },
      ],
    },
    // Hidden excitement
    {
      id: 'hidden-excitement',
      messages: [
        { speaker: 'user', text: 'So I got some news about the job application...' },
        { 
          speaker: 'ferni', 
          insight: 'Sensing emotion shift...',
          text: 'I can hear it in how you typed that. The ellipsis, the "so"... This sounds like good news you\'re trying not to jinx. Am I right?',
        },
        { speaker: 'user', text: 'They want a second interview! I didn\'t want to get too excited' },
        { speaker: 'ferni', text: 'Get excited! You prepared for weeks for this. Remember how nervous you were before the first one? Look how far you\'ve come.' },
      ],
    },
    // Avoidance pattern
    {
      id: 'avoidance',
      messages: [
        { speaker: 'user', text: 'Anyway, how are you doing?' },
        { 
          speaker: 'ferni', 
          insight: 'Noticing the redirect...',
          text: 'You just changed the subject. You were about to tell me something about this weekend, and then... "anyway." What were you going to say?',
        },
        { speaker: 'user', text: 'It\'s nothing. I just... didn\'t go to the party.' },
        { speaker: 'ferni', text: 'That\'s the third event you\'ve skipped this month. No judgment—I\'m just noticing. Want to talk about what\'s making social things feel hard lately?' },
      ],
    },
    // Success minimization
    {
      id: 'success-minimization',
      messages: [
        { speaker: 'user', text: 'I finished the project. It turned out okay I guess.' },
        { 
          speaker: 'ferni', 
          insight: 'Hearing the undersell...',
          text: 'Okay? You\'ve been working on this for two months. You pulled three late nights last week. That\'s not "okay"—that\'s dedication. What did you actually create?',
        },
        { speaker: 'user', text: 'I mean, my boss seemed impressed...' },
        { speaker: 'ferni', text: 'There it is. I want you to practice saying it without qualifying: "I created something impressive." Try it.' },
      ],
    },
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // USE CASE USER VOICES
  // Dynamic quotes for each use case
  // ═══════════════════════════════════════════════════════════════════════════
  
  const USE_CASE_VOICES = {
    'career': [
      '"I got a job offer but I\'m not sure if I should leave..."',
      '"My boss keeps passing me over for promotions..."',
      '"I think I want to change careers entirely. Is that crazy at 40?"',
      '"I have this business idea but everyone says it\'s risky..."',
      '"I\'m burning out but I can\'t afford to quit..."',
    ],
    'stress': [
      '"I can\'t stop thinking about everything I need to do..."',
      '"My chest gets tight every Sunday night before work..."',
      '"I keep having this dream where I\'m falling behind..."',
      '"Everyone thinks I have it together but I\'m drowning..."',
      '"I snapped at my kid today and I don\'t know why..."',
    ],
    'habits': [
      '"I keep saying I\'ll start tomorrow..."',
      '"I was doing so well and then I just stopped..."',
      '"I\'ve tried every app, every system, nothing sticks..."',
      '"I know what I should do, I just can\'t make myself do it..."',
      '"My morning routine fell apart months ago..."',
    ],
    'decisions': [
      '"I don\'t know if this relationship is working..."',
      '"Should I move back closer to family?"',
      '"I have to decide by Friday and I\'m paralyzed..."',
      '"Everyone has opinions but I need to figure out what I want..."',
      '"What if I make the wrong choice and regret it forever?"',
    ],
    'relationships': [
      '"My parents never seem to understand..."',
      '"I think my best friend is pulling away..."',
      '"I want to set boundaries but I don\'t want to hurt anyone..."',
      '"My partner and I keep having the same fight..."',
      '"I feel lonely even when I\'m with people..."',
    ],
    'daily': [
      '"I just need someone to talk through my day..."',
      '"I want to start my morning with intention but I\'m always rushed..."',
      '"The days blur together. I want to feel more present..."',
      '"I never take time to reflect. Life just happens to me..."',
      '"I want to journal but talking is easier..."',
    ],
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // JOURNEY STAGE STORIES
  // User experiences at each stage of the journey
  // ═══════════════════════════════════════════════════════════════════════════
  
  const JOURNEY_STORIES = {
    'first-meeting': [
      'Start with Ferni, your life coach and coordinator. Get to know each other. No pressure, no expectations.',
      '"I was skeptical at first, but Ferni just... listened. No agenda. No judgment."',
      '"We talked about my day. Nothing deep. But somehow I felt lighter after."',
    ],
    'getting-started': [
      'Want to build better habits? Meet Maya. She\'ll help you start embarrassingly small—and actually stick with it.',
      '"Maya asked me: What\'s so small you can\'t say no? Two pushups. That\'s where we started."',
      '"I\'ve tried every habit app. Maya was different. She understood why I kept failing."',
    ],
    'building-trust': [
      'Need to dig deeper? Peter joins with research and data. Plus Alex for communication and Jordan for planning.',
      '"Peter found a pattern in my spending I\'d never noticed. It changed how I think about money."',
      '"Alex helped me practice a hard conversation before I had it. I wasn\'t nervous anymore."',
    ],
    'deep-partnership': [
      'For those who want the full experience: meet Nayan, our sage mentor. Decades of wisdom in one conversation.',
      '"Nayan asked me a question that I\'ve been thinking about for weeks. I didn\'t even know that question existed."',
      '"Talking to Nayan is like talking to the wisest person you\'ve never met."',
    ],
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // FINAL CTA VARIANTS
  // Time and visitor-aware closing invitations
  // ═══════════════════════════════════════════════════════════════════════════
  
  const FINAL_CTA_VARIANTS = {
    // Time of day variants
    lateNight: {
      headline: 'Can\'t sleep?',
      subhead: 'I\'m here. Right now. No waiting, no judgment.',
      phoneLabel: 'Call me. I\'m up.',
    },
    earlyMorning: {
      headline: 'Early riser?',
      subhead: 'Start your day with someone who listens.<br>I\'m already here.',
      phoneLabel: 'Start your morning with me.',
    },
    afternoon: {
      headline: 'Taking a break?',
      subhead: 'Sometimes you need to talk through what\'s on your mind.<br>I\'ve got time.',
      phoneLabel: 'I\'m here when you are.',
    },
    evening: {
      headline: 'Ready to be heard?',
      subhead: 'End your day with someone who remembers.<br>Someone who cares.',
      phoneLabel: 'I\'ll be here. Always.',
    },
    // Visitor type variants
    returning: {
      headline: 'Ready to continue?',
      subhead: 'We started a conversation. I\'ve been thinking about what you shared.',
      phoneLabel: 'Pick up where we left off.',
    },
    loyal: {
      headline: 'You keep coming back.',
      subhead: 'I think you know this is different.<br>Let\'s stop wondering and start talking.',
      phoneLabel: 'Let\'s go deeper.',
    },
    // Default
    default: {
      headline: 'Ready to be heard?',
      subhead: 'No app to download. No account needed to try.<br>Just pick up your phone and call.',
      phoneLabel: 'I\'ll be here. Always.',
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════
  
  const state = {
    currentMemoryStory: 0,
    currentShowcase: 0,
    useCaseIndices: {},
    currentJourneyStage: 0,
    isReturning: false,
    visitCount: 0,
    timeOfDay: 'afternoon',
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════
  
  function log(...args) {
    if (CONFIG.debug) {
      console.log('[AI-Storytelling]', ...args);
    }
  }

  function getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 5) return 'lateNight';
    if (hour >= 5 && hour < 9) return 'earlyMorning';
    if (hour >= 9 && hour < 17) return 'afternoon';
    return 'evening';
  }

  function getVisitorType() {
    const visitCount = parseInt(localStorage.getItem('ferni_visit_count') || '0', 10);
    state.visitCount = visitCount;
    state.isReturning = visitCount > 0;
    
    if (visitCount > 5) return 'loyal';
    if (visitCount > 1) return 'returning';
    return 'new';
  }

  function animateTextChange(element, newText, options = {}) {
    const duration = options.duration || 300;
    
    element.style.transition = `opacity ${duration}ms ease`;
    element.style.opacity = '0';
    
    setTimeout(() => {
      if (options.html) {
        element.innerHTML = newText;
      } else {
        element.textContent = newText;
      }
      element.style.opacity = '1';
    }, duration);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MEMORY TIMELINE STORYTELLING
  // ═══════════════════════════════════════════════════════════════════════════
  
  function initMemoryStories() {
    if (!CONFIG.enableMemoryStories) return;
    
    const memorySection = document.querySelector('.memory-demo');
    if (!memorySection) {
      log('Memory section not found');
      return;
    }
    
    log('Initializing memory stories rotation');
    
    // Add data attribute for CSS targeting
    memorySection.setAttribute('data-ai-storytelling', 'memory');
    
    // Start rotation
    setInterval(() => {
      state.currentMemoryStory = (state.currentMemoryStory + 1) % MEMORY_STORIES.length;
      updateMemoryTimeline(MEMORY_STORIES[state.currentMemoryStory]);
    }, CONFIG.memoryRotationInterval);
  }

  function updateMemoryTimeline(story) {
    const moments = document.querySelectorAll('.memory-demo__moment');
    if (moments.length < 3) return;
    
    story.moments.forEach((moment, index) => {
      if (moments[index]) {
        const dateEl = moments[index].querySelector('.memory-demo__date');
        const textEl = moments[index].querySelector('.memory-demo__text');
        
        if (dateEl) animateTextChange(dateEl, moment.date);
        if (textEl) animateTextChange(textEl, moment.text);
      }
    });
    
    log('Updated memory timeline to story:', story.id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHOWCASE CHAT ROTATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  function initShowcaseRotation() {
    if (!CONFIG.enableShowcaseRotation) return;
    
    const showcaseChat = document.querySelector('.showcase__app-chat');
    if (!showcaseChat) {
      log('Showcase chat not found');
      return;
    }
    
    log('Initializing showcase chat rotation');
    
    // Add data attribute
    showcaseChat.closest('.showcase')?.setAttribute('data-ai-storytelling', 'showcase');
    
    // Start rotation
    setInterval(() => {
      state.currentShowcase = (state.currentShowcase + 1) % SHOWCASE_CONVERSATIONS.length;
      updateShowcaseChat(SHOWCASE_CONVERSATIONS[state.currentShowcase]);
    }, CONFIG.showcaseRotationInterval);
  }

  function updateShowcaseChat(conversation) {
    const showcaseChat = document.querySelector('.showcase__app-chat');
    if (!showcaseChat) return;
    
    // Fade out
    showcaseChat.style.transition = 'opacity 400ms ease';
    showcaseChat.style.opacity = '0';
    
    setTimeout(() => {
      // Build new chat HTML
      const html = conversation.messages.map(msg => {
        if (msg.speaker === 'user') {
          return `<div class="showcase__app-bubble showcase__app-bubble--user">${msg.text}</div>`;
        } else {
          const insightHtml = msg.insight 
            ? `<span class="bubble-insight">${msg.insight}</span>` 
            : '';
          return `<div class="showcase__app-bubble showcase__app-bubble--ai${msg.insight ? ' showcase__app-bubble--insight' : ''}">${insightHtml}${msg.text}</div>`;
        }
      }).join('\n');
      
      showcaseChat.innerHTML = html;
      
      // Fade in
      showcaseChat.style.opacity = '1';
    }, 400);
    
    log('Updated showcase chat to:', conversation.id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // USE CASE USER VOICES
  // ═══════════════════════════════════════════════════════════════════════════
  
  function initUseCaseVoices() {
    if (!CONFIG.enableUseCaseVoices) return;
    
    const useCases = document.querySelectorAll('.use-case');
    if (!useCases.length) {
      log('Use cases not found');
      return;
    }
    
    log('Initializing use case voice rotation');
    
    // Map use cases to categories based on their titles
    const categoryMap = {
      'Career Crossroads': 'career',
      'Stress & Overwhelm': 'stress',
      'Building Habits': 'habits',
      'Life Decisions': 'decisions',
      'Relationships': 'relationships',
      'Daily Check-ins': 'daily',
    };
    
    useCases.forEach(useCase => {
      const titleEl = useCase.querySelector('.use-case__title');
      const exampleEl = useCase.querySelector('.use-case__example');
      
      if (!titleEl || !exampleEl) return;
      
      const title = titleEl.textContent.trim();
      const category = categoryMap[title];
      
      if (category && USE_CASE_VOICES[category]) {
        // Initialize index for this category
        state.useCaseIndices[category] = 0;
        
        // Add rotation to this use case
        setInterval(() => {
          const voices = USE_CASE_VOICES[category];
          state.useCaseIndices[category] = (state.useCaseIndices[category] + 1) % voices.length;
          animateTextChange(exampleEl, voices[state.useCaseIndices[category]]);
        }, CONFIG.useCaseRotationInterval + Math.random() * 2000); // Stagger timing
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // JOURNEY STAGE STORIES
  // ═══════════════════════════════════════════════════════════════════════════
  
  function initJourneyStories() {
    if (!CONFIG.enableJourneyStories) return;
    
    const journeyStages = document.querySelectorAll('.journey__stage');
    if (!journeyStages.length) {
      log('Journey stages not found');
      return;
    }
    
    log('Initializing journey stage stories');
    
    // Map stages to story categories
    const stageMap = {
      'First Meeting': 'first-meeting',
      'Getting Started': 'getting-started',
      'Building Trust': 'building-trust',
      'Deep Partnership': 'deep-partnership',
    };
    
    journeyStages.forEach(stage => {
      const titleEl = stage.querySelector('.journey__stage-title');
      const descEl = stage.querySelector('.journey__stage-description');
      
      if (!titleEl || !descEl) return;
      
      const title = titleEl.textContent.trim();
      const category = stageMap[title];
      
      if (category && JOURNEY_STORIES[category]) {
        // Initialize index
        const stateKey = `journey_${category}`;
        state[stateKey] = 0;
        
        // Rotate stories
        setInterval(() => {
          const stories = JOURNEY_STORIES[category];
          state[stateKey] = (state[stateKey] + 1) % stories.length;
          animateTextChange(descEl, stories[state[stateKey]]);
        }, 18000 + Math.random() * 4000); // Every 18-22 seconds
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPARISON TABLE ENHANCEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  
  function initComparisonEnhancement() {
    if (!CONFIG.enableComparisonEnhancement) return;
    
    const proofTable = document.querySelector('.proof-table');
    if (!proofTable) {
      log('Proof table not found');
      return;
    }
    
    log('Initializing comparison table enhancement');
    
    // Find the "At 2am" row and enhance Ferni's column
    const rows = proofTable.querySelectorAll('.proof-table__row');
    rows.forEach(row => {
      const labelEl = row.querySelector('.proof-table__col--label');
      if (labelEl && labelEl.textContent.trim() === 'At 2am') {
        const ferniCol = row.querySelector('.proof-table__col--ferni .proof-table__good');
        if (ferniCol) {
          const scenarios = [
            'Same presence as noon',
            'Fully here, no sleep needed',
            '"Tell me everything"',
            'Ready when you are',
            'Already waiting for you',
          ];
          
          let index = 0;
          setInterval(() => {
            index = (index + 1) % scenarios.length;
            animateTextChange(ferniCol, scenarios[index]);
          }, 8000);
        }
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FINAL CTA PERSONALIZATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  function initFinalCTA() {
    if (!CONFIG.enableFinalCTA) return;
    
    const finalCTA = document.querySelector('.final-cta');
    if (!finalCTA) {
      log('Final CTA not found');
      return;
    }
    
    log('Initializing final CTA personalization');
    
    // Determine which variant to use
    const timeOfDay = getTimeOfDay();
    const visitorType = getVisitorType();
    
    // Priority: loyal > returning > time-of-day > default
    let variant;
    if (visitorType === 'loyal') {
      variant = FINAL_CTA_VARIANTS.loyal;
    } else if (visitorType === 'returning') {
      variant = FINAL_CTA_VARIANTS.returning;
    } else {
      variant = FINAL_CTA_VARIANTS[timeOfDay] || FINAL_CTA_VARIANTS.default;
    }
    
    // Apply variant
    const headlineEl = finalCTA.querySelector('.final-cta__headline');
    const subheadEl = finalCTA.querySelector('.final-cta__subhead');
    const phoneLabelEl = finalCTA.querySelector('.final-cta__phone-label');
    
    if (headlineEl && variant.headline) {
      headlineEl.textContent = variant.headline;
    }
    if (subheadEl && variant.subhead) {
      subheadEl.innerHTML = variant.subhead;
    }
    if (phoneLabelEl && variant.phoneLabel) {
      phoneLabelEl.textContent = variant.phoneLabel;
    }
    
    log('Applied final CTA variant:', visitorType || timeOfDay);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  function init() {
    log('Initializing AI Storytelling...');
    
    // Determine visitor context
    state.timeOfDay = getTimeOfDay();
    getVisitorType();
    
    // Initialize features with staggered timing to prevent jank
    setTimeout(() => initMemoryStories(), 100);
    setTimeout(() => initShowcaseRotation(), 200);
    setTimeout(() => initUseCaseVoices(), 300);
    setTimeout(() => initJourneyStories(), 400);
    setTimeout(() => initComparisonEnhancement(), 500);
    setTimeout(() => initFinalCTA(), 600);
    
    log('AI Storytelling initialized');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for debugging
  window.FerniStorytelling = {
    state,
    MEMORY_STORIES,
    SHOWCASE_CONVERSATIONS,
    USE_CASE_VOICES,
    JOURNEY_STORIES,
    FINAL_CTA_VARIANTS,
    // Manual testing
    showMemoryStory: (index) => {
      if (index >= 0 && index < MEMORY_STORIES.length) {
        state.currentMemoryStory = index;
        updateMemoryTimeline(MEMORY_STORIES[index]);
      }
    },
    showShowcase: (index) => {
      if (index >= 0 && index < SHOWCASE_CONVERSATIONS.length) {
        state.currentShowcase = index;
        updateShowcaseChat(SHOWCASE_CONVERSATIONS[index]);
      }
    },
  };

})();

