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

import type { EmotionalArc } from '../../conversation/emotional-arc.js';
import {
  applyDynamicSpeedSsml,
  calculateDynamicSpeed,
  getSpeedTrend,
  recordSpeedDecision,
  resetSpeedControlSession,
  type SpeedControlContext,
  type SpeedControlResult,
} from '../../speech/adaptive-ssml/dynamic-speed-control.js';
import type { HumanListeningResult } from '../../speech/human-listening-pipeline/types.js';
import { getLogger } from '../../utils/safe-logger.js';

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
export function applyDynamicSpeed(text: string, options: DynamicSpeedOptions): SpeedAdjustedText {
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
  const cognitiveScore = cognitiveLevel === 'high' ? 0.8 : cognitiveLevel === 'medium' ? 0.5 : 0.3;
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
 * Persona speed profile - comprehensive speed behavior
 */
export interface PersonaSpeedProfile {
  /** Base speaking speed (1.0 = normal) */
  baseSpeed: number;

  /** How much to slow down for emotional content (0-1) */
  emotionalSlowdown: number;

  /** How much to slow down for complex content (0-1) */
  complexitySlowdown: number;

  /** Minimum speed floor */
  minSpeed: number;

  /** Maximum speed ceiling */
  maxSpeed: number;

  /** Extra pause probability (0-1) */
  pauseProbability: number;

  /** Personality traits affecting pacing */
  traits: {
    /** Reflective personas pause more between thoughts */
    reflective: number;
    /** Energetic personas maintain faster baseline */
    energetic: number;
    /** Empathetic personas slow down more for emotions */
    empathetic: number;
    /** Scholarly personas slow down more for complexity */
    scholarly: number;
  };
}

/**
 * Comprehensive persona speed profiles
 */
const PERSONA_SPEED_PROFILES: Record<string, PersonaSpeedProfile> = {
  ferni: {
    baseSpeed: 1.0,
    emotionalSlowdown: 0.15, // Moderate slowing for emotions
    complexitySlowdown: 0.1, // Slight slowing for complexity
    minSpeed: 0.85,
    maxSpeed: 1.15,
    pauseProbability: 0.3,
    traits: {
      reflective: 0.5,
      energetic: 0.5,
      empathetic: 0.7,
      scholarly: 0.4,
    },
  },

  peter: {
    baseSpeed: 0.95,
    emotionalSlowdown: 0.1, // Less emotional variation
    complexitySlowdown: 0.2, // More slowing for complex research topics
    minSpeed: 0.8,
    maxSpeed: 1.1,
    pauseProbability: 0.5, // More pauses for thinking
    traits: {
      reflective: 0.8,
      energetic: 0.3,
      empathetic: 0.5,
      scholarly: 0.9, // Very scholarly
    },
  },

  alex: {
    baseSpeed: 1.05,
    emotionalSlowdown: 0.12,
    complexitySlowdown: 0.08, // Keeps momentum even with complexity
    minSpeed: 0.9,
    maxSpeed: 1.2, // Can go faster
    pauseProbability: 0.2, // Fewer pauses
    traits: {
      reflective: 0.3,
      energetic: 0.9, // Very energetic
      empathetic: 0.6,
      scholarly: 0.5,
    },
  },

  maya: {
    baseSpeed: 1.0,
    emotionalSlowdown: 0.12,
    complexitySlowdown: 0.1,
    minSpeed: 0.85,
    maxSpeed: 1.15,
    pauseProbability: 0.35,
    traits: {
      reflective: 0.5,
      energetic: 0.5,
      empathetic: 0.6,
      scholarly: 0.4,
    },
  },

  jordan: {
    baseSpeed: 1.0,
    emotionalSlowdown: 0.15, // Event planning can be emotional
    complexitySlowdown: 0.12, // Details matter
    minSpeed: 0.85,
    maxSpeed: 1.15,
    pauseProbability: 0.3,
    traits: {
      reflective: 0.4,
      energetic: 0.6,
      empathetic: 0.7, // Celebrates with users
      scholarly: 0.3,
    },
  },

  nayan: {
    baseSpeed: 0.9, // Naturally slower
    emotionalSlowdown: 0.2, // Very responsive to emotions
    complexitySlowdown: 0.15, // Philosophical depth needs time
    minSpeed: 0.75, // Can go quite slow for wisdom
    maxSpeed: 1.05,
    pauseProbability: 0.6, // Many thoughtful pauses
    traits: {
      reflective: 0.95, // Highly reflective
      energetic: 0.2,
      empathetic: 0.8,
      scholarly: 0.7,
    },
  },
};

const DEFAULT_PROFILE: PersonaSpeedProfile = {
  baseSpeed: 1.0,
  emotionalSlowdown: 0.12,
  complexitySlowdown: 0.1,
  minSpeed: 0.85,
  maxSpeed: 1.15,
  pauseProbability: 0.3,
  traits: {
    reflective: 0.5,
    energetic: 0.5,
    empathetic: 0.5,
    scholarly: 0.5,
  },
};

/**
 * Get base speed for a persona
 * Different personas naturally speak at different paces
 */
export function getPersonaBaseSpeed(personaId: string): number {
  const profile = PERSONA_SPEED_PROFILES[personaId.toLowerCase()];
  return profile?.baseSpeed ?? DEFAULT_PROFILE.baseSpeed;
}

/**
 * Get full speed profile for a persona
 */
export function getPersonaSpeedProfile(personaId: string): PersonaSpeedProfile {
  return PERSONA_SPEED_PROFILES[personaId.toLowerCase()] ?? DEFAULT_PROFILE;
}

/**
 * Calculate persona-adjusted speed multiplier
 *
 * Takes into account:
 * - Base persona speed
 * - Persona traits (reflective, energetic, empathetic, scholarly)
 * - Content type (emotional, complex)
 * - Context (topic weight, turn number)
 */
export function calculatePersonaAdjustedSpeed(
  personaId: string,
  context: {
    emotionalIntensity: number;
    contentComplexity: number;
    topicWeight: 'light' | 'medium' | 'heavy';
    isQuestion?: boolean;
  }
): {
  speed: number;
  addPause: boolean;
  reason: string;
} {
  const profile = getPersonaSpeedProfile(personaId);
  let speed = profile.baseSpeed;
  const reasons: string[] = [];

  // Apply emotional slowdown weighted by empathy trait
  if (context.emotionalIntensity > 0.5) {
    const emotionAdjust =
      (context.emotionalIntensity - 0.5) *
      2 *
      profile.emotionalSlowdown *
      profile.traits.empathetic;
    speed -= emotionAdjust;
    if (emotionAdjust > 0.05) {
      reasons.push('emotional content');
    }
  }

  // Apply complexity slowdown weighted by scholarly trait
  if (context.contentComplexity > 0.5) {
    const complexAdjust =
      (context.contentComplexity - 0.5) * 2 * profile.complexitySlowdown * profile.traits.scholarly;
    speed -= complexAdjust;
    if (complexAdjust > 0.05) {
      reasons.push('complex content');
    }
  }

  // Topic weight adjustments
  if (context.topicWeight === 'heavy') {
    speed -= 0.05 * profile.traits.empathetic;
    reasons.push('heavy topic');
  } else if (context.topicWeight === 'light') {
    speed += 0.03 * profile.traits.energetic;
    reasons.push('light topic');
  }

  // Reflective personas slow slightly for questions
  if (context.isQuestion && profile.traits.reflective > 0.6) {
    speed -= 0.02;
    reasons.push('thoughtful question');
  }

  // Clamp to profile bounds
  speed = Math.max(profile.minSpeed, Math.min(profile.maxSpeed, speed));

  // Determine if pause should be added
  const pauseThreshold =
    profile.pauseProbability + context.emotionalIntensity * 0.2 + context.contentComplexity * 0.1;
  const addPause = Math.random() < pauseThreshold;

  return {
    speed,
    addPause,
    reason: reasons.length > 0 ? reasons.join(', ') : `${personaId} baseline`,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  applyDynamicSpeed,
  getSessionSpeedTrend,
  cleanupDynamicSpeed,
  getPersonaBaseSpeed,
  getPersonaSpeedProfile,
  calculatePersonaAdjustedSpeed,
};
