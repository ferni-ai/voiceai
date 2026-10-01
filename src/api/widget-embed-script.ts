/**
 * Widget embed script served at /api/widget/embed.js.
 * Extracted from widget-routes.ts.
 */

import { WIDGET_CONFIG_RESOLVER_JS } from './widget-embed-config.js';

export const EMBED_SCRIPT = `
/**
 * Ferni Voice Agent - Embeddable Widget SDK
 *
 * Usage (any one of):
 *   <script>window.FerniWidget = { widgetId: 'YOUR_WIDGET_ID' };</script>
 *   <script>window.FERNI_CONFIG = { agentId: 'YOUR_WIDGET_ID', apiUrl: '' };</script>
 *   <script src="https://your-domain.com/api/widget/embed.js" data-widget-id="YOUR_WIDGET_ID" async></script>
 * apiBase defaults to the origin this script was loaded from.
 */
(function() {
  'use strict';

  // Prevent multiple initializations
  if (window.FerniWidgetLoaded) return;
  window.FerniWidgetLoaded = true;
  window.FerniWidget = window.FerniWidget || {};

  // Capture our own <script> now; currentScript is only set while executing.
  const SCRIPT_EL = document.currentScript ||
    document.querySelector('script[src*="/api/widget/embed.js"]');

  ${WIDGET_CONFIG_RESOLVER_JS}

  // Resolved in start(), after inline config scripts that follow an async tag have run
  let API_BASE = '';
  let WIDGET_ID;

  // State
  let config = null;
  let session = null;
  let isOpen = false;
  let iframe = null;
  let button = null;

  // Styles
  const STYLES = \`
    .ferni-widget-button {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: var(--ferni-primary, #4a6741);
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      z-index: 999998;
    }
    .ferni-widget-button:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 24px rgba(0,0,0,0.3);
    }
    .ferni-widget-button svg {
      width: 28px;
      height: 28px;
      fill: white;
    }
    .ferni-widget-button.ferni-widget-button--left {
      right: auto;
      left: 20px;
    }
    .ferni-widget-iframe {
      position: fixed;
      bottom: 100px;
      right: 20px;
      width: 380px;
      height: 600px;
      max-height: calc(100vh - 140px);
      border: none;
      border-radius: 16px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.2);
      background: white;
      z-index: 999999;
      opacity: 0;
      transform: translateY(20px) scale(0.95);
      transition: opacity 0.3s ease, transform 0.3s ease;
      pointer-events: none;
    }
    .ferni-widget-iframe.ferni-widget-iframe--open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }
    .ferni-widget-iframe.ferni-widget-iframe--left {
      right: auto;
      left: 20px;
    }
    @media (max-width: 480px) {
      .ferni-widget-iframe {
        width: calc(100vw - 40px);
        height: calc(100vh - 140px);
        bottom: 90px;
        right: 20px;
        left: 20px;
      }
      .ferni-widget-iframe.ferni-widget-iframe--left {
        right: 20px;
      }
    }
  \`;

  // Icons
  const MIC_ICON = '<svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/></svg>';
  const CLOSE_ICON = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

  // Initialize
  async function init() {
    try {
      // Fetch config
      const configRes = await fetch(API_BASE + '/api/widget/config/' + WIDGET_ID);
      if (!configRes.ok) throw new Error('Failed to load widget config');
      config = await configRes.json();

      // Inject styles
      const style = document.createElement('style');
      style.textContent = STYLES;
      if (config.primaryColor) {
        style.textContent = ':root { --ferni-primary: ' + config.primaryColor + '; }' + style.textContent;
      }
      document.head.appendChild(style);

      // Create button
      createButton();

      // Auto-greet if configured
      if (config.autoGreet && window.FerniWidget.autoOpen) {
        setTimeout(open, 2000);
      }

      if (window.FerniWidget?.debug) console.log('[Ferni] Widget initialized:', config.displayName);
    } catch (err) {
      if (window.FerniWidget?.debug) console.error('[Ferni] Failed to initialize:', err);
    }
  }

  function createButton() {
    button = document.createElement('button');
    button.className = 'ferni-widget-button';
    if (config.position === 'bottom-left') {
      button.classList.add('ferni-widget-button--left');
    }
    button.innerHTML = MIC_ICON;
    button.setAttribute('aria-label', 'Open ' + (config.displayName || 'Voice Assistant'));
    button.addEventListener('click', toggle);
    document.body.appendChild(button);
  }

  function createIframe() {
    if (iframe) return;

    iframe = document.createElement('iframe');
    iframe.className = 'ferni-widget-iframe';
    if (config.position === 'bottom-left') {
      iframe.classList.add('ferni-widget-iframe--left');
    }
    iframe.setAttribute('allow', 'microphone');
    iframe.setAttribute('title', config.displayName || 'Voice Assistant');

    // Build widget URL with session info
    const params = new URLSearchParams({
      widget: WIDGET_ID,
      session: session.sessionId,
      persona: session.personaId,
    });
    iframe.src = API_BASE + '/widget?' + params.toString();

    document.body.appendChild(iframe);
  }

  async function open() {
    if (isOpen) return;

    try {
      // Create session
      const sessionRes = await fetch(API_BASE + '/api/widget/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgetId: WIDGET_ID }),
      });
      if (!sessionRes.ok) {
        const err = await sessionRes.json();
        throw new Error(err.error || 'Failed to create session');
      }
      session = await sessionRes.json();

      // Create iframe
      createIframe();

      // Animate open
      requestAnimationFrame(() => {
        iframe.classList.add('ferni-widget-iframe--open');
        button.innerHTML = CLOSE_ICON;
        isOpen = true;
      });
    } catch (err) {
      if (window.FerniWidget?.debug) console.error('[Ferni] Failed to open:', err);
      alert('Unable to start voice assistant. Please try again later.');
    }
  }

  function close() {
    if (!isOpen || !iframe) return;

    iframe.classList.remove('ferni-widget-iframe--open');
    button.innerHTML = MIC_ICON;
    isOpen = false;

    // Remove iframe after animation
    setTimeout(() => {
      if (iframe && !isOpen) {
        iframe.remove();
        iframe = null;
        session = null;
      }
    }, 300);
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  // Public API
  window.FerniWidget.open = open;
  window.FerniWidget.close = close;
  window.FerniWidget.toggle = toggle;

  function start() {
    const resolved = resolveFerniWidgetConfig(window, SCRIPT_EL);
    API_BASE = resolved.apiBase;
    WIDGET_ID = resolved.widgetId;
    if (!WIDGET_ID) {
      if (window.FerniWidget.debug) console.error('[Ferni] Widget ID not configured. Set window.FerniWidget.widgetId, window.FERNI_CONFIG.agentId, or data-widget-id');
      return;
    }
    init();
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
`;
