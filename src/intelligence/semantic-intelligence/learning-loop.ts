/**
 * Phase 2: Learning Loop - Track JSON Executions
 *
 * Records what tools were ACTUALLY executed via JSON dispatch,
 * compares to semantic predictions, and learns from the delta.
 *
 * Key insight: JSON dispatch is our source of truth for what happened.
 * We use this to train semantic predictions over time.
 *
 * Learning signals:
 * 1. Implicit corrections - JSON executed different tool than predicted
 * 2. Explicit corrections - User says "no, I meant X"
 * 3. Success patterns - What worked well (no re-prompts)
 * 4. Failure patterns - What didn't work (user frustrated/re-asked)
 *
 * @module intelligence/semantic-intelligence/learning-loop
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  saveExecutionRecord,
  getExecutionRecords,
  saveToolPatterns,
  getToolPatterns,
} from './persistence.js';

const log = createLogger({ module: 'SemanticIntelligence.LearningLoop' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Record of a tool execution via JSON dispatch
 */
export interface ExecutionRecord {
  /** Unique ID for this execution */
  id: string;

  /** User who made the request */
  userId: string;

  /** Session this happened in */
  sessionId: string;

  /** Current persona */
  personaId: string;

  /** Original user input text */
  inputText: string;

  /** What semantic router predicted (if any) */
  semanticPrediction?: {
    toolId: string;
    confidence: number;
  };

  /** What was actually executed via JSON */
  jsonExecution: {
    toolId: string;
    args: Record<string, unknown>;
    success: boolean;
    executionTimeMs: number;
  };

  /** Was this an implicit correction? (prediction != execution) */
  wasCorrection: boolean;

  /** Correction type */
  correctionType?: 'implicit' | 'explicit';

  /** Timestamp */
  timestamp: Date;

  /** Additional context */
  context?: {
    recentTools?: string[];
    conversationTurn?: number;
    userMood?: string;
  };
}

/**
 * Learned pattern for a user
 */
export interface ToolPattern {
  /** User this pattern belongs to */
  userId: string;

  /** Input pattern (phrase or regex) */
  inputPattern: string;

  /** Tool that should be called */
  toolId: string;

  /** How many times this pattern succeeded */
  successCount: number;

  /** How many times this pattern failed */
  failureCount: number;

  /** Computed confidence (success / total) */
  confidence: number;

  /** Last time this pattern was used */
  lastUsed: Date;

  /** First time this pattern was seen */
  firstSeen: Date;
}

/**
 * Prediction result from learned patterns
 */
export interface ToolPrediction {
  /** Predicted tool */
  toolId: string;

  /** Confidence based on user history */
  confidence: number;

  /** How many times we've seen this pattern */
  sampleCount: number;

  /** Source of prediction */
  source: 'user_pattern' | 'global_pattern' | 'time_pattern';

