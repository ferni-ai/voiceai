/**
 * Dynamic Speed Control Integration for Voice Agent
 *
 * Integrates dynamic speech speed adjustment into the voice agent.
 * Automatically adjusts TTS speed based on:
 * - User engagement level
 * - Content complexity
 * - Emotional intensity
 * - User's speaking patterns
 *
 * @module dynamic-speed-integration
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  calculateDynamicSpeed,
  applyDynamicSpeedSsml,
  recordSpeedDecision,
  getSpeedTrend,
  resetSpeedControlSession,
  type SpeedControlContext,
  type SpeedControlResult,
} from '../../speech/adaptive-ssml/dynamic-speed-control.js';
import type { EmotionalArc } from '../../conversation/emotional-arc.js';
import type { HumanListeningResult } from '../../speech/human-listening-pipeline/types.js';

const log = getLogger().child({ module: 'DynamicSpeedIntegration' });

// ============================================================================
// TYPES
// ============================================================================

export interface DynamicSpeedOptions {
  /** Session ID for tracking */
  sessionId: string;
  /** Persona ID for persona-specific adjustments */
  personaId: string;
  /** Current emotional arc */
  emotionalArc?: EmotionalArc;
  /** Human listening analysis result */
  listeningResult?: HumanListeningResult;
  /** Topic weight */
  topicWeight?: 'light' | 'medium' | 'heavy';
  /** Turn number */
  turnNumber?: number;
  /** User's recent WPM (if known) */
  userWPM?: number;
  /** Base speed for persona (default 1.0) */
  baseSpeed?: number;
}

export interface SpeedAdjustedText {
  /** Original text */
  originalText: string;
  /** Text with SSML speed adjustments */
  ssmlText: string;
  /** Speed control result */
  speedResult: SpeedControlResult;
  /** Whether significant adjustment was made */
  wasAdjusted: boolean;
}

// ============================================================================
// MAIN INTEGRATION
// ============================================================================

/**
 * Calculate and apply dynamic speed to text
 *
 * @example
 * ```typescript
 * const adjusted = applyDynamicSpeed(
 *   "I understand how difficult this must be for you.",
 *   {
 *     sessionId,
 *     personaId: 'ferni',
 *     emotionalArc: tracker.getArc(),
 *     listeningResult: humanListeningResult,
 *     topicWeight: 'heavy',
 *     turnNumber: 5,
 *   }
 * );
 *
 * // Use adjusted.ssmlText for TTS
 * ```
 */
export function applyDynamicSpeed(
  text: string,
  options: DynamicSpeedOptions
): SpeedAdjustedText {
  const {
    sessionId,
    personaId,
    emotionalArc,
    listeningResult,
    topicWeight = 'medium',
    turnNumber = 0,
    userWPM,
    baseSpeed = 1.0,
  } = options;

  // Build speed control context from available data
  const context: SpeedControlContext = {
    // User engagement from listening result
    userEngagement: deriveEngagement(listeningResult),
    // Content complexity from listening result
    contentComplexity: deriveComplexity(listeningResult, text),
    // Emotional intensity from emotional arc
    emotionalIntensity: deriveEmotionalIntensity(emotionalArc),
    // Base speed (persona default)
    baseSpeed,
    // User's WPM for mirroring
    userWPM,
    // Topic weight
    topicWeight,
    // Turn number
    turnNumber,
  };

  // Calculate speed adjustment
  const speedResult = calculateDynamicSpeed(context);

  // Record decision for trend analysis
  recordSpeedDecision(sessionId, speedResult);

  // Apply SSML speed wrapper
  const ssmlText = applyDynamicSpeedSsml(text, speedResult);

  // Determine if significant adjustment was made
  const wasAdjusted = Math.abs(speedResult.speedMultiplier - 1.0) > 0.05;

  if (wasAdjusted) {
    log.debug(
      {
        sessionId,
        personaId,
        speed: speedResult.speedMultiplier,
        reason: speedResult.reason,
        addExtraPauses: speedResult.addExtraPauses,
      },
      '⏱️ Dynamic speed applied'
    );
  }

  return {
    originalText: text,
    ssmlText,
    speedResult,
    wasAdjusted,
  };
}

/**
 * Get speed trend for a session
 */
export function getSessionSpeedTrend(sessionId: string): {
  avgSpeed: number;
  trend: 'speeding_up' | 'slowing_down' | 'stable';
  turnCount: number;
} {
  return getSpeedTrend(sessionId);
}

