/**
 * Transcript UI - Live speech-to-text display
 * 
 * Shows what's being said in real-time with elegant typography
 * and smooth animations.
 */

import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

const log = createLogger('TranscriptUI');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let textElement: HTMLElement | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initTranscriptUI(): void {
  container = document.getElementById('transcriptContainer');
  textElement = document.getElementById('transcriptText');
  
  if (!container || !textElement) {
    log.warn('Transcript elements not found');
    return;
  }
  
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show transcript with text (interim or final)
 * Now part of Status Island - no layout shift
 */
export function showTranscript(text: string, isFinal = false): void {
  if (!container || !textElement) return;
  
  // Clear any pending hide
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  
  // Update text
  textElement.textContent = text;
  
  // Show via visible class (Status Island uses opacity/transform)
  container.classList.remove('exiting');
  requestAnimationFrame(() => {
    container?.classList.add('visible');
  });
  
  // Toggle typing cursor based on final state
  if (isFinal) {
    textElement.classList.remove('typing');
    
    // Auto-hide after final text
    hideTimeout = trackedTimeout(() => {
      hide();
    }, 3000);
  } else {
    textElement.classList.add('typing');
  }
}

/**
 * Update transcript with interim (in-progress) text
 */
export function updateInterim(text: string): void {
  showTranscript(text, false);
}

/**
 * Finalize transcript with completed text
 */
export function finalize(text: string): void {
  showTranscript(text, true);
}

/**
 * Clear and hide transcript
 * Smooth exit via Status Island CSS
 */
export function hide(): void {
  if (!container || !textElement) return;
  
  // Exit animation
  container.classList.add('exiting');
  container.classList.remove('visible');
  
  // Clean up after animation
  trackedTimeout(() => {
    container?.classList.remove('exiting');
    if (textElement) {
      textElement.textContent = '';
      textElement.classList.remove('typing');
    }
  }, 300);
}

/**
 * Clear transcript text but keep visible
 */
export function clear(): void {
  if (textElement) {
    textElement.textContent = '';
    textElement.classList.remove('typing');
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
  }
  
  container = null;
  textElement = null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const transcriptUI = {
  init: initTranscriptUI,
  show: showTranscript,
  updateInterim,
  finalize,
  hide,
  clear,
  dispose,
};

