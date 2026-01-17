/**
 * Mood-Reactive Backgrounds UI
 *
 * Subtly shifts background colors based on the emotional mood detected
 * during conversation. Creates an empathetic atmosphere.
 *
 * Design principles:
 * - Very subtle - should be barely noticeable consciously
 * - Respects user preference for reduced motion
 * - Warm moods = warmer tints, cool moods = cooler tints
 * - Never jarring or distracting
 *
 * Security note: All CSS is generated from hardcoded values.
 *
 * @module ui/mood-backgrounds
 */

import { DURATION } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('MoodBackgrounds');

// ============================================================================
// TYPES
// ============================================================================

export type EmotionalMood =
  | 'neutral'
  | 'happy'
  | 'excited'
  | 'calm'
  | 'thoughtful'
  | 'sad'
  | 'anxious'
  | 'supportive';

interface MoodStyle {
  tint: string; // rgba overlay
  warmth: number; // 0-1 scale
  saturation: number; // 0-1 scale
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'ferni_mood_backgrounds_enabled';

// Mood color configurations (very subtle tints)
const MOOD_STYLES: Record<EmotionalMood, MoodStyle> = {
  neutral: {
    tint: 'rgba(255, 255, 255, 0)',
    warmth: 0.5,
    saturation: 0.5,
  },
  happy: {
    tint: 'rgba(255, 220, 100, 0.03)',
    warmth: 0.7,
    saturation: 0.6,
  },
  excited: {
    tint: 'rgba(255, 180, 120, 0.04)',
    warmth: 0.8,
    saturation: 0.7,
  },
  calm: {
    tint: 'rgba(180, 220, 255, 0.03)',
    warmth: 0.3,
    saturation: 0.4,
  },
  thoughtful: {
    tint: 'rgba(200, 180, 255, 0.03)',
    warmth: 0.4,
    saturation: 0.5,
  },
  sad: {
    tint: 'rgba(180, 200, 220, 0.03)',
    warmth: 0.3,
    saturation: 0.3,
  },
  anxious: {
    tint: 'rgba(200, 200, 220, 0.02)',
    warmth: 0.4,
    saturation: 0.4,
  },
  supportive: {
    tint: 'rgba(220, 255, 200, 0.03)',
    warmth: 0.6,
    saturation: 0.5,
  },
};

// ============================================================================
// STATE
// ============================================================================

let currentMood: EmotionalMood = 'neutral';
let isEnabled = true;
let isInitialized = false;
let overlayElement: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initMoodBackgroundsUI(): void {
  if (isInitialized) return;

  // Load preference
  loadPreference();

  // Inject styles
  injectStyles();

  // Create overlay element
  createOverlay();

  // Listen for mood changes from avatar-feedback or other sources
  window.addEventListener('ferniMoodChange', handleMoodChange as EventListener);

  isInitialized = true;
  log.info('Mood Backgrounds UI initialized', { enabled: isEnabled });
}

// ============================================================================
// OVERLAY MANAGEMENT
// ============================================================================

function createOverlay(): void {
  overlayElement = document.createElement('div');
  overlayElement.className = 'mood-background-overlay';
  overlayElement.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(overlayElement, document.body.firstChild);
}

function updateOverlay(mood: EmotionalMood): void {
  if (!overlayElement || !isEnabled) return;

  const style = MOOD_STYLES[mood];
  overlayElement.style.setProperty('--mood-tint', style.tint);
  overlayElement.classList.add('mood-background-overlay--transitioning');

  // Remove transition class after animation
  setTimeout(() => {
    overlayElement?.classList.remove('mood-background-overlay--transitioning');
  }, DURATION.SLOW);
}

// ============================================================================
// MOOD HANDLING
// ============================================================================

function handleMoodChange(event: CustomEvent<{ mood: EmotionalMood }>): void {
  const newMood = event.detail?.mood;
  if (!newMood || newMood === currentMood) return;

  currentMood = newMood;
  updateOverlay(newMood);

  log.debug('Mood changed', { mood: newMood });
}

/**
 * Set the current emotional mood programmatically.
 * Call this from avatar-feedback or emotion detection systems.
 */
export function setMood(mood: EmotionalMood): void {
  if (mood === currentMood) return;

  currentMood = mood;
  updateOverlay(mood);

  log.debug('Mood set', { mood });
}

export function getMood(): EmotionalMood {
  return currentMood;
}

// ============================================================================
// PREFERENCES
// ============================================================================

function loadPreference(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      isEnabled = stored === 'true';
    }
  } catch {
    // Ignore localStorage errors
  }
}

function savePreference(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(isEnabled));
  } catch {
    // Ignore localStorage errors
  }
}

export function setEnabled(enabled: boolean): void {
  isEnabled = enabled;
  savePreference();

  if (overlayElement) {
    overlayElement.classList.toggle('mood-background-overlay--disabled', !enabled);
  }

  log.debug('Mood backgrounds enabled:', { enabled });
}

export function getEnabled(): boolean {
  return isEnabled;
}

export function toggleEnabled(): boolean {
  setEnabled(!isEnabled);
  return isEnabled;
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.id = 'mood-backgrounds-styles';
  styleElement.textContent = `
    /* ========================================
       MOOD-REACTIVE BACKGROUNDS
       Subtle emotional atmosphere
       ======================================== */

    .mood-background-overlay {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: var(--z-base, 0);
      background: var(--mood-tint, transparent);
      transition: background ${DURATION.SLOW}ms ease-out;
    }

    .mood-background-overlay--transitioning {
      transition: background ${DURATION.SLOW}ms ease-out;
    }

    .mood-background-overlay--disabled {
      opacity: 0 !important;
    }

    /* Reduced motion - instant transitions */
    @media (prefers-reduced-motion: reduce) {
      .mood-background-overlay {
        transition: none;
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// CLEANUP
// ============================================================================

export function disposeMoodBackgroundsUI(): void {
  window.removeEventListener('ferniMoodChange', handleMoodChange as EventListener);

  if (overlayElement) {
    overlayElement.remove();
    overlayElement = null;
  }

  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }

  isInitialized = false;
  log.debug('Mood Backgrounds UI disposed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const moodBackgroundsUI = {
  init: initMoodBackgroundsUI,
  dispose: disposeMoodBackgroundsUI,
  setMood,
  getMood,
  setEnabled,
  getEnabled,
  toggleEnabled,
};