  /** The pattern that matched */
  matchedPattern?: string;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Record a tool execution from JSON dispatch
 *
 * This is the primary data collection point for learning.
 * Should be called every time a JSON function call is executed.
 *
 * @example
 * ```typescript
 * await recordToolExecution({
 *   userId: 'user-123',
 *   sessionId: 'session-456',
 *   personaId: 'ferni',
 *   inputText: 'play some jazz',
 *   jsonExecution: {
 *     toolId: 'playMusic',
 *     args: { genre: 'jazz' },
 *     success: true,
 *     executionTimeMs: 150,
 *   },
 *   semanticPrediction: {
 *     toolId: 'playMusic',
 *     confidence: 0.92,
 *   },
 * });
 * ```
 */
export async function recordToolExecution(params: {
  userId: string;
  sessionId: string;
  personaId: string;
  inputText: string;
  jsonExecution: {
    toolId: string;
    args: Record<string, unknown>;
    success: boolean;
    executionTimeMs: number;
  };
  semanticPrediction?: {
    toolId: string;
    confidence: number;
  };
  context?: ExecutionRecord['context'];
}): Promise<ExecutionRecord> {
  const wasCorrection =
    params.semanticPrediction !== undefined &&
    params.semanticPrediction.toolId !== params.jsonExecution.toolId;

  const record: ExecutionRecord = {
    id: `exec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    userId: params.userId,
    sessionId: params.sessionId,
    personaId: params.personaId,
    inputText: params.inputText,
    semanticPrediction: params.semanticPrediction,
    jsonExecution: params.jsonExecution,
    wasCorrection,
    correctionType: wasCorrection ? 'implicit' : undefined,
    timestamp: new Date(),
    context: params.context,
  };

  // Store the record (uses persistence layer with caching)
  await saveExecutionRecord(params.userId, record);

  // Learn from this execution
  await learnFromExecution(record);

  log.debug(
    {
      recordId: record.id,
      userId: params.userId,
      inputText: params.inputText.substring(0, 50),
      predictedTool: params.semanticPrediction?.toolId,
      actualTool: params.jsonExecution.toolId,
      wasCorrection,
      success: params.jsonExecution.success,
    },
    'Recorded tool execution'
  );

  return record;
}

/**
 * Record an implicit correction (LLM chose different tool than predicted)
 *
 * Called when we detect the LLM used a different tool than semantic predicted.
 */
export async function recordImplicitCorrection(params: {
  userId: string;
  inputText: string;
  predictedToolId: string;
  actualToolId: string;
}): Promise<void> {
  const patterns = await getToolPatterns(params.userId);

  // Find existing pattern for predicted tool
  const existingPattern = patterns.find(
    (p) =>
      p.inputPattern.toLowerCase() === params.inputText.toLowerCase() &&
      p.toolId === params.predictedToolId
  );

  if (existingPattern) {
    // Increment failure count for wrong prediction
    existingPattern.failureCount++;
    existingPattern.confidence =
      existingPattern.successCount / (existingPattern.successCount + existingPattern.failureCount);
  }

  // Create or update pattern for actual tool
  const actualPattern = patterns.find(
    (p) =>
      p.inputPattern.toLowerCase() === params.inputText.toLowerCase() &&
      p.toolId === params.actualToolId
  );

  if (actualPattern) {
    actualPattern.successCount++;
    actualPattern.lastUsed = new Date();
    actualPattern.confidence =
      actualPattern.successCount / (actualPattern.successCount + actualPattern.failureCount);
  } else {
    patterns.push({
      userId: params.userId,
      inputPattern: params.inputText.toLowerCase(),
      toolId: params.actualToolId,
      successCount: 1,
      failureCount: 0,
      confidence: 1.0,
      lastUsed: new Date(),
      firstSeen: new Date(),
    });
  }

  await saveToolPatterns(params.userId, patterns);

  log.info(
    {
      userId: params.userId,
      inputText: params.inputText.substring(0, 50),
      predictedTool: params.predictedToolId,
      actualTool: params.actualToolId,
    },
    'Recorded implicit correction'
  );
}

/**
 * Record an explicit correction from user
 *
 * Called when user says "no, I meant X" or similar.
 */
export async function recordExplicitCorrection(params: {
  userId: string;
  inputText: string;
  wrongToolId: string;
  correctToolId: string;
  userFeedback?: string;
}): Promise<void> {
  const patterns = await getToolPatterns(params.userId);

  // Strongly penalize wrong tool
  const wrongPattern = patterns.find(
    (p) =>
      p.inputPattern.toLowerCase() === params.inputText.toLowerCase() &&
      p.toolId === params.wrongToolId
  );

  if (wrongPattern) {
    wrongPattern.failureCount += 3; // Explicit corrections count more
    wrongPattern.confidence =
      wrongPattern.successCount / (wrongPattern.successCount + wrongPattern.failureCount);
  }

  // Strongly boost correct tool
  const correctPattern = patterns.find(
    (p) =>
      p.inputPattern.toLowerCase() === params.inputText.toLowerCase() &&
      p.toolId === params.correctToolId
  );

  if (correctPattern) {
    correctPattern.successCount += 3; // Explicit confirmations count more
    correctPattern.lastUsed = new Date();
    correctPattern.confidence =
      correctPattern.successCount / (correctPattern.successCount + correctPattern.failureCount);
  } else {
    patterns.push({
      userId: params.userId,
      inputPattern: params.inputText.toLowerCase(),
      toolId: params.correctToolId,
      successCount: 3, // Start higher for explicit correction
      failureCount: 0,
      confidence: 1.0,
      lastUsed: new Date(),
      firstSeen: new Date(),
    });
  }

  await saveToolPatterns(params.userId, patterns);

  log.info(
    {
      userId: params.userId,
      inputText: params.inputText.substring(0, 50),
      wrongTool: params.wrongToolId,
      correctTool: params.correctToolId,
      userFeedback: params.userFeedback,
    },
    'Recorded explicit correction'
  );
}

/**
 * Get tool prediction based on learned patterns
 *
 * Uses user-specific patterns first, then falls back to global patterns.
 */
export async function getToolPrediction(params: {
  userId: string;
  inputText: string;
}): Promise<ToolPrediction | null> {
  const patterns = await getToolPatterns(params.userId);
  const normalizedInput = params.inputText.toLowerCase();

  // Find best matching pattern
  let bestMatch: ToolPattern | null = null;
  let bestSimilarity = 0;

  for (const pattern of patterns) {
    // Exact match
    if (pattern.inputPattern === normalizedInput) {
      if (pattern.confidence > (bestMatch?.confidence ?? 0)) {
        bestMatch = pattern;
        bestSimilarity = 1.0;
      }
    }
    // Fuzzy match - check if pattern is contained in input
    else if (
      normalizedInput.includes(pattern.inputPattern) ||
      pattern.inputPattern.includes(normalizedInput)
    ) {
      const similarity = calculateSimilarity(normalizedInput, pattern.inputPattern);
      if (similarity > 0.7 && similarity > bestSimilarity) {
        bestMatch = pattern;
        bestSimilarity = similarity;
      }
    }
  }

  if (bestMatch && bestMatch.confidence > 0.5) {
    return {
      toolId: bestMatch.toolId,
      confidence: bestMatch.confidence * bestSimilarity, // Adjust by similarity
      sampleCount: bestMatch.successCount + bestMatch.failureCount,
      source: 'user_pattern',
      matchedPattern: bestMatch.inputPattern,
    };
  }

  return null;
}

/**
 * Get all learned patterns for a user
 */
export async function getUserToolPatterns(userId: string): Promise<ToolPattern[]> {
  return getToolPatterns(userId);
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Learn from a tool execution
 */
async function learnFromExecution(record: ExecutionRecord): Promise<void> {
  if (!record.jsonExecution.success) {
    // Don't learn from failed executions
    return;
  }

  const patterns = await getToolPatterns(record.userId);
  const normalizedInput = record.inputText.toLowerCase();

  // Find or create pattern
  const existingPattern = patterns.find(
    (p) => p.inputPattern === normalizedInput && p.toolId === record.jsonExecution.toolId
  );

  if (existingPattern) {
    existingPattern.successCount++;
    existingPattern.lastUsed = record.timestamp;
    existingPattern.confidence =
      existingPattern.successCount / (existingPattern.successCount + existingPattern.failureCount);
  } else {
    patterns.push({
      userId: record.userId,
      inputPattern: normalizedInput,
      toolId: record.jsonExecution.toolId,
      successCount: 1,
      failureCount: 0,
      confidence: 1.0,
      lastUsed: record.timestamp,
      firstSeen: record.timestamp,
    });
  }

  // Prune old/low-confidence patterns before saving
  const pruned = prunePatterns(patterns);
  await saveToolPatterns(record.userId, pruned);
}

/**
 * Prune patterns to prevent unbounded growth
 */
function prunePatterns(patterns: ToolPattern[]): ToolPattern[] {
  if (patterns.length <= 100) {
    return patterns;
  }

  // Remove low-confidence patterns that haven't been used recently
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  return patterns
    .filter((p) => p.confidence > 0.3 || p.lastUsed > thirtyDaysAgo)
    .sort((a, b) => {
      // Sort by recency and confidence
      const scoreA = a.confidence * (a.lastUsed.getTime() / Date.now());
      const scoreB = b.confidence * (b.lastUsed.getTime() / Date.now());
      return scoreB - scoreA;
    })
    .slice(0, 100); // Keep top 100
}

/**
 * Calculate simple string similarity (Dice coefficient)
 */
function calculateSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;

  const bigrams1 = new Set<string>();
  for (let i = 0; i < s1.length - 1; i++) {
    bigrams1.add(s1.substring(i, i + 2));
  }

  let intersectionSize = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bigram = s2.substring(i, i + 2);
    if (bigrams1.has(bigram)) {
      intersectionSize++;
      bigrams1.delete(bigram); // Count each match only once
    }
  }

  return (2.0 * intersectionSize) / (s1.length + s2.length - 2);
}
