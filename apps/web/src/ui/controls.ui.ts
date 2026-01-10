/**
 * Controls UI Component
 * 
 * Manages the connect/disconnect buttons and main interaction controls.
 */

import type { ConnectionState } from '../types/events.js';
import { appState } from '../state/app.state.js';
import {
  getElementById,
  addClass,
  removeClass,
  addListener,
  show,
  hide,
} from '../utils/dom.js';
import { createLogger } from '../utils/logger.js';
import { t } from '../i18n/index.js';

const log = createLogger('ControlsUI');

// Note: addClass/removeClass kept for future mute button styling

// ============================================================================
// TYPES
// ============================================================================

export interface ControlCallbacks {
  onConnect: () => void;
  onDisconnect: () => void;
  onMuteToggle: () => void;
  onRepeat?: () => void;
}

// ============================================================================
// ELEMENT REFERENCES
// ============================================================================

interface ControlElements {
  controlsContainer: HTMLElement | null;
  connectBtn: HTMLButtonElement;
  disconnectBtn: HTMLButtonElement;
  muteBtn: HTMLButtonElement | null;
  repeatBtn: HTMLButtonElement | null;
}

let elements: ControlElements | null = null;
let callbacks: ControlCallbacks | null = null;
const cleanupFunctions: (() => void)[] = [];

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the controls UI component.
 * Must be called after DOM is ready.
 */
