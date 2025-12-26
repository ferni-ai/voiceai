/**
 * Advice Detector - For Counterfactual Memory
 *
 * Detects when Ferni gives advice in responses so we can track:
 * - What advice was given
 * - Whether user followed it
 * - What the outcome was
 *
 * This enables "Better than Human" insights like:
 * "Last time this pattern started, you didn't rest. Want to try something different?"
 *
 * @module services/superhuman/semantic-intelligence/advice-detector
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { recordAgentAdvice, type AgentAdviceContext } from './integration.js';

const log = createLogger({ module: 'advice-detector' });

// ============================================================================
// ADVICE PATTERNS
// ============================================================================

/**
 * Patterns that indicate advice is being given.
 * Ordered by strength/explicitness.
 */
const ADVICE_PATTERNS: Array<{
  pattern: RegExp;
  category: AgentAdviceContext['category'];
  strength: number;
}> = [
  // Strong explicit advice
  { pattern: /\byou should\b/i, category: 'behavioral', strength: 0.9 },
  { pattern: /\bi'd suggest\b/i, category: 'practical', strength: 0.9 },
  { pattern: /\bi'd recommend\b/i, category: 'practical', strength: 0.9 },
  { pattern: /\bmy advice\b/i, category: 'practical', strength: 0.95 },
  { pattern: /\btry to\b/i, category: 'behavioral', strength: 0.7 },
  { pattern: /\bconsider\b/i, category: 'practical', strength: 0.7 },
  // BETTER THAN HUMAN: Enhanced advice patterns
  { pattern: /\btry \w+ing\b/i, category: 'behavioral', strength: 0.8 }, // "Try keeping", "Try doing"
  { pattern: /\bhave you tried\b/i, category: 'practical', strength: 0.75 }, // Common advice pattern
  { pattern: /\bmaybe try\b/i, category: 'behavioral', strength: 0.7 },
  { pattern: /\byou can try\b/i, category: 'behavioral', strength: 0.75 },
  { pattern: /\bit might help if you\b/i, category: 'practical', strength: 0.8 },
  { pattern: /\bone thing (that|to) try\b/i, category: 'practical', strength: 0.75 },

  // Behavioral suggestions
  { pattern: /\bwhy not\b/i, category: 'behavioral', strength: 0.6 },
  { pattern: /\bhow about\b/i, category: 'behavioral', strength: 0.6 },
  { pattern: /\bwhat if you\b/i, category: 'behavioral', strength: 0.7 },
  { pattern: /\byou could\b/i, category: 'practical', strength: 0.6 },
  { pattern: /\byou might want to\b/i, category: 'practical', strength: 0.7 },
  { pattern: /\bit might help to\b/i, category: 'practical', strength: 0.7 },

  // Emotional guidance
  { pattern: /\bit's okay to\b/i, category: 'emotional', strength: 0.7 },
  { pattern: /\bgive yourself permission\b/i, category: 'emotional', strength: 0.8 },
  { pattern: /\bbe gentle with yourself\b/i, category: 'emotional', strength: 0.8 },
  { pattern: /\btake a moment to\b/i, category: 'emotional', strength: 0.6 },
  { pattern: /\blet yourself\b/i, category: 'emotional', strength: 0.7 },

  // Relational advice
  { pattern: /\btalk to them about\b/i, category: 'relational', strength: 0.8 },
  { pattern: /\bhave a conversation with\b/i, category: 'relational', strength: 0.7 },
  { pattern: /\bset a boundary\b/i, category: 'relational', strength: 0.85 },
  { pattern: /\bset boundaries\b/i, category: 'relational', strength: 0.85 },
  { pattern: /\bspeak up about\b/i, category: 'relational', strength: 0.7 },

  // Philosophical/reflective
  { pattern: /\bremember that\b/i, category: 'philosophical', strength: 0.5 },
  { pattern: /\bkeep in mind\b/i, category: 'philosophical', strength: 0.5 },
  { pattern: /\bone thing that helps\b/i, category: 'practical', strength: 0.7 },
  { pattern: /\bsomething to think about\b/i, category: 'philosophical', strength: 0.6 },

  // Health/wellness
  { pattern: /\bget some rest\b/i, category: 'behavioral', strength: 0.8 },
  { pattern: /\bget some sleep\b/i, category: 'behavioral', strength: 0.8 },
  { pattern: /\btake a break\b/i, category: 'behavioral', strength: 0.7 },
  { pattern: /\bmake sure to\b/i, category: 'behavioral', strength: 0.7 },
  { pattern: /\bdon't forget to\b/i, category: 'behavioral', strength: 0.6 },
];

/**
 * Anti-patterns - these reduce the likelihood that something is advice.
 * Used to filter out questions, past tense, etc.
 */
const ANTI_PATTERNS: RegExp[] = [
  /\?$/, // Questions aren't advice
  /\bdid you\b/i, // Past tense questions
  /\bhave you (?!tried)\b/i, // Questions (but NOT "have you tried" - that's advice)
  /\bwould you like\b/i, // Offers, not advice
  /\bdo you want\b/i, // Offers
  /\bI don't think you should\b/i, // Negative advice (complex to track)
  /\byou shouldn't\b/i, // Prohibitions (different from suggestions)
];

// ============================================================================
// ADVICE EXTRACTION
// ============================================================================

interface AdviceDetectionResult {
  containsAdvice: boolean;
  adviceText: string | null;
  category: AgentAdviceContext['category'] | null;
  confidence: number;
  matchedPattern: string | null;
}

/**
 * Detect if a response contains advice.
 */
export function detectAdvice(responseText: string): AdviceDetectionResult {
  // Check anti-patterns first
  for (const antiPattern of ANTI_PATTERNS) {
    if (antiPattern.test(responseText)) {
      return {
        containsAdvice: false,
        adviceText: null,
        category: null,
        confidence: 0,
        matchedPattern: null,
      };
    }
  }

  // Check for advice patterns
  for (const { pattern, category, strength } of ADVICE_PATTERNS) {
    const match = responseText.match(pattern);
    if (match) {
      // Extract the sentence containing the advice
      const adviceText = extractAdviceSentence(responseText, match.index || 0);

      return {
        containsAdvice: true,
        adviceText,
        category,
        confidence: strength,
        matchedPattern: pattern.source,
      };
    }
  }

  return {
    containsAdvice: false,
    adviceText: null,
    category: null,
    confidence: 0,
    matchedPattern: null,
  };
}

/**
 * Extract the sentence containing the advice.
 */
function extractAdviceSentence(text: string, matchIndex: number): string {
  // Find sentence boundaries
  const beforeMatch = text.slice(0, matchIndex);
  const afterMatch = text.slice(matchIndex);

  // Find start of sentence
  const lastSentenceEnd = Math.max(
    beforeMatch.lastIndexOf('.'),
    beforeMatch.lastIndexOf('!'),
    beforeMatch.lastIndexOf('?'),
    beforeMatch.lastIndexOf('\n')
  );
  const sentenceStart = lastSentenceEnd >= 0 ? lastSentenceEnd + 1 : 0;

  // Find end of sentence
  const nextSentenceEnd = afterMatch.search(/[.!?\n]/);
  const sentenceEnd =
    nextSentenceEnd >= 0
      ? matchIndex + nextSentenceEnd + 1
      : text.length;

  return text.slice(sentenceStart, sentenceEnd).trim();
}

// ============================================================================
// MAIN TRACKING FUNCTION
// ============================================================================

/**
 * Analyze agent response for advice and record it if found.
 *
 * Call this from response-processor.ts after the response is finalized.
 *
 * @param responseText - The final response text
 * @param context - Context about the conversation
 */
export async function trackAdviceInResponse(
  responseText: string,
  context: {
    userId: string;
    sessionId: string;
    personaId: string;
    topic?: string;
    userSituation?: string;
    userEmotion?: string;
  }
): Promise<void> {
  const { userId, sessionId, personaId, topic, userSituation, userEmotion } = context;

  if (!userId || userId === 'anonymous') {
    return; // Skip for anonymous users
  }

  // Detect advice
  const detection = detectAdvice(responseText);

  if (!detection.containsAdvice || !detection.adviceText || !detection.category) {
    return; // No advice detected
  }

  // Only track high-confidence advice
  if (detection.confidence < 0.6) {
    log.debug(
      { userId, confidence: detection.confidence, pattern: detection.matchedPattern },
      'Low-confidence advice skipped'
    );
    return;
  }

  // Record the advice for counterfactual memory
  try {
    await recordAgentAdvice({
      userId,
      sessionId,
      personaId,
      timestamp: new Date(),
      adviceText: detection.adviceText,
      topic: topic || 'general',
      category: detection.category,
      userSituation,
      userEmotion,
    });

    log.debug(
      {
        userId,
        category: detection.category,
        advice: detection.adviceText.slice(0, 50),
        confidence: detection.confidence,
      },
      '📝 Advice tracked for counterfactual memory'
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to track advice');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { AdviceDetectionResult };

