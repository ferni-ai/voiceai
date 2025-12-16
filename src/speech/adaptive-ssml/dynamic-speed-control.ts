/**
 * Dynamic Speed Control
 *
 * Real-time speech speed adjustment based on:
 * - User engagement level (from listening pipeline)
 * - Content complexity (from cognitive load detector)
 * - Emotional intensity (from emotional arc)
 * - User's speaking patterns (WPM mirroring)
 *
 * This enables Ferni to naturally adapt speaking pace to match
 * the conversation's needs - slowing down for complex or emotional
 * content, speeding up when the user is highly engaged.
 *
 * @module dynamic-speed-control
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger().child({ module: 'DynamicSpeedControl' });

// ============================================================================
// TYPES
// ============================================================================

export interface SpeedControlContext {
  /** User engagement level 0-1 (from engagement scorer) */
  userEngagement: number;
  /** Content complexity 0-1 (from cognitive load detector) */
  contentComplexity: number;
  /** Emotional intensity 0-1 (from emotional arc arousal) */
  emotionalIntensity: number;
  /** Base speed multiplier (persona default) */
  baseSpeed: number;
  /** User's recent WPM (optional, for mirroring) */
  userWPM?: number;
  /** Topic weight */
  topicWeight?: 'light' | 'medium' | 'heavy';
  /** Turn number in conversation */
  turnNumber?: number;
}

export interface SpeedControlResult {
  /** Final speed multiplier (0.7-1.3 range) */
  speedMultiplier: number;
  /** Individual contribution factors */
  factors: {
    engagement: number;
    complexity: number;
    emotion: number;
    wpmMirroring: number;
    topicWeight: number;
  };
  /** Human-readable reason for the speed */
  reason: string;
  /** Should add extra pauses? */
  addExtraPauses: boolean;
  /** Recommended pause duration multiplier */
  pauseMultiplier: number;
}

