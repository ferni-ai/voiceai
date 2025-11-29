/**
 * Speech Context
 *
 * Provides context for adaptive SSML generation.
 * Tracks user speaking patterns and adapts agent speech accordingly.
 */

import { log } from '@livekit/agents';
import type { ConversationPhase } from '../intelligence/conversation-state.js';
import type { EmotionResult } from '../intelligence/emotion-detector.js';

const _getLogger = () => log();

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
  private samples: { wordCount: number; durationMs: number }[] = [];
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
// SPEECH CONTEXT BUILDER
// ============================================================================

/**
 * Build speech context from available information
 */
export function buildSpeechContext(input: {
  userWPM?: number;
  userText?: string;
  emotion?: EmotionResult;
  phase?: ConversationPhase;
  topics?: string[];
  turnCount?: number;
}): SpeechContext {
  // Determine user energy
  const userEnergy = input.userText ? detectEnergyLevel(input.userText) : 'medium';

  // Determine topic weight
  const topicWeight = determineTopicWeight(input.emotion, input.topics);

  // Calculate base speed from user WPM
  // Jack speaks slower than average (seasoned gentleman!)
  const userWPM = input.userWPM || 150;
  let baseSpeed: number;
  if (userWPM < 120) {
    baseSpeed = 0.75; // Very slow - match them
  } else if (userWPM < 150) {
    baseSpeed = 0.82; // Moderate - slightly slower
  } else if (userWPM < 180) {
    baseSpeed = 0.88; // Normal - Jack's natural pace
  } else {
    baseSpeed = 0.92; // Fast - don't match completely, stay measured
  }

  // Adjust for phase
  const phase = input.phase || 'exploring';
  switch (phase) {
    case 'greeting':
    case 'warming_up':
      baseSpeed *= 0.95; // Slower for connection
      break;
    case 'supporting':
      baseSpeed *= 0.9; // Much slower for emotional support
      break;
    case 'advising':
      baseSpeed *= 0.95; // Slower for wisdom
      break;
    case 'wrapping_up':
      baseSpeed *= 0.92; // Slow and warm
      break;
  }

  // Calculate energy multiplier (mirror user energy)
  let energyMultiplier: number;
  switch (userEnergy) {
    case 'low':
      energyMultiplier = 0.92;
      break;
    case 'high':
      energyMultiplier = 1.08;
      break;
    default:
      energyMultiplier = 1.0;
  }

  // Determine if laughter is appropriate
  const allowLaughter =
    topicWeight !== 'heavy' && phase !== 'supporting' && input.emotion?.valence !== 'negative';

  // Calculate pause multiplier
  let pauseMultiplier = 1.0;
  if (topicWeight === 'heavy') pauseMultiplier = 1.4;
  else if (phase === 'supporting') pauseMultiplier = 1.3;
  else if (userEnergy === 'low') pauseMultiplier = 1.2;

  // Calculate emotion intensity for SSML
  let emotionIntensity = 0.7; // Default
  if (input.emotion) {
    if (input.emotion.distressLevel > 0.5) {
      emotionIntensity = 0.5; // Gentle when distressed
    } else if (input.emotion.valence === 'positive') {
      emotionIntensity = 0.85;
    }
  }

  return {
    userWPM,
    userEnergy,
    userEmotion: input.emotion?.primary || 'neutral',
    conversationPhase: phase,
    topicWeight,
    turnCount: input.turnCount || 0,
    baseSpeed: Math.max(0.7, Math.min(1.0, baseSpeed)),
    energyMultiplier,
    allowLaughter,
    pauseMultiplier,
    emotionIntensity,
  };
}

// ============================================================================
// SINGLETON TRACKER
// ============================================================================

let defaultWPMTracker: WPMTracker | null = null;

/**
 * Get the default WPM tracker
 */
export function getWPMTracker(): WPMTracker {
  if (!defaultWPMTracker) {
    defaultWPMTracker = new WPMTracker();
  }
  return defaultWPMTracker;
}

/**
 * Reset the WPM tracker
 */
export function resetWPMTracker(): void {
  if (defaultWPMTracker) {
    defaultWPMTracker.clear();
  }
}

export default {
  buildSpeechContext,
  detectEnergyLevel,
  determineTopicWeight,
  WPMTracker,
  getWPMTracker,
  resetWPMTracker,
};
