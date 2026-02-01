/**
 * Semantic Intent Splitter - Phase 4 Multi-Intent Upgrade
 *
 * Replaces keyword-based multi-intent detection with semantic understanding.
 * Uses lightweight clause boundary detection + embedding similarity.
 *
 * Example:
 * Input: "Play jazz and check the weather in Seattle"
 * Output: [
 *   { text: "Play jazz", toolId: "playMusic", confidence: 0.92 },
 *   { text: "check the weather in Seattle", toolId: "getWeather", confidence: 0.89 }
 * ]
 *
 * @module tools/semantic-router/multi-intent/semantic-splitter
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getEmbedding, cosineSimilarity, type EmbeddingVector } from '../embedding-providers.js';
import { getToolRegistry } from '../registry.js';
import type { SemanticToolDefinition } from '../types.js';

// Cache for tool embeddings (computed once per session)
const toolEmbeddingCache = new Map<string, EmbeddingVector>();

const log = createLogger({ module: 'semantic-splitter' });

// ============================================================================
// TYPES
// ============================================================================

export interface IntentSpan {
  /** The text of this intent span */
  text: string;
  /** Start position in original text */
  startPos: number;
  /** End position in original text */
  endPos: number;
  /** Best matching tool ID */
  toolId: string | null;
  /** Confidence that this is a valid intent (0-1) */
  confidence: number;
  /** Embedding of this span (for debugging) */
  embedding?: number[];
}

export interface SemanticSplitResult {
  /** Whether multiple distinct intents were found */
  isMultiIntent: boolean;
  /** Detected intent spans, ordered by position in text */
  intents: IntentSpan[];
  /** Original input text */
  originalText: string;
  /** Processing time in ms */
  processingTimeMs: number;
}

// ============================================================================
// CLAUSE BOUNDARY DETECTION
// ============================================================================

/**
 * Conjunctions and phrases that typically separate intents.
 * Ordered by specificity (longer patterns first).
 */
const INTENT_SEPARATORS = [
  // Multi-word separators (must be checked first)
  'and also',
  'and then',
  'as well as',
  'in addition to',
  'on top of that',
  'but also',
  'not only',
  'while also',
  'at the same time',
  'plus also',
  // Single-word separators
  'also',
  'plus',
  'and',
  'then',
  'but',
  'while',
];

/**
 * Words that should NOT be treated as separators in certain contexts.
 * These are often part of tool arguments rather than intent boundaries.
 */
const FALSE_POSITIVE_CONTEXTS = [
  // Music queries: "rock and roll", "guns and roses", "hall and oates"
  /\b(rock|country|rhythm)\s+and\s+(roll|blues|western)\b/i,
  /\b(\w+)\s+and\s+(\w+)\s+(band|group|artist)/i,
  // Location queries: "fish and chips", "bed and breakfast"
  /\b(bed|fish|rock)\s+and\s+(breakfast|chips|roll)\b/i,
  // Time expressions: "now and then", "then and there"
  /\b(now|then|here)\s+and\s+(then|there|now)\b/i,
];

/**
 * Split input into candidate clauses based on separators.
 */
function splitIntoClauses(input: string): Array<{ text: string; startPos: number; endPos: number }> {
  // Check for false positives first
  for (const pattern of FALSE_POSITIVE_CONTEXTS) {
    if (pattern.test(input)) {
      // This looks like a compound noun/phrase, don't split
      return [{ text: input.trim(), startPos: 0, endPos: input.length }];
    }
  }

  const clauses: Array<{ text: string; startPos: number; endPos: number }> = [];
  let remaining = input;
  let currentPos = 0;

  // Try each separator pattern
  for (const separator of INTENT_SEPARATORS) {
    const regex = new RegExp(`\\s*\\b${separator}\\b\\s*`, 'gi');
    const parts = remaining.split(regex);

    if (parts.length > 1) {
      // Found a split point
      let pos = 0;
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.length > 0) {
          const startPos = input.indexOf(trimmed, pos);
          clauses.push({
            text: trimmed,
            startPos: startPos >= 0 ? startPos : currentPos,
            endPos: startPos >= 0 ? startPos + trimmed.length : currentPos + trimmed.length,
          });
          pos = startPos + trimmed.length;
        }
      }
      return clauses;
    }
  }

  // No separator found - return entire input as single clause
  return [{ text: input.trim(), startPos: 0, endPos: input.length }];
}

// ============================================================================
// SEMANTIC SCORING
// ============================================================================

/**
 * Score a clause against all registered tools using embedding similarity.
 */
