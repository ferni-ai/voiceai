/**
 * Speech Context
 *
 * Provides context for adaptive SSML generation.
 * Tracks user speaking patterns and adapts agent speech accordingly.
 *
 * PERSONA-AWARE: Now incorporates per-persona speech characteristics
 * so each agent sounds distinctly different (pacing, pauses, energy).
 */

import type { ConversationPhase } from '../intelligence/conversation-state.js';
import type { EmotionResult } from '../intelligence/emotion-detector.js';
import type { SpeechCharacteristics } from '../personas/types.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * User energy level
 */
export type EnergyLevel = 'low' | 'medium' | 'high';

/**
 * Topic emotional weight
 */
export type TopicWeight = 'light' | 'medium' | 'heavy';

/**
 * Speech context for SSML adaptation
 */
export interface SpeechContext {
  // User speech patterns
  userWPM: number;
  userEnergy: EnergyLevel;
  userEmotion: string;

  // Conversation context
  conversationPhase: ConversationPhase;
  topicWeight: TopicWeight;
  turnCount: number;

  // Adaptation parameters (calculated)
  baseSpeed: number; // 0.7 - 1.0
  energyMultiplier: number; // 0.9 - 1.1
  allowLaughter: boolean;
  pauseMultiplier: number; // 1.0 - 1.5
  emotionIntensity: number; // 0.5 - 1.0
}

// ============================================================================
// WPM TRACKER
// ============================================================================

/**
 * Tracks user words per minute from transcriptions
 */
export class WPMTracker {
  private samples: Array<{ wordCount: number; durationMs: number }> = [];
  private maxSamples = 10;

