/**
 * Authentic Thinking Pauses
 *
 * Maps actual cognitive load to natural pauses, creating the illusion
 * that the AI is genuinely thinking:
 *
 * - Complex questions → longer thinking pause + "Hmm..." phrase
 * - Simple questions → quick response
 * - Emotional content → gentle pause + soft entry
 *
 * Key insight: Rather than fixed delays, we use question complexity
 * and conversation context to determine appropriate "thinking time".
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface ThinkingContext {
  /** The user's message */
  userText: string;
  /** Detected question complexity (0-1) */
  questionComplexity: number;
  /** Whether user is in distress */
  isEmotional: boolean;
  /** Whether this requires factual lookup */
  requiresLookup: boolean;
  /** Current conversation depth (turns) */
  turnCount: number;
  /** Persona ID for persona-specific thinking sounds */
  personaId?: string;
}

export interface ThinkingPause {
  /** Thinking phrase to prepend (may be empty) */
  thinkingPhrase: string;
  /** SSML break duration in ms */
  pauseDurationMs: number;
  /** Whether to add a soft entry ("Well...") */
  softEntry: boolean;
  /** Speed adjustment for response (0.9 = slightly slower) */
  speedAdjustment: number;
}

// ============================================================================
// COMPLEXITY ANALYSIS
// ============================================================================

/**
 * Analyze question complexity based on linguistic features
 */
