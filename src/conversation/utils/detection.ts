/**
 * Shared Detection Utilities
 *
 * Centralized detection functions for conversation analysis.
 * These utilities are used across multiple conversation modules:
 * - deep-humanization.ts
 * - vocal-humanization.ts
 * - humanization/index.ts
 * - humanizer.ts
 *
 * @module @ferni/conversation/utils/detection
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ConversationDetection' });

// ============================================================================
// TYPES
// ============================================================================

export type EnergyLevel = 'high' | 'medium' | 'low' | 'subdued';
export type TopicWeight = 'light' | 'medium' | 'heavy';
export type EngagementLevel = 'disengaged' | 'low' | 'medium' | 'high' | 'very_high';

export interface DetectionResult<T> {
  detected: boolean;
  value?: T;
  confidence: number;
  signals: string[];
}

// ============================================================================
// PATTERN CONSTANTS
// ============================================================================

/**
 * Patterns indicating high energy in user message
 */
export const HIGH_ENERGY_PATTERNS = [
  /!{2,}/,
  /\b(amazing|awesome|incredible|fantastic|excited|thrilled|pumped|yes|yeah|yay)\b/i,
  /\b(can't wait|so happy|love it|best|great news)\b/i,
  /^(omg|oh my god|wow|whoa|holy)\b/i,
  /\?!|\?{2,}/,
] as const;

/**
 * Patterns indicating low/subdued energy
 */
export const LOW_ENERGY_PATTERNS = [
  /\b(tired|exhausted|drained|overwhelmed|sad|down|depressed|anxious)\b/i,
  /\b(struggling|hard time|difficult|tough|rough)\b/i,
  /\b(I don't know|not sure|maybe|I guess)\b/i,
  /\.{3,}/, // Trailing off...
  /\b(sigh|ugh|meh)\b/i,
] as const;

/**
 * Patterns indicating emotional content in responses
 */
export const EMOTIONAL_CONTENT_PATTERNS = [
  /\b(I'm sorry|that's hard|that sounds|I hear you|that's heavy)\b/i,
  /\b(proud of you|believe in you|you matter|you're not alone)\b/i,
  /\b(love|care|feel|heart|soul)\b/i,
  /\b(hurt|pain|struggle|suffer|grief|loss)\b/i,
] as const;

/**
 * Patterns indicating heavy/serious content
 */
export const HEAVY_CONTENT_PATTERNS = [
  /\b(death|dying|died|passed away|suicide|crisis)\b/i,
  /\b(abuse|trauma|assault|violence)\b/i,
  /\b(divorce|breakup|separation|lost my)\b/i,
  /\b(fired|laid off|bankrupt|homeless)\b/i,
  /\b(diagnosis|cancer|terminal|chronic)\b/i,
  /\b(depression|anxiety|panic)\b/i,
] as const;

/**
 * Patterns indicating light/positive content
 */
export const LIGHT_CONTENT_PATTERNS = [
  /\b(haha|lol|lmao|funny|joke)\b/i,
  /\b(great|awesome|amazing|wonderful)\b/i,
  /\b(excited|happy|glad|thrilled)\b/i,
  /\b(weekend|vacation|holiday|party)\b/i,
] as const;

/**
 * Patterns indicating user presented evidence/counter-argument
 */
export const EVIDENCE_PATTERNS = [
  /here'?s the thing/i,
  /but actually/i,
  /what about/i,
  /consider this/i,
  /in my experience/i,
  /when I tried/i,
  /what happened was/i,
  /I disagree/i,
  /that'?s not how I see it/i,
  /but what if/i,
  /let me tell you/i,
  /I know someone who/i,
] as const;

/**
 * Patterns indicating breakthrough/insight moment
 */
export const BREAKTHROUGH_PATTERNS = [
  /I (just )?realized/i,
  /it hit me/i,
  /I (just )?figured out/i,
  /maybe what I need/i,
  /finally/i,
  /for the first time/i,
  /I never thought of it/i,
  /I'?ve never told anyone/i,
  /this is hard to say/i,
  /oh my god/i,
  /wait\s*[,.!]/i,
] as const;

/**
 * Patterns indicating agent is giving advice
 */
export const ADVICE_PATTERNS = [
  /you should/i,
  /I'?d recommend/i,
  /try to/i,
  /consider/i,
  /my advice/i,
  /what I suggest/i,
  /here'?s what/i,
  /the key is/i,
  /I think you should/i,
  /you might want to/i,
  /my suggestion/i,
] as const;

/**
 * Patterns indicating user disengagement
 */
export const DISENGAGEMENT_PATTERNS = [
  /^yeah[.,!?]?$/i,
  /^ok(ay)?[.,!?]?$/i,
  /^sure[.,!?]?$/i,
  /^i (guess|suppose)[.,!?]?$/i,
  /^whatever[.,!?]?$/i,
  /^fine[.,!?]?$/i,
  /^not really[.,!?]?$/i,
  /^i don'?t (know|care)[.,!?]?$/i,
] as const;

/**
 * Single-word disengagement responses
 */
export const DISENGAGEMENT_WORDS = new Set([
  'yeah',
  'ok',
  'okay',
  'sure',
  'fine',
  'whatever',
  'i guess',
  'uh huh',
  'mhm',
  'yep',
  'nope',
  'dunno',
  'idk',
  'meh',
  'eh',
  'k',
  'kk',
  'cool',
  'right',
]);

/**
 * Patterns indicating high engagement/enthusiasm
 */
export const HIGH_ENGAGEMENT_PATTERNS = [
  /!{2,}/, // Multiple exclamation marks
  /that'?s (so |really )?(interesting|cool|amazing|fascinating)/i,
  /i (love|really like) (this|that|what you)/i,
  /wow/i,
  /oh my (god|gosh)/i,
  /yes!+/i,
  /exactly!?/i,
  /you know what/i,
  /i'?ve (been thinking|never thought)/i,
  /i want to tell you/i,
  /can i share something/i,
  /this is (hard|difficult|important)/i,
  /i'?ve never told anyone/i,
] as const;

/**
 * Patterns indicating deep sharing
 */
export const DEEP_SHARING_PATTERNS = [
  /i feel like/i,
  /it makes me feel/i,
  /i'?ve been struggling/i,
  /honestly|truthfully/i,
  /i realized/i,
  /the thing is/i,
  /what i really want/i,
] as const;

/**
 * Hesitation signals for first-turn detection
 */
export const HESITATION_PATTERNS = [
  // Deflection
  /^(fine|okay|good|not bad|alright|ok)\.?$/i,
  /^(i'?m? )?(doing )?(fine|okay|good|alright)/i,
  /nothing (much|really|special)/i,
  /just (wanted to|thought i'd|checking in)/i,
  // Minimizing
  /not that (big|important|bad)/i,
  /no big deal/i,
  /it'?s? (nothing|fine|whatever)/i,
  /doesn'?t (matter|bother)/i,
  // Hedging
  /i guess/i,
  /maybe i/i,
  /i don'?t (really )?know/i,
  /sort of/i,
  /kind of/i,
  /probably/i,
  // Trailing off
  /\.\.\./,
  /anyway\s*\.?$/i,
  // Vague responses
  /^(um|uh|hmm)/i,
  /^just.*$/i,
] as const;

// ============================================================================
// ENERGY DETECTION
// ============================================================================

/**
 * Detect user's energy level from their message
 *
 * @param userMessage - The user's message to analyze
 * @returns The detected energy level
 *
 * @example
 * detectUserEnergy("This is AMAZING!!!") // 'high'
 * detectUserEnergy("I'm so tired...") // 'low'
 * detectUserEnergy("That sounds good") // 'medium'
 */
export function detectUserEnergy(userMessage: string): EnergyLevel {
  if (!userMessage) return 'medium';

  const lower = userMessage.toLowerCase();

  // Check for high energy signals
  let highScore = 0;
  const highSignals: string[] = [];
  for (const pattern of HIGH_ENERGY_PATTERNS) {
    if (pattern.test(userMessage)) {
      highScore++;
      highSignals.push(pattern.source);
    }
  }

  // Check for low energy signals
  let lowScore = 0;
  const lowSignals: string[] = [];
  for (const pattern of LOW_ENERGY_PATTERNS) {
    if (pattern.test(lower)) {
      lowScore++;
      lowSignals.push(pattern.source);
    }
  }

  // Word count and punctuation analysis
  const wordCount = userMessage.split(/\s+/).length;
  const exclamationCount = (userMessage.match(/!/g) || []).length;
  const questionCount = (userMessage.match(/\?/g) || []).length;
  const capsRatio = (userMessage.match(/[A-Z]/g) || []).length / Math.max(userMessage.length, 1);

  // High energy: lots of exclamations, caps, short excited messages
  if (exclamationCount >= 2 || capsRatio > 0.3) highScore++;
  if (wordCount < 10 && exclamationCount > 0) highScore++;

  // Low energy: short responses, trailing off
  if (wordCount < 5 && !exclamationCount && !questionCount) lowScore++;
  if (/\.{2,}$/.test(userMessage)) lowScore++;

  // Determine energy level
  if (highScore >= 2 || (highScore > 0 && lowScore === 0 && exclamationCount > 0)) {
    return 'high';
  }
  if (lowScore >= 2 || (lowScore > 0 && highScore === 0)) {
    return HEAVY_CONTENT_PATTERNS.some((p) => p.test(lower)) ? 'subdued' : 'low';
  }

  return 'medium';
}

/**
 * Detect user energy with detailed result
 */
export function detectUserEnergyDetailed(userMessage: string): DetectionResult<EnergyLevel> {
  if (!userMessage) {
    return { detected: true, value: 'medium', confidence: 0.5, signals: [] };
  }

  const lower = userMessage.toLowerCase();
  const signals: string[] = [];
  let highScore = 0;
  let lowScore = 0;

  for (const pattern of HIGH_ENERGY_PATTERNS) {
    if (pattern.test(userMessage)) {
      highScore++;
      signals.push(`high: ${pattern.source}`);
    }
  }

  for (const pattern of LOW_ENERGY_PATTERNS) {
    if (pattern.test(lower)) {
      lowScore++;
      signals.push(`low: ${pattern.source}`);
    }
  }

  const wordCount = userMessage.split(/\s+/).length;
  const exclamationCount = (userMessage.match(/!/g) || []).length;

  if (exclamationCount >= 2) {
    highScore++;
    signals.push('multiple exclamations');
  }
  if (wordCount < 5 && exclamationCount === 0) {
    lowScore++;
    signals.push('short response');
  }

  let value: EnergyLevel = 'medium';
  let confidence = 0.5;

  if (highScore >= 2 || (highScore > 0 && lowScore === 0 && exclamationCount > 0)) {
    value = 'high';
    confidence = Math.min(0.95, 0.6 + highScore * 0.1);
  } else if (lowScore >= 2 || (lowScore > 0 && highScore === 0)) {
    value = HEAVY_CONTENT_PATTERNS.some((p) => p.test(lower)) ? 'subdued' : 'low';
    confidence = Math.min(0.95, 0.6 + lowScore * 0.1);
  }

  return { detected: true, value, confidence, signals };
}

// ============================================================================
// TOPIC WEIGHT CLASSIFICATION
// ============================================================================

/**
 * Classify the emotional weight of a topic
 *
 * @param userMessage - The user's message to analyze
 * @param detectedEmotion - Optional detected emotion from voice/sentiment analysis
 * @returns The topic weight classification
 *
 * @example
 * classifyTopicWeight("My father passed away") // 'heavy'
 * classifyTopicWeight("Going on vacation!") // 'light'
 * classifyTopicWeight("Working on a project") // 'medium'
 */
export function classifyTopicWeight(
  userMessage: string,
  detectedEmotion?: string
): TopicWeight {
  const lower = userMessage.toLowerCase();

  // Check heavy indicators
  if (HEAVY_CONTENT_PATTERNS.some((p) => p.test(lower))) {
    return 'heavy';
  }
  if (detectedEmotion === 'sadness' || detectedEmotion === 'fear' || detectedEmotion === 'grief') {
    return 'heavy';
  }

  // Check light indicators
  if (LIGHT_CONTENT_PATTERNS.some((p) => p.test(lower))) {
    return 'light';
  }
  if (detectedEmotion === 'joy' || detectedEmotion === 'excitement') {
    return 'light';
  }

  return 'medium';
}

// ============================================================================
// CONTENT DETECTION
// ============================================================================

/**
 * Detect if content is emotionally charged
 */
export function detectEmotionalContent(text: string): boolean {
  return EMOTIONAL_CONTENT_PATTERNS.some((p) => p.test(text));
}

/**
 * Detect if content is heavy/serious
 */
export function detectHeavyContent(text: string): boolean {
  return HEAVY_CONTENT_PATTERNS.some((p) => p.test(text));
}

/**
 * Detect if user presented evidence or counter-argument
 */
export function detectEvidence(userMessage: string): boolean {
  return EVIDENCE_PATTERNS.some((p) => p.test(userMessage));
}

/**
 * Detect breakthrough/insight moment
 */
export function detectBreakthrough(userMessage: string): boolean {
  return BREAKTHROUGH_PATTERNS.some((p) => p.test(userMessage));
}

/**
 * Detect if agent response is giving advice
 */
export function detectAdviceGiving(agentMessage: string): boolean {
  return ADVICE_PATTERNS.some((p) => p.test(agentMessage));
}

// ============================================================================
// ENGAGEMENT DETECTION
// ============================================================================

/**
 * Detect if user seems disengaged based on message content
 *
 * @param userMessage - The user's message to analyze
 * @returns true if user appears disengaged
 *
 * @example
 * detectDisengagement("yeah") // true
 * detectDisengagement("That's really interesting, tell me more!") // false
 */
export function detectDisengagement(userMessage: string): boolean {
  const trimmed = userMessage.trim().toLowerCase();

  // Very short responses (under 15 chars) with disengagement words
  if (trimmed.length < 15) {
    if (
      DISENGAGEMENT_WORDS.has(trimmed) ||
      [...DISENGAGEMENT_WORDS].some((word) => trimmed.startsWith(`${word} `))
    ) {
      return true;
    }
  }

  // Pattern-based disengagement detection
  return DISENGAGEMENT_PATTERNS.some((p) => p.test(trimmed));
}

/**
 * Detect if user seems highly engaged
 *
 * @param userMessage - The user's message to analyze
 * @returns true if user appears highly engaged
 */
export function detectHighEngagement(userMessage: string): boolean {
  const trimmed = userMessage.trim().toLowerCase();

  // Long responses (over 100 chars) often indicate engagement
  const isLongResponse = trimmed.length > 100;

  // Enthusiasm markers
  const hasEnthusiasm = HIGH_ENGAGEMENT_PATTERNS.some((p) => p.test(trimmed));

  // Deep sharing indicators
  const isDeepSharing = DEEP_SHARING_PATTERNS.some((p) => p.test(trimmed));

  // Combined heuristic
  return (isLongResponse && (hasEnthusiasm || isDeepSharing)) || (hasEnthusiasm && isDeepSharing);
}

/**
 * Detect hesitation in user message (for first-turn "I notice" moments)
 */
export function detectHesitation(userMessage: string): boolean {
  const lower = userMessage.toLowerCase();
  return HESITATION_PATTERNS.some((p) => p.test(lower));
}

/**
 * Get overall engagement level with confidence
 */
export function detectEngagementLevel(userMessage: string): DetectionResult<EngagementLevel> {
  const signals: string[] = [];

  if (detectDisengagement(userMessage)) {
    signals.push('disengagement_pattern');
    return { detected: true, value: 'disengaged', confidence: 0.8, signals };
  }

  if (detectHighEngagement(userMessage)) {
    signals.push('high_engagement_pattern');
    const isVeryHigh = userMessage.length > 200 && HIGH_ENGAGEMENT_PATTERNS.some((p) => p.test(userMessage));
    return {
      detected: true,
      value: isVeryHigh ? 'very_high' : 'high',
      confidence: isVeryHigh ? 0.9 : 0.75,
      signals,
    };
  }

  // Medium engagement by default
  const wordCount = userMessage.split(/\s+/).length;
  if (wordCount > 30) {
    signals.push('substantial_response');
    return { detected: true, value: 'medium', confidence: 0.6, signals };
  }

  return { detected: true, value: 'low', confidence: 0.5, signals };
}

// ============================================================================
// COMPOSITE DETECTION
// ============================================================================

/**
 * Combined analysis result for a user message
 */
export interface MessageAnalysis {
  energy: EnergyLevel;
  topicWeight: TopicWeight;
  engagement: EngagementLevel;
  hasEvidence: boolean;
  isBreakthrough: boolean;
  hasHesitation: boolean;
  isEmotional: boolean;
  isHeavy: boolean;
  confidence: number;
}

/**
 * Perform comprehensive analysis of a user message
 *
 * @param userMessage - The user's message to analyze
 * @param detectedEmotion - Optional detected emotion
 * @returns Complete message analysis
 */
export function analyzeMessage(userMessage: string, detectedEmotion?: string): MessageAnalysis {
  const energyResult = detectUserEnergyDetailed(userMessage);
  const engagementResult = detectEngagementLevel(userMessage);

  const analysis: MessageAnalysis = {
    energy: energyResult.value!,
    topicWeight: classifyTopicWeight(userMessage, detectedEmotion),
    engagement: engagementResult.value!,
    hasEvidence: detectEvidence(userMessage),
    isBreakthrough: detectBreakthrough(userMessage),
    hasHesitation: detectHesitation(userMessage),
    isEmotional: detectEmotionalContent(userMessage),
    isHeavy: detectHeavyContent(userMessage),
    confidence: (energyResult.confidence + engagementResult.confidence) / 2,
  };

  log.debug({ analysis, messageLength: userMessage.length }, 'Message analyzed');

  return analysis;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Energy
  detectUserEnergy,
  detectUserEnergyDetailed,

  // Topic weight
  classifyTopicWeight,

  // Content detection
  detectEmotionalContent,
  detectHeavyContent,
  detectEvidence,
  detectBreakthrough,
  detectAdviceGiving,

  // Engagement
  detectDisengagement,
  detectHighEngagement,
  detectHesitation,
  detectEngagementLevel,

  // Composite
  analyzeMessage,

  // Pattern constants (for testing/extension)
  HIGH_ENERGY_PATTERNS,
  LOW_ENERGY_PATTERNS,
  EMOTIONAL_CONTENT_PATTERNS,
  HEAVY_CONTENT_PATTERNS,
  LIGHT_CONTENT_PATTERNS,
  EVIDENCE_PATTERNS,
  BREAKTHROUGH_PATTERNS,
  ADVICE_PATTERNS,
  DISENGAGEMENT_PATTERNS,
  HIGH_ENGAGEMENT_PATTERNS,
  DEEP_SHARING_PATTERNS,
  HESITATION_PATTERNS,
};