export interface SpeedControlConfig {
  /** Minimum speed multiplier */
  minSpeed: number;
  /** Maximum speed multiplier */
  maxSpeed: number;
  /** How much engagement affects speed (0-1) */
  engagementWeight: number;
  /** How much complexity affects speed (0-1) */
  complexityWeight: number;
  /** How much emotion affects speed (0-1) */
  emotionWeight: number;
  /** How much user WPM mirroring affects speed (0-1) */
  wpmMirroringWeight: number;
  /** Target WPM for "normal" speaking pace */
  targetWPM: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export const DEFAULT_SPEED_CONFIG: SpeedControlConfig = {
  minSpeed: 0.75,
  maxSpeed: 1.25,
  engagementWeight: 0.2,
  complexityWeight: 0.3,
  emotionWeight: 0.3,
  wpmMirroringWeight: 0.2,
  targetWPM: 150,
};

// Topic weight adjustments
const TOPIC_SPEED_ADJUSTMENTS: Record<string, number> = {
  light: 0.05, // Slightly faster for light topics
  medium: 0, // No adjustment
  heavy: -0.1, // Slower for heavy topics
};

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Calculate dynamic speed adjustment based on conversation context
 *
 * @param context - Current conversation context
 * @param config - Speed control configuration
 * @returns Speed control result with multiplier and reasons
 *
 * @example
 * ```typescript
 * const speedResult = calculateDynamicSpeed({
 *   userEngagement: 0.8,      // Highly engaged
 *   contentComplexity: 0.3,   // Low complexity
 *   emotionalIntensity: 0.4,  // Moderate emotion
 *   baseSpeed: 1.0,
 *   userWPM: 140,
 *   topicWeight: 'medium',
 * });
 *
 * // speedResult.speedMultiplier might be 1.05 (slightly faster)
 * ```
 */
export function calculateDynamicSpeed(
  context: SpeedControlContext,
  config: SpeedControlConfig = DEFAULT_SPEED_CONFIG
): SpeedControlResult {
  const {
    userEngagement,
    contentComplexity,
    emotionalIntensity,
    baseSpeed,
    userWPM,
    topicWeight = 'medium',
    turnNumber = 0,
  } = context;

  const reasons: string[] = [];
  let speedAdjustment = 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // FACTOR 1: User Engagement
  // High engagement → can speak slightly faster (user is following)
  // Low engagement → slow down to help them catch up
  // ═══════════════════════════════════════════════════════════════════════════

  const engagementFactor = (userEngagement - 0.5) * 2; // Normalize to -1 to 1
  const engagementAdjust = engagementFactor * config.engagementWeight * 0.15;
  speedAdjustment += engagementAdjust;

  if (userEngagement > 0.7) {
    reasons.push('high engagement');
  } else if (userEngagement < 0.4) {
    reasons.push('low engagement - slowing');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FACTOR 2: Content Complexity
  // High complexity → slow down significantly
  // Low complexity → slight speed up allowed
  // ═══════════════════════════════════════════════════════════════════════════

  // Complexity has asymmetric effect: high complexity slows more than low speeds up
  const complexityFactor =
    contentComplexity > 0.5
      ? -(contentComplexity - 0.5) * 2 // High complexity: negative (slow down)
      : (0.5 - contentComplexity) * 0.5; // Low complexity: slight positive

  const complexityAdjust = complexityFactor * config.complexityWeight * 0.2;
  speedAdjustment += complexityAdjust;

  if (contentComplexity > 0.7) {
    reasons.push('complex content - slowing');
  } else if (contentComplexity > 0.5) {
    reasons.push('moderate complexity');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FACTOR 3: Emotional Intensity
  // High emotion → slow down for weight and presence
  // Low emotion → neutral
  // ═══════════════════════════════════════════════════════════════════════════

  // Emotional content almost always benefits from slower pace
  const emotionFactor =
    emotionalIntensity > 0.5
      ? -(emotionalIntensity - 0.5) * 2 // High emotion: slow down
      : 0; // Low emotion: no change

  const emotionAdjust = emotionFactor * config.emotionWeight * 0.2;
  speedAdjustment += emotionAdjust;

  if (emotionalIntensity > 0.7) {
    reasons.push('high emotion - giving space');
  } else if (emotionalIntensity > 0.5) {
    reasons.push('emotional content');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FACTOR 4: WPM Mirroring
  // Match user's speaking pace slightly (builds rapport)
  // ═══════════════════════════════════════════════════════════════════════════

  let wpmFactor = 0;
  if (userWPM !== undefined && userWPM > 0) {
    // Calculate how much to adjust toward user's pace
    const wpmRatio = userWPM / config.targetWPM;
    // Limit the mirroring effect to avoid extreme speeds
    const clampedRatio = Math.max(0.8, Math.min(1.2, wpmRatio));
    wpmFactor = (clampedRatio - 1) * config.wpmMirroringWeight;
    speedAdjustment += wpmFactor;

    if (Math.abs(wpmFactor) > 0.03) {
      reasons.push(userWPM > config.targetWPM ? 'mirroring fast pace' : 'mirroring slow pace');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FACTOR 5: Topic Weight
  // Heavy topics need more gravitas → slower
  // ═══════════════════════════════════════════════════════════════════════════

  const topicAdjust = TOPIC_SPEED_ADJUSTMENTS[topicWeight] ?? 0;
  speedAdjustment += topicAdjust;

  if (topicWeight === 'heavy') {
    reasons.push('heavy topic');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FACTOR 6: Early Conversation
  // First few turns should be slightly slower (building rapport)
  // ═══════════════════════════════════════════════════════════════════════════

  if (turnNumber <= 3) {
    speedAdjustment -= 0.05;
    if (turnNumber === 1) {
      reasons.push('first turn - establishing rapport');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CALCULATE FINAL SPEED
  // ═══════════════════════════════════════════════════════════════════════════

  // Apply adjustment to base speed
  let finalSpeed = baseSpeed + speedAdjustment;

  // Clamp to valid range
  finalSpeed = Math.max(config.minSpeed, Math.min(config.maxSpeed, finalSpeed));

  // Determine if extra pauses should be added
  const addExtraPauses =
    contentComplexity > 0.6 || emotionalIntensity > 0.6 || topicWeight === 'heavy';

  // Calculate pause multiplier
  let pauseMultiplier = 1.0;
  if (contentComplexity > 0.5) pauseMultiplier += 0.2;
  if (emotionalIntensity > 0.5) pauseMultiplier += 0.3;
  if (topicWeight === 'heavy') pauseMultiplier += 0.2;

  const result: SpeedControlResult = {
    speedMultiplier: Number(finalSpeed.toFixed(3)),
    factors: {
      engagement: Number(engagementAdjust.toFixed(4)),
      complexity: Number(complexityAdjust.toFixed(4)),
      emotion: Number(emotionAdjust.toFixed(4)),
      wpmMirroring: Number(wpmFactor.toFixed(4)),
      topicWeight: topicAdjust,
    },
    reason: reasons.length > 0 ? reasons.join(', ') : 'normal pace',
    addExtraPauses,
    pauseMultiplier: Number(pauseMultiplier.toFixed(2)),
  };

  // Log significant speed adjustments
  if (Math.abs(finalSpeed - baseSpeed) > 0.05) {
    log.debug(
      {
        baseSpeed,
        finalSpeed: result.speedMultiplier,
        factors: result.factors,
        reason: result.reason,
      },
      '⏱️ Dynamic speed adjustment applied'
    );
  }

  return result;
}

// ============================================================================
// SSML APPLICATION
// ============================================================================

/**
 * Apply dynamic speed control to text as SSML
 *
 * @param text - The text to wrap with speed control
 * @param result - The speed control result
 * @returns SSML-wrapped text
 */
export function applyDynamicSpeedSsml(text: string, result: SpeedControlResult): string {
  let ssml = text;

  // Apply speed wrapper if significantly different from 1.0
  if (Math.abs(result.speedMultiplier - 1.0) > 0.02) {
    ssml = `<prosody rate="${Math.round(result.speedMultiplier * 100)}%">${ssml}</prosody>`;
  }

  // Add extra pauses if needed
  if (result.addExtraPauses) {
    const pauseMs = Math.round(150 * result.pauseMultiplier);
    // Add pauses after sentences
    ssml = ssml.replace(/([.!?])\s+/g, `$1 <break time="${pauseMs}ms"/> `);
  }

  return ssml;
}

// ============================================================================
// SESSION TRACKING
// ============================================================================

interface SpeedControlSession {
  sessionId: string;
  history: SpeedControlResult[];
  avgSpeed: number;
  turnCount: number;
}

const sessions = new Map<string, SpeedControlSession>();

/**
 * Get or create speed control session
 */
export function getSpeedControlSession(sessionId: string): SpeedControlSession {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      sessionId,
      history: [],
      avgSpeed: 1.0,
      turnCount: 0,
    });
  }
  return sessions.get(sessionId)!;
}

/**
 * Record a speed control decision for trend analysis
 */
export function recordSpeedDecision(sessionId: string, result: SpeedControlResult): void {
  const session = getSpeedControlSession(sessionId);
  session.history.push(result);
  session.turnCount++;

  // Keep last 20 decisions
  if (session.history.length > 20) {
    session.history.shift();
  }

  // Update average
  const speeds = session.history.map((h) => h.speedMultiplier);
  session.avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
}

/**
 * Get speed trend for a session
 */
export function getSpeedTrend(sessionId: string): {
  avgSpeed: number;
  trend: 'speeding_up' | 'slowing_down' | 'stable';
  turnCount: number;
} {
  const session = getSpeedControlSession(sessionId);

  if (session.history.length < 3) {
    return { avgSpeed: session.avgSpeed, trend: 'stable', turnCount: session.turnCount };
  }

  // Compare recent to older
  const recent = session.history.slice(-3);
  const older = session.history.slice(-6, -3);

  if (older.length === 0) {
    return { avgSpeed: session.avgSpeed, trend: 'stable', turnCount: session.turnCount };
  }

  const recentAvg = recent.reduce((a, b) => a + b.speedMultiplier, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b.speedMultiplier, 0) / older.length;

  let trend: 'speeding_up' | 'slowing_down' | 'stable' = 'stable';
  if (recentAvg - olderAvg > 0.05) {
    trend = 'speeding_up';
  } else if (olderAvg - recentAvg > 0.05) {
    trend = 'slowing_down';
  }

  return { avgSpeed: session.avgSpeed, trend, turnCount: session.turnCount };
}

/**
 * Reset speed control session
 */
export function resetSpeedControlSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/**
 * Reset all sessions
 */
export function resetAllSpeedControlSessions(): void {
  sessions.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  calculateDynamicSpeed,
  applyDynamicSpeedSsml,
  getSpeedControlSession,
  recordSpeedDecision,
  getSpeedTrend,
  resetSpeedControlSession,
  resetAllSpeedControlSessions,
  DEFAULT_SPEED_CONFIG,
};
