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
import { endLabelKey, installCallRoom } from './call-room/call-room.js';

const log = createLogger('ControlsUI');

/** The span holding a button's visible label (index.html `.btn-content`) */
const LABEL_SELECTOR = '.btn-content';


// ============================================================================
// TYPES
// ============================================================================

export interface ControlCallbacks {
  onConnect: () => void;
  /** Call off the connect attempt in progress (the connecting button's tap) */
  onCancelConnect?: () => void;
  onDisconnect: () => void;
  onMuteToggle: () => void;
}

// ============================================================================
// ELEMENT REFERENCES
// ============================================================================

interface ControlElements {
  controlsContainer: HTMLElement | null;
  connectBtn: HTMLButtonElement;
  disconnectBtn: HTMLButtonElement;
  muteBtn: HTMLButtonElement | null;
}

let elements: ControlElements | null = null;
let callbacks: ControlCallbacks | null = null;
const cleanupFunctions: (() => void)[] = [];
let uninstallCallRoom: (() => void) | null = null;

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
    };

    // Set up click handlers
    setupClickHandlers();

    // Set up state subscriptions
    setupSubscriptions();

    // The call's own room, behind its off-by-default flag
    uninstallCallRoom?.();
    uninstallCallRoom = installCallRoom();

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
  // While connecting, the same button calls the attempt off
  const connectCleanup = addListener(elements.connectBtn, 'click', () => {
    if (appState.get('connection') === 'connecting') callbacks?.onCancelConnect?.();
    else callbacks?.onConnect();
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
      // Each call starts with the mic live, so a mute must not carry over.
      if (appState.get('isMuted')) appState.set('isMuted', false);
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

  // Mute only means something during a live call
  if (elements.muteBtn) {
    if (state === 'connected') show(elements.muteBtn, 'flex');
    else hide(elements.muteBtn);
  }

  switch (state) {
    case 'disconnected':
      show(elements.connectBtn, 'flex');
      hide(elements.disconnectBtn);
      showConnectingStatus(elements.connectBtn, false);
      removeClass(elements.disconnectBtn, 'btn-end-call');
      break;

    case 'connecting':
    case 'reconnecting':
      show(elements.connectBtn, 'flex');
      hide(elements.disconnectBtn);
      // A first connect can be called off from the button; a reconnect cannot
      showConnectingStatus(elements.connectBtn, true, state === 'connecting');
      break;

    case 'connected':
      showConnectingStatus(elements.connectBtn, false);
      hide(elements.connectBtn);
      show(elements.disconnectBtn, 'flex');
      elements.disconnectBtn.disabled = false;
      // Ending the call must not look like starting one: a calm outlined button
      // with a soft warm tint, never the filled persona Connect pill.
      addClass(elements.disconnectBtn, 'btn-end-call');
      break;

    case 'error':
      show(elements.connectBtn, 'flex');
      hide(elements.disconnectBtn);
      showConnectingStatus(elements.connectBtn, false);
      break;
  }
}

/**
 * Show (or clear) the button's one connecting status, tappable to cancel: two
 * lines in the pill, "Connecting…" over a smaller "Tap to cancel", beside the
 * spinner. A label drawn over the button used to wrap under the spinner and
 * clip at large text sizes. Screen readers get one sentence (aria-label).
 */
function showConnectingStatus(btn: HTMLButtonElement, on: boolean, cancellable = false): void {
  btn.disabled = on && !cancellable;
  btn.setAttribute('aria-busy', String(on));
  btn.querySelector('.btn-status')?.remove();
  if (on) {
    addClass(btn, 'btn-connecting');
    btn.dataset.status = t('entrance.connectingNow');
    const status = document.createElement('span');
    status.className = 'btn-status';
    status.setAttribute('aria-hidden', 'true');
    const main = document.createElement('span');
    main.className = 'btn-status-main';
    main.textContent = t('entrance.connectingNow');
    status.append(main);
    if (cancellable) {
      const hint = document.createElement('span');
      hint.className = 'btn-status-hint';
      hint.textContent = t('entrance.tapToCancel');
      status.append(hint);
    }
    btn.append(status);
    btn.setAttribute('aria-label', cancellable ? t('entrance.connectingCancel') : t('app.connecting'));
  } else {
    removeClass(btn, 'btn-connecting');
    delete btn.dataset.status;
    btn.removeAttribute('aria-label');
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
    elements.muteBtn.setAttribute('aria-label', t('accessibility.unmuteMicrophone'));
  } else {
    removeClass(elements.muteBtn, 'muted');
    elements.muteBtn.setAttribute('aria-pressed', 'false');
    elements.muteBtn.setAttribute('aria-label', t('accessibility.muteMicrophone'));
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
    const textSpan = elements.disconnectBtn.querySelector(LABEL_SELECTOR);
    if (textSpan) {
      textSpan.textContent = t('session.goodbye');
    } else {
      // Fallback for buttons without a label span
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
    const textSpan = elements.disconnectBtn.querySelector(LABEL_SELECTOR);
    if (textSpan) {
      textSpan.textContent = t(endLabelKey());
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
  const textSpan = elements.disconnectBtn.querySelector(LABEL_SELECTOR);
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
  const textSpan = elements.disconnectBtn.querySelector(LABEL_SELECTOR);
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
  uninstallCallRoom?.();
  uninstallCallRoom = null;
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

