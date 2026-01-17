/**
 * Transcript UI - Live speech-to-text display
 * 
 * Shows what's being said in real-time with elegant typography
 * and smooth animations.
 * 
 * MOBILE BEHAVIOR: Transcription is OFF by default on iOS/mobile devices
 * to provide a cleaner, more immersive experience. Users can enable it
 * via Settings menu.
 */

import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { PREFERENCE_KEYS } from '../config/storage-keys.js';

const log = createLogger('TranscriptUI');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// MOBILE DETECTION
// ============================================================================

/**
 * Detect if user is on iOS device
 */
function isIOSDevice(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Detect if user is on mobile device
 */
function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth <= 768;
}

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let textElement: HTMLElement | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;
let isEnabled = true; // Will be set during init based on platform and user preference

// ============================================================================
// PREFERENCE MANAGEMENT
// ============================================================================

/**
 * Get whether transcription should be enabled based on user preference.
 * Default: OFF on iOS/mobile, ON for desktop
 */
function getTranscriptionPreference(): boolean {
  const stored = localStorage.getItem(PREFERENCE_KEYS.SHOW_TRANSCRIPTION);
  
  if (stored !== null) {
    // User has explicitly set a preference
    return stored === 'true';
  }
  
  // Default behavior: OFF on iOS/mobile for cleaner UX
  if (isIOSDevice() || isMobileDevice()) {
    return false;
  }
  
  // Desktop default: ON
  return true;
}

/**
 * Set transcription visibility preference
 */
export function setTranscriptionEnabled(enabled: boolean): void {
  isEnabled = enabled;
  localStorage.setItem(PREFERENCE_KEYS.SHOW_TRANSCRIPTION, String(enabled));
  log.info(`Transcription ${enabled ? 'enabled' : 'disabled'}`);
  
  // If disabling while visible, hide immediately
  if (!enabled && container?.classList.contains('visible')) {
    hide();
  }
}

/**
 * Get current transcription enabled state
 */
export function isTranscriptionEnabled(): boolean {
  return isEnabled;
}

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
  
  // Load user preference (defaults to OFF on mobile)
  isEnabled = getTranscriptionPreference();
  log.info(`Transcription initialized: ${isEnabled ? 'enabled' : 'disabled'} (mobile: ${isMobileDevice()}, iOS: ${isIOSDevice()})`);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show transcript with text (interim or final)
 * Now part of Status Island - no layout shift
 * 
 * Respects user preference - won't show if transcription is disabled
 */
export function showTranscript(text: string, isFinal = false): void {
  // Respect user preference - skip if transcription is disabled
  if (!isEnabled) return;
  
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
  // Transcription preference controls
  setEnabled: setTranscriptionEnabled,
  isEnabled: isTranscriptionEnabled,
};

