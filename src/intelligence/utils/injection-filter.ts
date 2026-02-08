/**
 * Smart Injection Filter (Level 70 - Intelligence)
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
 *
 * Canonical implementation lives here so domain layers (context-routing) can
 * import without depending on the application layer (agents/).
 *
 * @module intelligence/utils/injection-filter
 */

import type { ContextInjection } from '../../types/context-injection-types.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Categories that ALWAYS get through (non-negotiable)
 *
 * These are "Better than Human" capabilities that should NEVER be filtered:
 * - safety/crisis: Life-safety
 * - identity: Persona consistency
 * - boundaries: Respecting user's sensitive topics (trust system)
 * - unsaid: Detecting what user isn't saying (emotional mismatches, permission seeking)
 */
export const ESSENTIAL_CATEGORIES = new Set([
  'safety',
  'crisis_response',
  'identity',
  'boundaries', // Trust: Topics to avoid - critical for user safety/comfort
  'unsaid', // Trust: Emotional mismatches, permission seeking - "Better than Human" listening
]);

/**
 * Categories that are NICE-TO-HAVE but can be dropped
 */
export const OPTIONAL_CATEGORIES = new Set([
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
 * Maximum injections to allow per turn (default)
 * LATENCY OPTIMIZATION: Reduced from 8 to 6 - fewer injections = faster LLM TTFT
 */
export const MAX_INJECTIONS = 6;

/**
 * Maximum total characters for all injections (default)
 * LATENCY OPTIMIZATION: Reduced from 2000 to 1500 - smaller context = faster LLM TTFT
 */
export const MAX_TOTAL_CHARS = 1500;

/**
 * FAST MODE: For casual/simple exchanges - even more aggressive limits
 */
const FAST_MODE_MAX_INJECTIONS = 3;
const FAST_MODE_MAX_CHARS = 600;

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
        'proactive_outreach',
        'celebration',
        'growth',
        'callback',
      ]);

    case 'practical':
      return new Set(['context', 'tasks', 'response_length', 'coaching']);

    case 'deep':
      return new Set([
        'coaching',
        'context',
        'humanizing',
        'response_length',
        'proactive_outreach',
        'growth',
        'callback',
      ]);

    case 'casual':
      return new Set(['response_length']);

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
 *
 * LATENCY OPTIMIZATION (Dec 2024):
 * - Uses "fast mode" for casual conversations with aggressive limits
 * - Reduces context size to minimize LLM time-to-first-token
 */
export function filterInjections(
  injections: ContextInjection[],
  options: FilterOptions = {}
): ContextInjection[] {
  // Bypass filter if requested
  if (options.bypassFilter || process.env.BYPASS_INJECTION_FILTER === 'true') {
    return injections;
  }

  // Detect mode if not provided
  const mode =
    options.mode ??
    detectConversationMode(
      options.userText ?? '',
      options.emotionalIntensity,
      options.crisisDetected
    );

  // LATENCY OPTIMIZATION: Use aggressive limits for casual/simple exchanges
  const isFastMode = mode === 'casual';
  const maxInjections =
    options.maxInjections ?? (isFastMode ? FAST_MODE_MAX_INJECTIONS : MAX_INJECTIONS);
  const maxChars = options.maxChars ?? (isFastMode ? FAST_MODE_MAX_CHARS : MAX_TOTAL_CHARS);

  const priorityCategories = getPriorityCategories(mode);
  const filtered: ContextInjection[] = [];
  let totalChars = 0;

  const sorted = [...injections].sort((a, b) => b.priority - a.priority);

  for (const injection of sorted) {
    if (ESSENTIAL_CATEGORIES.has(injection.category)) {
      filtered.push(injection);
      totalChars += injection.content.length;
      continue;
    }

    if (
      OPTIONAL_CATEGORIES.has(injection.category) &&
      !priorityCategories.has(injection.category)
    ) {
      continue;
    }

    const isPriority = priorityCategories.has(injection.category);

    if (filtered.length >= maxInjections && !isPriority) {
      continue;
    }

    if (totalChars + injection.content.length > maxChars && !isPriority) {
      continue;
    }

    filtered.push(injection);
    totalChars += injection.content.length;
  }

  if (process.env.DEBUG_INJECTIONS === 'true') {
    const removed = injections.length - filtered.length;
    const fastModeStr = isFastMode ? ' [FAST MODE]' : '';
    process.stderr.write(
      `[INJECTION FILTER] Mode: ${mode}${fastModeStr}, Kept: ${filtered.length}/${injections.length}, Removed: ${removed}, Chars: ${totalChars}/${maxChars}\n`
    );
  }

  return filtered;
}

// ============================================================================
// SEMANTIC DEDUPLICATION
// ============================================================================

const SEMANTIC_CLUSTERS: readonly string[][] = [
  ['empathy', 'empathetic', 'listen', 'understand', 'presence', 'supportive', 'validate'],
  ['crisis', 'safety', 'emergency', 'urgent', 'distress', 'harm'],
  ['brief', 'concise', 'short', 'succinct', 'keep it short'],
  ['acknowledge', 'recognize', 'notice', 'aware', 'see that'],
  ['pause', 'slow', 'space', 'breath', 'gentle'],
  ['celebrate', 'congratulate', 'proud', 'achievement', 'milestone', 'win'],
];

function extractKeywords(content: string): Set<string> {
  const words = content
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);
  return new Set(words);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

function areSemanticallySimilar(a: ContextInjection, b: ContextInjection): boolean {
  if (a.category === b.category) return true;
  const keywordsA = extractKeywords(a.content);
  const keywordsB = extractKeywords(b.content);
  const directSimilarity = jaccardSimilarity(keywordsA, keywordsB);
  if (directSimilarity > 0.4) return true;
  for (const cluster of SEMANTIC_CLUSTERS) {
    const clusterSet = new Set(cluster);
    const aHasCluster = [...keywordsA].some((w) => clusterSet.has(w));
    const bHasCluster = [...keywordsB].some((w) => clusterSet.has(w));
    if (aHasCluster && bHasCluster) return true;
  }
  return false;
}

/**
 * Deduplicate semantically similar injections.
 */
export function deduplicateInjections(injections: ContextInjection[]): ContextInjection[] {
  if (injections.length <= 1) return injections;
  const sorted = [...injections].sort((a, b) => b.priority - a.priority);
  const kept: ContextInjection[] = [];
  const skipped = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    if (skipped.has(i)) continue;
    const current = sorted[i];
    kept.push(current);
    for (let j = i + 1; j < sorted.length; j++) {
      if (skipped.has(j)) continue;
      if (areSemanticallySimilar(current, sorted[j])) skipped.add(j);
    }
  }

  if (process.env.DEBUG_INJECTIONS === 'true' && skipped.size > 0) {
    process.stderr.write(
      `[INJECTION DEDUP] Removed ${skipped.size} semantically similar injections\n`
    );
  }

  return kept;
}

export default {
  filterInjections,
  deduplicateInjections,
  detectConversationMode,
  ESSENTIAL_CATEGORIES,
  OPTIONAL_CATEGORIES,
  MAX_INJECTIONS,
  MAX_TOTAL_CHARS,
};