  /**
   * Add a speech sample
   */
  addSample(text: string, durationMs: number): void {
    if (durationMs <= 0) return;

    const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
    this.samples.push({ wordCount, durationMs });

    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  /**
   * Calculate average WPM
   */
  getAverageWPM(): number {
    if (this.samples.length === 0) return 150; // Default

    const totalWords = this.samples.reduce((sum, s) => sum + s.wordCount, 0);
    const totalMinutes = this.samples.reduce((sum, s) => sum + s.durationMs, 0) / 60000;

    if (totalMinutes === 0) return 150;

    return Math.round(totalWords / totalMinutes);
  }

  /**
   * Classify speaking pace
   */
  getSpeedCategory(): 'slow' | 'moderate' | 'fast' {
    const wpm = this.getAverageWPM();
    if (wpm < 120) return 'slow';
    if (wpm > 180) return 'fast';
    return 'moderate';
  }

  /**
   * Clear samples
   */
  clear(): void {
    this.samples = [];
  }
}

// ============================================================================
// ENERGY DETECTOR
// ============================================================================

/**
 * Detect user energy level from text patterns
 */
export function detectEnergyLevel(text: string): EnergyLevel {
  const lowerText = text.toLowerCase();

  // High energy indicators
  const highEnergy = [
    /!{2,}/, // Multiple exclamation marks
    /\b(excited|amazing|awesome|incredible|fantastic|love|great)\b/i,
    /\b(can't wait|so happy|thrilled|pumped)\b/i,
  ];

  // Low energy indicators
  const lowEnergy = [
    /\b(tired|exhausted|drained|overwhelmed|down|sad|depressed)\b/i,
    /\b(can't|don't want to|no energy|barely)\b/i,
    /\.{3,}/, // Trailing ellipses
    /^(yeah|okay|fine|sure|whatever)\.?$/i, // Minimal responses
  ];

  let highScore = 0;
  let lowScore = 0;

  for (const pattern of highEnergy) {
    if (pattern.test(text)) highScore++;
  }

  for (const pattern of lowEnergy) {
    if (pattern.test(lowerText)) lowScore++;
  }

  // Short responses suggest lower energy
  if (text.split(/\s+/).length < 5) {
    lowScore += 0.5;
  }

  // Long enthusiastic responses suggest higher energy
  if (text.split(/\s+/).length > 20 && text.includes('!')) {
    highScore += 0.5;
  }

  if (highScore > lowScore + 1) return 'high';
  if (lowScore > highScore + 1) return 'low';
  return 'medium';
}

/**
 * Determine topic weight from emotion and topic
 */
export function determineTopicWeight(emotion?: EmotionResult, topics?: string[]): TopicWeight {
  // Heavy topics
  const heavyTopics = [
    'grief',
    'loss',
    'death',
    'illness',
    'anxiety',
    'depression',
    'debt',
    'failure',
  ];
  const lightTopics = ['vacation', 'celebration', 'success', 'achievement', 'family', 'hobbies'];

  // Check emotion first
  if (emotion) {
    if (emotion.distressLevel > 0.6) return 'heavy';
    if (emotion.valence === 'negative' && emotion.intensity > 0.7) return 'heavy';
    if (emotion.valence === 'positive' && emotion.intensity > 0.7) return 'light';
  }

  // Check topics
  if (topics) {
    for (const topic of topics) {
      const lowerTopic = topic.toLowerCase();
      if (heavyTopics.some((t) => lowerTopic.includes(t))) return 'heavy';
      if (lightTopics.some((t) => lowerTopic.includes(t))) return 'light';
    }
  }

  return 'medium';
}

// ============================================================================
// DEFAULT SPEECH CHARACTERISTICS BY PERSONA TYPE
// ============================================================================

/**
 * Default speech characteristics for different persona archetypes.
 * Used when a persona doesn't define custom speechCharacteristics.
 */
export const DEFAULT_SPEECH_CHARACTERISTICS: Record<string, SpeechCharacteristics> = {
  // Wise grandfather - measured, deliberate, contemplative
  measured: {
    baseSpeedMultiplier: 0.72,
    pauseMultiplier: 1.4,
    speedVariation: 0.08,
    thinkingSoundFrequency: 0.6,
    emphasisStyle: 'subtle',
    sentenceEndingStyle: 'falling',
    minimumEnergy: 0.75,
    maximumEnergy: 1.05,
  },
  // Energetic storyteller - fast, animated, dynamic
  energetic: {
    baseSpeedMultiplier: 1.02,
    pauseMultiplier: 0.75,
    speedVariation: 0.25,
    thinkingSoundFrequency: 0.15,
    emphasisStyle: 'pronounced',
    sentenceEndingStyle: 'rising',
    minimumEnergy: 0.95,
    maximumEnergy: 1.25,
  },
  // Warm conversationalist - natural, balanced, warm
  conversational: {
    baseSpeedMultiplier: 0.88,
    pauseMultiplier: 1.0,
    speedVariation: 0.15,
    thinkingSoundFrequency: 0.3,
    emphasisStyle: 'moderate',
    sentenceEndingStyle: 'natural',
    minimumEnergy: 0.85,
    maximumEnergy: 1.15,
  },
};

/**
 * Derive speech characteristics from persona energy level.
 * Falls back to this when speechCharacteristics isn't defined.
 */
export function deriveSpeechCharacteristicsFromEnergy(energy: number): SpeechCharacteristics {
  // energy is 0-1, where 0 = calm/measured, 1 = high energy
  if (energy <= 0.4) {
    return DEFAULT_SPEECH_CHARACTERISTICS['measured'];
  } else if (energy >= 0.8) {
    return DEFAULT_SPEECH_CHARACTERISTICS['energetic'];
  } else {
    return DEFAULT_SPEECH_CHARACTERISTICS['conversational'];
  }
}

// ============================================================================
// SPEECH CONTEXT BUILDER
// ============================================================================

/**
 * Build speech context from available information.
 *
 * PERSONA-AWARE: Now accepts optional speechCharacteristics to make
 * each persona sound distinctly different.
 */
export function buildSpeechContext(input: {
  userWPM?: number;
  userText?: string;
  emotion?: EmotionResult;
  /** User's emotional state for voice tone matching (sad, happy, stressed, etc.) */
  userEmotion?: string;
  phase?: ConversationPhase;
  topics?: string[];
  turnCount?: number;
  /** Persona-specific speech characteristics for distinct voice pacing */
  personaSpeech?: SpeechCharacteristics;
  /** Fallback: persona energy level (0-1) to derive speech characteristics */
  personaEnergy?: number;
}): SpeechContext {
  // Get persona speech characteristics (or derive from energy, or use default)
  const personaSpeech =
    input.personaSpeech ??
    (input.personaEnergy !== undefined
      ? deriveSpeechCharacteristicsFromEnergy(input.personaEnergy)
      : DEFAULT_SPEECH_CHARACTERISTICS['conversational']);

  // Determine user energy
  const userEnergy = input.userText ? detectEnergyLevel(input.userText) : 'medium';

  // Determine topic weight
  const topicWeight = determineTopicWeight(input.emotion, input.topics);

  // Calculate base speed from user WPM AND persona characteristics
  const userWPM = input.userWPM || 150;
  let baseSpeed: number;

  // Start with persona's base speed
  const personaBaseSpeed = personaSpeech.baseSpeedMultiplier;

  // Adjust for user's speaking pace (mirror within persona's range)
  if (userWPM < 120) {
    // Slow user - slow down but stay within persona's style
    baseSpeed = personaBaseSpeed * 0.92;
  } else if (userWPM < 150) {
    // Moderate user - slight adjustment
    baseSpeed = personaBaseSpeed * 0.96;
  } else if (userWPM < 180) {
    // Normal user - use persona's natural pace
    baseSpeed = personaBaseSpeed;
  } else {
    // Fast user - speed up but cap by persona's max energy
    const speedBoost = 1.0 + personaSpeech.speedVariation;
    baseSpeed = Math.min(personaBaseSpeed * speedBoost, personaSpeech.maximumEnergy);
  }

  // Adjust for conversation phase (but respect persona's style)
  const phase = input.phase || 'exploring';
  const phaseMultiplier = getPhaseSpeedMultiplier(phase, personaSpeech);
  baseSpeed *= phaseMultiplier;

  // Calculate energy multiplier (mirror user energy, constrained by persona)
  // FIX BUG #voice-19: Ensure energyMultiplier stays within safe bounds
  const ENERGY_MIN = 0.8;
  const ENERGY_MAX = 1.3;

  let energyMultiplier: number;
  switch (userEnergy) {
    case 'low':
      // Mirror low energy, but not below persona's minimum
      energyMultiplier = Math.max(0.92, personaSpeech.minimumEnergy / personaBaseSpeed);
      break;
    case 'high': {
      // Mirror high energy, but not above persona's maximum
      const highMultiplier = 1.0 + personaSpeech.speedVariation;
      energyMultiplier = Math.min(highMultiplier, personaSpeech.maximumEnergy / personaBaseSpeed);
      break;
    }
    default:
      energyMultiplier = 1.0;
  }

  // FIX BUG #voice-19: Final bounds check to prevent extreme values
  energyMultiplier = Math.max(ENERGY_MIN, Math.min(ENERGY_MAX, energyMultiplier));

  // Determine if laughter is appropriate
  const allowLaughter =
    topicWeight !== 'heavy' && phase !== 'supporting' && input.emotion?.valence !== 'negative';

  // Calculate pause multiplier (incorporate persona's base pause style)
  let { pauseMultiplier } = personaSpeech;
  if (topicWeight === 'heavy') {
    pauseMultiplier *= 1.25; // Add pauses for heavy topics
  } else if (phase === 'supporting') {
    pauseMultiplier *= 1.2; // Add pauses for support
  } else if (userEnergy === 'low') {
    pauseMultiplier *= 1.1; // Slightly longer pauses for low energy users
  }

  // Calculate emotion intensity for SSML (varies by persona emphasis style)
  let emotionIntensity: number;
  switch (personaSpeech.emphasisStyle) {
    case 'subtle':
      emotionIntensity = 0.6;
      break;
    case 'pronounced':
      emotionIntensity = 0.9;
      break;
    default:
      emotionIntensity = 0.75;
  }

  // Adjust for user emotional state
  if (input.emotion) {
    if (input.emotion.distressLevel > 0.5) {
      emotionIntensity *= 0.7; // Gentle when distressed
    } else if (input.emotion.valence === 'positive') {
      emotionIntensity = Math.min(1.0, emotionIntensity * 1.1);
    }
  }

  // Clamp base speed to reasonable bounds (but respect persona's range)
  const minSpeed = Math.max(0.65, personaSpeech.minimumEnergy * 0.7);
  const maxSpeed = Math.min(1.15, personaSpeech.maximumEnergy * 1.1);

  return {
    userWPM,
    userEnergy,
    // Use explicitly passed userEmotion (tracked from user's speech) or fall back to current text emotion
    userEmotion: input.userEmotion || input.emotion?.primary || 'neutral',
    conversationPhase: phase,
    topicWeight,
    turnCount: input.turnCount || 0,
    baseSpeed: Math.max(minSpeed, Math.min(maxSpeed, baseSpeed)),
    energyMultiplier,
    allowLaughter,
    pauseMultiplier,
    emotionIntensity,
  };
}

/**
 * Get speed multiplier for conversation phase, respecting persona style.
 * Energetic personas slow down less during supportive phases.
 * Measured personas slow down more deliberately.
 */
function getPhaseSpeedMultiplier(
  phase: ConversationPhase,
  personaSpeech: SpeechCharacteristics
): number {
  const isEnergetic = personaSpeech.baseSpeedMultiplier >= 0.95;
  const isMeasured = personaSpeech.baseSpeedMultiplier <= 0.75;

  switch (phase) {
    case 'greeting':
    case 'warming_up':
      // Measured personas don't need to slow more; energetic personas slow a bit
      return isEnergetic ? 0.92 : isMeasured ? 1.0 : 0.95;
    case 'supporting':
      // Everyone slows for emotional support, but proportionally
      return isEnergetic ? 0.88 : isMeasured ? 0.95 : 0.9;
    case 'advising':
      // Measured personas stay steady; energetic slow to be clear
      return isEnergetic ? 0.9 : isMeasured ? 1.0 : 0.95;
    case 'wrapping_up':
      // Warm and unhurried for all
      return isEnergetic ? 0.92 : isMeasured ? 0.98 : 0.95;
    default:
      return 1.0;
  }
}

// ============================================================================
// SESSION-SCOPED WPM TRACKING
// ============================================================================

/**
 * Session-scoped WPM tracker map.
 * FIX BUG #voice-11: Per-session tracking instead of global singleton.
 */
const sessionWPMTrackers = new Map<string, WPMTracker>();

/**
 * Get or create a WPM tracker for a specific session
 */
export function getSessionWPMTracker(sessionId: string): WPMTracker {
  let tracker = sessionWPMTrackers.get(sessionId);
  if (!tracker) {
    tracker = new WPMTracker();
    sessionWPMTrackers.set(sessionId, tracker);
  }
  return tracker;
}

/**
 * Remove a session's WPM tracker (on session end)
 */
/**
 * Reset and remove a session's WPM tracker
 */
export function removeSessionWPMTracker(sessionId: string): void {
  sessionWPMTrackers.delete(sessionId);
}

/**
 * Alias for removeSessionWPMTracker (preferred naming)
 */
export const resetSessionWPMTracker = removeSessionWPMTracker;

// ============================================================================
// LEGACY COMPATIBILITY (Remove after all callers migrated)
// ============================================================================

/**
 * Get or create a global WPM tracker.
 *
 * @deprecated Use getSessionWPMTracker(sessionId) for proper session isolation.
 * This function creates a tracker with a synthetic session ID.
 */
export function getWPMTracker(): WPMTracker {
  return getSessionWPMTracker('__global__');
}

export default {
  buildSpeechContext,
  detectEnergyLevel,
  determineTopicWeight,
  WPMTracker,
  getWPMTracker,
  getSessionWPMTracker,
  removeSessionWPMTracker,
};
