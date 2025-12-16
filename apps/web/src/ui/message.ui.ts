/**
 * Message UI Component
 *
 * Uses the cute white "whisper" toast near the avatar.
 * This is the small, elegant pill that appears just below the avatar.
 */

import { TIMING } from '../config/index.js';
import { appState, setMessage } from '../state/app.state.js';
import type { MessageType } from '../types/events.js';
import type { PersonaConfig } from '../types/persona.js';
import { getElementById, setText } from '../utils/dom.js';
import { createLogger } from '../utils/logger.js';
import { hideStatusWhisper, whisperStatus } from './avatar-feedback.ui.js';

const log = createLogger('MessageUI');

// ============================================================================
// ELEMENT REFERENCES
// ============================================================================

interface MessageElements {
  helper: HTMLElement;
}

let elements: MessageElements | null = null;

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
      helper: getElementById('helperText'),
    };

    // Set up state subscriptions
    setupSubscriptions();

    log.debug('Message UI initialized (using whisper toast)');
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
}

// ============================================================================
// MESSAGE DISPLAY - Uses the cute white whisper toast near avatar
// ============================================================================

/**
 * Show a brief status message using the cute white whisper near the avatar.
 * This is the small, elegant pill that appears just below the avatar.
 */
export function showMessage(
  text: string,
  type: MessageType = 'info',
  duration: number = TIMING.MESSAGE_DURATION
): void {
  // Skip empty messages
  if (!text || text.trim() === '') {
    return;
  }

  // Map MessageType to whisper type
  const whisperType =
    type === 'success'
      ? 'success'
      : type === 'error'
        ? 'error'
        : type === 'warning'
          ? 'warning'
          : 'info';

  // Use the cute white whisper toast near the avatar
  whisperStatus(text, whisperType, duration);

  // Update state for backward compatibility
  setMessage(text);
}

/**
 * Clear the current message.
 */
export function clearMessage(): void {
  hideStatusWhisper();
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
  hideStatusWhisper();
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
