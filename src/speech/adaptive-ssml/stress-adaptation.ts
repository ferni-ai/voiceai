/**
 * Stress Auto-Adaptation
 *
 * Detects user stress from audio signals and gradually modulates TTS parameters
 * (slower pace, calming tone, longer pauses) over 2-3 turns.
 *
 * Key principle: The user should NOT consciously notice the adaptation.
 * Changes should feel natural, not robotic or clinical.
 *
 * @module StressAdaptation
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { BreathType } from '../breath-detection.js';

const log = createLogger({ module: 'StressAdaptation' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * A single stress reading from one turn
 */
export interface StressReading {
  /** Timestamp of the reading */
  timestamp: number;

  /** Stress level (0-1) from calculateStressLevel() */
  stressLevel: number;

  /** Whether anxiety markers were detected */
  anxietyMarkers: boolean;

  /** Breath pattern type */
  breathPattern: BreathType;

  /** Whether voice tremor was detected */
  voiceTremor: boolean;

  /** Concern level from concern-detection.ts */
  concernLevel: 'none' | 'mild' | 'moderate' | 'high' | 'crisis';
}

/**
 * TTS adjustments to apply based on stress level
 */
export interface StressAdaptation {
  /** Speed multiplier (0.75-1.0, slower when stressed) */
  speedMultiplier: number;

  /** Pause multiplier (1.0-2.0, longer pauses when stressed) */
  pauseMultiplier: number;

  /** Warmth level for emotional tone */
  warmthLevel: 'high' | 'medium' | 'normal';

  /** Cartesia emotion to use */
  emotion: string;

  /** Whether to add verbal acknowledgment (rare, only for high stress) */
  shouldAcknowledge: boolean;

  /** Current adaptation level (0-1) for monitoring */
  adaptationLevel: number;

  /** Explanation of current adaptation */
  reason: string;
}

/**
 * Internal state for the stress adaptation engine
 */
interface StressAdaptationState {
  /** Session ID */
  sessionId: string;

  /** History of stress readings (last N) */
  stressHistory: StressReading[];

  /** Current adaptation level (0-1) */
  adaptationLevel: number;

  /** Turns spent at current level */
  turnsAtCurrentLevel: number;

  /** Timestamp of last adaptation change */
  lastAdaptationChange: number;