async function scoreClauseAgainstTools(
  clause: string,
  toolDefinitions: SemanticToolDefinition[]
): Promise<{ toolId: string | null; confidence: number }> {
  if (!clause || clause.length < 3) {
    return { toolId: null, confidence: 0 };
  }

  try {
    // Get embedding for the clause
    const clauseEmbedding = await getEmbedding(clause);
    if (!clauseEmbedding || clauseEmbedding.length === 0) {
      return { toolId: null, confidence: 0 };
    }

    // Score against each tool's embedding
    let bestMatch: { toolId: string; confidence: number } = { toolId: '', confidence: 0 };

    for (const tool of toolDefinitions) {
      // Use cached embedding or compute from description
      let toolEmbedding = toolEmbeddingCache.get(tool.id);
      if (!toolEmbedding) {
        const combinedText = `${tool.name}: ${tool.description}`;
        toolEmbedding = await getEmbedding(combinedText);
        if (toolEmbedding && toolEmbedding.length > 0) {
          toolEmbeddingCache.set(tool.id, toolEmbedding);
        }
      }

      if (toolEmbedding && toolEmbedding.length > 0) {
        const similarity = cosineSimilarity(clauseEmbedding, toolEmbedding);
        if (similarity > bestMatch.confidence) {
          bestMatch = { toolId: tool.id, confidence: similarity };
        }
      }
    }

    // Minimum confidence threshold
    if (bestMatch.confidence < 0.3) {
      return { toolId: null, confidence: bestMatch.confidence };
    }

    return bestMatch;
  } catch (error) {
    log.warn({ error: String(error), clause }, 'Failed to score clause');
    return { toolId: null, confidence: 0 };
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Split a user input into distinct intent spans using semantic understanding.
 *
 * @param input - User input text
 * @returns Detected intent spans with tool matches
 */
export async function semanticSplit(input: string): Promise<SemanticSplitResult> {
  const startTime = performance.now();

  // Normalize input
  const normalized = input.trim();
  if (!normalized) {
    return {
      isMultiIntent: false,
      intents: [],
      originalText: input,
      processingTimeMs: 0,
    };
  }

  // Step 1: Split into candidate clauses
  const clauses = splitIntoClauses(normalized);

  // Single clause - not multi-intent
  if (clauses.length <= 1) {
    const clause = clauses[0] || { text: normalized, startPos: 0, endPos: normalized.length };
    const registry = getToolRegistry();
    const tools = registry.getAll();
    const { toolId, confidence } = await scoreClauseAgainstTools(clause.text, tools);

    return {
      isMultiIntent: false,
      intents: [
        {
          text: clause.text,
          startPos: clause.startPos,
          endPos: clause.endPos,
          toolId,
          confidence,
        },
      ],
      originalText: input,
      processingTimeMs: Math.round(performance.now() - startTime),
    };
  }

  // Step 2: Score each clause against tools
  const registry = getToolRegistry();
  const tools = registry.getAll();

  const intents: IntentSpan[] = [];

  for (const clause of clauses) {
    const { toolId, confidence } = await scoreClauseAgainstTools(clause.text, tools);

    intents.push({
      text: clause.text,
      startPos: clause.startPos,
      endPos: clause.endPos,
      toolId,
      confidence,
    });
  }

  // Step 3: Filter out low-confidence intents
  const validIntents = intents.filter((intent) => intent.confidence >= 0.4);

  // Step 4: Deduplicate (same tool matched by multiple clauses)
  const seenTools = new Set<string>();
  const deduplicatedIntents = validIntents.filter((intent) => {
    if (!intent.toolId) return true; // Keep unmatched intents
    if (seenTools.has(intent.toolId)) return false;
    seenTools.add(intent.toolId);
    return true;
  });

  const processingTimeMs = Math.round(performance.now() - startTime);

  log.debug(
    {
      input: input.slice(0, 100),
      clauseCount: clauses.length,
      intentCount: deduplicatedIntents.length,
      processingTimeMs,
    },
    'Semantic split complete'
  );

  return {
    isMultiIntent: deduplicatedIntents.length > 1,
    intents: deduplicatedIntents,
    originalText: input,
    processingTimeMs,
  };
}

/**
 * Check if an input likely contains multiple intents (fast check).
 * Use this before the full semanticSplit for performance.
 */
export function likelyMultiIntent(input: string): boolean {
  // Check for false positives first
  for (const pattern of FALSE_POSITIVE_CONTEXTS) {
    if (pattern.test(input)) {
      return false;
    }
  }

  // Quick keyword check
  for (const separator of INTENT_SEPARATORS) {
    const regex = new RegExp(`\\b${separator}\\b`, 'i');
    if (regex.test(input)) {
      return true;
    }
  }

  return false;
}
