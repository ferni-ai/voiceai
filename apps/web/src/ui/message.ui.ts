/**
 * Message UI Component
 *
 * Uses the cute white "whisper" toast near the avatar.
 * This is the small, elegant pill that appears just below the avatar.
 */

import { TIMING } from '../config/index.js';
import { setMessage } from '../state/app.state.js';
import type { MessageType } from '../types/events.js';
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

    log.debug('Message UI initialized (using whisper toast)');
  } catch (error) {
    log.error('Failed to initialize Message UI:', error);
  }
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
// The helper line holds the welcome greeting and status words. It no longer
// follows the persona: every persona's helperText repeated its subtitle, so a
// teammate's role showed a third time under the button (audit item 15).

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