  /** Whether we're in active stress adaptation mode */
  isActive: boolean;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Tunable configuration for stress adaptation behavior
 */
export const STRESS_ADAPTATION_CONFIG = {
  /** Maximum readings to keep in history */
  MAX_HISTORY: 10,

  /** Maximum adaptation change per turn (prevents jarring shifts) */
  MAX_RAMP_UP_PER_TURN: 0.15,
  MAX_RAMP_DOWN_PER_TURN: 0.1,

  /** Minimum stress change to trigger adaptation change (hysteresis) */
  HYSTERESIS_THRESHOLD: 0.1,

  /** Minimum turns between significant adaptation changes */
  COOLDOWN_TURNS: 2,

  /** Stress level thresholds */
  STRESS_MILD: 0.3,
  STRESS_MODERATE: 0.5,
  STRESS_HIGH: 0.7,

  /** Weights for different stress signals */
  WEIGHTS: {
    stressLevel: 0.35,
    anxietyMarkers: 0.2,
    breathPattern: 0.2,
    voiceTremor: 0.15,
    concernLevel: 0.1,
  },

  /** Speed adjustments by adaptation level */
  SPEED: {
    NONE: 1.0,
    MILD: 0.95,
    MODERATE: 0.88,
    HIGH: 0.8,
  },

  /** Pause adjustments by adaptation level */
  PAUSE: {
    NONE: 1.0,
    MILD: 1.15,
    MODERATE: 1.35,
    HIGH: 1.6,
  },
};

// ============================================================================
// BREATH PATTERN STRESS MAPPING
// ============================================================================

/**
 * Map breath patterns to stress contribution (0-1)
 */
function getBreathStressContribution(breathPattern: BreathType): number {
  switch (breathPattern) {
    case 'shaky':
      return 0.9; // High stress indicator
    case 'held':
      return 0.7; // Bracing for something
    case 'gasp':
      return 0.6; // Surprise/stress
    case 'sigh':
      return 0.4; // Some stress, or release
    case 'deep':
      return 0.2; // Gathering courage, mild stress
    case 'release':
      return 0.1; // Letting go, low stress
    case 'normal':
    default:
      return 0.0;
  }
}

/**
 * Map concern level to stress contribution (0-1)
 */
function getConcernStressContribution(
  concernLevel: 'none' | 'mild' | 'moderate' | 'high' | 'crisis'
): number {
  switch (concernLevel) {
    case 'crisis':
      return 1.0;
    case 'high':
      return 0.8;
    case 'moderate':
      return 0.5;
    case 'mild':
      return 0.25;
    case 'none':
    default:
      return 0.0;
  }
}

// ============================================================================
// STRESS ADAPTATION ENGINE
// ============================================================================

/**
 * Session-scoped stress adaptation engines
 */
const engines = new Map<string, StressAdaptationState>();

/**
 * Get or create the stress adaptation engine for a session
 */
export function getStressAdaptationEngine(sessionId: string): StressAdaptationState {
  if (!engines.has(sessionId)) {
    engines.set(sessionId, {
      sessionId,
      stressHistory: [],
      adaptationLevel: 0,
      turnsAtCurrentLevel: 0,
      lastAdaptationChange: Date.now(),
      isActive: false,
    });
  }
  return engines.get(sessionId)!;
}

/**
 * Reset the stress adaptation engine for a session
 */
export function resetStressAdaptationEngine(sessionId: string): void {
  const engine = engines.get(sessionId);
  if (engine) {
    log.debug({ sessionId, finalLevel: engine.adaptationLevel }, 'Resetting stress adaptation');
  }
  engines.delete(sessionId);
}

/**
 * Get count of active engines (for monitoring)
 */
export function getActiveStressAdaptationCount(): number {
  return engines.size;
}

// ============================================================================
// STRESS RECORDING & CALCULATION
// ============================================================================

/**
 * Record a new stress reading from the current turn
 */
export function recordStressReading(sessionId: string, reading: StressReading): void {
  const engine = getStressAdaptationEngine(sessionId);

  // Add to history
  engine.stressHistory.push(reading);

  // Trim old readings
  if (engine.stressHistory.length > STRESS_ADAPTATION_CONFIG.MAX_HISTORY) {
    engine.stressHistory = engine.stressHistory.slice(-STRESS_ADAPTATION_CONFIG.MAX_HISTORY);
  }

  log.debug(
    {
      sessionId,
      stressLevel: reading.stressLevel.toFixed(2),
      anxietyMarkers: reading.anxietyMarkers,
      breathPattern: reading.breathPattern,
      historyLength: engine.stressHistory.length,
    },
    'Recorded stress reading'
  );
}

/**
 * Calculate weighted stress score from a reading
 */
function calculateWeightedStress(reading: StressReading): number {
  const { WEIGHTS } = STRESS_ADAPTATION_CONFIG;

  const breathContribution = getBreathStressContribution(reading.breathPattern);
  const concernContribution = getConcernStressContribution(reading.concernLevel);

  return (
    reading.stressLevel * WEIGHTS.stressLevel +
    (reading.anxietyMarkers ? 1 : 0) * WEIGHTS.anxietyMarkers +
    breathContribution * WEIGHTS.breathPattern +
    (reading.voiceTremor ? 1 : 0) * WEIGHTS.voiceTremor +
    concernContribution * WEIGHTS.concernLevel
  );
}

/**
 * Calculate the target adaptation level from stress history
 */
function calculateTargetAdaptation(engine: StressAdaptationState): number {
  if (engine.stressHistory.length === 0) {
    return 0;
  }

  // Weight recent readings more heavily (exponential decay)
  const readings = engine.stressHistory;
  let weightedSum = 0;
  let totalWeight = 0;

  for (let i = 0; i < readings.length; i++) {
    // More recent readings have higher weight
    const recencyWeight = Math.pow(2, i - readings.length + 1);
    const stressScore = calculateWeightedStress(readings[i]);
    weightedSum += stressScore * recencyWeight;
    totalWeight += recencyWeight;
  }

  const averageStress = weightedSum / totalWeight;

  // Map to adaptation level (0-1)
  // Use a soft threshold to avoid jarring on/off behavior
  if (averageStress < STRESS_ADAPTATION_CONFIG.STRESS_MILD) {
    return 0;
  } else if (averageStress < STRESS_ADAPTATION_CONFIG.STRESS_MODERATE) {
    // Linear interpolation in mild zone
    const t =
      (averageStress - STRESS_ADAPTATION_CONFIG.STRESS_MILD) /
      (STRESS_ADAPTATION_CONFIG.STRESS_MODERATE - STRESS_ADAPTATION_CONFIG.STRESS_MILD);
    return t * 0.4; // 0 to 0.4
  } else if (averageStress < STRESS_ADAPTATION_CONFIG.STRESS_HIGH) {
    // Linear interpolation in moderate zone
    const t =
      (averageStress - STRESS_ADAPTATION_CONFIG.STRESS_MODERATE) /
      (STRESS_ADAPTATION_CONFIG.STRESS_HIGH - STRESS_ADAPTATION_CONFIG.STRESS_MODERATE);
    return 0.4 + t * 0.35; // 0.4 to 0.75
  } else {
    // High stress zone
    const t = Math.min(1, (averageStress - STRESS_ADAPTATION_CONFIG.STRESS_HIGH) / 0.3);
    return 0.75 + t * 0.25; // 0.75 to 1.0
  }
}

// ============================================================================
// ADAPTATION CALCULATION
// ============================================================================

/**
 * Calculate the current stress adaptation to apply
 */
export function calculateStressAdaptation(sessionId: string): StressAdaptation {
  const engine = getStressAdaptationEngine(sessionId);

  // Calculate target adaptation level
  const targetLevel = calculateTargetAdaptation(engine);

  // Apply gradual ramping with hysteresis
  let newLevel = engine.adaptationLevel;
  const delta = targetLevel - engine.adaptationLevel;

  // Check hysteresis - don't change for small differences
  if (Math.abs(delta) > STRESS_ADAPTATION_CONFIG.HYSTERESIS_THRESHOLD) {
    // Check cooldown
    const turnsSinceChange = engine.turnsAtCurrentLevel;

    if (turnsSinceChange >= STRESS_ADAPTATION_CONFIG.COOLDOWN_TURNS) {
      // Apply gradual change
      if (delta > 0) {
        // Ramping up (detecting stress)
        newLevel = Math.min(
          targetLevel,
          engine.adaptationLevel + STRESS_ADAPTATION_CONFIG.MAX_RAMP_UP_PER_TURN
        );
      } else {
        // Ramping down (stress decreasing)
        newLevel = Math.max(
          targetLevel,
          engine.adaptationLevel - STRESS_ADAPTATION_CONFIG.MAX_RAMP_DOWN_PER_TURN
        );
      }

      // Update state if level changed
      if (Math.abs(newLevel - engine.adaptationLevel) > 0.01) {
        engine.adaptationLevel = newLevel;
        engine.turnsAtCurrentLevel = 0;
        engine.lastAdaptationChange = Date.now();
        engine.isActive = newLevel > 0.1;

        log.info(
          {
            sessionId,
            previousLevel: (newLevel - delta).toFixed(2),
            newLevel: newLevel.toFixed(2),
            targetLevel: targetLevel.toFixed(2),
          },
          'Stress adaptation level changed'
        );
      }
    }
  }

  // Increment turns at current level
  engine.turnsAtCurrentLevel++;

  // Calculate TTS parameters from adaptation level
  return adaptationLevelToParams(newLevel);
}

/**
 * Convert adaptation level (0-1) to TTS parameters
 */
function adaptationLevelToParams(level: number): StressAdaptation {
  const { SPEED, PAUSE } = STRESS_ADAPTATION_CONFIG;

  // Speed: interpolate from 1.0 to 0.80
  const speedMultiplier = SPEED.NONE - level * (SPEED.NONE - SPEED.HIGH);

  // Pause: interpolate from 1.0 to 1.6
  const pauseMultiplier = PAUSE.NONE + level * (PAUSE.HIGH - PAUSE.NONE);

  // Warmth level
  let warmthLevel: 'high' | 'medium' | 'normal';
  if (level > 0.6) {
    warmthLevel = 'high';
  } else if (level > 0.3) {
    warmthLevel = 'medium';
  } else {
    warmthLevel = 'normal';
  }

  // Emotion selection
  let emotion: string;
  if (level > 0.7) {
    emotion = 'serene'; // Very calming for high stress
  } else if (level > 0.4) {
    emotion = 'calm'; // Grounding for moderate stress
  } else if (level > 0.1) {
    emotion = 'affectionate'; // Warm for mild stress
  } else {
    emotion = ''; // No override
  }

  // Only acknowledge verbally for very high stress levels
  const shouldAcknowledge = level > 0.85;

  // Build reason string
  let reason: string;
  if (level < 0.1) {
    reason = 'no stress detected';
  } else if (level < 0.4) {
    reason = 'mild stress - slight pace adjustment';
  } else if (level < 0.7) {
    reason = 'moderate stress - calming voice';
  } else {
    reason = 'high stress - full calming mode';
  }

  return {
    speedMultiplier: Math.round(speedMultiplier * 100) / 100,
    pauseMultiplier: Math.round(pauseMultiplier * 100) / 100,
    warmthLevel,
    emotion,
    shouldAcknowledge,
    adaptationLevel: level,
    reason,
  };
}

// ============================================================================
// SSML APPLICATION
// ============================================================================

/**
 * Apply stress adaptation to SSML text
 */
export function applyStressAdaptationSsml(text: string, adaptation: StressAdaptation): string {
  // Skip if no adaptation needed
  if (adaptation.adaptationLevel < 0.1) {
    return text;
  }

  let result = text;

  // Apply speed adjustment if not already present
  if (!result.includes('<speed ratio=') && adaptation.speedMultiplier < 0.98) {
    result = `<speed ratio="${adaptation.speedMultiplier.toFixed(2)}"/>${result}`;
  }

  // Apply emotion if specified and not already present
  if (adaptation.emotion && !result.includes('<emotion')) {
    result = `<emotion value="${adaptation.emotion}">${result}</emotion>`;
  }

  // Extend existing pauses by the multiplier
  if (adaptation.pauseMultiplier > 1.05) {
    result = result.replace(/<break time="(\d+)ms"\/>/g, (_match, ms) => {
      const extended = Math.round(parseInt(ms) * adaptation.pauseMultiplier);
      return `<break time="${extended}ms"/>`;
    });

    // Also extend sentence-ending pauses
    result = result.replace(
      /\. /g,
      `.<break time="${Math.round(300 * adaptation.pauseMultiplier)}ms"/> `
    );
  }

  log.debug(
    {
      adaptationLevel: adaptation.adaptationLevel.toFixed(2),
      speed: adaptation.speedMultiplier,
      pause: adaptation.pauseMultiplier,
      emotion: adaptation.emotion || 'none',
    },
    'Applied stress adaptation to SSML'
  );

  return result;
}

// ============================================================================
// MONITORING & DIAGNOSTICS
// ============================================================================

/**
 * Get current stress adaptation state for monitoring
 */
export function getStressAdaptationState(sessionId: string): {
  isActive: boolean;
  adaptationLevel: number;
  historyLength: number;
  turnsAtCurrentLevel: number;
  lastReading: StressReading | null;
} | null {
  const engine = engines.get(sessionId);
  if (!engine) {
    return null;
  }

  return {
    isActive: engine.isActive,
    adaptationLevel: engine.adaptationLevel,
    historyLength: engine.stressHistory.length,
    turnsAtCurrentLevel: engine.turnsAtCurrentLevel,
    lastReading: engine.stressHistory[engine.stressHistory.length - 1] ?? null,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const stressAdaptation = {
  getEngine: getStressAdaptationEngine,
  reset: resetStressAdaptationEngine,
  record: recordStressReading,
  calculate: calculateStressAdaptation,
  apply: applyStressAdaptationSsml,
  getState: getStressAdaptationState,
  getActiveCount: getActiveStressAdaptationCount,
  config: STRESS_ADAPTATION_CONFIG,
};
