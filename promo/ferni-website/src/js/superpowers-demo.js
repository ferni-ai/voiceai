/**
 * Superpowers Demo Interaction
 *
 * Handles the tabbed demo interface for showcasing Ferni's superpowers.
 * Integrates with landing-intelligence system for dynamic demos.
 *
 * @module superpowers-demo
 */

(function () {
  'use strict';

  // ============================================================================
  // STATE
  // ============================================================================

  const state = {
    activeTab: 'reading-between-lines',
    initialized: false,
  };

  // ============================================================================
  // TAB INTERACTION
  // ============================================================================

  function initTabs() {
    const tabs = document.querySelectorAll('.superpowers__tab');
    const demos = document.querySelectorAll('.superpowers__demo');

    if (!tabs.length || !demos.length) return;

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;
        if (!tabId || tabId === state.activeTab) return;

        // Update tabs
        tabs.forEach((t) => {
          t.classList.toggle('is-active', t.dataset.tab === tabId);
          t.setAttribute('aria-selected', t.dataset.tab === tabId ? 'true' : 'false');
        });

        // Update demos
        demos.forEach((demo) => {
          demo.classList.toggle('is-active', demo.dataset.demo === tabId);
        });

        state.activeTab = tabId;

        // Track engagement
        trackSuperpowerView(tabId);
      });
    });
  }

  // ============================================================================
  // TRACKING
  // ============================================================================

  function trackSuperpowerView(superpower) {
    // Track with behavior tracker if available
    if (window.FerniBehaviorTracker) {
      const signals = window.FerniBehaviorTracker.getState?.();
      if (signals) {
        signals.superpowersViewed = signals.superpowersViewed || [];
        if (!signals.superpowersViewed.includes(superpower)) {
          signals.superpowersViewed.push(superpower);
        }
      }
    }

    // Analytics event
    if (typeof gtag === 'function') {
      gtag('event', 'superpower_viewed', {
        event_category: 'Landing',
        event_label: superpower,
      });
    }
  }

  // ============================================================================
  // CHAT ANIMATION
  // ============================================================================

  function initChatAnimations() {
    const demoChats = document.querySelectorAll('.demo-chat');

    // Intersection observer to trigger animation when visible
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateChat(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.3 }
    );

    demoChats.forEach((chat) => observer.observe(chat));
  }

  function animateChat(chatElement) {
    const messages = chatElement.querySelectorAll('.demo-chat__message');

    messages.forEach((msg, index) => {
      msg.style.opacity = '0';
      msg.style.transform = 'translateY(20px)';

      setTimeout(
        () => {
          msg.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
          msg.style.opacity = '1';
          msg.style.transform = 'translateY(0)';
        },
        index * 600 + 200
      );
    });
  }

  // ============================================================================
  // DYNAMIC DEMO LOADING
  // ============================================================================

  async function loadDynamicDemo(superpower) {
    // Fetch dynamic demo from landing intelligence API
    try {
      const response = await fetch(`/api/landing/demo?superpower=${superpower}`);
      if (!response.ok) return null;

      const demo = await response.json();
      return demo;
    } catch (error) {
      console.warn('[SuperpowersDemo] Failed to load dynamic demo:', error);
      return null;
    }
  }

  function renderDemoChat(demo, container) {
    if (!demo || !demo.messages || !container) return;

    const chatHtml = demo.messages
      .map((msg) => {
        const roleClass = msg.role === 'user' ? 'demo-chat__message--user' : 'demo-chat__message--ai';
        const insightHtml = msg.annotation
          ? `<span class="demo-chat__insight">${msg.annotation}</span>`
          : '';
        const timestampHtml = msg.timestamp
          ? `<span class="demo-chat__timestamp">${msg.timestamp}</span>`
          : '';

        return `
          <div class="demo-chat__message ${roleClass}">
            ${timestampHtml}
            ${insightHtml}
            ${msg.message}
          </div>
        `;
      })
      .join('');

    container.innerHTML = `<div class="demo-chat">${chatHtml}</div>`;

    // Re-animate
    animateChat(container.querySelector('.demo-chat'));
  }

  // ============================================================================
  // DEPTH VISUALIZATION ANIMATION
  // ============================================================================

  function initDepthVisualization() {
    const bars = document.querySelectorAll('.journey__depth-bar-fill');

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Animate the bars when visible
            const depth = entry.target.style.getPropertyValue('--depth');
            entry.target.style.transform = `scaleY(${depth})`;
          }
        });
      },
      { threshold: 0.5 }
    );

    bars.forEach((bar) => {
      // Start at 0
      bar.style.transform = 'scaleY(0)';
      observer.observe(bar);
    });
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  function init() {
    if (state.initialized) return;

    initTabs();
    initChatAnimations();
    initDepthVisualization();

    state.initialized = true;

    console.log('%c✨ Superpowers Demo initialized', 'color: #4a6741;');
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  window.FerniSuperpowersDemo = {
    init,
    loadDynamicDemo,
    renderDemoChat,
    getState: () => ({ ...state }),
  };

  // Auto-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 100);
  }
})();

