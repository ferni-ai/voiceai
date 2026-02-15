/**
 * LLM Prompt Compressor
 *
 * Reduces prompt token count by categorizing query complexity
 * and compressing low-priority context injections for simple queries.
 *
 * Part of WS3: Sub-300ms latency optimization.
 *
 * @module agents/shared/prompt-compressor
 */

import type { ContextInjection } from '../../types/context-injection-types.js';
import { createLogger } from '../../utils/safe-logger.js';
import { isOptimizationEnabled } from './performance/latency-feature-flags.js';

const log = createLogger({ module: 'PromptCompressor' });

// ============================================================================
// METRICS
// ============================================================================

let totalCompressed = 0;
let compressionRatios: number[] = [];

// ============================================================================
// QUERY CATEGORIZATION (heuristic-based, no LLM calls)
// ============================================================================

type QueryComplexity = 'simple' | 'moderate' | 'complex';

const GREETING_RE =
  /^(hi|hey|hello|sup|yo|what'?s up|howdy|good\s+(morning|afternoon|evening|night))\b/i;
const YES_NO_RE =
  /^(yes|no|yeah|nah|yep|nope|sure|ok|okay|uh huh|mhm|right|correct|absolutely|definitely|not really|I guess|maybe)\b/i;
const SHORT_ACK_RE =
  /^(thanks|thank you|got it|cool|nice|great|awesome|perfect|sounds good|alright)\b/i;
const QUESTION_WORD_RE =
  /\b(what|why|how|when|where|who|which|can|could|would|should|is|are|do|does|did|will|have|has)\b/i;
const EMOTIONAL_RE =
  /\b(feel|feeling|felt|anxious|stressed|worried|scared|sad|depressed|angry|frustrated|overwhelmed|grief|loss|lonely|hurt|cry|crying|panic)\b/i;
const MULTI_PART_RE =
  /\b(and also|plus|additionally|another thing|on top of that|first.*then|both.*and)\b/i;

/**
 * Categorize query complexity using lightweight regex heuristics.
 */
export function categorizeQuery(transcript: string): QueryComplexity {
  const trimmed = transcript.trim();
  const wordCount = trimmed.split(/\s+/).filter((w) => w.length > 0).length;

  // Simple: greetings, yes/no answers, short acknowledgments
  if (wordCount < 10) {
    if (GREETING_RE.test(trimmed) || YES_NO_RE.test(trimmed) || SHORT_ACK_RE.test(trimmed)) {
      return 'simple';
    }
    // Short non-question, non-emotional statements
    if (!QUESTION_WORD_RE.test(trimmed) && !EMOTIONAL_RE.test(trimmed)) {
      return 'simple';
    }
  }

  // Complex: emotional content, multi-part questions, long queries
  if (EMOTIONAL_RE.test(trimmed) || MULTI_PART_RE.test(trimmed) || wordCount > 40) {
    return 'complex';
  }

  return 'moderate';
}

// ============================================================================
// COMPRESSION
// ============================================================================

function truncateToSentences(text: string, maxSentences: number): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  if (sentences.length <= maxSentences) return text;
  return sentences.slice(0, maxSentences).join(' ');
}

/**
 * Compress injection content based on query complexity.
 *
 * - Simple queries: keep only priority >= 80, truncate to first sentence
 * - Moderate queries: keep priority >= 50, truncate low-priority to 2 sentences
 * - Complex queries: no compression (full context needed)
 */
export function compressInjectionContent(
  injections: ContextInjection[],
  queryComplexity: QueryComplexity
): ContextInjection[] {
  if (!isOptimizationEnabled('PROMPT_COMPRESSION')) {
    return injections;
  }

  if (queryComplexity === 'complex') {
    return injections;
  }

  const originalLength = injections.reduce((sum, inj) => sum + inj.content.length, 0);

  let compressed: ContextInjection[];

  if (queryComplexity === 'simple') {
    compressed = injections
      .filter((inj) => inj.priority >= 80)
      .map((inj) => ({
        ...inj,
        content: truncateToSentences(inj.content, 1),
      }));
  } else {
    // moderate
    compressed = injections
      .filter((inj) => inj.priority >= 50)
      .map((inj) => ({
        ...inj,
        content: inj.priority < 70 ? truncateToSentences(inj.content, 2) : inj.content,
      }));
  }

  const compressedLength = compressed.reduce((sum, inj) => sum + inj.content.length, 0);
  const ratio = originalLength > 0 ? compressedLength / originalLength : 1;

  totalCompressed++;
  compressionRatios.push(ratio);
  if (compressionRatios.length > 100) {
    compressionRatios = compressionRatios.slice(-100);
  }

  log.debug(
    {
      complexity: queryComplexity,
      before: injections.length,
      after: compressed.length,
      ratio: ratio.toFixed(2),
    },
    'Prompt compressed'
  );

  return compressed;
}

// ============================================================================
// METRICS
// ============================================================================

/**
 * Get compression metrics for observability.
 */
export function getCompressionMetrics(): {
  totalCompressed: number;
  avgCompressionRatio: number;
} {
  const avgRatio =
    compressionRatios.length > 0
      ? compressionRatios.reduce((a, b) => a + b, 0) / compressionRatios.length
      : 1;

  return {
    totalCompressed,
    avgCompressionRatio: avgRatio,
  };
}