export function initControlsUI(controlCallbacks: ControlCallbacks): void {
  try {
    callbacks = controlCallbacks;

    elements = {
      controlsContainer: document.querySelector('.controls'),
      connectBtn: getElementById('connectBtn'),
      disconnectBtn: getElementById('disconnectBtn'),
      muteBtn: document.getElementById('muteBtn') as HTMLButtonElement | null,
      repeatBtn: document.getElementById('repeatBtn') as HTMLButtonElement | null,
    };

    // Set up click handlers
    setupClickHandlers();

    // Set up state subscriptions
    setupSubscriptions();

    // Initial state
    updateButtonVisibility(appState.get('connection'));

  } catch (error) {
    log.error('❌ Failed to initialize Controls UI:', error);
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function setupClickHandlers(): void {
  if (!elements || !callbacks) return;

  // Simple click handlers - matches working frontend
  // iOS handles click events on buttons correctly
  const connectCleanup = addListener(elements.connectBtn, 'click', () => {
    callbacks?.onConnect();
  });
  cleanupFunctions.push(connectCleanup);

  // Disconnect button
  const disconnectCleanup = addListener(elements.disconnectBtn, 'click', () => {
    callbacks?.onDisconnect();
  });
  cleanupFunctions.push(disconnectCleanup);

  // Mute button (optional)
  if (elements.muteBtn) {
    const muteCleanup = addListener(elements.muteBtn, 'click', () => {
      callbacks?.onMuteToggle();
    });
    cleanupFunctions.push(muteCleanup);
  }

  // 🔄 Repeat button (optional) - replays last agent response
  if (elements.repeatBtn) {
    const repeatCleanup = addListener(elements.repeatBtn, 'click', () => {
      callbacks?.onRepeat?.();
    });
    cleanupFunctions.push(repeatCleanup);
  }
}

// ============================================================================
// STATE SUBSCRIPTIONS
// ============================================================================

function setupSubscriptions(): void {
  // Connection state changes
  appState.subscribe('connection', (state) => {
    updateButtonVisibility(state);
    // Reset wrap-up state on disconnect
    if (state === 'disconnected') {
      updateWrapUpState(false);
    }
  });

  // Mute state changes
  appState.subscribe('isMuted', (muted) => {
    updateMuteButton(muted);
  });

  // Wrap-up state changes (agent saying goodbye)
  appState.subscribe('isWrappingUp', (isWrappingUp) => {
    updateWrapUpState(isWrappingUp);
  });
}

// ============================================================================
// UPDATE FUNCTIONS
// ============================================================================

/**
 * Update button visibility based on connection state.
 * Apple-style: smooth morphing between states with no layout shift.
 */
function updateButtonVisibility(state: ConnectionState): void {
  if (!elements) return;

  switch (state) {
    case 'disconnected':
      show(elements.connectBtn, 'flex');
      hide(elements.disconnectBtn);
      if (elements.repeatBtn) hide(elements.repeatBtn);
      elements.connectBtn.disabled = false;
      // Reset connecting state
      removeClass(elements.connectBtn, 'btn-connecting');
      // Reset disconnect button to default styling
      removeClass(elements.disconnectBtn, 'btn-primary');
      removeClass(elements.disconnectBtn, 'btn-magnetic');
      addClass(elements.disconnectBtn, 'btn-secondary');
      break;

    case 'connecting':
    case 'reconnecting':
      show(elements.connectBtn, 'flex');
      hide(elements.disconnectBtn);
      if (elements.repeatBtn) hide(elements.repeatBtn);
      elements.connectBtn.disabled = true;
      // Apple-style: button shows connecting state inline
      addClass(elements.connectBtn, 'btn-connecting');
      break;

    case 'connected':
      // Remove connecting state before hiding
      removeClass(elements.connectBtn, 'btn-connecting');
      hide(elements.connectBtn);
      show(elements.disconnectBtn, 'flex');
      // 🔄 Show repeat button when connected (will enable after first response)
      if (elements.repeatBtn) show(elements.repeatBtn, 'flex');
      elements.disconnectBtn.disabled = false;
      // Make disconnect button match persona colors!
      removeClass(elements.disconnectBtn, 'btn-secondary');
      addClass(elements.disconnectBtn, 'btn-primary');
      addClass(elements.disconnectBtn, 'btn-magnetic');
      break;

    case 'error':
      show(elements.connectBtn, 'flex');
      hide(elements.disconnectBtn);
      if (elements.repeatBtn) hide(elements.repeatBtn);
      elements.connectBtn.disabled = false;
      // Reset connecting state on error
      removeClass(elements.connectBtn, 'btn-connecting');
      break;
  }
}

/**
 * Update mute button state.
 */
function updateMuteButton(muted: boolean): void {
  if (!elements?.muteBtn) return;

  if (muted) {
    addClass(elements.muteBtn, 'muted');
    elements.muteBtn.setAttribute('aria-pressed', 'true');
  } else {
    removeClass(elements.muteBtn, 'muted');
    elements.muteBtn.setAttribute('aria-pressed', 'false');
  }
}

/**
 * Update UI when agent is wrapping up the conversation.
 * Makes the disconnect button more prominent and inviting.
 */
function updateWrapUpState(isWrappingUp: boolean): void {
  if (!elements?.disconnectBtn) return;

  if (isWrappingUp) {
    // Add wrap-up styling - warm, inviting goodbye state
    addClass(elements.disconnectBtn, 'btn-wrap-up');

    // Update button text to be warmer
    const textSpan = elements.disconnectBtn.querySelector('.btn-text');
    if (textSpan) {
      textSpan.textContent = t('session.goodbye');
    } else {
      // Fallback for buttons without .btn-text
      elements.disconnectBtn.setAttribute('data-wrap-up-text', t('session.goodbye'));
    }

    // Add pulsing attention animation
    addClass(elements.disconnectBtn, 'btn-attention');

    // Update aria label for accessibility
    elements.disconnectBtn.setAttribute('aria-label', t('session.endConversationGoodbye'));
  } else {
    // Reset to normal disconnect state
    removeClass(elements.disconnectBtn, 'btn-wrap-up');
    removeClass(elements.disconnectBtn, 'btn-attention');
    removeClass(elements.disconnectBtn, 'btn-closing'); // Clear closing state too
    removeClass(elements.disconnectBtn, 'btn-agent-hangup'); // Clear agent hangup state too

    // Reset button text
    const textSpan = elements.disconnectBtn.querySelector('.btn-text');
    if (textSpan) {
      textSpan.textContent = t('session.end');
    }
    elements.disconnectBtn.removeAttribute('data-wrap-up-text');
    elements.disconnectBtn.setAttribute('aria-label', t('session.endConversation'));
  }
}

/**
 * Show the "closing ceremony" state on the goodbye button.
 * Called when user clicks Goodbye to show the ceremony is in progress.
 */
export function showClosingState(): void {
  if (!elements?.disconnectBtn) return;

  // Remove attention pulse, add closing state
  removeClass(elements.disconnectBtn, 'btn-attention');
  addClass(elements.disconnectBtn, 'btn-closing');

  // Change text to show it's happening
  const textSpan = elements.disconnectBtn.querySelector('.btn-text');
  if (textSpan) {
    textSpan.textContent = t('session.untilNextTime');
  }

  // Disable the button during ceremony
  elements.disconnectBtn.disabled = true;
}

/**
 * 📞 Show the "agent hangup" state on the disconnect button.
 * Called when Ferni/agent chooses to end the conversation.
 * More tactile "button pressed" animation - like hanging up a phone.
 */
export function showAgentHangupState(): void {
  if (!elements?.disconnectBtn) return;

  // Remove any existing states
  removeClass(elements.disconnectBtn, 'btn-attention');
  removeClass(elements.disconnectBtn, 'btn-closing');

  // Add agent hangup state - tactile button press
  addClass(elements.disconnectBtn, 'btn-agent-hangup');

  // Brief text change
  const textSpan = elements.disconnectBtn.querySelector('.btn-text');
  if (textSpan) {
    textSpan.textContent = t('session.ending');
  }

  // Disable the button
  elements.disconnectBtn.disabled = true;
}

/**
 * Set loading state on connect button.
 * Apple-style: button morphs to show connecting state inline.
 */
export function setConnecting(isConnecting: boolean): void {
  if (!elements) return;

  if (isConnecting) {
    elements.connectBtn.disabled = true;
    addClass(elements.connectBtn, 'btn-connecting');
    removeClass(elements.connectBtn, 'loading');
  } else {
    elements.connectBtn.disabled = false;
    removeClass(elements.connectBtn, 'btn-connecting');
    removeClass(elements.connectBtn, 'loading');
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up resources.
 */
export function dispose(): void {
  for (const fn of cleanupFunctions) {
    fn();
  }
  cleanupFunctions.length = 0;
  elements = null;
  callbacks = null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const controlsUI = {
  init: initControlsUI,
  setConnecting,
  showClosingState, // 🌅 For goodbye ceremony
  showAgentHangupState, // 📞 For agent-initiated disconnect
  dispose,
};