/**
 * Clean up speed control for a session
 */
export function cleanupDynamicSpeed(sessionId: string): void {
  resetSpeedControlSession(sessionId);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Derive user engagement from listening result
 */
function deriveEngagement(listeningResult?: HumanListeningResult): number {
  if (!listeningResult) return 0.5; // Default moderate engagement

  // Extract numeric values from complex types
  // CognitiveLoadState has level ('low'|'medium'|'high'|'overloaded') and confidence
  const cognitiveLevel = listeningResult.text.cognitiveLoad?.level;
  const cognitiveScore =
    cognitiveLevel === 'high' ? 0.8 : cognitiveLevel === 'medium' ? 0.5 : 0.3;
  const selfSoothingConfidence = listeningResult.text.selfSoothing?.confidence ?? 0;
  // HedgingAnalysisResult has hedgingDensity and elevated flag
  const hedgingDensity = listeningResult.text.hedging?.hedgingDensity ?? 0;

  // Calculate engagement score
  let engagement = 0.5;

  // Cognitive load increases engagement (they're thinking)
  engagement += cognitiveScore * 0.2;

  // Self-soothing decreases (they need support, not speed)
  engagement -= selfSoothingConfidence * 0.3;

  // Hedging decreases (uncertainty) - normalize density to 0-1 range
  engagement -= Math.min(hedgingDensity / 20, 1) * 0.15;

  // Clamp to 0-1
  return Math.max(0, Math.min(1, engagement));
}

/**
 * Derive content complexity for our response
 */
function deriveComplexity(listeningResult?: HumanListeningResult, text?: string): number {
  let complexity = 0.3; // Default moderate-low

  // If user showed high cognitive load, our response should be simpler (slower)
  if (listeningResult) {
    const cognitiveLevel = listeningResult.text.cognitiveLoad?.level;
    if (cognitiveLevel === 'high' || cognitiveLevel === 'overloaded') {
      complexity += 0.2; // More complex situation = slow down
    }
  }

  // Text-based complexity estimation
  if (text) {
    // Longer text = higher complexity
    const wordCount = text.split(/\s+/).length;
    if (wordCount > 50) complexity += 0.2;
    else if (wordCount > 30) complexity += 0.1;

    // Questions increase complexity
    const questionCount = (text.match(/\?/g) || []).length;
    complexity += questionCount * 0.1;

    // Technical/complex words
    const complexWords = text.match(
      /\b(understand|consider|important|significant|however|therefore|specifically|particularly|essentially)\b/gi
    );
    if (complexWords && complexWords.length > 2) {
      complexity += 0.15;
    }
  }

  return Math.max(0, Math.min(1, complexity));
}

/**
 * Derive emotional intensity from emotional arc
 */
function deriveEmotionalIntensity(emotionalArc?: EmotionalArc): number {
  if (!emotionalArc) return 0.4; // Default moderate

  // Use arousal as primary indicator
  const arousal = emotionalArc.currentArousal;

  // Adjust for support needs
  if (emotionalArc.needsEmotionalSupport) {
    return Math.max(arousal, 0.6); // Ensure we slow down for support
  }

  // Adjust for distress
  if (emotionalArc.turnsSinceDistress < 3) {
    return Math.max(arousal, 0.7); // Recent distress = slow down
  }

  return arousal;
}

// ============================================================================
// PERSONA-SPECIFIC ADJUSTMENTS
// ============================================================================

/**
 * Get base speed for a persona
 * Different personas naturally speak at different paces
 */
export function getPersonaBaseSpeed(personaId: string): number {
  const PERSONA_SPEEDS: Record<string, number> = {
    ferni: 1.0,       // Balanced, warm
    peter: 0.95,      // Slightly slower (thoughtful, research-oriented)
    alex: 1.05,       // Slightly faster (energetic, communication-focused)
    maya: 1.0,        // Balanced (habits, routines)
    jordan: 1.0,      // Balanced (event planning)
    nayan: 0.9,       // Slower (wisdom, philosophy)
  };

  return PERSONA_SPEEDS[personaId.toLowerCase()] ?? 1.0;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  applyDynamicSpeed,
  getSessionSpeedTrend,
  cleanupDynamicSpeed,
  getPersonaBaseSpeed,
};
