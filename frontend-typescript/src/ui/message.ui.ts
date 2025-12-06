/**
 * Message UI Component
 *
 * Now delegates to the new world-class toast.ui.ts system.
 * This file provides backward compatibility with the old API.
 */

import type { MessageType } from '../types/events.js';
import type { PersonaConfig } from '../types/persona.js';
import { appState, setMessage } from '../state/app.state.js';
import { TIMING } from '../config/index.js';
import { getElementById, setText } from '../utils/dom.js';
import {
  initToastUI,
  toastSuccess,
  toastError,
  toastInfo,
  dismiss,
} from './toast.ui.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('MessageUI');

// ============================================================================
// ELEMENT REFERENCES (Helper text only - toasts handled by toast.ui.ts)
// ============================================================================

interface MessageElements {
  helper: HTMLElement;
}

let elements: MessageElements | null = null;
let currentToastId: string | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the message UI component.
 * Must be called after DOM is ready.
 */
export function initMessageUI(): void {
  try {
    // Initialize the new toast system
    initToastUI();

    elements = {
      helper: getElementById('helperText'),
    };

    // Set up state subscriptions
    setupSubscriptions();

  } catch (error) {
    log.error('Failed to initialize Message UI:', error);
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

  // Connection state changes - avatar feedback (no text)
  // The toast functions now route through avatarFeedback
  appState.subscribe('connection', (state) => {
    // Dismiss any previous toast
    if (currentToastId) {
      dismiss(currentToastId);
      currentToastId = null;
    }

    // Avatar communicates state through behavior, not text
    if (state === 'connected') {
      currentToastId = toastSuccess('', { duration: 2000 });
    } else if (state === 'connecting') {
      currentToastId = toastInfo('', { duration: 0 });
    } else if (state === 'error') {
      currentToastId = toastError('', { duration: 5000 });
    }
    // No feedback for disconnected - avatar handles it
  });
}

// ============================================================================
// MESSAGE DISPLAY - Delegates to toast.ui.ts
// ============================================================================

/**
 * Show a brief status message.
 * Now uses the new world-class toast system.
 */
export function showMessage(
  text: string,
  type: MessageType = 'info',
  duration: number = TIMING.MESSAGE_DURATION
): void {
  // Dismiss previous message toast
  if (currentToastId) {
    dismiss(currentToastId);
  }

  // Map to new toast API
  if (type === 'success') {
    currentToastId = toastSuccess(text, { duration });
  } else if (type === 'error') {
    currentToastId = toastError(text, { duration: duration || 5000 });
  } else {
    currentToastId = toastInfo(text, { duration });
  }

  // Update state for backward compatibility
  setMessage(text);
}

/**
 * Clear the current message.
 */
export function clearMessage(): void {
  if (currentToastId) {
    dismiss(currentToastId);
    currentToastId = null;
  }
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
  if (currentToastId) {
    dismiss(currentToastId);
    currentToastId = null;
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

