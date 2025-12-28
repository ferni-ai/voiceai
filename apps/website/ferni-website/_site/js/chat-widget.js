/**
 * Chat Widget
 *
 * Proactive chat widget that offers help based on visitor context.
 * Non-intrusive, warm, and contextually relevant.
 *
 * @module chat-widget
 */

(function () {
  'use strict';

  // ============================================================================
  // STATE
  // ============================================================================

  const state = {
    initialized: false,
    visible: false,
    expanded: false,
    greeting: null,
    greetingTiming: null,
    currentSection: 'hero',
    timeOnPage: 0,
    scrollDepth: 0,
    greetingShown: false,
    dismissed: false,
  };

  // ============================================================================
  // ELEMENTS
  // ============================================================================

  let widget = null;
  let bubble = null;
  let panel = null;

  // ============================================================================
  // CREATE WIDGET
  // ============================================================================

  function createWidget() {
    // Main container
    widget = document.createElement('div');
    widget.className = 'ferni-chat-widget';
    widget.innerHTML = `
      <div class="ferni-chat-bubble" role="button" aria-label="Chat with Ferni">
        <div class="ferni-chat-bubble__avatar"><svg class="ferni-eyes-svg" viewBox="0 0 100 100"><ellipse cx="36" cy="50" rx="10" ry="12" fill="white"/><circle cx="33" cy="45" r="2.5" fill="white" opacity="0.9"/><ellipse cx="64" cy="50" rx="10" ry="12" fill="white"/><circle cx="61" cy="45" r="2.5" fill="white" opacity="0.9"/></svg></div>
        <div class="ferni-chat-bubble__greeting"></div>
      </div>
      <div class="ferni-chat-panel" role="dialog" aria-label="Chat with Ferni">
        <div class="ferni-chat-panel__header">
          <div class="ferni-chat-panel__avatar"><svg class="ferni-eyes-svg" viewBox="0 0 100 100"><ellipse cx="36" cy="50" rx="10" ry="12" fill="white"/><circle cx="33" cy="45" r="2.5" fill="white" opacity="0.9"/><ellipse cx="64" cy="50" rx="10" ry="12" fill="white"/><circle cx="61" cy="45" r="2.5" fill="white" opacity="0.9"/></svg></div>
          <div class="ferni-chat-panel__title">
            <span class="ferni-chat-panel__name">Ferni</span>
            <span class="ferni-chat-panel__status">Online</span>
          </div>
          <button class="ferni-chat-panel__close" aria-label="Close chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="ferni-chat-panel__body">
          <div class="ferni-chat-panel__message">
            <p>Hey! 👋</p>
            <p>I'm Ferni, your AI life coach. Want to see how I can help?</p>
          </div>
          <div class="ferni-chat-panel__actions">
            <a href="tel:+18888888888" class="ferni-chat-panel__action ferni-chat-panel__action--call">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              Call Now
            </a>
            <a href="#" class="ferni-chat-panel__action ferni-chat-panel__action--app" onclick="window.location.href='https://app.ferni.ai'">
              Try the App
            </a>
          </div>
        </div>
      </div>
    `;

    // Get references
    bubble = widget.querySelector('.ferni-chat-bubble');
    panel = widget.querySelector('.ferni-chat-panel');

    // Add event listeners
    bubble.addEventListener('click', togglePanel);
    widget.querySelector('.ferni-chat-panel__close').addEventListener('click', closePanel);

    // Add to DOM
    document.body.appendChild(widget);
  }

  // ============================================================================
  // WIDGET ACTIONS
  // ============================================================================

  function show() {
    if (state.visible || state.dismissed) return;

    widget.classList.add('is-visible');
    state.visible = true;
  }

  function hide() {
    widget.classList.remove('is-visible');
    state.visible = false;
  }

  function togglePanel() {
    if (state.expanded) {
      closePanel();
    } else {
      openPanel();
    }
  }

  function openPanel() {
    widget.classList.add('is-expanded');
    panel.setAttribute('aria-hidden', 'false');
    state.expanded = true;

    // Hide greeting when panel opens
    hideGreeting();
  }

  function closePanel() {
    widget.classList.remove('is-expanded');
    panel.setAttribute('aria-hidden', 'true');
    state.expanded = false;
  }

  function dismiss() {
    state.dismissed = true;
    hide();
    sessionStorage.setItem('ferni_chat_dismissed', 'true');
  }

  // ============================================================================
  // GREETING
  // ============================================================================

  function setGreeting(message, timing) {
    state.greeting = message;
    state.greetingTiming = timing;

    if (timing && timing.shouldShow && !state.greetingShown && !state.dismissed) {
      setTimeout(() => {
        showGreeting(message);
      }, timing.delay);
    }
  }

  function showGreeting(message) {
    if (state.greetingShown || state.expanded || state.dismissed) return;

    const greetingEl = widget.querySelector('.ferni-chat-bubble__greeting');
    if (greetingEl) {
      greetingEl.textContent = message;
      greetingEl.classList.add('is-visible');
      state.greetingShown = true;

      // Auto-hide after 8 seconds
      setTimeout(hideGreeting, 8000);
    }

    // Show the widget if not visible
    show();
  }

  function hideGreeting() {
    const greetingEl = widget.querySelector('.ferni-chat-bubble__greeting');
    if (greetingEl) {
      greetingEl.classList.remove('is-visible');
    }
  }

  // ============================================================================
  // CONTEXT UPDATES
  // ============================================================================

  function updateContext(context) {
    state.currentSection = context.section || state.currentSection;
    state.timeOnPage = context.timeOnPage || state.timeOnPage;
    state.scrollDepth = context.scrollDepth || state.scrollDepth;

    // Maybe trigger a new greeting based on context
    maybeShowContextualGreeting();
  }

  function onSectionChange(sectionId) {
    state.currentSection = sectionId;

    // Section-specific greeting triggers
    const sectionTriggers = {
      pricing: "Questions about pricing? I can help.",
      faq: "Don't see your question? Ask me directly.",
      proof: "Skeptical? Happy to address any concerns.",
    };

    if (sectionTriggers[sectionId] && !state.greetingShown && !state.dismissed) {
      setTimeout(() => {
        showGreeting(sectionTriggers[sectionId]);
      }, 2000);
    }
  }

  let contextGreetingTimeout = null;

  function maybeShowContextualGreeting() {
    if (state.greetingShown || state.dismissed) return;

    clearTimeout(contextGreetingTimeout);

    // Trigger greeting based on engagement
    if (state.timeOnPage > 30 && state.scrollDepth > 40) {
      contextGreetingTimeout = setTimeout(() => {
        if (!state.greetingShown) {
          fetchAndShowGreeting();
        }
      }, 3000);
    }
  }

  async function fetchAndShowGreeting() {
    try {
      const result = await window.FerniLandingIntelligence?.fetchChatGreeting(
        state.currentSection,
        state.timeOnPage,
        state.scrollDepth
      );

      if (result && result.shouldShowChat) {
        setTimeout(() => {
          showGreeting(result.chatGreeting);
        }, result.delay);
      }
    } catch (error) {
      console.warn('[ChatWidget] Failed to fetch greeting:', error);
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  function init() {
    if (state.initialized) return;

    // Check if previously dismissed this session
    if (sessionStorage.getItem('ferni_chat_dismissed')) {
      state.dismissed = true;
    }

    createWidget();
    state.initialized = true;

    console.log('%c💬 Ferni Chat Widget initialized', 'color: #a67a6a;');
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  window.FerniChatWidget = {
    init,
    show,
    hide,
    dismiss,
    setGreeting,
    showGreeting,
    hideGreeting,
    updateContext,
    onSectionChange,
    openPanel,
    closePanel,
    getState: () => ({ ...state }),
  };
})();

