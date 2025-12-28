/**
 * Speech State Dispatcher
 *
 * Sends real-time speech state events to the frontend for "Better Than Human"
 * active listening capabilities:
 *
 * - speech_start: User started speaking → Frontend starts active listening animations
 * - speech_pause: User paused (breath, thinking) → Frontend shows micro-nod
 * - speech_end: User finished → Frontend transitions expression
 * - breath_detected: Breath pattern detected → Frontend syncs avatar breath
 *
 * This is the CRITICAL bridge that enables the avatar to feel truly present
 * during conversation - showing moment-to-moment engagement that humans often miss.
 *
 * @module agents/realtime/speech-state-dispatcher
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SpeechStateDispatcher' });

// ============================================================================
// TYPES
// ============================================================================

export type SpeechStateType =
  | 'speech_start'
  | 'speech_pause'
  | 'speech_end'
  | 'breath_detected'
  | 'active_listening_start'
  | 'active_listening_nod';

export interface SpeechStateEvent {
  type: SpeechStateType;
  /** Duration in ms (for pauses, speech segments) */
  durationMs?: number;
  /** Pause type for speech_pause */
  pauseType?: 'breath' | 'thinking' | 'emphasis' | 'hesitation';
  /** Nod type for active listening */
  nodType?: 'micro' | 'subtle' | 'visible';
  /** Estimated breath rate (breaths per minute) */
  breathRate?: number;
  /** Speech rate (words per minute) */
  speechRateWPM?: number;
  /** Current emotion detected */
  emotion?: string;
  /** Timestamp */
  timestamp: number;
  /** Allow index access for compatibility */
  [key: string]: unknown;
}

export type SendDataMessageFn = (type: string, payload: Record<string, unknown>) => Promise<void>;

// ============================================================================
// PAUSE DETECTION STATE
// ============================================================================

interface SpeechStateTracker {
  isSpeaking: boolean;
  lastSpeechStart: number;
  lastPauseStart: number;
  pauseCount: number;
  totalPauseDuration: number;
  breathRateEstimate: number;
  recentPauseDurations: number[];
}

const trackers = new Map<string, SpeechStateTracker>();

function getTracker(sessionId: string): SpeechStateTracker {
  if (!trackers.has(sessionId)) {
    trackers.set(sessionId, {
      isSpeaking: false,
      lastSpeechStart: 0,
      lastPauseStart: 0,
      pauseCount: 0,
      totalPauseDuration: 0,
      breathRateEstimate: 15, // Default breaths per minute
      recentPauseDurations: [],
    });
  }
  return trackers.get(sessionId)!;
}

export function clearSpeechStateTracker(sessionId: string): void {
  trackers.delete(sessionId);
}

// ============================================================================
// PAUSE TYPE CLASSIFICATION
// ============================================================================

/**
 * Classify pause type based on duration and context
 * Based on speech science research:
 * - 200-400ms: Breath pause (natural respiratory)
 * - 400-800ms: Thinking pause (cognitive processing)
 * - 800-1500ms: Emphasis pause (deliberate)
 * - 1500ms+: Hesitation (uncertainty)
 */
function classifyPause(durationMs: number, speechRateWPM?: number): SpeechStateEvent['pauseType'] {
  // Adjust thresholds based on speech rate (faster speakers have shorter pauses)
  const speedFactor = speechRateWPM ? Math.min(1.5, Math.max(0.7, 150 / speechRateWPM)) : 1;

  const breathThreshold = 400 * speedFactor;
  const thinkingThreshold = 800 * speedFactor;
  const emphasisThreshold = 1500 * speedFactor;

  if (durationMs < breathThreshold) return 'breath';
  if (durationMs < thinkingThreshold) return 'thinking';
  if (durationMs < emphasisThreshold) return 'emphasis';
  return 'hesitation';
}

/**
 * Determine nod type based on pause type and duration
 * Longer/more significant pauses get more visible nods
 */
function getNodType(
  pauseType: SpeechStateEvent['pauseType']
): SpeechStateEvent['nodType'] {
  switch (pauseType) {
    case 'breath':
      return 'micro'; // Barely perceptible - 1.5px
    case 'thinking':
      return 'subtle'; // Visible - 2.5px
    case 'emphasis':
    case 'hesitation':
      return 'visible'; // Clear acknowledgment - 4px
    default:
      return 'micro';
  }
}

/**
 * Estimate breath rate from pause patterns
 * Normal breathing: 12-20 breaths/min = 3000-5000ms between breaths
 */
function estimateBreathRate(recentPauseDurations: number[]): number {
  if (recentPauseDurations.length < 3) return 15; // Default

  // Filter to likely breath pauses (200-600ms)
  const breathPauses = recentPauseDurations.filter((d) => d >= 200 && d <= 600);
  if (breathPauses.length < 2) return 15;

  // Calculate average inter-breath interval
  // Speech pauses happen roughly 3-4 times per breath cycle
  const avgPauseDuration = breathPauses.reduce((a, b) => a + b, 0) / breathPauses.length;
  const pausesPerSecond = 1000 / avgPauseDuration;

  // Rough estimate: ~3 pauses per breath cycle
  const breathsPerMinute = (pausesPerSecond * 60) / 3;

  // Clamp to reasonable range
  return Math.max(8, Math.min(25, Math.round(breathsPerMinute)));
}

