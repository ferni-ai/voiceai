/**
 * BTH Hint Listener - Subtle UI hints for "Better Than Human" signals
 *
 * Listens for ferni:bth-hint events and displays subtle, non-intrusive
 * hints showing what Ferni noticed. These humanize Ferni by making
 * superhuman observations visible without being overwhelming.
 *
 * DESIGN PHILOSOPHY:
 * - Hints should feel like soft thoughts, not alerts
 * - Only show meaningful insights, not every signal
 * - Very short durations - peripheral awareness, not focus
 * - Some hints are avatar-only (no text display)
 *
 * @module @ferni/eq/bridge/bth-hint-listener
 */

import { whisperInfo } from '../../ui/whisper.ui.js';
import { createLogger } from '../../utils/logger.js';
import type { BthHintDetail, BthHintType } from './humanization-bridge.js';

const log = createLogger('BthHintListener');

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Hint display configuration
 * - textHint: Whether to show a text whisper (vs just avatar feedback)
 * - template: How to format the hint text (use {content} placeholder)
 * - duration: How long to show (shorter = more subtle)
 * - minInterval: Minimum time between showing this hint type
 */
interface HintConfig {
  textHint: boolean;
  template?: string;
  duration: number;
  minInterval: number;
}

const HINT_CONFIGS: Record<BthHintType, HintConfig> = {
  // User achievement - very brief celebration acknowledgment
  delight: {
    textHint: true,
    template: '{content}', // Just show the trigger
    duration: 1500,
    minInterval: 30000, // 30s between delight hints
  },

  // Inside joke - show the reference to reinforce connection
  inside_joke: {
    textHint: true,
    template: '{content}',
    duration: 2000,
    minInterval: 60000, // 1 min between inside jokes
  },

  // Observation - surface the insight
  observation: {
    textHint: true,
    template: 'I noticed: {content}',
    duration: 2500,
    minInterval: 120000, // 2 min between observations
  },

  // Vulnerability - NO text hint (just avatar expression)
  // Showing "I'm uncertain" as text would feel weird
  vulnerability: {
    textHint: false,
    duration: 0,
    minInterval: 30000,
  },

  // Memory reference - show what Ferni remembers
  memory: {
    textHint: true,
    template: 'I remember: {content}',
    duration: 2500,
    minInterval: 90000, // 1.5 min between memory hints
  },

  // Relationship moment - subtle acknowledgment
  relationship: {
    textHint: true,
    template: '{content}',
    duration: 2000,
    minInterval: 120000, // 2 min between relationship hints
  },

  // Somatic - NO text hint (physical cues are avatar-only)
  somatic: {
    textHint: false,
    duration: 0,
    minInterval: 60000,
  },

  // Anticipatory - brief time awareness
  anticipatory: {
    textHint: true,
    template: '{content}',
    duration: 1800,
    minInterval: 180000, // 3 min between time hints
  },
};

// Human-readable labels for time contexts
const TIME_CONTEXT_LABELS: Record<string, string> = {
  late_night: "I'm here for you tonight",
  early_morning: 'Good morning',
  weekend: 'Enjoying the weekend?',
  monday: 'Monday check-in',
  evening: 'Evening thoughts',
};

// ============================================================================
// STATE
// ============================================================================

let initialized = false;
const lastShownByType = new Map<BthHintType, number>();

// ============================================================================
// HINT PROCESSING
// ============================================================================

/**
 * Check if we should show this hint type (rate limiting)
 */
function shouldShowHint(type: BthHintType): boolean {
  const config = HINT_CONFIGS[type];
  if (!config.textHint) {
    return false; // Avatar-only hints don't show text
  }

  const lastShown = lastShownByType.get(type) || 0;
  const now = Date.now();

  if (now - lastShown < config.minInterval) {
    log.debug('Hint rate limited', { type, sinceLastMs: now - lastShown });
    return false;
  }

  return true;
}

/**
 * Format the hint content for display
 */
function formatHintContent(type: BthHintType, content: string, metadata?: Record<string, unknown>): string {
  const config = HINT_CONFIGS[type];

  // Handle special case: anticipatory with time context
  if (type === 'anticipatory' && metadata?.intensity) {
    const timeLabel = TIME_CONTEXT_LABELS[content];
    if (timeLabel) {
      return timeLabel;
    }
  }

  // Use template if available
  if (config.template) {
    return config.template.replace('{content}', content);
  }

  return content;
}

/**
 * Handle a BTH hint event
 */
function handleBthHint(event: CustomEvent<BthHintDetail>): void {
  const { type, content, metadata } = event.detail;

  log.debug('BTH hint received', { type, content: content.slice(0, 50) });

  if (!shouldShowHint(type)) {
    return;
  }

  const config = HINT_CONFIGS[type];
  const formattedContent = formatHintContent(type, content, metadata);

  // Record that we showed this type
  lastShownByType.set(type, Date.now());

  // Show the whisper (subtle notification)
  whisperInfo(formattedContent, config.duration);

  log.debug('BTH hint displayed', { type, content: formattedContent });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the BTH hint listener
 * Call this once during app initialization
 */
export function initBthHintListener(): void {
  if (initialized) {
    log.debug('BTH hint listener already initialized');
    return;
  }

  document.addEventListener('ferni:bth-hint', handleBthHint as EventListener);

  log.info('BTH hint listener initialized');
  initialized = true;
}

/**
 * Dispose the BTH hint listener
 * Call this during cleanup
 */
export function disposeBthHintListener(): void {
  if (!initialized) {
    return;
  }

  document.removeEventListener('ferni:bth-hint', handleBthHint as EventListener);
  lastShownByType.clear();

  log.debug('BTH hint listener disposed');
  initialized = false;
}

/**
 * Manually show a BTH hint (for testing)
 */
export function showBthHint(type: BthHintType, content: string, metadata?: Record<string, unknown>): void {
  const detail: BthHintDetail = {
    type,
    content,
    metadata,
    timestamp: Date.now(),
  };

  handleBthHint(new CustomEvent('ferni:bth-hint', { detail }));
}

/**
 * Reset rate limiting (for testing)
 */
export function resetBthHintRateLimits(): void {
  lastShownByType.clear();
}
