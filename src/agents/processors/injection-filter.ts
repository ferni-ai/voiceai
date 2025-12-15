/**
 * Smart Injection Filter
 *
 * The problem: 28+ injection categories fire on EVERY turn, overwhelming the LLM.
 * The solution: Be selective like a human would be.
 *
 * A human friend doesn't think about ALL possible response strategies every time.
 * They naturally focus on what matters in the moment:
 * - Is this person in crisis? → Safety first
 * - Are they sharing something emotional? → Focus on presence
 * - Are they asking a practical question? → Focus on being helpful
 * - Is this casual chat? → Keep it light, don't overthink
 *
 * This filter reduces injection noise by:
 * 1. Only allowing ESSENTIAL injections always (safety, identity)
 * 2. Selecting CONTEXTUAL injections based on conversation state
 * 3. Limiting total injection count and size
 */

import type { ContextInjection } from './types.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Categories that ALWAYS get through (non-negotiable)
 */
const ESSENTIAL_CATEGORIES = new Set(['safety', 'crisis_response', 'identity']);

/**
 * Categories that are NICE-TO-HAVE but can be dropped
 */
const OPTIONAL_CATEGORIES = new Set([
  'catchphrase',
  'response_prefix',
  'conversation_state',
  'wrap_up',
  'story_opportunity',
  'mode_transition',
  'situational_response',
  'pushback',
  'health_awareness',
  'ambient_awareness',
]);

/**
 * Maximum injections to allow per turn
 */
const MAX_INJECTIONS = 8;

/**
 * Maximum total characters for all injections
 */
const MAX_TOTAL_CHARS = 2000;

// ============================================================================
// CONVERSATION MODES
// ============================================================================

export type ConversationMode =
  | 'crisis' // User in distress - safety focus
  | 'emotional' // Sharing feelings - presence focus
  | 'practical' // Asking questions - helpful focus
  | 'casual' // Light chat - keep it simple
  | 'deep' // Exploring meaning - thoughtful focus
  | 'unknown'; // Default

/**
 * Detect conversation mode from user text and analysis
 */
export function detectConversationMode(
  userText: string,
  emotionalIntensity?: number,
  crisisDetected?: boolean
): ConversationMode {
  const text = userText.toLowerCase();

  // Crisis mode
  if (crisisDetected) return 'crisis';

  // Emotional mode - sharing feelings
  const emotionalIndicators = [
    'feel',
    'feeling',
    'felt',
    'sad',
    'happy',
    'angry',
    'scared',
    'worried',
    'anxious',
    'stressed',
    'overwhelmed',
    'hurt',
    'love',
    'hate',
    'miss',
    'lonely',
    'afraid',
  ];
  if (
    emotionalIndicators.some((w) => text.includes(w)) ||
    (emotionalIntensity && emotionalIntensity > 0.6)
  ) {
    return 'emotional';
  }

  // Practical mode - asking questions
  const practicalIndicators = [
    'how do i',
    'what should',
    'can you help',
    'i need to',
    'tell me about',
    'what is',
    'how does',
    '?',
  ];
  if (practicalIndicators.some((w) => text.includes(w))) {
    return 'practical';
  }

  // Deep mode - exploring meaning
  const deepIndicators = [
    'meaning',
    'purpose',
    'why do',
    'what if',
    'philosophy',
    'life',
    'death',
    'existence',
    'believe',
    'values',
  ];
  if (deepIndicators.some((w) => text.includes(w))) {
    return 'deep';
  }

  // Casual mode - short, simple exchanges
  if (text.length < 50 && !text.includes('?')) {
    return 'casual';
  }

  return 'unknown';
}

/**
 * Get priority categories for a conversation mode
 */
function getPriorityCategories(mode: ConversationMode): Set<string> {
  switch (mode) {
    case 'crisis':
      return new Set(['safety', 'crisis_response', 'identity', 'emotional_guidance']);

    case 'emotional':
      return new Set([
        'emotional_guidance',
        'emotional_transition',
        'humanizing',
        'response_length',
        'pacing',
      ]);

    case 'practical':
      return new Set(['context', 'tasks', 'response_length', 'coaching']);

    case 'deep':
      return new Set(['coaching', 'context', 'humanizing', 'response_length']);

    case 'casual':
      return new Set([
        'response_length', // Just keep it short!
      ]);

    default:
      return new Set(['response_length', 'context']);
  }
}

// ============================================================================
// MAIN FILTER
// ============================================================================

export interface FilterOptions {
  mode?: ConversationMode;
  userText?: string;
  emotionalIntensity?: number;
  crisisDetected?: boolean;
  maxInjections?: number;
  maxChars?: number;
  /** If true, bypasses filter (for debugging) */
  bypassFilter?: boolean;
}

/**
 * Filter injections to only what's relevant for this turn
 */
export function filterInjections(
  injections: ContextInjection[],
  options: FilterOptions = {}
): ContextInjection[] {
  // Bypass filter if requested
  if (options.bypassFilter || process.env.BYPASS_INJECTION_FILTER === 'true') {
    return injections;
  }

  const maxInjections = options.maxInjections ?? MAX_INJECTIONS;
  const maxChars = options.maxChars ?? MAX_TOTAL_CHARS;

  // Detect mode if not provided
  const mode =
    options.mode ??
    detectConversationMode(
      options.userText ?? '',
      options.emotionalIntensity,
      options.crisisDetected
    );

  const priorityCategories = getPriorityCategories(mode);
  const filtered: ContextInjection[] = [];
  let totalChars = 0;

  // Sort by priority (highest first)
  const sorted = [...injections].sort((a, b) => b.priority - a.priority);

  for (const injection of sorted) {
    // Always include essential categories
    if (ESSENTIAL_CATEGORIES.has(injection.category)) {
      filtered.push(injection);
      totalChars += injection.content.length;
      continue;
    }

    // Skip optional categories unless they're priority for this mode
    if (
      OPTIONAL_CATEGORIES.has(injection.category) &&
      !priorityCategories.has(injection.category)
    ) {
      continue;
    }

    // Check if this category is priority for current mode
    const isPriority = priorityCategories.has(injection.category);

    // If we're at limit, only add priority categories
    if (filtered.length >= maxInjections && !isPriority) {
      continue;
    }

    // Check character limit
    if (totalChars + injection.content.length > maxChars && !isPriority) {
      continue;
    }

    filtered.push(injection);
    totalChars += injection.content.length;
  }

  // Log what we filtered
  if (process.env.DEBUG_INJECTIONS === 'true') {
    const removed = injections.length - filtered.length;
    process.stderr.write(
      `[INJECTION FILTER] Mode: ${mode}, Kept: ${filtered.length}/${injections.length}, Removed: ${removed}\n`
    );
  }

  return filtered;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  filterInjections,
  detectConversationMode,
  ESSENTIAL_CATEGORIES,
  OPTIONAL_CATEGORIES,
  MAX_INJECTIONS,
  MAX_TOTAL_CHARS,
};
