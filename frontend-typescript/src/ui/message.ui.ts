/**
 * Message UI Component
 * 
 * Minimal status messages only - no quotes clutter.
 * Shows brief status updates that auto-clear.
 */

import type { MessageType } from '../types/events.js';
import type { PersonaConfig } from '../types/persona.js';
import { appState, setMessage } from '../state/app.state.js';
import { TIMING } from '../config/index.js';
import { getElementById, setText, setClasses, addClass, removeClass, show, hide } from '../utils/dom.js';

// ============================================================================
// ELEMENT REFERENCES
// ============================================================================

interface MessageElements {
  container: HTMLElement;
  text: HTMLElement;
  helper: HTMLElement;
}

let elements: MessageElements | null = null;
let messageTimeout: ReturnType<typeof setTimeout> | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the message UI component.
 * Must be called after DOM is ready.
 */
export function initMessageUI(): void {
  try {
    elements = {
      container: getElementById('messageContainer'),
      text: getElementById('messageText'),
      helper: getElementById('helperText'),
    };

    // Set up state subscriptions
    setupSubscriptions();

    // Start hidden - only show on status updates
    hide(elements.container);

    console.log('✅ Message UI initialized');
  } catch (error) {
    console.error('Failed to initialize Message UI:', error);
  }
}

// ============================================================================
// STATE SUBSCRIPTIONS
// ============================================================================

function setupSubscriptions(): void {
  // Active persona changes - update helper text only
  appState.subscribe('activePersona', (persona) => {
    updateHelperText(persona);
  });

  // Connection state changes - brief status only
  appState.subscribe('connection', (state) => {
    if (state === 'connected') {
      showMessage('Connected!', 'success', 1500);
    } else if (state === 'connecting') {
      showMessage('Connecting...', 'info', 0);
    } else if (state === 'error') {
      showMessage('Connection error', 'error', 3000);
    } else if (state === 'disconnected') {
      clearMessage();
    }
  });
}

// ============================================================================
// MESSAGE DISPLAY
// ============================================================================

/**
 * Show a brief status message.
 */
export function showMessage(
  text: string,
  type: MessageType = 'info',
  duration: number = TIMING.MESSAGE_DURATION
): void {
  if (!elements) return;

  // Clear any existing timeout
  if (messageTimeout) {
    clearTimeout(messageTimeout);
    messageTimeout = null;
  }

  // Update text
  setText(elements.text, text);

  // Update type classes
  setClasses(elements.container, {
    'message-info': type === 'info',
    'message-error': type === 'error',
    'message-success': type === 'success',
    'hidden': false,
  });

  // Show container
  show(elements.container);

  // Add entrance animation
  removeClass(elements.container, 'message-exit');
  addClass(elements.container, 'message-enter');

  // Update state
  setMessage(text);

  // Auto-clear after duration (unless 0)
  if (duration > 0) {
    messageTimeout = setTimeout(() => {
      clearMessage();
    }, duration);
  }
}

/**
 * Clear the current message.
 */
export function clearMessage(): void {
  if (!elements) return;

  // Exit animation
  removeClass(elements.container, 'message-enter');
  addClass(elements.container, 'message-exit');

  // Hide after animation
  setTimeout(() => {
    if (elements) {
      hide(elements.container);
    }
  }, 300);

  // Clear state
  setMessage(null);
}

// ============================================================================
// HELPER TEXT
// ============================================================================

/**
 * Update the helper text.
 */
export function updateHelperText(persona: PersonaConfig): void {
  if (!elements) return;
  setText(elements.helper, persona.helperText);
}

/**
 * Set custom helper text.
 */
export function setHelperText(text: string): void {
  if (!elements) return;
  setText(elements.helper, text);
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up resources.
 */
export function dispose(): void {
  if (messageTimeout) {
    clearTimeout(messageTimeout);
    messageTimeout = null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const messageUI = {
  init: initMessageUI,
  show: showMessage,
  clear: clearMessage,
  setHelper: setHelperText,
  dispose,
};

