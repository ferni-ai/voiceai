/**
 * Emotion Types - Shared across memory and intelligence layers
 *
 * This file consolidates emotion-related type definitions to prevent
 * architecture violations (memory → intelligence imports).
 *
 * @module types/emotion-types
 */

// ============================================================================
// PRIMARY EMOTIONS
// ============================================================================

/**
 * Primary emotion categories
 */
export type PrimaryEmotion =
  | 'joy'
  | 'sadness'
  | 'anger'
  | 'fear'
  | 'surprise'
  | 'disgust'
  | 'trust'
  | 'anticipation'
  | 'anxiety'
  | 'regret'
  | 'neutral';

/**
 * Emotional valence (positive/negative/neutral)
 */
export type Valence = 'positive' | 'negative' | 'neutral';

/**
 * Detected emotion with metadata
 */
export interface EmotionResult {
  primary: PrimaryEmotion;
  secondary?: PrimaryEmotion;
  intensity: number; // 0-1, how strong
  valence: Valence;
  distressLevel: number; // 0-1, urgency of emotional support
  confidence: number; // 0-1, how sure we are
  markers: string[]; // Keywords/patterns that triggered detection
  suggestedTone:
    | 'warm'
    | 'gentle'
    | 'enthusiastic'
    | 'calm'
    | 'serious'
    | 'friendly'
    | 'reassuring'
    | 'informative'
    | 'measured';
}

// ============================================================================
// EMOTIONAL MEMORY (USER EMOTIONS)
// ============================================================================

/**
 * A significant emotional moment from a conversation
 */
export interface EmotionalMoment {
  id: string;
  timestamp: Date;
  sessionId: string;

  // What was felt
  emotion: PrimaryEmotion;
  intensity: 'mild' | 'moderate' | 'strong';

  // Context
  topic: string;
  trigger: string; // What caused this emotion
  userStatement: string; // What user said

  // Resolution
  resolved?: boolean;
  resolutionNote?: string;
  followedUp?: boolean;
}

/**
 * Detected pattern in emotional behavior over time
 */
export interface EmotionalPattern {
  topic: string;
  emotions: PrimaryEmotion[];
  frequency: number;
  lastSeen: Date;
  trend: 'improving' | 'stable' | 'worsening' | 'unknown';
}

/**
 * A suggested check-in based on past emotional moments
 */
export interface EmotionalCheckIn {
  type: 'follow_up' | 'celebration' | 'support' | 'curiosity';
  reference: string; // What to reference
  suggestedOpener: string; // How to bring it up
  priority: 'high' | 'medium' | 'low';
  moment: EmotionalMoment;
}

/**
 * Emotional context for LLM injection
 */
export interface EmotionalContext {
  // For LLM context injection
  recentEmotions: string[];
  unresolvedConcerns: string[];
  celebratableWins: string[];
  checkInSuggestions: EmotionalCheckIn[];
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if a value is a valid PrimaryEmotion
 */
export function isPrimaryEmotion(value: unknown): value is PrimaryEmotion {
  const validEmotions: PrimaryEmotion[] = [
    'joy',
    'sadness',
    'anger',
    'fear',
    'surprise',
    'disgust',
    'trust',
    'anticipation',
    'anxiety',
    'regret',
    'neutral',
  ];
  return typeof value === 'string' && validEmotions.includes(value as PrimaryEmotion);
}

/**
 * Check if a value is a valid EmotionResult
 */
export function isEmotionResult(value: unknown): value is EmotionResult {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    isPrimaryEmotion(obj.primary) &&
    typeof obj.intensity === 'number' &&
    typeof obj.valence === 'string' &&
    typeof obj.confidence === 'number'
  );
}

