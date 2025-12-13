/**
 * AI-Powered Landing Page Features
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive AI interactions for the Ferni landing page:
 *
 * 1. LIVE TEXT CHAT - Real AI conversation without signup
 * 2. PERSONALIZED HERO - AI-generated headlines based on context
 * 3. PERSONA PREVIEW CARDS - Interactive team member demos
 * 4. MEMORY VISUALIZATION - Interactive memory demonstration
 * 5. HOVER PREVIEWS - "What would Ferni say?" tooltips
 * 6. AI SOCIAL PROOF - Dynamic testimonial snippets
 * 7. SENTIMENT-REACTIVE COPY - Dynamic copy based on engagement
 * 8. SMART FAQ - Ask anything, AI answers
 * 9. MICRO-EXPRESSIONS - Orb reactions to user behavior
 *
 * @module ai-powered-landing
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  const CONFIG = {
    apiBase: '/api/landing/ai',
    // Feature flags - these get updated by loadFeatureFlags()
    enableChat: false,
    enablePersonalizedHero: false,
    enablePersonaPreviews: false,
    enableSmartFAQ: false,
    enableSocialProof: false,
    enableHoverPreviews: false,
    enableSentimentCopy: false,
    enableMicroExpressions: false,
    enableVoiceSamples: false,
    enableMemoryDemo: false,
    debugMode: false,
  };

  // Feature flag mapping: server flag ID -> CONFIG key
  const FLAG_MAP = {
    'landing-ai-live-chat': 'enableChat',
    'landing-ai-personalized-hero': 'enablePersonalizedHero',
    'landing-ai-persona-previews': 'enablePersonaPreviews',
    'landing-ai-smart-faq': 'enableSmartFAQ',
    'landing-ai-social-proof': 'enableSocialProof',
    'landing-ai-hover-previews': 'enableHoverPreviews',
    'landing-ai-sentiment-copy': 'enableSentimentCopy',
    'landing-ai-micro-expressions': 'enableMicroExpressions',
    'landing-ai-voice-samples': 'enableVoiceSamples',
    'landing-ai-memory-demo': 'enableMemoryDemo',
  };

  /**
   * Load feature flags from experiments API
   */
  async function loadFeatureFlags() {
    try {
      // Check if FerniExperiments is available (from experiments.js)
      if (typeof window.FerniExperiments === 'undefined') {
        console.warn('[AI Landing] FerniExperiments not available, using defaults');
        return;
      }

      // Load each flag
      const flagPromises = Object.entries(FLAG_MAP).map(async ([flagId, configKey]) => {
        try {
          const variant = await window.FerniExperiments.getVariant(flagId, { skipExposure: true });
          // Variant is either the percentage bucket or 'control'/'enabled'
          CONFIG[configKey] = variant !== 'control' && variant !== '0';
          if (CONFIG.debugMode) {
            console.log(`[AI Landing] Flag ${flagId} = ${CONFIG[configKey]}`);
          }
        } catch (e) {
          // Flag not found or error - keep default (false)
        }
      });

      await Promise.all(flagPromises);
      console.log('[AI Landing] Feature flags loaded');
    } catch (error) {
      console.warn('[AI Landing] Failed to load feature flags:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════

  const state = {
    visitorId: null,
    chatOpen: false,
    chatMessages: [],
    messagesRemaining: 10,
    currentPersona: 'ferni',
    sentiment: 0.5,
    initialized: false,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  function getVisitorId() {
    let id = localStorage.getItem('ferni_visitor_id');
    if (!id) {
      id = 'fv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('ferni_visitor_id', id);
    }
    return id;
  }

  async function apiCall(endpoint, options = {}) {
    try {
      const response = await fetch(CONFIG.apiBase + endpoint, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.warn('[AI Landing] API call failed:', error);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. LIVE TEXT CHAT
  // ═══════════════════════════════════════════════════════════════════════════

  const LiveChat = {
    container: null,
    panel: null,
    messagesContainer: null,
    input: null,
    sendButton: null,

    init() {
      if (!CONFIG.enableChat) return;

      this.createChatWidget();
      this.bindEvents();

      if (CONFIG.debugMode) {
        console.log('[LiveChat] Initialized');
      }
    },

    createChatWidget() {
      // Check if widget already exists
      if (document.getElementById('ferni-live-chat')) return;

      const widget = document.createElement('div');
      widget.id = 'ferni-live-chat';
      widget.innerHTML = `
        <button class="ferni-chat-trigger" aria-label="Chat with Ferni">
          <div class="ferni-chat-trigger__avatar">FE</div>
          <span class="ferni-chat-trigger__text">Chat with Ferni</span>
          <span class="ferni-chat-trigger__badge">AI</span>
        </button>
        
        <div class="ferni-chat-panel" aria-hidden="true">
          <div class="ferni-chat-panel__header">
            <div class="ferni-chat-panel__persona">
              <div class="ferni-chat-panel__avatar">FE</div>
              <div class="ferni-chat-panel__info">
                <span class="ferni-chat-panel__name">Ferni</span>
                <span class="ferni-chat-panel__status">● Online</span>
              </div>
            </div>
            <div class="ferni-chat-panel__remaining">
              <span class="ferni-chat-panel__count">${state.messagesRemaining}</span> messages left
            </div>
            <button class="ferni-chat-panel__close" aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          
          <div class="ferni-chat-panel__messages">
            <div class="ferni-chat-message ferni-chat-message--ai">
              <p>Hey! 👋 I'm Ferni. Want to see what it's like to talk to someone who actually listens? Try me—no signup needed.</p>
            </div>
          </div>
          
          <div class="ferni-chat-panel__input-area">
            <input 
              type="text" 
              class="ferni-chat-panel__input" 
              placeholder="What's on your mind?"
              maxlength="500"
            />
            <button class="ferni-chat-panel__send" aria-label="Send">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            </button>
          </div>
          
          <div class="ferni-chat-panel__footer">
            <a href="https://app.ferni.ai" class="ferni-chat-panel__upgrade">
              Create free account for unlimited access →
            </a>
          </div>
        </div>
      `;

      document.body.appendChild(widget);

      this.container = widget;
      this.panel = widget.querySelector('.ferni-chat-panel');
      this.messagesContainer = widget.querySelector('.ferni-chat-panel__messages');
      this.input = widget.querySelector('.ferni-chat-panel__input');
      this.sendButton = widget.querySelector('.ferni-chat-panel__send');
    },

    bindEvents() {
      const trigger = this.container.querySelector('.ferni-chat-trigger');
      const closeBtn = this.container.querySelector('.ferni-chat-panel__close');

      trigger.addEventListener('click', () => this.togglePanel());
      closeBtn.addEventListener('click', () => this.closePanel());

      this.input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });

      this.sendButton.addEventListener('click', () => this.sendMessage());

      // Close on escape
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && state.chatOpen) {
          this.closePanel();
        }
      });
    },

    togglePanel() {
      state.chatOpen ? this.closePanel() : this.openPanel();
    },

    openPanel() {
      state.chatOpen = true;
      this.panel.classList.add('is-open');
      this.panel.setAttribute('aria-hidden', 'false');
      this.container.classList.add('is-open');
      this.input.focus();

      // Track
      window.FerniExperiments?.trackConversionForAll('chat_opened');
    },

    closePanel() {
      state.chatOpen = false;
      this.panel.classList.remove('is-open');
      this.panel.setAttribute('aria-hidden', 'true');
      this.container.classList.remove('is-open');
    },

    async sendMessage() {
      const message = this.input.value.trim();
      if (!message) return;

      // Clear input
      this.input.value = '';

      // Add user message to UI
      this.addMessage(message, 'user');

      // Show typing indicator
      this.showTyping();

      // Send to API
      const result = await apiCall('/chat', {
        method: 'POST',
        body: {
          visitorId: state.visitorId,
          message,
          persona: state.currentPersona,
        },
      });

      // Hide typing
      this.hideTyping();

      if (result) {
        this.addMessage(result.response, 'ai');
        state.messagesRemaining = result.messagesRemaining;
        this.updateRemainingCount();

        // If out of messages, show upgrade prompt
        if (result.messagesRemaining === 0) {
          this.showUpgradePrompt();
        }
      } else {
        this.addMessage("Sorry, I couldn't respond right now. Try again?", 'ai');
      }
    },

    addMessage(content, type) {
      const msg = document.createElement('div');
      msg.className = `ferni-chat-message ferni-chat-message--${type}`;
      msg.innerHTML = `<p>${this.escapeHtml(content)}</p>`;

      this.messagesContainer.appendChild(msg);
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    },

    showTyping() {
      const typing = document.createElement('div');
      typing.className = 'ferni-chat-typing';
      typing.innerHTML = `
        <div class="ferni-chat-typing__dot"></div>
        <div class="ferni-chat-typing__dot"></div>
        <div class="ferni-chat-typing__dot"></div>
      `;
      this.messagesContainer.appendChild(typing);
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    },

    hideTyping() {
      const typing = this.messagesContainer.querySelector('.ferni-chat-typing');
      if (typing) typing.remove();
    },

    updateRemainingCount() {
      const countEl = this.container.querySelector('.ferni-chat-panel__count');
      if (countEl) {
        countEl.textContent = state.messagesRemaining;
        if (state.messagesRemaining <= 3) {
          countEl.classList.add('is-low');
        }
      }
    },

    showUpgradePrompt() {
      const prompt = document.createElement('div');
      prompt.className = 'ferni-chat-upgrade-prompt';
      prompt.innerHTML = `
        <p>You've used all your demo messages! 💚</p>
        <a href="https://app.ferni.ai" class="btn btn--primary btn--sm">
          Create free account to continue
        </a>
      `;
      this.messagesContainer.appendChild(prompt);
    },

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. PERSONALIZED HERO
  // ═══════════════════════════════════════════════════════════════════════════

  const PersonalizedHero = {
    async init() {
      if (!CONFIG.enablePersonalizedHero) return;

      // Gather context
      const context = {
        hour: new Date().getHours(),
        referrer: document.referrer || undefined,
        isReturning: parseInt(localStorage.getItem('ferni_visit_count') || '0', 10) > 1,
        visitCount: parseInt(localStorage.getItem('ferni_visit_count') || '1', 10),
        device: window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop',
        sentiment: window.FerniSentience?.sentiment?.() || 0.5,
        topSectionsViewed: this.getTopSections(),
      };

      const result = await apiCall('/personalized-hero', {
        method: 'POST',
        body: context,
      });

      if (result) {
        this.applyHero(result);
      }
    },

    getTopSections() {
      const attention = window.FerniSentience?.attention?.();
      if (!attention) return [];
      return attention.map((a) => a.id).slice(0, 3);
    },

    applyHero(hero) {
      const tagline = document.querySelector('.hero__tagline');
      const headline = document.querySelector('.hero__headline');
      const subhead = document.querySelector('.hero__subhead');
      const cta = document.querySelector('.hero__cta .btn--primary');

      if (tagline && hero.tagline) {
        tagline.textContent = hero.tagline;
        tagline.classList.add('is-personalized');
      }

      if (headline && hero.headline) {
        headline.innerHTML = hero.headline;
        headline.classList.add('is-personalized');
      }

      if (subhead && hero.subhead) {
        subhead.textContent = hero.subhead;
        subhead.classList.add('is-personalized');
      }

      if (cta && hero.ctaText) {
        const icon = cta.querySelector('svg');
        cta.childNodes[0].textContent = hero.ctaText + ' ';
        if (icon) cta.appendChild(icon);
      }

      if (CONFIG.debugMode) {
        console.log('[PersonalizedHero] Applied:', hero.generationReason);
      }
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. PERSONA PREVIEW CARDS
  // ═══════════════════════════════════════════════════════════════════════════

  const PersonaPreviews = {
    init() {
      if (!CONFIG.enablePersonaPreviews) return;

      this.enhanceTeamCards();
    },

    enhanceTeamCards() {
      const teamCards = document.querySelectorAll('.team-card');

      teamCards.forEach((card) => {
        const personaId = this.getPersonaId(card);
        if (!personaId) return;

        // Add input field for questions
        const inputContainer = document.createElement('div');
        inputContainer.className = 'team-card__preview-input';
        inputContainer.innerHTML = `
          <input 
            type="text" 
            placeholder="Ask ${this.getPersonaName(personaId)} something..."
            maxlength="200"
            data-persona="${personaId}"
          />
          <button class="team-card__preview-btn" data-persona="${personaId}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </button>
        `;

        // Add response area
        const responseArea = document.createElement('div');
        responseArea.className = 'team-card__preview-response';
        responseArea.style.display = 'none';

        card.appendChild(inputContainer);
        card.appendChild(responseArea);

        // Bind events
        const input = inputContainer.querySelector('input');
        const btn = inputContainer.querySelector('button');

        btn.addEventListener('click', () => this.askPersona(personaId, input, responseArea));
        input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') this.askPersona(personaId, input, responseArea);
        });
      });
    },

    getPersonaId(card) {
      // Try to extract from class or data attribute
      const classes = card.className;
      const match = classes.match(/team-card--(\w+)/);
      return match ? match[1] : card.dataset.persona;
    },

    getPersonaName(personaId) {
      const names = {
        ferni: 'Ferni',
        maya: 'Maya',
        peter: 'Peter',
        alex: 'Alex',
        jordan: 'Jordan',
        nayan: 'Nayan',
      };
      return names[personaId] || 'them';
    },

    async askPersona(personaId, input, responseArea) {
      const question = input.value.trim();
      if (!question) return;

      // Show loading
      responseArea.style.display = 'block';
      responseArea.innerHTML = '<div class="team-card__preview-loading">Thinking...</div>';

      const result = await apiCall('/persona-preview', {
        method: 'POST',
        body: {
          persona: personaId,
          question,
          visitorId: state.visitorId,
        },
      });

      if (result) {
        responseArea.innerHTML = `
          <blockquote class="team-card__preview-quote">
            <p>"${result.response}"</p>
          </blockquote>
          <div class="team-card__preview-traits">
            ${result.traits.map((t) => `<span class="trait">${t}</span>`).join('')}
          </div>
        `;
      } else {
        responseArea.innerHTML = '<p class="team-card__preview-error">Could not get response. Try again?</p>';
      }
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. MEMORY VISUALIZATION DEMO
  // ═══════════════════════════════════════════════════════════════════════════

  const MemoryDemo = {
    container: null,

    init() {
      this.container = document.querySelector('.memory-demo__showcase');
      if (!this.container) return;

      this.addInteractiveInput();
    },

    addInteractiveInput() {
      const inputSection = document.createElement('div');
      inputSection.className = 'memory-demo__interactive';
      inputSection.innerHTML = `
        <div class="memory-demo__try-it">
          <h4>Try it yourself</h4>
          <p>Type something and see how Ferni would remember it:</p>
          <div class="memory-demo__input-area">
            <input 
              type="text" 
              placeholder="e.g., I'm stressed about my new job..."
              maxlength="200"
              class="memory-demo__input"
            />
            <button class="memory-demo__btn btn btn--primary btn--sm">
              See the memory
            </button>
          </div>
          <div class="memory-demo__result" style="display: none;"></div>
        </div>
      `;

      this.container.appendChild(inputSection);

      const input = inputSection.querySelector('.memory-demo__input');
      const btn = inputSection.querySelector('.memory-demo__btn');
      const result = inputSection.querySelector('.memory-demo__result');

      btn.addEventListener('click', () => this.showMemoryVisualization(input.value, result));
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.showMemoryVisualization(input.value, result);
      });
    },

    showMemoryVisualization(text, resultEl) {
      if (!text.trim()) return;

      // Parse the input to extract potential insights
      const insights = this.extractInsights(text);

      resultEl.style.display = 'block';
      resultEl.innerHTML = `
        <div class="memory-demo__visualization">
          <div class="memory-demo__today">
            <div class="memory-demo__date">TODAY</div>
            <div class="memory-demo__card">
              <p>"${text}"</p>
              <span class="memory-demo__emotion">Current feeling</span>
            </div>
          </div>
          
          <div class="memory-demo__future">
            <div class="memory-demo__date">IN 3 MONTHS</div>
            <div class="memory-demo__card memory-demo__card--ferni">
              <div class="memory-demo__speaker">
                <div class="memory-demo__avatar">FE</div>
                Ferni remembers
              </div>
              <ul class="memory-demo__insights">
                ${insights.map((i) => `<li>${i}</li>`).join('')}
              </ul>
            </div>
          </div>
          
          <div class="memory-demo__connection">
            <svg viewBox="0 0 100 20" class="memory-demo__line">
              <path d="M0 10 Q25 0, 50 10 T100 10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4"/>
            </svg>
            <span>Connected across time</span>
          </div>
        </div>
      `;
    },

    extractInsights(text) {
      const insights = [];
      const lower = text.toLowerCase();

      // Extract topic
      if (lower.includes('job') || lower.includes('work') || lower.includes('career')) {
        insights.push('Your work situation and career concerns');
      }
      if (lower.includes('stress') || lower.includes('anxious') || lower.includes('worried')) {
        insights.push('The emotional weight you were carrying');
      }
      if (lower.includes('relationship') || lower.includes('friend') || lower.includes('family')) {
        insights.push('Important relationships in your life');
      }

      // Add default insights
      insights.push('The context around this moment');
      insights.push('How this connects to your bigger story');
      insights.push('Growth opportunities I noticed');

      return insights.slice(0, 4);
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. HOVER PREVIEWS ("What Would Ferni Say?")
  // ═══════════════════════════════════════════════════════════════════════════

  const HoverPreviews = {
    cache: new Map(),
    tooltip: null,

    init() {
      if (!CONFIG.enableHoverPreviews) return;

      this.createTooltip();
      this.bindHoverElements();
    },

    createTooltip() {
      this.tooltip = document.createElement('div');
      this.tooltip.className = 'ferni-hover-preview';
      this.tooltip.setAttribute('role', 'tooltip');
      this.tooltip.innerHTML = `
        <div class="ferni-hover-preview__avatar">FE</div>
        <div class="ferni-hover-preview__content"></div>
      `;
      document.body.appendChild(this.tooltip);
    },

    bindHoverElements() {
      // FAQ items
      document.querySelectorAll('.faq-item summary, .faq-item__question').forEach((el) => {
        this.bindElement(el, 'faq', el.textContent.trim());
      });

      // Feature cards
      document.querySelectorAll('.feature, .feature-card').forEach((el) => {
        const title = el.querySelector('.feature__title, .feature-title')?.textContent;
        if (title) this.bindElement(el, 'feature', title);
      });

      // CTA buttons
      document.querySelectorAll('.btn--primary').forEach((el) => {
        this.bindElement(el, 'cta', el.textContent.trim());
      });
    },

    bindElement(el, type, context) {
      let timeout;

      el.addEventListener('mouseenter', async (e) => {
        timeout = setTimeout(async () => {
          const preview = await this.getPreview(type, context);
          this.showTooltip(e.target, preview);
        }, 500); // 500ms delay before showing
      });

      el.addEventListener('mouseleave', () => {
        clearTimeout(timeout);
        this.hideTooltip();
      });
    },

    async getPreview(type, context) {
      const cacheKey = `${type}:${context}`;

      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      const result = await apiCall('/hover-preview', {
        method: 'POST',
        body: { elementType: type, context },
      });

      const preview = result?.preview || this.getFallbackPreview(type);
      this.cache.set(cacheKey, preview);

      return preview;
    },

    getFallbackPreview(type) {
      const fallbacks = {
        faq: "I'd love to explain this more...",
        feature: 'Let me show you how this works...',
        testimonial: 'Stories like this...',
        cta: 'No pressure. Just try talking.',
      };
      return fallbacks[type] || 'Tell me more...';
    },

    showTooltip(target, text) {
      const content = this.tooltip.querySelector('.ferni-hover-preview__content');
      content.textContent = text;

      const rect = target.getBoundingClientRect();
      const tooltipRect = this.tooltip.getBoundingClientRect();

      let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
      let top = rect.top - tooltipRect.height - 10;

      // Keep in viewport
      left = Math.max(10, Math.min(left, window.innerWidth - tooltipRect.width - 10));
      if (top < 10) top = rect.bottom + 10;

      this.tooltip.style.left = left + 'px';
      this.tooltip.style.top = top + window.scrollY + 'px';
      this.tooltip.classList.add('is-visible');
    },

    hideTooltip() {
      this.tooltip.classList.remove('is-visible');
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. AI SOCIAL PROOF
  // ═══════════════════════════════════════════════════════════════════════════

  const SocialProof = {
    container: null,
    snippets: [],
    currentIndex: 0,
    interval: null,

    async init() {
      if (!CONFIG.enableSocialProof) return;

      // Find or create container
      this.container = document.querySelector('.social-proof-dynamic');

      if (!this.container) {
        this.createContainer();
      }

      // Fetch snippets
      const result = await apiCall('/social-proof?count=5', { method: 'GET' });

      if (result && result.length) {
        this.snippets = result;
        this.render();
        this.startRotation();
      }
    },

    createContainer() {
      const statsBar = document.querySelector('.stats-bar');
      if (!statsBar) return;

      this.container = document.createElement('div');
      this.container.className = 'social-proof-dynamic';
      statsBar.parentNode.insertBefore(this.container, statsBar.nextSibling);
    },

    render() {
      if (!this.container || !this.snippets.length) return;

      this.container.innerHTML = `
        <div class="social-proof-dynamic__inner">
          <div class="social-proof-dynamic__avatar">FE</div>
          <div class="social-proof-dynamic__content">
            <p class="social-proof-dynamic__text">${this.snippets[0].content}</p>
          </div>
        </div>
      `;
    },

    startRotation() {
      if (this.snippets.length <= 1) return;

      this.interval = setInterval(() => {
        this.currentIndex = (this.currentIndex + 1) % this.snippets.length;
        this.animateToNext();
      }, 8000);
    },

    animateToNext() {
      const textEl = this.container.querySelector('.social-proof-dynamic__text');
      if (!textEl) return;

      // Fade out
      textEl.style.opacity = '0';
      textEl.style.transform = 'translateY(-10px)';

      setTimeout(() => {
        textEl.textContent = this.snippets[this.currentIndex].content;
        textEl.style.opacity = '1';
        textEl.style.transform = 'translateY(0)';
      }, 300);
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. SENTIMENT-REACTIVE COPY
  // ═══════════════════════════════════════════════════════════════════════════

  const SentimentCopy = {
    lastSentiment: 0.5,
    appliedChanges: false,

    init() {
      if (!CONFIG.enableSentimentCopy) return;

      // Listen for sentiment changes from ferni-sentience.js
      this.monitorSentiment();
    },

    monitorSentiment() {
      setInterval(async () => {
        const currentSentiment = window.FerniSentience?.sentiment?.() || 0.5;

        // Only react to significant changes
        if (Math.abs(currentSentiment - this.lastSentiment) < 0.15) return;
        if (this.appliedChanges) return; // Only apply once per session

        this.lastSentiment = currentSentiment;

        // Only trigger for extreme sentiments
        if (currentSentiment < 0.35 || currentSentiment > 0.75) {
          await this.fetchAndApplyCopy(currentSentiment);
        }
      }, 5000);
    },

    async fetchAndApplyCopy(sentiment) {
      const ctaBtn = document.querySelector('.hero__cta .btn--primary');
      const subhead = document.querySelector('.hero__subhead');

      const result = await apiCall('/sentiment-copy', {
        method: 'POST',
        body: {
          sentiment,
          currentSection: window.FerniSentience?.state?.()?.currentSection || 'hero',
          timeOnPage: Math.floor((Date.now() - window.performance.timing.navigationStart) / 1000),
          originalCopy: {
            ctaText: ctaBtn?.textContent?.trim(),
            subhead: subhead?.textContent?.trim(),
          },
        },
      });

      if (result && (result.ctaText || result.subhead)) {
        this.applyCopy(result);
        this.appliedChanges = true;

        if (CONFIG.debugMode) {
          console.log('[SentimentCopy] Applied:', result.reason);
        }
      }
    },

    applyCopy(copy) {
      if (copy.ctaText) {
        const btn = document.querySelector('.hero__cta .btn--primary');
        if (btn) {
          const icon = btn.querySelector('svg');
          btn.childNodes[0].textContent = copy.ctaText + ' ';
          if (icon) btn.appendChild(icon);
          btn.classList.add('is-sentiment-adjusted');
        }
      }

      if (copy.subhead) {
        const subhead = document.querySelector('.hero__subhead');
        if (subhead) {
          subhead.textContent = copy.subhead;
          subhead.classList.add('is-sentiment-adjusted');
        }
      }
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. SMART FAQ
  // ═══════════════════════════════════════════════════════════════════════════

  const SmartFAQ = {
    container: null,

    init() {
      if (!CONFIG.enableSmartFAQ) return;

      this.addAskAnything();
    },

    addAskAnything() {
      const faqSection = document.querySelector('.faq, #faq');
      if (!faqSection) return;

      const askBox = document.createElement('div');
      askBox.className = 'smart-faq';
      askBox.innerHTML = `
        <div class="smart-faq__header">
          <div class="smart-faq__avatar">FE</div>
          <h4 class="smart-faq__title">Ask me anything</h4>
        </div>
        <div class="smart-faq__input-area">
          <input 
            type="text" 
            class="smart-faq__input"
            placeholder="What would you like to know about Ferni?"
            maxlength="300"
          />
          <button class="smart-faq__btn btn btn--primary btn--sm">Ask</button>
        </div>
        <div class="smart-faq__response" style="display: none;"></div>
      `;

      // Insert at top of FAQ section
      const header = faqSection.querySelector('.section__header');
      if (header) {
        header.parentNode.insertBefore(askBox, header.nextSibling);
      } else {
        faqSection.insertBefore(askBox, faqSection.firstChild);
      }

      this.container = askBox;
      this.bindEvents();
    },

    bindEvents() {
      const input = this.container.querySelector('.smart-faq__input');
      const btn = this.container.querySelector('.smart-faq__btn');
      const response = this.container.querySelector('.smart-faq__response');

      btn.addEventListener('click', () => this.askQuestion(input, response));
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.askQuestion(input, response);
      });
    },

    async askQuestion(input, responseEl) {
      const question = input.value.trim();
      if (!question) return;

      // Show loading
      responseEl.style.display = 'block';
      responseEl.innerHTML = '<div class="smart-faq__loading">Thinking...</div>';

      const result = await apiCall('/faq', {
        method: 'POST',
        body: {
          question,
          visitorId: state.visitorId,
        },
      });

      if (result) {
        responseEl.innerHTML = `
          <div class="smart-faq__answer">
            <p>${result.answer}</p>
            ${
              result.confidence < 0.7
                ? '<p class="smart-faq__disclaimer">Not sure about this one? <a href="https://app.ferni.ai">Ask me directly in the app</a>.</p>'
                : ''
            }
          </div>
          ${
            result.relatedQuestions?.length
              ? `
            <div class="smart-faq__related">
              <p>Related questions:</p>
              <ul>
                ${result.relatedQuestions.map((q) => `<li><button class="smart-faq__related-btn">${q}</button></li>`).join('')}
              </ul>
            </div>
          `
              : ''
          }
        `;

        // Bind related question buttons
        responseEl.querySelectorAll('.smart-faq__related-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            input.value = btn.textContent;
            this.askQuestion(input, responseEl);
          });
        });
      } else {
        responseEl.innerHTML = '<p class="smart-faq__error">Could not get an answer. Try rephrasing?</p>';
      }
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. MICRO-EXPRESSIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const MicroExpressions = {
    orb: null,
    currentExpression: 'present',

    init() {
      if (!CONFIG.enableMicroExpressions) return;

      this.orb = document.querySelector('.hero-ferni, [data-hero-orb]');
      if (!this.orb) return;

      this.bindBehaviorTriggers();
    },

    bindBehaviorTriggers() {
      // CTA hover - show curiosity
      document.querySelectorAll('.btn--primary').forEach((btn) => {
        btn.addEventListener('mouseenter', () => this.flash('curious'));
      });

      // Pricing section - show interest
      const pricingObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              this.flash('interested');
            }
          });
        },
        { threshold: 0.5 }
      );

      const pricing = document.getElementById('pricing');
      if (pricing) pricingObserver.observe(pricing);

      // FAQ interaction - show helpful
      document.querySelectorAll('.faq-item, details').forEach((item) => {
        item.addEventListener('toggle', () => this.flash('helpful'));
      });

      // Fast scrolling - show concern
      let lastScrollY = window.scrollY;
      let scrollVelocity = 0;

      window.addEventListener(
        'scroll',
        () => {
          const delta = Math.abs(window.scrollY - lastScrollY);
          scrollVelocity = delta;
          lastScrollY = window.scrollY;

          if (scrollVelocity > 100) {
            this.flash('concerned');
          }
        },
        { passive: true }
      );

      // Slow reading - show warmth
      let readingTimer;
      window.addEventListener(
        'scroll',
        () => {
          clearTimeout(readingTimer);
          readingTimer = setTimeout(() => {
            if (scrollVelocity < 10) {
              this.flash('warm');
            }
          }, 2000);
        },
        { passive: true }
      );
    },

    flash(expression) {
      if (!this.orb || this.currentExpression === expression) return;

      // Remove old expression
      this.orb.classList.remove(`ferni-expression--${this.currentExpression}`);

      // Add new expression
      this.orb.classList.add(`ferni-expression--${expression}`);
      this.currentExpression = expression;

      // Micro-expression flash (brief, subliminal)
      this.orb.animate(
        [{ filter: 'brightness(1)' }, { filter: 'brightness(1.15)' }, { filter: 'brightness(1)' }],
        { duration: 120, easing: 'ease-out' }
      );

      // Reset after a moment
      setTimeout(() => {
        this.orb.classList.remove(`ferni-expression--${expression}`);
        this.orb.classList.add('ferni-expression--present');
        this.currentExpression = 'present';
      }, 3000);
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CSS INJECTION
  // ═══════════════════════════════════════════════════════════════════════════

  function injectStyles() {
    if (document.getElementById('ferni-ai-landing-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'ferni-ai-landing-styles';
    styles.textContent = `
      /* ═══════════════════════════════════════════════════════════════════════════
         LIVE CHAT WIDGET
         ═══════════════════════════════════════════════════════════════════════════ */
      
      #ferni-live-chat {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9998;
        font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      }
      
      .ferni-chat-trigger {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 20px;
        background: linear-gradient(135deg, #5a7751 0%, #4a6741 100%);
        color: white;
        border: none;
        border-radius: 100px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
        box-shadow: 0 8px 32px rgba(74, 103, 65, 0.4);
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      
      .ferni-chat-trigger:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 40px rgba(74, 103, 65, 0.5);
      }
      
      .ferni-chat-trigger__avatar {
        width: 28px;
        height: 28px;
        background: rgba(255,255,255,0.2);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 700;
      }
      
      .ferni-chat-trigger__badge {
        padding: 2px 8px;
        background: rgba(255,255,255,0.2);
        border-radius: 10px;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      #ferni-live-chat.is-open .ferni-chat-trigger {
        opacity: 0;
        pointer-events: none;
      }
      
      /* Chat Panel */
      .ferni-chat-panel {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 380px;
        max-height: 600px;
        background: #faf8f5;
        border-radius: 24px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
        display: flex;
        flex-direction: column;
        opacity: 0;
        visibility: hidden;
        transform: translateY(20px) scale(0.95);
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      
      .ferni-chat-panel.is-open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0) scale(1);
      }
      
      .ferni-chat-panel__header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 20px;
        border-bottom: 1px solid rgba(44, 37, 32, 0.08);
      }
      
      .ferni-chat-panel__persona {
        display: flex;
        align-items: center;
        gap: 10px;
        flex: 1;
      }
      
      .ferni-chat-panel__avatar {
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
      }
      
      .ferni-chat-panel__name {
        font-weight: 600;
        color: #2c2520;
        display: block;
      }
      
      .ferni-chat-panel__status {
        font-size: 12px;
        color: #4a6741;
      }
      
      .ferni-chat-panel__remaining {
        font-size: 11px;
        color: #70605a;
        background: rgba(44, 37, 32, 0.05);
        padding: 4px 10px;
        border-radius: 12px;
      }
      
      .ferni-chat-panel__count {
        font-weight: 600;
        color: #4a6741;
      }
      
      .ferni-chat-panel__count.is-low {
        color: #c4856a;
      }
      
      .ferni-chat-panel__close {
        width: 32px;
        height: 32px;
        background: none;
        border: none;
        cursor: pointer;
        color: #70605a;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background 0.2s;
      }
      
      .ferni-chat-panel__close:hover {
        background: rgba(44, 37, 32, 0.08);
      }
      
      .ferni-chat-panel__close svg {
        width: 18px;
        height: 18px;
      }
      
      /* Messages */
      .ferni-chat-panel__messages {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-height: 300px;
        max-height: 400px;
      }
      
      .ferni-chat-message {
        max-width: 85%;
        animation: chatMessageIn 0.3s ease;
      }
      
      @keyframes chatMessageIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      .ferni-chat-message p {
        margin: 0;
        padding: 12px 16px;
        border-radius: 18px;
        font-size: 14px;
        line-height: 1.5;
      }
      
      .ferni-chat-message--user {
        align-self: flex-end;
      }
      
      .ferni-chat-message--user p {
        background: linear-gradient(135deg, #5a7751, #4a6741);
        color: white;
        border-bottom-right-radius: 4px;
      }
      
      .ferni-chat-message--ai p {
        background: white;
        color: #2c2520;
        border-bottom-left-radius: 4px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
      }
      
      /* Typing indicator */
      .ferni-chat-typing {
        display: flex;
        gap: 4px;
        padding: 16px;
        align-self: flex-start;
      }
      
      .ferni-chat-typing__dot {
        width: 8px;
        height: 8px;
        background: #4a6741;
        border-radius: 50%;
        animation: typingDot 1.4s ease-in-out infinite;
      }
      
      .ferni-chat-typing__dot:nth-child(2) { animation-delay: 0.2s; }
      .ferni-chat-typing__dot:nth-child(3) { animation-delay: 0.4s; }
      
      @keyframes typingDot {
        0%, 100% { opacity: 0.3; transform: scale(0.8); }
        50% { opacity: 1; transform: scale(1); }
      }
      
      /* Input area */
      .ferni-chat-panel__input-area {
        display: flex;
        gap: 8px;
        padding: 16px 20px;
        border-top: 1px solid rgba(44, 37, 32, 0.08);
      }
      
      .ferni-chat-panel__input {
        flex: 1;
        padding: 12px 16px;
        border: 1px solid rgba(44, 37, 32, 0.12);
        border-radius: 24px;
        font-size: 14px;
        background: white;
        transition: border-color 0.2s;
      }
      
      .ferni-chat-panel__input:focus {
        outline: none;
        border-color: #4a6741;
      }
      
      .ferni-chat-panel__send {
        width: 44px;
        height: 44px;
        background: linear-gradient(135deg, #5a7751, #4a6741);
        border: none;
        border-radius: 50%;
        cursor: pointer;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s;
      }
      
      .ferni-chat-panel__send:hover {
        transform: scale(1.05);
      }
      
      .ferni-chat-panel__send svg {
        width: 18px;
        height: 18px;
      }
      
      /* Footer */
      .ferni-chat-panel__footer {
        padding: 12px 20px;
        text-align: center;
        background: rgba(44, 37, 32, 0.03);
        border-radius: 0 0 24px 24px;
      }
      
      .ferni-chat-panel__upgrade {
        font-size: 12px;
        color: #4a6741;
        text-decoration: none;
        font-weight: 500;
      }
      
      .ferni-chat-panel__upgrade:hover {
        text-decoration: underline;
      }
      
      /* Upgrade prompt */
      .ferni-chat-upgrade-prompt {
        background: linear-gradient(135deg, rgba(74, 103, 65, 0.1), rgba(90, 119, 81, 0.1));
        padding: 20px;
        border-radius: 16px;
        text-align: center;
      }
      
      .ferni-chat-upgrade-prompt p {
        margin: 0 0 12px;
        color: #2c2520;
        font-weight: 500;
      }
      
      /* ═══════════════════════════════════════════════════════════════════════════
         PERSONA PREVIEW CARDS
         ═══════════════════════════════════════════════════════════════════════════ */
      
      .team-card__preview-input {
        display: flex;
        gap: 8px;
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid rgba(44, 37, 32, 0.08);
      }
      
      .team-card__preview-input input {
        flex: 1;
        padding: 10px 14px;
        border: 1px solid rgba(44, 37, 32, 0.12);
        border-radius: 20px;
        font-size: 13px;
        background: white;
      }
      
      .team-card__preview-input input:focus {
        outline: none;
        border-color: var(--team-color, #4a6741);
      }
      
      .team-card__preview-btn {
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
        transition: transform 0.2s;
      }
      
      .team-card__preview-btn:hover {
        transform: scale(1.05);
      }
      
      .team-card__preview-response {
        margin-top: 12px;
        padding: 12px;
        background: rgba(44, 37, 32, 0.03);
        border-radius: 12px;
      }
      
      .team-card__preview-quote {
        margin: 0;
        padding: 0;
        border: none;
        font-style: italic;
        color: #2c2520;
      }
      
      .team-card__preview-quote p {
        margin: 0;
      }
      
      .team-card__preview-traits {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-top: 10px;
      }
      
      .team-card__preview-traits .trait {
        padding: 3px 10px;
        background: var(--team-color, #4a6741);
        color: white;
        border-radius: 12px;
        font-size: 11px;
        text-transform: lowercase;
      }
      
      .team-card__preview-loading {
        color: #70605a;
        font-size: 13px;
      }
      
      /* ═══════════════════════════════════════════════════════════════════════════
         HOVER PREVIEW TOOLTIP
         ═══════════════════════════════════════════════════════════════════════════ */
      
      .ferni-hover-preview {
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
        max-width: 300px;
      }
      
      .ferni-hover-preview.is-visible {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }
      
      .ferni-hover-preview__avatar {
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
      
      /* ═══════════════════════════════════════════════════════════════════════════
         SOCIAL PROOF DYNAMIC
         ═══════════════════════════════════════════════════════════════════════════ */
      
      .social-proof-dynamic {
        padding: 24px 0;
        background: rgba(74, 103, 65, 0.05);
        border-top: 1px solid rgba(74, 103, 65, 0.1);
        border-bottom: 1px solid rgba(74, 103, 65, 0.1);
      }
      
      .social-proof-dynamic__inner {
        max-width: 800px;
        margin: 0 auto;
        padding: 0 24px;
        display: flex;
        align-items: center;
        gap: 16px;
      }
      
      .social-proof-dynamic__avatar {
        width: 48px;
        height: 48px;
        background: linear-gradient(135deg, #5a7751, #4a6741);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 14px;
        font-weight: 700;
        flex-shrink: 0;
      }
      
      .social-proof-dynamic__text {
        margin: 0;
        font-size: 15px;
        color: #2c2520;
        line-height: 1.6;
        font-style: italic;
        transition: opacity 0.3s, transform 0.3s;
      }
      
      /* ═══════════════════════════════════════════════════════════════════════════
         SMART FAQ
         ═══════════════════════════════════════════════════════════════════════════ */
      
      .smart-faq {
        background: linear-gradient(135deg, rgba(74, 103, 65, 0.08), rgba(90, 119, 81, 0.05));
        padding: 24px;
        border-radius: 20px;
        margin-bottom: 40px;
      }
      
      .smart-faq__header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }
      
      .smart-faq__avatar {
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
      }
      
      .smart-faq__title {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: #2c2520;
      }
      
      .smart-faq__input-area {
        display: flex;
        gap: 10px;
      }
      
      .smart-faq__input {
        flex: 1;
        padding: 14px 20px;
        border: 1px solid rgba(44, 37, 32, 0.12);
        border-radius: 24px;
        font-size: 15px;
        background: white;
      }
      
      .smart-faq__input:focus {
        outline: none;
        border-color: #4a6741;
      }
      
      .smart-faq__response {
        margin-top: 20px;
        padding: 20px;
        background: white;
        border-radius: 16px;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
      }
      
      .smart-faq__answer {
        font-size: 15px;
        line-height: 1.7;
        color: #2c2520;
      }
      
      .smart-faq__answer p {
        margin: 0 0 12px;
      }
      
      .smart-faq__disclaimer {
        font-size: 13px;
        color: #70605a;
      }
      
      .smart-faq__disclaimer a {
        color: #4a6741;
      }
      
      .smart-faq__related {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid rgba(44, 37, 32, 0.08);
      }
      
      .smart-faq__related p {
        margin: 0 0 8px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #70605a;
      }
      
      .smart-faq__related ul {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      
      .smart-faq__related-btn {
        padding: 6px 14px;
        background: rgba(74, 103, 65, 0.1);
        border: none;
        border-radius: 16px;
        font-size: 13px;
        color: #4a6741;
        cursor: pointer;
        transition: background 0.2s;
      }
      
      .smart-faq__related-btn:hover {
        background: rgba(74, 103, 65, 0.2);
      }
      
      .smart-faq__loading {
        color: #70605a;
        font-style: italic;
      }
      
      /* ═══════════════════════════════════════════════════════════════════════════
         MEMORY DEMO INTERACTIVE
         ═══════════════════════════════════════════════════════════════════════════ */
      
      .memory-demo__interactive {
        margin-top: 40px;
        padding: 30px;
        background: linear-gradient(135deg, rgba(74, 103, 65, 0.05), transparent);
        border-radius: 24px;
        border: 1px solid rgba(74, 103, 65, 0.15);
      }
      
      .memory-demo__try-it h4 {
        margin: 0 0 8px;
        font-size: 18px;
        color: #2c2520;
      }
      
      .memory-demo__try-it > p {
        margin: 0 0 16px;
        color: #70605a;
        font-size: 14px;
      }
      
      .memory-demo__input-area {
        display: flex;
        gap: 12px;
      }
      
      .memory-demo__input {
        flex: 1;
        padding: 14px 20px;
        border: 1px solid rgba(44, 37, 32, 0.15);
        border-radius: 24px;
        font-size: 15px;
        background: white;
      }
      
      .memory-demo__input:focus {
        outline: none;
        border-color: #4a6741;
      }
      
      .memory-demo__result {
        margin-top: 24px;
      }
      
      .memory-demo__visualization {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
      }
      
      .memory-demo__today,
      .memory-demo__future {
        padding: 20px;
        background: white;
        border-radius: 16px;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
      }
      
      .memory-demo__date {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #70605a;
        margin-bottom: 12px;
      }
      
      .memory-demo__card p {
        margin: 0;
        font-style: italic;
        color: #2c2520;
      }
      
      .memory-demo__emotion {
        display: inline-block;
        margin-top: 10px;
        padding: 4px 10px;
        background: rgba(166, 122, 106, 0.15);
        border-radius: 10px;
        font-size: 11px;
        color: #a67a6a;
      }
      
      .memory-demo__card--ferni .memory-demo__speaker {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
        font-weight: 600;
        color: #4a6741;
      }
      
      .memory-demo__card--ferni .memory-demo__avatar {
        width: 28px;
        height: 28px;
        background: linear-gradient(135deg, #5a7751, #4a6741);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 9px;
        font-weight: 700;
      }
      
      .memory-demo__insights {
        margin: 0;
        padding: 0;
        list-style: none;
      }
      
      .memory-demo__insights li {
        padding: 6px 0;
        font-size: 13px;
        color: #2c2520;
        border-bottom: 1px solid rgba(44, 37, 32, 0.05);
      }
      
      .memory-demo__insights li:last-child {
        border-bottom: none;
      }
      
      .memory-demo__connection {
        grid-column: 1 / -1;
        text-align: center;
        padding: 16px;
      }
      
      .memory-demo__line {
        display: block;
        margin: 0 auto 10px;
        width: 200px;
        color: #4a6741;
      }
      
      .memory-demo__connection span {
        font-size: 12px;
        color: #70605a;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      
      /* ═══════════════════════════════════════════════════════════════════════════
         MICRO EXPRESSIONS
         ═══════════════════════════════════════════════════════════════════════════ */
      
      .ferni-expression--curious {
        --mood-color: #5a8060;
      }
      
      .ferni-expression--interested {
        --mood-color: #6a9070;
      }
      
      .ferni-expression--helpful {
        --mood-color: #5a7751;
      }
      
      .ferni-expression--concerned {
        --mood-color: #5a7050;
      }
      
      .ferni-expression--warm {
        --mood-color: #7aa080;
      }
      
      /* ═══════════════════════════════════════════════════════════════════════════
         PERSONALIZED ELEMENTS
         ═══════════════════════════════════════════════════════════════════════════ */
      
      .is-personalized {
        animation: personalizedFadeIn 0.5s ease;
      }
      
      @keyframes personalizedFadeIn {
        from {
          opacity: 0.5;
        }
        to {
          opacity: 1;
        }
      }
      
      .is-sentiment-adjusted {
        transition: all 0.5s ease;
      }
      
      /* ═══════════════════════════════════════════════════════════════════════════
         RESPONSIVE
         ═══════════════════════════════════════════════════════════════════════════ */
      
      @media (max-width: 768px) {
        #ferni-live-chat {
          bottom: 80px;
          right: 16px;
        }
        
        .ferni-chat-trigger__text {
          display: none;
        }
        
        .ferni-chat-trigger {
          padding: 14px;
          border-radius: 50%;
        }
        
        .ferni-chat-panel {
          width: calc(100vw - 32px);
          max-height: calc(100vh - 120px);
        }
        
        .memory-demo__visualization {
          grid-template-columns: 1fr;
        }
        
        .smart-faq__input-area {
          flex-direction: column;
        }
        
        .team-card__preview-input {
          flex-direction: column;
        }
        
        .team-card__preview-btn {
          align-self: flex-end;
        }
      }
      
      /* ═══════════════════════════════════════════════════════════════════════════
         REDUCED MOTION
         ═══════════════════════════════════════════════════════════════════════════ */
      
      @media (prefers-reduced-motion: reduce) {
        .ferni-chat-panel,
        .ferni-chat-message,
        .ferni-hover-preview,
        .is-personalized {
          animation: none !important;
          transition: opacity 0.1s !important;
        }
        
        .ferni-chat-typing__dot {
          animation: none;
          opacity: 0.5;
        }
      }
    `;

    document.head.appendChild(styles);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  async function init() {
    if (state.initialized) return;

    state.visitorId = getVisitorId();
    
    // Load feature flags FIRST (before any module init)
    await loadFeatureFlags();
    
    injectStyles();

    // Initialize modules based on feature flags
    const enabledFeatures = [];
    
    if (CONFIG.enableChat) {
      LiveChat.init();
      enabledFeatures.push('Live Text Chat');
    }
    if (CONFIG.enablePersonaPreviews) {
      PersonaPreviews.init();
      enabledFeatures.push('Persona Previews');
    }
    if (CONFIG.enableMemoryDemo) {
      MemoryDemo.init();
      enabledFeatures.push('Memory Demo');
    }
    if (CONFIG.enableHoverPreviews) {
      HoverPreviews.init();
      enabledFeatures.push('Hover Previews');
    }
    if (CONFIG.enableSmartFAQ) {
      SmartFAQ.init();
      enabledFeatures.push('Smart FAQ');
    }
    if (CONFIG.enableSentimentCopy) {
      SentimentCopy.init();
      enabledFeatures.push('Sentiment-Reactive Copy');
    }
    if (CONFIG.enableMicroExpressions) {
      MicroExpressions.init();
      enabledFeatures.push('Micro Expressions');
    }

    // Async initialization (don't block)
    if (CONFIG.enablePersonalizedHero) {
      PersonalizedHero.init();
      enabledFeatures.push('Personalized Hero');
    }
    if (CONFIG.enableSocialProof) {
      SocialProof.init();
      enabledFeatures.push('AI Social Proof');
    }

    state.initialized = true;

    // Log enabled features
    if (enabledFeatures.length > 0) {
      console.log('%c🤖 AI-Powered Landing initialized', 'color: #4a6741; font-weight: bold;');
      console.log('%c  Enabled features:', 'color: #70605a; font-size: 11px;');
      enabledFeatures.forEach(f => {
        console.log(`%c    ✓ ${f}`, 'color: #70605a; font-size: 10px;');
      });
    } else {
      console.log('%c🤖 AI-Powered Landing: All features disabled by flags', 'color: #70605a;');
    }
    console.log('%c    ✓ Micro-Expressions', 'color: #70605a; font-size: 10px;');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORTS
  // ═══════════════════════════════════════════════════════════════════════════

  window.FerniAI = {
    init,
    chat: LiveChat,
    hero: PersonalizedHero,
    personas: PersonaPreviews,
    memory: MemoryDemo,
    hover: HoverPreviews,
    socialProof: SocialProof,
    sentimentCopy: SentimentCopy,
    faq: SmartFAQ,
    expressions: MicroExpressions,
    config: CONFIG,
    state: () => ({ ...state }),
  };

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 100);
  }
})();

