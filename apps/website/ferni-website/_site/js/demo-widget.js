/**
 * Interactive Demo Widget
 * A mini chat that demonstrates Ferni's "Better than Human" magic
 * 
 * Features:
 * - Appears as a friendly floating orb with breathing animation
 * - Expands into a polished chat interface on click
 * - Pre-scripted conversations that show key capabilities
 * - Human-like typing with personality (speed variation, pauses)
 * - Emotional state indicators (badges)
 * - Memory demonstration (references earlier in conversation)
 * - Voice-first hints with call-to-action
 * - Response variations for repeated topics
 * 
 * Philosophy: Show, don't tell. Let people feel the difference.
 */

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  const CONFIG = {
    enableWidget: true,
    position: 'bottom-right',
    showDelay: 3000,           // Show after 3s on page
    peekDelay: 12000,          // Peek message after 12s
    baseTypingSpeed: 35,       // Base ms per character
    typingVariation: 0.4,      // How much typing speed varies (0-1)
    pausePunctuation: 150,     // Extra pause after . ! ?
    pauseComma: 80,            // Extra pause after ,
    thinkingDelayBase: 600,    // Base pause before responding
    thinkingDelayPerChar: 8,   // Extra thinking time based on message length
    enableSound: false,
    debugMode: false
  };

  // ============================================================================
  // CONVERSATION SCRIPTS - Showcasing "Better than Human"
  // ============================================================================
  
  const CONVERSATIONS = {
    // Default conversation showing memory + understanding
    default: {
      greeting: "Hey. What's on your mind?",
      exchanges: [
        {
          triggers: ['stressed', 'overwhelmed', 'too much', 'anxious', 'anxiety'],
          responses: [
            "I hear that. Want to talk through what's weighing on you, or would it help more to just... breathe for a moment first?",
            "That sounds heavy. What's one thing that feels the most pressing right now?",
            "Stress has a way of piling up. No rush—just tell me what's there."
          ],
          emotion: 'concerned',
          showsCapability: 'emotional-intelligence',
          followUp: {
            triggers: ['talk', 'tell you', 'vent', 'yes'],
            response: "I'm here. Take your time—there's no rush."
          }
        },
        {
          triggers: ['work', 'job', 'boss', 'career', 'office'],
          responses: [
            "Work stuff. That can be a lot to carry. What's the main thing sitting with you right now?",
            "Work takes up so much headspace, doesn't it? What's been the hardest part lately?",
            "I hear you. Is it the work itself, or the people, or something else?"
          ],
          emotion: 'curious',
          showsCapability: 'understanding'
        },
        {
          triggers: ['relationship', 'partner', 'dating', 'lonely', 'love', 'girlfriend', 'boyfriend'],
          responses: [
            "Relationships are complicated. I'm not going to give you a quick fix—but I can help you figure out what you're really feeling.",
            "That's tender territory. What part of it do you want to explore?",
            "Love stuff. There's a lot there. What feels most important to talk about?"
          ],
          emotion: 'warm',
          showsCapability: 'depth'
        },
        {
          triggers: ['sad', 'down', 'depressed', 'unhappy', 'miserable'],
          responses: [
            "I'm sorry you're feeling that way. Sometimes sadness needs space, not solutions. What does yours need right now?",
            "That's hard. I'm not going to try to cheer you up—but I'm here to sit with you in it.",
            "Sadness has something to tell us. Want to listen to it together?"
          ],
          emotion: 'empathetic',
          showsCapability: 'emotional-intelligence'
        },
        {
          triggers: ['happy', 'good', 'great', 'excited', 'amazing'],
          responses: [
            "That's wonderful to hear! What's bringing that energy?",
            "I love that. Tell me what's going right.",
            "That's great! I'm curious what's lighting you up."
          ],
          emotion: 'delighted'
        },
        {
          triggers: ['tired', 'exhausted', 'burnt out', 'burnout', 'drained'],
          responses: [
            "Exhaustion is real. Is this a 'I need rest' tired or a 'something deeper' tired?",
            "Being drained like that... it's hard. What's been taking the most from you?",
            "That kind of tired runs deep. What would help right now—rest or talking?"
          ],
          emotion: 'concerned',
          showsCapability: 'understanding'
        },
        {
          triggers: ['confused', 'lost', 'uncertain', 'don\'t know', 'stuck'],
          responses: [
            "Being stuck is uncomfortable. But sometimes it's just the pause before clarity. What feels most unclear?",
            "That's okay. Confusion often means you're on the edge of figuring something out.",
            "Not knowing is hard. Let's untangle it together—what feels like the knot?"
          ],
          emotion: 'thoughtful',
          showsCapability: 'depth'
        },
        {
          triggers: ['hi', 'hello', 'hey', 'sup'],
          responses: [
            "Hey. I'm here whenever you're ready to talk. No pressure.",
            "Hey there. What's on your mind today?",
            "Hi. How are you really doing?"
          ],
          emotion: 'neutral'
        }
      ],
      defaults: [
        "Tell me more about that. I want to understand.",
        "I'm listening. What else is there?",
        "Say more—I'm here.",
        "What's underneath that?",
        "Keep going. I'm following."
      ]
    },
    
    // Memory demonstration
    memory: {
      greeting: "Last time you mentioned you were working on setting boundaries at work. How's that going?",
      showsCapability: 'memory',
      explanation: "I remember what matters to you.",
      emotion: 'thoughtful'
    },
    
    // 2am demonstration
    lateNight: {
      greeting: "It's late. Can't sleep, or choosing not to?",
      showsCapability: '24-7-presence',
      explanation: "Same presence at 2am as noon.",
      emotion: 'warm'
    }
  };

  // ============================================================================
  // CAPABILITY DEMONSTRATIONS
  // ============================================================================
  
  const CAPABILITIES = {
    memory: {
      label: 'Perfect Memory',
      description: 'I remember your whole story'
    },
    understanding: {
      label: 'Deep Understanding',
      description: 'I hear what you\'re not saying'
    },
    depth: {
      label: 'Real Depth',
      description: 'Not just surface-level advice'
    },
    'emotional-intelligence': {
      label: 'Emotional Intelligence',
      description: 'I meet you where you are'
    },
    '24-7-presence': {
      label: 'Always Present',
      description: 'Same warmth, any hour'
    }
  };
  
  // ============================================================================
  // EMOTIONAL STATES - For emotion badge display
  // ============================================================================
  
  const EMOTIONS = {
    neutral: { color: '#4a6741', label: 'Present' },
    curious: { color: '#3a6b73', label: 'Curious' },
    warm: { color: '#a67a6a', label: 'Warm' },
    concerned: { color: '#7a6a5a', label: 'Concerned' },
    empathetic: { color: '#8a6a7a', label: 'With You' },
    thoughtful: { color: '#5a6b8a', label: 'Thinking' },
    delighted: { color: '#6a8a5a', label: 'Happy' }
  };

  // ============================================================================
  // STATE
  // ============================================================================
  
  const state = {
    isOpen: false,
    isPeeking: false,
    messages: [],
    conversationScript: null,
    lastUserMessage: '',
    showedCapabilities: new Set(),
    usedResponses: new Map(),     // Track which responses were used per trigger
    currentEmotion: 'neutral',
    isTyping: false,
    initialized: false
  };

  // ============================================================================
  // DOM ELEMENTS
  // ============================================================================
  
  let widgetContainer = null;
  let widgetTrigger = null;
  let widgetChat = null;
  let messagesContainer = null;
  let inputEl = null;

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  function init() {
    if (!CONFIG.enableWidget) return;
    
    createWidget();
    bindEvents();
    
    // Delayed appearance
    setTimeout(() => {
      showWidget();
    }, CONFIG.showDelay);
    
    // Peek message after longer delay
    setTimeout(() => {
      if (!state.isOpen) {
        showPeek();
      }
    }, CONFIG.peekDelay);
    
    // Choose conversation based on time
    const hour = new Date().getHours();
    if (hour >= 23 || hour < 5) {
      state.conversationScript = CONVERSATIONS.lateNight;
    } else if (localStorage.getItem('ferni_demo_visited')) {
      state.conversationScript = CONVERSATIONS.memory;
    } else {
      state.conversationScript = CONVERSATIONS.default;
    }
    
    state.initialized = true;
    logDebug('Demo Widget initialized');
  }

  // ============================================================================
  // CREATE WIDGET DOM
  // ============================================================================
  
  function createWidget() {
    widgetContainer = document.createElement('div');
    widgetContainer.className = 'demo-widget';
    widgetContainer.innerHTML = `
      <button class="demo-widget__trigger" aria-label="Chat with Ferni">
        <div class="demo-widget__avatar">
          <div class="demo-widget__avatar-glow"></div>
          <div class="demo-widget__avatar-orb">
            <span>FE</span>
          </div>
        </div>
        <div class="demo-widget__peek">
          <span class="demo-widget__peek-text"></span>
        </div>
      </button>
      
      <div class="demo-widget__chat" aria-hidden="true">
        <div class="demo-widget__header">
          <div class="demo-widget__header-avatar">
            <div class="demo-widget__mini-orb">
              <span>FE</span>
              <div class="demo-widget__mini-orb-glow"></div>
            </div>
            <div class="demo-widget__header-info">
              <span class="demo-widget__header-name">Ferni</span>
              <span class="demo-widget__status">Demo Mode</span>
            </div>
            <span class="demo-widget__emotion-badge"></span>
          </div>
          <button class="demo-widget__close" aria-label="Close chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        
        <div class="demo-widget__messages">
          <div class="demo-widget__capability-hint" hidden>
            <span class="demo-widget__capability-icon"></span>
            <span class="demo-widget__capability-text"></span>
          </div>
        </div>
        
        <div class="demo-widget__input-area">
          <input 
            type="text" 
            class="demo-widget__input" 
            placeholder="Try typing something..."
            aria-label="Type a message"
          />
          <button class="demo-widget__send" aria-label="Send message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </button>
          <button class="demo-widget__voice" aria-label="Use voice">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
            </svg>
          </button>
        </div>
        
        <div class="demo-widget__footer">
          <a href="https://app.ferni.ai" class="demo-widget__cta">
            Start a Real Conversation
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </a>
        </div>
      </div>
    `;
    
    document.body.appendChild(widgetContainer);
    
    // Cache references
    widgetTrigger = widgetContainer.querySelector('.demo-widget__trigger');
    widgetChat = widgetContainer.querySelector('.demo-widget__chat');
    messagesContainer = widgetContainer.querySelector('.demo-widget__messages');
    inputEl = widgetContainer.querySelector('.demo-widget__input');
  }

  // ============================================================================
  // EVENT BINDING
  // ============================================================================
  
  function bindEvents() {
    // Trigger click
    widgetTrigger.addEventListener('click', toggleChat);
    
    // Close button
    widgetContainer.querySelector('.demo-widget__close').addEventListener('click', closeChat);
    
    // Send message
    widgetContainer.querySelector('.demo-widget__send').addEventListener('click', sendMessage);
    
    // Enter key
    inputEl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });
    
    // Voice button (show tooltip)
    widgetContainer.querySelector('.demo-widget__voice').addEventListener('click', () => {
      showVoiceHint();
    });
    
    // Click outside to close
    document.addEventListener('click', (e) => {
      if (state.isOpen && !widgetContainer.contains(e.target)) {
        closeChat();
      }
    });
  }

  // ============================================================================
  // WIDGET VISIBILITY
  // ============================================================================
  
  function showWidget() {
    widgetContainer.classList.add('is-visible');
  }
  
  function showPeek() {
    if (state.isOpen) return;
    
    state.isPeeking = true;
    const peekText = widgetContainer.querySelector('.demo-widget__peek-text');
    peekText.textContent = "Something on your mind?";
    widgetContainer.classList.add('is-peeking');
    
    // Auto-hide after 5s
    setTimeout(() => {
      if (state.isPeeking) {
        widgetContainer.classList.remove('is-peeking');
        state.isPeeking = false;
      }
    }, 5000);
  }

  // ============================================================================
  // CHAT OPEN/CLOSE
  // ============================================================================
  
  function toggleChat() {
    if (state.isOpen) {
      closeChat();
    } else {
      openChat();
    }
  }
  
  function openChat() {
    state.isOpen = true;
    state.isPeeking = false;
    widgetContainer.classList.remove('is-peeking');
    widgetContainer.classList.add('is-open');
    widgetChat.setAttribute('aria-hidden', 'false');
    
    // Focus input
    setTimeout(() => {
      inputEl.focus();
    }, 300);
    
    // Show greeting if first open
    if (state.messages.length === 0) {
      setTimeout(() => {
        addFerniMessage(state.conversationScript.greeting);
        
        // Show capability hint if applicable
        if (state.conversationScript.showsCapability) {
          showCapabilityHint(state.conversationScript.showsCapability);
        }
      }, 500);
    }
    
    // Mark as visited for memory demo
    localStorage.setItem('ferni_demo_visited', 'true');
  }
  
  function closeChat() {
    state.isOpen = false;
    widgetContainer.classList.remove('is-open');
    widgetChat.setAttribute('aria-hidden', 'true');
  }

  // ============================================================================
  // MESSAGING - With personality
  // ============================================================================
  
  function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || state.isTyping) return;
    
    // Add user message
    addUserMessage(text);
    inputEl.value = '';
    state.lastUserMessage = text;
    
    // Calculate thinking time (longer messages = more thought)
    const thinkingTime = CONFIG.thinkingDelayBase + 
                         Math.min(text.length * CONFIG.thinkingDelayPerChar, 800);
    
    // Generate response
    setTimeout(() => {
      showTypingIndicator();
      state.isTyping = true;
      
      // Generate response content
      const response = generateResponse(text);
      
      // Calculate typing duration (approximate)
      const typingDuration = response.text.length * CONFIG.baseTypingSpeed * 1.5;
      
      setTimeout(() => {
        hideTypingIndicator();
        addFerniMessage(response.text, response.emotion);
        state.isTyping = false;
        
        if (response.capability) {
          setTimeout(() => showCapabilityHint(response.capability), 500);
        }
      }, typingDuration);
    }, thinkingTime);
  }
  
  function addUserMessage(text) {
    const msg = document.createElement('div');
    msg.className = 'demo-message demo-message--user';
    
    // Add entrance animation
    msg.innerHTML = `<span class="demo-message__content">${escapeHtml(text)}</span>`;
    
    messagesContainer.appendChild(msg);
    requestAnimationFrame(() => msg.classList.add('is-visible'));
    scrollToBottom();
    state.messages.push({ role: 'user', text });
  }
  
  function addFerniMessage(text, emotion = 'neutral') {
    const msg = document.createElement('div');
    msg.className = 'demo-message demo-message--ferni';
    msg.dataset.emotion = emotion;
    
    // Update current emotion
    state.currentEmotion = emotion;
    updateEmotionBadge(emotion);
    
    // Create message structure
    msg.innerHTML = `<span class="demo-message__content"></span>`;
    const contentEl = msg.querySelector('.demo-message__content');
    
    messagesContainer.appendChild(msg);
    requestAnimationFrame(() => msg.classList.add('is-visible'));
    
    // Typewriter effect with personality
    typeTextWithPersonality(contentEl, text);
    
    scrollToBottom();
    state.messages.push({ role: 'ferni', text, emotion });
  }
  
  function typeTextWithPersonality(element, text) {
    let i = 0;
    element.textContent = '';
    
    function type() {
      if (i < text.length) {
        const char = text.charAt(i);
        element.textContent += char;
        i++;
        scrollToBottom();
        
        // Calculate delay with personality
        let delay = CONFIG.baseTypingSpeed;
        
        // Add variation for natural feel
        delay += (Math.random() - 0.5) * CONFIG.baseTypingSpeed * CONFIG.typingVariation * 2;
        
        // Pause on punctuation
        if (['.', '!', '?'].includes(char)) {
          delay += CONFIG.pausePunctuation;
        } else if (char === ',') {
          delay += CONFIG.pauseComma;
        } else if (char === '—') {
          delay += CONFIG.pausePunctuation * 0.5; // em-dash is a thoughtful pause
        }
        
        // Occasional longer pause (thinking)
        if (Math.random() < 0.02) {
          delay += 150;
        }
        
        setTimeout(type, Math.max(10, delay));
      }
    }
    
    type();
  }
  
  function showTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'demo-typing';
    indicator.innerHTML = `
      <div class="demo-typing__dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <span class="demo-typing__label">Ferni is thinking...</span>
    `;
    messagesContainer.appendChild(indicator);
    requestAnimationFrame(() => indicator.classList.add('is-visible'));
    scrollToBottom();
  }
  
  function hideTypingIndicator() {
    const indicator = messagesContainer.querySelector('.demo-typing');
    if (indicator) {
      indicator.classList.remove('is-visible');
      setTimeout(() => indicator.remove(), 200);
    }
  }
  
  function scrollToBottom() {
    messagesContainer.scrollTo({
      top: messagesContainer.scrollHeight,
      behavior: 'smooth'
    });
  }
  
  function updateEmotionBadge(emotionId) {
    const badge = widgetContainer.querySelector('.demo-widget__emotion-badge');
    if (!badge) return;
    
    const emotion = EMOTIONS[emotionId] || EMOTIONS.neutral;
    badge.textContent = emotion.label;
    badge.style.setProperty('--emotion-color', emotion.color);
    badge.classList.add('is-visible');
    
    // Hide after 3 seconds
    setTimeout(() => badge.classList.remove('is-visible'), 3000);
  }
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================================================
  // RESPONSE GENERATION - With variations and memory
  // ============================================================================
  
  function generateResponse(userText) {
    const text = userText.toLowerCase();
    const script = state.conversationScript;
    
    // Check for trigger matches
    if (script.exchanges) {
      for (const exchange of script.exchanges) {
        const matchedTrigger = exchange.triggers.find(trigger => text.includes(trigger));
        if (matchedTrigger) {
          // Get response with variation
          const responses = exchange.responses || [exchange.response];
          const responseText = getVariedResponse(matchedTrigger, responses);
          
          return {
            text: responseText,
            capability: exchange.showsCapability,
            emotion: exchange.emotion || 'neutral'
          };
        }
      }
    }
    
    // Memory callback - reference something earlier (more likely as conversation progresses)
    const memoryChance = Math.min(0.4, state.messages.length * 0.1);
    if (state.messages.length > 3 && Math.random() < memoryChance) {
      const userMessages = state.messages.filter(m => m.role === 'user');
      if (userMessages.length > 1) {
        const earlierMessage = userMessages[0];
        const memoryResponses = [
          `You mentioned "${truncate(earlierMessage.text, 25)}" earlier. Does that connect to what you're feeling now?`,
          `I keep thinking about when you said "${truncate(earlierMessage.text, 25)}." Is that related?`,
          `Going back to what you said about "${truncate(earlierMessage.text, 25)}"—is that still on your mind?`
        ];
        
        return {
          text: pickRandom(memoryResponses),
          capability: 'memory',
          emotion: 'thoughtful'
        };
      }
    }
    
    // Default response with variation
    const defaults = script.defaults || [script.default || "Tell me more about that. I'm listening."];
    return {
      text: pickRandom(defaults),
      capability: null,
      emotion: 'curious'
    };
  }
  
  function getVariedResponse(trigger, responses) {
    // Track which responses we've used for this trigger
    if (!state.usedResponses.has(trigger)) {
      state.usedResponses.set(trigger, new Set());
    }
    
    const used = state.usedResponses.get(trigger);
    
    // Find unused responses
    const available = responses.filter((_, i) => !used.has(i));
    
    // If all used, reset
    if (available.length === 0) {
      used.clear();
      return pickRandom(responses);
    }
    
    // Pick random from available
    const unusedIndices = responses
      .map((_, i) => i)
      .filter(i => !used.has(i));
    
    const chosenIndex = pickRandom(unusedIndices);
    used.add(chosenIndex);
    
    return responses[chosenIndex];
  }
  
  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  
  function truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trim() + '...';
  }

  // ============================================================================
  // CAPABILITY HINTS
  // ============================================================================
  
  function showCapabilityHint(capabilityId) {
    const capability = CAPABILITIES[capabilityId];
    if (!capability || state.showedCapabilities.has(capabilityId)) return;
    
    state.showedCapabilities.add(capabilityId);
    
    const hint = messagesContainer.querySelector('.demo-widget__capability-hint');
    const icon = hint.querySelector('.demo-widget__capability-icon');
    const text = hint.querySelector('.demo-widget__capability-text');
    
    icon.textContent = capability.icon;
    text.textContent = capability.description;
    
    hint.hidden = false;
    hint.classList.add('is-visible');
    
    // Hide after 4s
    setTimeout(() => {
      hint.classList.remove('is-visible');
      setTimeout(() => {
        hint.hidden = true;
      }, 300);
    }, 4000);
  }

  // ============================================================================
  // VOICE HINT
  // ============================================================================
  
  function showVoiceHint() {
    const existing = widgetContainer.querySelector('.demo-voice-tooltip');
    if (existing) existing.remove();
    
    const tooltip = document.createElement('div');
    tooltip.className = 'demo-voice-tooltip';
    tooltip.innerHTML = `
      <p>Ferni is voice-first.</p>
      <p>In the real app, just talk—Ferni listens and responds naturally.</p>
      <a href="tel:+14844813081">Try calling: (484) 481-3081</a>
    `;
    
    widgetContainer.querySelector('.demo-widget__input-area').appendChild(tooltip);
    
    setTimeout(() => {
      tooltip.classList.add('is-visible');
    }, 10);
    
    setTimeout(() => {
      tooltip.classList.remove('is-visible');
      setTimeout(() => tooltip.remove(), 300);
    }, 5000);
  }

  // ============================================================================
  // UTILITY
  // ============================================================================
  
  function logDebug(...args) {
    if (CONFIG.debugMode) {
      console.log('[DemoWidget]', ...args);
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  
  window.FerniDemo = {
    init,
    open: openChat,
    close: closeChat,
    toggle: toggleChat,
    getState: () => ({ ...state })
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