// ============================================================================
// MAIN DISPATCHER
// ============================================================================

/**
 * Dispatch speech start event
 */
export async function dispatchSpeechStart(
  sessionId: string,
  sendDataMessage: SendDataMessageFn,
  options?: {
    speechRateWPM?: number;
    emotion?: string;
  }
): Promise<void> {
  const tracker = getTracker(sessionId);
  const now = Date.now();

  tracker.isSpeaking = true;
  tracker.lastSpeechStart = now;
  tracker.pauseCount = 0;
  tracker.totalPauseDuration = 0;

  const event: SpeechStateEvent = {
    type: 'speech_start',
    speechRateWPM: options?.speechRateWPM,
    emotion: options?.emotion,
    timestamp: now,
  };

  try {
    await sendDataMessage('speech_state', event);

    // Also send active listening start signal
    await sendDataMessage('humanization_signal', {
      signalType: 'active_listening_start',
      timestamp: now,
    });

    log.debug({ sessionId, event }, '🎭 Speech start dispatched');
  } catch (error) {
    log.debug({ error: String(error) }, 'Speech start dispatch failed (non-fatal)');
  }
}

/**
 * Dispatch speech pause event (for active listening nods)
 */
export async function dispatchSpeechPause(
  sessionId: string,
  sendDataMessage: SendDataMessageFn,
  durationMs: number,
  options?: {
    speechRateWPM?: number;
    emotion?: string;
  }
): Promise<void> {
  const tracker = getTracker(sessionId);
  const now = Date.now();

  // Only dispatch if we're in speaking state
  if (!tracker.isSpeaking) return;

  // Ignore very short pauses (< 150ms - likely just word boundaries)
  if (durationMs < 150) return;

  tracker.pauseCount++;
  tracker.totalPauseDuration += durationMs;
  tracker.recentPauseDurations.push(durationMs);

  // Keep only last 10 pauses for breath rate estimation
  if (tracker.recentPauseDurations.length > 10) {
    tracker.recentPauseDurations.shift();
  }

  const pauseType = classifyPause(durationMs, options?.speechRateWPM);
  const nodType = getNodType(pauseType);
  const breathRate = estimateBreathRate(tracker.recentPauseDurations);

  tracker.breathRateEstimate = breathRate;

  const event: SpeechStateEvent = {
    type: 'speech_pause',
    durationMs,
    pauseType,
    nodType,
    breathRate,
    speechRateWPM: options?.speechRateWPM,
    emotion: options?.emotion,
    timestamp: now,
  };

  try {
    await sendDataMessage('speech_state', event);

    // Also send active listening nod signal for the frontend EQ system
    await sendDataMessage('humanization_signal', {
      signalType: 'active_listening_nod',
      nodType,
      pauseType,
      durationMs,
      timestamp: now,
    });

    log.debug(
      { sessionId, durationMs, pauseType, nodType },
      '🎭 Speech pause dispatched → frontend will nod'
    );
  } catch (error) {
    log.debug({ error: String(error) }, 'Speech pause dispatch failed (non-fatal)');
  }
}

/**
 * Dispatch speech end event
 */
export async function dispatchSpeechEnd(
  sessionId: string,
  sendDataMessage: SendDataMessageFn,
  options?: {
    totalDurationMs?: number;
    emotion?: string;
  }
): Promise<void> {
  const tracker = getTracker(sessionId);
  const now = Date.now();

  const totalDurationMs = options?.totalDurationMs || (now - tracker.lastSpeechStart);

  tracker.isSpeaking = false;

  const event: SpeechStateEvent = {
    type: 'speech_end',
    durationMs: totalDurationMs,
    breathRate: tracker.breathRateEstimate,
    emotion: options?.emotion,
    timestamp: now,
  };

  try {
    await sendDataMessage('speech_state', event);

    // Send breath rate for avatar sync
    if (tracker.breathRateEstimate !== 15) {
      // Only if we have a real estimate
      await sendDataMessage('humanization_signal', {
        signalType: 'breath_sync',
        breathRate: tracker.breathRateEstimate,
        timestamp: now,
      });
    }

    log.debug(
      { sessionId, totalDurationMs, pauseCount: tracker.pauseCount, breathRate: tracker.breathRateEstimate },
      '🎭 Speech end dispatched'
    );
  } catch (error) {
    log.debug({ error: String(error) }, 'Speech end dispatch failed (non-fatal)');
  }
}

/**
 * Dispatch breath detected event
 * Called when breath pause detector identifies a breath
 */
export async function dispatchBreathDetected(
  sessionId: string,
  sendDataMessage: SendDataMessageFn,
  breathRate: number
): Promise<void> {
  const tracker = getTracker(sessionId);
  const now = Date.now();

  tracker.breathRateEstimate = breathRate;

  const event: SpeechStateEvent = {
    type: 'breath_detected',
    breathRate,
    timestamp: now,
  };

  try {
    await sendDataMessage('speech_state', event);

    // Also send to humanization system for avatar breath sync
    await sendDataMessage('humanization_signal', {
      signalType: 'breath_sync',
      breathRate,
      timestamp: now,
    });

    log.debug({ sessionId, breathRate }, '🎭 Breath detected → avatar will sync');
  } catch (error) {
    log.debug({ error: String(error) }, 'Breath dispatch failed (non-fatal)');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { getTracker as getSpeechStateTracker };
