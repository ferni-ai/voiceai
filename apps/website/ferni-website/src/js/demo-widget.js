/**
 * ✨ Interactive Demo Widget
 * A mini chat that demonstrates Ferni's "Better than Human" magic
 * 
 * Features:
 * - Appears as a friendly floating orb
 * - Expands into a chat interface on click
 * - Pre-scripted conversations that show key capabilities
 * - Typing indicators with personality
 * - Memory demonstration (references earlier in conversation)
 * - Voice-first hints
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
    showDelay: 5000,           // Show after 5s on page
    peekDelay: 15000,          // Peek message after 15s
    typingSpeed: 40,           // ms per character
    thinkingDelay: 800,        // Pause before responding
    enableSound: false,        // Sound effects (disabled by default)
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
          triggers: ['stressed', 'overwhelmed', 'too much', 'anxious'],
          response: "I hear that. Want to talk through what's weighing on you, or would it help more to just... breathe for a moment first?",
          followUp: {
            triggers: ['talk', 'tell you', 'vent'],
            response: "I'm here. Take your time—there's no rush."
          }
        },
        {
          triggers: ['work', 'job', 'boss', 'career'],
          response: "Work stuff. That can be a lot to carry. What's the main thing sitting with you right now?",
          showsCapability: 'understanding'
        },
        {
          triggers: ['relationship', 'partner', 'dating', 'lonely'],
          response: "Relationships are complicated. I'm not going to give you a quick fix—but I can help you figure out what you're really feeling.",
          showsCapability: 'depth'
        },
        {
          triggers: ['sad', 'down', 'depressed', 'unhappy'],
          response: "I'm sorry you're feeling that way. Sometimes sadness needs space, not solutions. What does yours need right now?",
          showsCapability: 'emotional-intelligence'
        },
        {
          triggers: ['hi', 'hello', 'hey'],
          response: "Hey. I'm here whenever you're ready to talk. No pressure."
        }
      ],
      default: "Tell me more about that. I want to understand."
    },
    
    // Memory demonstration
    memory: {
      greeting: "Last time you mentioned you were working on setting boundaries at work. How's that going?",
      showsCapability: 'memory',
      explanation: "I remember what matters to you."
    },
    
    // 2am demonstration
    lateNight: {
      greeting: "It's late. Can't sleep, or choosing not to?",
      showsCapability: '24-7-presence',
      explanation: "Same presence at 2am as noon."
    }
  };

  // ============================================================================
  // CAPABILITY DEMONSTRATIONS
  // ============================================================================
  
  const CAPABILITIES = {
    memory: {
      icon: '🧠',
      label: 'Perfect Memory',
      description: 'I remember your whole story'
    },
    understanding: {
      icon: '👂',
      label: 'Deep Understanding',
      description: 'I hear what you\'re not saying'
    },
    depth: {
      icon: '🌊',
      label: 'Real Depth',
      description: 'Not just surface-level advice'
    },
    'emotional-intelligence': {
      icon: '💚',
      label: 'Emotional Intelligence',
      description: 'I meet you where you are'
    },
    '24-7-presence': {
      icon: '🌙',
      label: 'Always Present',
      description: 'Same warmth, any hour'
    }
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
            <div class="demo-widget__mini-orb">FE</div>
            <span>Ferni</span>
            <span class="demo-widget__status">Demo Mode</span>
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
  // MESSAGING
  // ============================================================================
  
  function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;
    
    // Add user message
    addUserMessage(text);
    inputEl.value = '';
    state.lastUserMessage = text;
    
    // Generate response
    setTimeout(() => {
      showTypingIndicator();
      
      setTimeout(() => {
        hideTypingIndicator();
        const response = generateResponse(text);
        addFerniMessage(response.text);
        
        if (response.capability) {
          showCapabilityHint(response.capability);
        }
      }, CONFIG.thinkingDelay + text.length * 20);
    }, 300);
  }
  
  function addUserMessage(text) {
    const msg = document.createElement('div');
    msg.className = 'demo-message demo-message--user';
    msg.textContent = text;
    messagesContainer.appendChild(msg);
    scrollToBottom();
    state.messages.push({ role: 'user', text });
  }
  
  function addFerniMessage(text) {
    const msg = document.createElement('div');
    msg.className = 'demo-message demo-message--ferni';
    messagesContainer.appendChild(msg);
    
    // Typewriter effect
    typeText(msg, text);
    
    scrollToBottom();
    state.messages.push({ role: 'ferni', text });
  }
  
  function typeText(element, text) {
    let i = 0;
    element.textContent = '';
    
    function type() {
      if (i < text.length) {
        element.textContent += text.charAt(i);
        i++;
        scrollToBottom();
        setTimeout(type, CONFIG.typingSpeed);
      }
    }
    
    type();
  }
  
  function showTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'demo-typing';
    indicator.innerHTML = `
      <span></span>
      <span></span>
      <span></span>
    `;
    messagesContainer.appendChild(indicator);
    scrollToBottom();
  }
  
  function hideTypingIndicator() {
    const indicator = messagesContainer.querySelector('.demo-typing');
    if (indicator) {
      indicator.remove();
    }
  }
  
  function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // ============================================================================
  // RESPONSE GENERATION
  // ============================================================================
  
  function generateResponse(userText) {
    const text = userText.toLowerCase();
    const script = state.conversationScript;
    
    // Check for trigger matches
    if (script.exchanges) {
      for (const exchange of script.exchanges) {
        const matched = exchange.triggers.some(trigger => text.includes(trigger));
        if (matched) {
          return {
            text: exchange.response,
            capability: exchange.showsCapability
          };
        }
      }
    }
    
    // Memory callback - reference something earlier
    if (state.messages.length > 4 && Math.random() > 0.7) {
      const earlierMessage = state.messages.find(m => m.role === 'user');
      if (earlierMessage) {
        return {
          text: `You mentioned "${earlierMessage.text.slice(0, 30)}..." earlier. Does that connect to what you're feeling now?`,
          capability: 'memory'
        };
      }
    }
    
    // Default response
    return {
      text: script.default || "Tell me more about that. I'm listening.",
      capability: null
    };
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
