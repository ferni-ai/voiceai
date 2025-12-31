/**
 * Adaptive Endpointing System
 *
 * Phase 23: Context-aware pause detection that adapts to:
 * - Topic weight (heavy topics = more thinking time)
 * - User speaking rhythm (fast/slow speakers)
 * - Sentence completeness (finished thought or still forming?)
 * - Emotional state (distress = more space)
 *
 * PROBLEM: Fixed 400-1200ms endpointing doesn't account for:
 * - Thinking pauses (user is formulating, not done)
 * - Topic complexity (heavy topics need more silence)
 * - User's natural speaking rhythm
 *
 * RESEARCH BASIS:
 * - Conversation analysis: Turn-taking is context-dependent
 * - Therapy research: Silence after heavy content is therapeutic
 * - UX research: Premature interruption frustrates users
 *
 * @module AdaptiveEndpointing
 */

import { getLogger } from '../utils/safe-logger.js';
// 🦀 Rust-accelerated word counting
import { countWordsRust, isTokenCountingAvailable } from '../memory/rust-accelerator.js';

import { detectHeavyContentKeywords as detectHeavyContent } from './utils/detection.js';

const log = getLogger().child({ module: 'adaptive-endpointing' });

// Check Rust availability at module load
const RUST_COUNTING_AVAILABLE = isTokenCountingAvailable();

// ============================================================================
// TYPES
// ============================================================================

export interface EndpointingContext {
  /** How emotionally heavy is the current topic? */
  topicWeight: 'light' | 'medium' | 'heavy';

  /** User's speaking rate over recent turns (words per minute) */
  userSpeakingRate?: number;

  /** How complete does the last utterance seem? (0-1) */
  sentenceCompleteness: number;

  /** Current emotional intensity (0-1) */
  emotionalIntensity: number;

  /** What phase of conversation are we in? */
  conversationPhase: 'opening' | 'exploring' | 'supporting' | 'closing';

  /** Is the user asking a question or making a statement? */
  utteranceType?: 'question' | 'statement' | 'incomplete' | 'exclamation';

  /** Keywords that suggest more thinking time needed */
  heavyContentSignals?: string[];

  /** How long has the user been speaking this turn? */
  turnDurationMs?: number;
}

export interface EndpointingResult {
  /** Minimum silence before considering user done */
  minDelay: number;

  /** Maximum wait before assuming user is done */
  maxDelay: number;

  /** Confidence that these settings are appropriate */
  confidence: number;

  /** Explanation for debugging */
  reasoning: string[];
}

export interface UserSpeakingProfile {
  /** Average words per minute */
  averageWpm: number;

  /** Typical pause length within utterances */
  typicalPauseMs: number;

  /** How variable is their pause length? */
  pauseVariability: 'consistent' | 'variable' | 'highly_variable';