export function analyzeQuestionComplexity(userText: string): number {
  let complexity = 0.3; // Base complexity

  const text = userText.toLowerCase();
  const wordCount = text.split(/\s+/).length;

  // =========================================================================
  // Deep/philosophical questions (high complexity)
  // =========================================================================
  const deepPatterns = [
    /what('s| is) the (meaning|point|purpose)/i,
    /why (do|does|should|would|am|is)/i,
    /how (do|should|can|would) (i|you|we)/i,
    /what (do you think|would you say|should i)/i,
    /(meaning|purpose) of (life|this|it all)/i,
    /is (it|this|that) (right|wrong|okay|normal)/i,
    /what if/i,
    /how do (i|you) (know|decide|choose)/i,
  ];

  if (deepPatterns.some((p) => p.test(text))) {
    complexity += 0.3;
  }

  // =========================================================================
  // Multi-part questions (higher complexity)
  // =========================================================================
  const questionMarks = (text.match(/\?/g) || []).length;
  if (questionMarks > 1) {
    complexity += 0.15 * Math.min(questionMarks - 1, 3);
  }

  // Questions with "and" or "or" (compound)
  if (/\?\s*(and|or|but)\s/i.test(text) || /(and|or|but).*\?/i.test(text)) {
    complexity += 0.1;
  }

  // =========================================================================
  // Long messages (more to process)
  // =========================================================================
  if (wordCount > 50) complexity += 0.1;
  if (wordCount > 100) complexity += 0.1;

  // =========================================================================
  // Advice-seeking (requires thoughtful response)
  // =========================================================================
  const advicePatterns = [
    /what (should|would|could) (i|you)/i,
    /any (advice|suggestions|recommendations)/i,
    /how (do|can|should) i (handle|deal|cope|manage)/i,
    /what('s| is) (your|the best) (take|advice|suggestion)/i,
  ];

  if (advicePatterns.some((p) => p.test(text))) {
    complexity += 0.2;
  }

  // =========================================================================
  // Simple/factual questions (lower complexity)
  // =========================================================================
  const simplePatterns = [
    /^(what|when|where|who) (is|was|are|were) /i,
    /^(can|could|will|would) you /i,
    /^(yes|no|yeah|nope|sure|okay)/i,
    /^(thanks|thank you|got it|understood)/i,
  ];

  if (simplePatterns.some((p) => p.test(text))) {
    complexity -= 0.2;
  }

  // =========================================================================
  // Very short messages (quick response)
  // =========================================================================
  if (wordCount < 5) {
    complexity -= 0.15;
  }

  return Math.max(0, Math.min(1, complexity));
}

// ============================================================================
// THINKING PHRASES
// ============================================================================

/**
 * Persona-specific thinking sounds/phrases
 */
const personaThinkingPhrases: Record<string, string[]> = {
  ferni: [
    'Hmm...',
    'Let me think about that...',
    "That's a good question...",
    'You know...',
    'Well...',
    "Let me sit with that for a moment...",
  ],
  'nayan-patel': [
    'Hmm...',
    'You know...',
    'Well...',
    'Let me think...',
    "That's worth considering...",
  ],
  'peter-john': [
    'Oh, that\'s interesting...',
    'Hmm, let me think...',
    'You know what...',
    'Good question...',
  ],
  'maya-santos': [
    'Hmm...',
    "Let's see...",
    "That's a thoughtful question...",
    'You know...',
  ],
  'alex-chen': [
    'Let me think...',
    'Good question...',
    'Hmm...',
    "Okay, let's see...",
  ],
  'jordan-taylor': [
    'Ooh, good question...',
    'Let me think...',
    'Hmm...',
    'You know what...',
  ],
  default: [
    'Hmm...',
    'Let me think about that...',
    'Well...',
    "That's a good question...",
  ],
};

/**
 * Get a thinking phrase for a persona
 */
function getThinkingPhrase(personaId: string | undefined, complexity: number): string {
  // Only use thinking phrase for complex questions
  if (complexity < 0.5) return '';

  // Higher complexity = higher chance of thinking phrase
  const usePhrase = Math.random() < complexity * 0.8;
  if (!usePhrase) return '';

  const phrases = personaThinkingPhrases[personaId || 'default'] || personaThinkingPhrases.default;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

// ============================================================================
// PAUSE CALCULATION
// ============================================================================

/**
 * Calculate authentic thinking pause based on context
 */
export function calculateThinkingPause(context: ThinkingContext): ThinkingPause {
  const { questionComplexity, isEmotional, requiresLookup, turnCount, personaId } = context;

  // Base pause (100-400ms depending on complexity)
  let pauseDurationMs = 100 + questionComplexity * 300;

  // Adjust for emotional content (longer, gentler pause)
  if (isEmotional) {
    pauseDurationMs += 150;
  }

  // Adjust for lookup requirement (simulated "searching" time)
  if (requiresLookup) {
    pauseDurationMs += 200;
  }

  // Early conversation = slightly longer pauses (still warming up)
  if (turnCount < 3) {
    pauseDurationMs *= 1.2;
  }

  // Cap at 800ms (anything longer feels unnatural)
  pauseDurationMs = Math.min(800, pauseDurationMs);

  // Get thinking phrase
  const thinkingPhrase = getThinkingPhrase(personaId, questionComplexity);

  // Soft entry for emotional content
  const softEntry = isEmotional && Math.random() < 0.4;

  // Speed adjustment (complex = slightly slower)
  const speedAdjustment = questionComplexity > 0.6 ? 0.95 : 1.0;

  log.debug(
    {
      complexity: questionComplexity.toFixed(2),
      pauseMs: Math.round(pauseDurationMs),
      hasPhrase: !!thinkingPhrase,
    },
    'Calculated thinking pause'
  );

  return {
    thinkingPhrase,
    pauseDurationMs: Math.round(pauseDurationMs),
    softEntry,
    speedAdjustment,
  };
}

// ============================================================================
// SSML GENERATION
// ============================================================================

/**
 * Generate SSML for thinking pause
 */
export function generateThinkingSSML(pause: ThinkingPause): string {
  const parts: string[] = [];

  // Opening pause
  if (pause.pauseDurationMs > 150) {
    parts.push(`<break time="${Math.round(pause.pauseDurationMs * 0.4)}ms"/>`);
  }

  // Thinking phrase
  if (pause.thinkingPhrase) {
    // Wrap in softer emotion for naturalness
    parts.push(`<emotion name="thoughtful">${pause.thinkingPhrase}</emotion>`);
    parts.push(`<break time="${Math.round(pause.pauseDurationMs * 0.3)}ms"/>`);
  }

  // Soft entry
  if (pause.softEntry && !pause.thinkingPhrase) {
    parts.push('Well... ');
    parts.push(`<break time="100ms"/>`);
  }

  return parts.join('');
}

/**
 * Wrap response with thinking pause SSML
 */
export function wrapWithThinkingPause(
  response: string,
  context: ThinkingContext
): string {
  const pause = calculateThinkingPause(context);

  // Skip if minimal pause needed
  if (pause.pauseDurationMs < 150 && !pause.thinkingPhrase) {
    return response;
  }

  const thinkingSSML = generateThinkingSSML(pause);

  // Don't double-add if response already starts with thinking
  if (response.trim().toLowerCase().startsWith('hmm') ||
      response.trim().toLowerCase().startsWith('well') ||
      response.trim().toLowerCase().startsWith('let me')) {
    return response;
  }

  return thinkingSSML + response;
}

// ============================================================================
// INTEGRATION HELPERS
// ============================================================================

/**
 * Create thinking context from conversation state
 */
export function createThinkingContext(
  userText: string,
  emotionIntensity: number,
  isQuestion: boolean,
  turnCount: number,
  personaId?: string
): ThinkingContext {
  return {
    userText,
    questionComplexity: isQuestion ? analyzeQuestionComplexity(userText) : 0.2,
    isEmotional: emotionIntensity > 0.6,
    requiresLookup: /\b(price|stock|weather|news|score|rate)\b/i.test(userText),
    turnCount,
    personaId,
  };
}

export {
  personaThinkingPhrases,
  getThinkingPhrase,
};