  /** Sample count for this profile */
  samples: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Base endpointing delays in milliseconds */
const BASE_DELAYS = {
  min: 400,
  max: 1200,
};

/** Adjustments for different contexts */
const ADJUSTMENTS = {
  // Topic weight
  heavyTopic: { minAdd: 300, maxAdd: 600 },
  mediumTopic: { minAdd: 100, maxAdd: 200 },

  // Sentence completeness
  incompleteThought: { minAdd: 400, maxAdd: 700 },
  partialThought: { minAdd: 200, maxAdd: 400 },

  // Emotional intensity
  highEmotion: { minAdd: 200, maxAdd: 400 },
  crisisLevel: { minAdd: 400, maxAdd: 800 },

  // Speaking rate
  slowSpeaker: { minAdd: 200, maxAdd: 300 }, // <100 WPM
  fastSpeaker: { minSub: 100, maxSub: 150 }, // >160 WPM

  // Conversation phase
  supporting: { minAdd: 150, maxAdd: 300 }, // Give space in support mode

  // Utterance type
  incompleteUtterance: { minAdd: 300, maxAdd: 500 },
};

/** Signals that suggest incomplete thought */
const INCOMPLETE_SIGNALS = [
  /\b(and|but|so|because|like|um|uh|well|I mean)\s*$/i,
  /,\s*$/,
  /\.\.\.\s*$/,
  /^(I think|I feel|I guess|Maybe|Perhaps|I wonder)/i,
];

// ============================================================================
// STORAGE
// ============================================================================

const userProfiles = new Map<string, UserSpeakingProfile>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Calculate optimal endpointing delays for current context.
 */
export function calculateEndpointingDelay(
  context: EndpointingContext,
  userId?: string
): EndpointingResult {
  let minDelay = BASE_DELAYS.min;
  let maxDelay = BASE_DELAYS.max;
  const reasoning: string[] = [];

  // =========================================================================
  // TOPIC WEIGHT
  // =========================================================================
  if (context.topicWeight === 'heavy') {
    minDelay += ADJUSTMENTS.heavyTopic.minAdd;
    maxDelay += ADJUSTMENTS.heavyTopic.maxAdd;
    reasoning.push('Heavy topic: +300ms min, +600ms max');
  } else if (context.topicWeight === 'medium') {
    minDelay += ADJUSTMENTS.mediumTopic.minAdd;
    maxDelay += ADJUSTMENTS.mediumTopic.maxAdd;
    reasoning.push('Medium topic: +100ms min, +200ms max');
  }

  // =========================================================================
  // SENTENCE COMPLETENESS
  // =========================================================================
  if (context.sentenceCompleteness < 0.3) {
    minDelay += ADJUSTMENTS.incompleteThought.minAdd;
    maxDelay += ADJUSTMENTS.incompleteThought.maxAdd;
    reasoning.push('Incomplete thought: +400ms min, +700ms max');
  } else if (context.sentenceCompleteness < 0.6) {
    minDelay += ADJUSTMENTS.partialThought.minAdd;
    maxDelay += ADJUSTMENTS.partialThought.maxAdd;
    reasoning.push('Partial thought: +200ms min, +400ms max');
  }

  // =========================================================================
  // EMOTIONAL INTENSITY
  // =========================================================================
  if (context.emotionalIntensity > 0.8) {
    minDelay += ADJUSTMENTS.crisisLevel.minAdd;
    maxDelay += ADJUSTMENTS.crisisLevel.maxAdd;
    reasoning.push('Crisis-level emotion: +400ms min, +800ms max');
  } else if (context.emotionalIntensity > 0.6) {
    minDelay += ADJUSTMENTS.highEmotion.minAdd;
    maxDelay += ADJUSTMENTS.highEmotion.maxAdd;
    reasoning.push('High emotion: +200ms min, +400ms max');
  }

  // =========================================================================
  // USER SPEAKING RATE
  // =========================================================================
  const profile = userId ? userProfiles.get(userId) : undefined;
  const speakingRate = context.userSpeakingRate ?? profile?.averageWpm ?? 130;

  if (speakingRate < 100) {
    minDelay += ADJUSTMENTS.slowSpeaker.minAdd;
    maxDelay += ADJUSTMENTS.slowSpeaker.maxAdd;
    reasoning.push(`Slow speaker (${speakingRate} WPM): +200ms min, +300ms max`);
  } else if (speakingRate > 160) {
    minDelay -= ADJUSTMENTS.fastSpeaker.minSub;
    maxDelay -= ADJUSTMENTS.fastSpeaker.maxSub;
    reasoning.push(`Fast speaker (${speakingRate} WPM): -100ms min, -150ms max`);
  }

  // =========================================================================
  // CONVERSATION PHASE
  // =========================================================================
  if (context.conversationPhase === 'supporting') {
    minDelay += ADJUSTMENTS.supporting.minAdd;
    maxDelay += ADJUSTMENTS.supporting.maxAdd;
    reasoning.push('Supporting phase: +150ms min, +300ms max');
  }

  // =========================================================================
  // UTTERANCE TYPE
  // =========================================================================
  if (context.utteranceType === 'incomplete') {
    minDelay += ADJUSTMENTS.incompleteUtterance.minAdd;
    maxDelay += ADJUSTMENTS.incompleteUtterance.maxAdd;
    reasoning.push('Incomplete utterance: +300ms min, +500ms max');
  }

  // =========================================================================
  // HEAVY CONTENT DETECTION
  // =========================================================================
  if (context.heavyContentSignals && context.heavyContentSignals.length > 0) {
    const heavyCount = context.heavyContentSignals.length;
    const adjustment = Math.min(heavyCount * 100, 400);
    minDelay += adjustment;
    maxDelay += adjustment * 1.5;
    reasoning.push(`Heavy content signals (${heavyCount}): +${adjustment}ms`);
  }

  // =========================================================================
  // CLAMP VALUES
  // =========================================================================
  minDelay = Math.max(300, Math.min(minDelay, 1200)); // 300ms - 1200ms
  maxDelay = Math.max(minDelay + 200, Math.min(maxDelay, 3000)); // At least 200ms range, max 3s

  // Calculate confidence based on available context
  let confidence = 0.7;
  if (profile && profile.samples >= 10) confidence += 0.1;
  if (context.sentenceCompleteness !== undefined) confidence += 0.1;
  if (context.emotionalIntensity !== undefined) confidence += 0.05;
  confidence = Math.min(confidence, 0.95);

  log.debug({ minDelay, maxDelay, confidence, reasoning }, 'Calculated adaptive endpointing');

  return {
    minDelay,
    maxDelay,
    confidence,
    reasoning,
  };
}

// Re-export for backwards compatibility
export { detectHeavyContentKeywords as detectHeavyContent } from './utils/detection.js';

/**
 * Estimate sentence completeness from text.
 */
export function estimateSentenceCompleteness(text: string): number {
  const trimmed = text.trim();

  // Empty or very short
  if (trimmed.length < 3) return 0;

  // Check for incomplete signals
  for (const pattern of INCOMPLETE_SIGNALS) {
    if (pattern.test(trimmed)) {
      return 0.3;
    }
  }

  // Check for sentence-ending punctuation
  if (/[.!?]$/.test(trimmed)) {
    return 0.9;
  }

  // Check for trailing comma or ellipsis
  if (/[,…]$/.test(trimmed)) {
    return 0.4;
  }

  // Basic heuristic: longer = more likely complete
  // 🦀 Use Rust for O(1) word counting when available
  const wordCount = RUST_COUNTING_AVAILABLE ? countWordsRust(trimmed) : trimmed.split(/\s+/).length;
  if (wordCount >= 10) return 0.7;
  if (wordCount >= 5) return 0.6;
  if (wordCount >= 3) return 0.5;

  return 0.4;
}

/**
 * Determine topic weight from context.
 */
export function determineTopicWeight(context: {
  topic?: string;
  emotionalIntensity?: number;
  keywords?: string[];
}): 'light' | 'medium' | 'heavy' {
  const { topic, emotionalIntensity = 0.5, keywords = [] } = context;

  // High emotion = at least medium
  if (emotionalIntensity > 0.7) {
    return 'heavy';
  }

  // Check for heavy keywords
  const heavyKeywords = detectHeavyContent(keywords.join(' '));
  if (heavyKeywords.length > 0) {
    return 'heavy';
  }

  // Check topic
  const heavyTopics = [
    'death',
    'grief',
    'trauma',
    'abuse',
    'crisis',
    'divorce',
    'illness',
    'suicide',
    'depression',
  ];
  const mediumTopics = [
    'relationship',
    'conflict',
    'anxiety',
    'stress',
    'work',
    'money',
    'family',
    'health',
  ];

  if (topic) {
    const lowerTopic = topic.toLowerCase();
    if (heavyTopics.some((t) => lowerTopic.includes(t))) return 'heavy';
    if (mediumTopics.some((t) => lowerTopic.includes(t))) return 'medium';
  }

  if (emotionalIntensity > 0.5) return 'medium';

  return 'light';
}

/**
 * Update user speaking profile from observed data.
 */
export function updateUserProfile(
  userId: string,
  observation: {
    wordCount: number;
    durationMs: number;
    pauseMs?: number;
  }
): void {
  const { wordCount, durationMs, pauseMs } = observation;

  // Calculate WPM
  const wpm = (wordCount / durationMs) * 60000;

  // Get or create profile
  let profile = userProfiles.get(userId);
  if (!profile) {
    profile = {
      averageWpm: wpm,
      typicalPauseMs: pauseMs ?? 400,
      pauseVariability: 'consistent',
      samples: 0,
    };
    userProfiles.set(userId, profile);
  }

  // Update with exponential moving average
  const alpha = 0.2; // Weight for new observation
  profile.averageWpm = profile.averageWpm * (1 - alpha) + wpm * alpha;

  if (pauseMs !== undefined) {
    profile.typicalPauseMs = profile.typicalPauseMs * (1 - alpha) + pauseMs * alpha;
  }

  profile.samples++;

  log.debug(
    { userId, wpm: Math.round(profile.averageWpm), samples: profile.samples },
    'Updated user speaking profile'
  );
}

/**
 * Get user speaking profile.
 */
export function getUserProfile(userId: string): UserSpeakingProfile | null {
  return userProfiles.get(userId) ?? null;
}

/**
 * Detect if user utterance is likely incomplete.
 */
export function isLikelyIncomplete(text: string): boolean {
  const completeness = estimateSentenceCompleteness(text);
  return completeness < 0.5;
}

/**
 * Get endpointing recommendation for voice agent.
 */
export function getEndpointingRecommendation(
  text: string,
  context?: Partial<EndpointingContext>
): EndpointingResult {
  const heavyContent = detectHeavyContent(text);
  const completeness = estimateSentenceCompleteness(text);
  const topicWeight = determineTopicWeight({
    emotionalIntensity: context?.emotionalIntensity,
    keywords: text.split(/\s+/),
  });

  const fullContext: EndpointingContext = {
    topicWeight,
    sentenceCompleteness: completeness,
    emotionalIntensity: context?.emotionalIntensity ?? 0.5,
    conversationPhase: context?.conversationPhase ?? 'exploring',
    heavyContentSignals: heavyContent,
    ...context,
  };

  return calculateEndpointingDelay(fullContext);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const adaptiveEndpointing = {
  calculate: calculateEndpointingDelay,
  detectHeavyContent,
  estimateCompleteness: estimateSentenceCompleteness,
  determineTopicWeight,
  updateProfile: updateUserProfile,
  getProfile: getUserProfile,
  isIncomplete: isLikelyIncomplete,
  getRecommendation: getEndpointingRecommendation,
};

export default adaptiveEndpointing;
