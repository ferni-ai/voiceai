/**
 * Conversation priming leftovers.
 *
 * JSON {fn,args} priming was removed. Native function calling / FTIS handle
 * tools. This module still exposes leakage detection and context pruning.
 *
 * @module agents/shared/conversation-priming
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ConversationPriming' });

// ============================================================================
// TYPES
// ============================================================================

export interface PrimingTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** Whether this turn should be visible in logs */
  isVisible: boolean;
  /** Description for logging */
  description: string;
}

export interface ConversationPrimingConfig {
  /** Whether priming is enabled */
  enabled: boolean;
  /** Persona ID for persona-specific priming */
  personaId: string;
  /** Log level for priming events */
  logLevel: 'debug' | 'info' | 'warn';
  /** Whether to add critical tool priming (handoffs, music) */
  primeCriticalTools: boolean;
  /** Whether to add JSON format reminder */
  primeJsonFormat: boolean;
}

export interface PrimingResult {
  /** Priming turns that were added */
  turns: PrimingTurn[];
  /** Whether priming was successful */
  success: boolean;
  /** Any warnings or notes */
  notes: string[];
}

// ============================================================================
// PRIMING TURN TEMPLATES
// ============================================================================

/**
 * Get priming turns based on persona and configuration.
 *
 * These are synthetic conversation turns that prime Gemini to output JSON.
 * They appear in conversation history but are NOT spoken aloud.
 */
export function getPrimingTurns(_config: ConversationPrimingConfig): PrimingTurn[] {
  // Native FC / FTIS handle tools — do not teach JSON {fn,args} in history.
  return [];
}

/**
 * Apply priming turns to a conversation history.
 *
 * @param addTurn - Function to add a turn to conversation history
 * @param config - Priming configuration
 * @returns Result of priming operation
 */
export function applyConversationPriming(
  addTurn: (role: 'user' | 'assistant', content: string) => void,
  config: ConversationPrimingConfig
): PrimingResult {
  const result: PrimingResult = {
    turns: [],
    success: true,
    notes: [],
  };

  if (!config.enabled) {
    result.notes.push('Priming disabled');
    log.debug('🎯 PRIMING: Skipped (disabled)');
    return result;
  }

  const turns = getPrimingTurns(config);

  if (turns.length === 0) {
    result.notes.push('No priming turns generated');
    return result;
  }

  log.info({ turnCount: turns.length }, '🎯 PRIMING: Applying conversation priming to history');

  try {
    for (const turn of turns) {
      if (turn.role === 'user' || turn.role === 'assistant') {
        addTurn(turn.role, turn.content);
        result.turns.push(turn);

        if (config.logLevel === 'info' || config.logLevel === 'debug') {
          log.info(
            { role: turn.role, description: turn.description },
            `🎯 PRIMING: Added ${turn.role} turn`
          );
        }
      }
    }

    log.info(
      { addedTurns: result.turns.length },
      '🎯 PRIMING: Successfully applied all priming turns'
    );
  } catch (error) {
    result.success = false;
    result.notes.push(`Error applying priming: ${String(error)}`);
    log.error({ error: String(error) }, '🎯 PRIMING: Failed to apply priming');
  }

  return result;
}

// ============================================================================
// RETRY LOGIC FOR FAILED TOOL CALLS
// ============================================================================

/**
 * Patterns that suggest a tool call was expected but not made.
 * These are phrases Gemini uses when it SHOULD have called a tool.
 */
const TOOL_CALL_LEAKAGE_PATTERNS = [
  // Music patterns
  /i(?:'ll| will) play/i,
  /let me play/i,
  /playing .* for you/i,
  /i(?:'ll| will) put on/i,
  /let me find .* music/i,
  /how about .* music/i,
  /what kind of .* would you like/i,

  // Handoff patterns
  /i(?:'ll| will) connect you/i,
  /let me transfer/i,
  /i(?:'ll| will) hand you off/i,
  /i(?:'m| am) going to hand/i,
  /(maya|alex|peter|jordan|nayan) (?:is|can|would be) (?:great|perfect|better)/i,

  // Information patterns
  /i(?:'ll| will) check/i,
  /let me look/i,
  /i(?:'ll| will) search/i,
  /i think the weather/i,
  /as of my knowledge/i,
];

/**
 * Check if a response indicates Gemini "spoke" instead of calling a tool.
 */
export function detectsToolCallLeakage(response: string): {
  isLeakage: boolean;
  pattern: string | null;
  suggestedTool: string | null;
} {
  const lower = response.toLowerCase();

  for (const pattern of TOOL_CALL_LEAKAGE_PATTERNS) {
    if (pattern.test(response)) {
      // Determine which tool should have been called
      let suggestedTool: string | null = null;

      if (/play|music|song/i.test(lower)) {
        suggestedTool = 'playMusic';
      } else if (/maya|habit|budget|routine|spending/i.test(lower)) {
        suggestedTool = 'handoffToMaya';
      } else if (/alex|calendar|email|schedule|meeting/i.test(lower)) {
        suggestedTool = 'handoffToAlex';
      } else if (/peter|invest|stock|research|portfolio/i.test(lower)) {
        suggestedTool = 'handoffToPeter';
      } else if (/jordan|wedding|celebration|birthday|milestone/i.test(lower)) {
        suggestedTool = 'handoffToJordan';
      } else if (/nayan|wisdom|meaning|philosophy|purpose/i.test(lower)) {
        suggestedTool = 'handoffToNayan';
      } else if (/weather/i.test(lower)) {
        suggestedTool = 'getWeather';
      } else if (/news/i.test(lower)) {
        suggestedTool = 'getNews';
      }

      log.warn(
        { pattern: pattern.source, suggestedTool, responsePreview: response.slice(0, 100) },
        '🚨 TOOL LEAKAGE: Gemini spoke instead of calling tool'
      );

      return {
        isLeakage: true,
        pattern: pattern.source,
        suggestedTool,
      };
    }
  }

  return { isLeakage: false, pattern: null, suggestedTool: null };
}

/**
 * Generate a retry prompt when tool call leakage is detected.
 *
 * This prompt explicitly tells Gemini to output JSON for the expected tool.
 * Uses progressively more forceful language on subsequent attempts.
 */
export function generateRetryPrompt(
  _originalMessage: string,
  _suggestedTool: string | null,
  _attempt: number
): string {
  // Native FC — do not teach JSON {fn,args} on retry.
  return '';
}

// ============================================================================
// CONTEXT PRUNING
// ============================================================================

/**
 * Configuration for context pruning.
 */
export interface ContextPruningConfig {
  /** Maximum turns to keep (including priming) */
  maxTurns: number;
  /** Always keep last N user/assistant turns */
  minRecentTurns: number;
  /** Whether to preserve turns with successful tool calls */
  preserveToolCalls: boolean;
  /** Token limit to trigger pruning (approximate) */
  tokenThreshold: number;
  /** Whether pruning is enabled */
  enabled: boolean;
}

/**
 * A conversation turn for pruning analysis.
 */
export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  /** Index in original conversation */
  index: number;
  /** Whether this is a priming turn */
  isPriming?: boolean;
  /** Whether this turn contains a successful tool call */
  hasToolCall?: boolean;
  /** Timestamp of the turn */
  timestamp?: number;
}

/**
 * Result of context pruning operation.
 */
export interface PruningResult {
  /** Turns to keep */
  keptTurns: ConversationTurn[];
  /** Turns that were pruned */
  prunedTurns: ConversationTurn[];
  /** Whether pruning was applied */
  wasApplied: boolean;
  /** Reason for pruning */
  reason: string | null;
  /** Estimated tokens before pruning */
  estimatedTokensBefore: number;
  /** Estimated tokens after pruning */
  estimatedTokensAfter: number;
}

export const DEFAULT_PRUNING_CONFIG: ContextPruningConfig = {
  maxTurns: 50,
  minRecentTurns: 10,
  preserveToolCalls: true,
  tokenThreshold: 20000, // Prune when approaching Gemini's 30k limit
  enabled: true,
};

/**
 * JSON function call pattern to detect successful tool calls
 */
const JSON_TOOL_CALL_PATTERN = /\{"fn":\s*"[^"]+"/;

/**
 * Estimate token count for a conversation turn (rough approximation).
 * Uses ~4 chars per token as a rough heuristic.
 */
function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/**
 * Check if a turn contains a successful JSON tool call.
 */
function hasJsonToolCall(turn: ConversationTurn): boolean {
  return turn.role === 'assistant' && JSON_TOOL_CALL_PATTERN.test(turn.content);
}

/**
 * Prune conversation context to improve Gemini function calling reliability.
 *
 * Research (Jan 2026) shows that large context degrades Gemini's function calling.
 * This function implements smart pruning that preserves:
 * 1. System prompt (always first turn if present)
 * 2. Priming turns (marked with isPriming: true)
 * 3. Last N user/assistant turns (minRecentTurns)
 * 4. Turns containing successful tool calls (for in-context learning)
 *
 * @param turns - Full conversation history
 * @param config - Pruning configuration
 * @returns Pruning result with kept and pruned turns
 *
 * @example
 * ```typescript
 * const result = pruneConversationContext(conversationHistory, {
 *   maxTurns: 50,
 *   minRecentTurns: 10,
 *   preserveToolCalls: true,
 *   tokenThreshold: 20000,
 *   enabled: true,
 * });
 *
 * if (result.wasApplied) {
 *   // Use result.keptTurns for the LLM
 *   console.log(`Pruned ${result.prunedTurns.length} turns`);
 * }
 * ```
 */
export function pruneConversationContext(
  turns: ConversationTurn[],
  config: ContextPruningConfig = DEFAULT_PRUNING_CONFIG
): PruningResult {
  const result: PruningResult = {
    keptTurns: [],
    prunedTurns: [],
    wasApplied: false,
    reason: null,
    estimatedTokensBefore: 0,
    estimatedTokensAfter: 0,
  };

  if (!config.enabled) {
    result.keptTurns = turns;
    result.reason = 'Pruning disabled';
    return result;
  }

  // Calculate total estimated tokens
  result.estimatedTokensBefore = turns.reduce((sum, turn) => sum + estimateTokens(turn.content), 0);

  // Check if pruning is needed
  const shouldPrune =
    turns.length > config.maxTurns || result.estimatedTokensBefore > config.tokenThreshold;

  if (!shouldPrune) {
    result.keptTurns = turns;
    result.reason = 'Under thresholds, no pruning needed';
    result.estimatedTokensAfter = result.estimatedTokensBefore;
    return result;
  }

  log.info(
    {
      totalTurns: turns.length,
      maxTurns: config.maxTurns,
      estimatedTokens: result.estimatedTokensBefore,
      tokenThreshold: config.tokenThreshold,
    },
    '✂️ PRUNE: Starting context pruning'
  );

  // Categorize turns
  const systemTurns: ConversationTurn[] = [];
  const primingTurns: ConversationTurn[] = [];
  const toolCallTurns: ConversationTurn[] = [];
  const recentTurns: ConversationTurn[] = [];
  const middleTurns: ConversationTurn[] = [];

  // Identify turn categories
  turns.forEach((turn, idx) => {
    // System prompt (usually index 0)
    if (turn.role === 'system') {
      systemTurns.push(turn);
      return;
    }

    // Priming turns (marked)
    if (turn.isPriming) {
      primingTurns.push(turn);
      return;
    }

    // Check if recent turn (last N)
    const isRecentTurn = idx >= turns.length - config.minRecentTurns;
    if (isRecentTurn) {
      recentTurns.push(turn);
      return;
    }

    // Check if contains tool call (preserve for in-context learning)
    if (config.preserveToolCalls && hasJsonToolCall(turn)) {
      toolCallTurns.push(turn);
      return;
    }

    // Everything else is middle content (candidate for pruning)
    middleTurns.push(turn);
  });

  // Calculate how many middle turns we can keep
  const preservedCount =
    systemTurns.length + primingTurns.length + toolCallTurns.length + recentTurns.length;
  const remainingSlots = Math.max(0, config.maxTurns - preservedCount);

  // Keep the most recent middle turns if we have room
  const keptMiddleTurns = middleTurns.slice(-remainingSlots);
  const prunedMiddleTurns = middleTurns.slice(0, -remainingSlots || undefined);

  // Reconstruct the conversation in original order
  const keptTurnIndices = new Set<number>([
    ...systemTurns.map((t) => t.index),
    ...primingTurns.map((t) => t.index),
    ...toolCallTurns.map((t) => t.index),
    ...keptMiddleTurns.map((t) => t.index),
    ...recentTurns.map((t) => t.index),
  ]);

  // Build final turn arrays preserving original order
  result.keptTurns = turns.filter((turn) => keptTurnIndices.has(turn.index));
  result.prunedTurns = turns.filter((turn) => !keptTurnIndices.has(turn.index));
  result.wasApplied = result.prunedTurns.length > 0;
  result.estimatedTokensAfter = result.keptTurns.reduce(
    (sum, turn) => sum + estimateTokens(turn.content),
    0
  );

  result.reason = `Pruned ${result.prunedTurns.length} turns (kept: ${systemTurns.length} system, ${primingTurns.length} priming, ${toolCallTurns.length} tool calls, ${keptMiddleTurns.length} middle, ${recentTurns.length} recent)`;

  log.info(
    {
      pruned: result.prunedTurns.length,
      kept: result.keptTurns.length,
      tokensBefore: result.estimatedTokensBefore,
      tokensAfter: result.estimatedTokensAfter,
      tokensSaved: result.estimatedTokensBefore - result.estimatedTokensAfter,
    },
    '✂️ PRUNE: Context pruning complete'
  );

  return result;
}

/**
 * Check if pruning is recommended based on current context.
 *
 * @param turns - Current conversation history
 * @param config - Pruning configuration
 * @returns Whether pruning should be applied
 */
export function shouldPruneContext(
  turns: ConversationTurn[],
  config: ContextPruningConfig = DEFAULT_PRUNING_CONFIG
): { shouldPrune: boolean; reason: string } {
  if (!config.enabled) {
    return { shouldPrune: false, reason: 'Pruning disabled' };
  }

  if (turns.length > config.maxTurns) {
    return {
      shouldPrune: true,
      reason: `Turn count (${turns.length}) exceeds max (${config.maxTurns})`,
    };
  }

  const estimatedTokens = turns.reduce((sum, turn) => sum + estimateTokens(turn.content), 0);
  if (estimatedTokens > config.tokenThreshold) {
    return {
      shouldPrune: true,
      reason: `Token count (~${estimatedTokens}) exceeds threshold (${config.tokenThreshold})`,
    };
  }

  return { shouldPrune: false, reason: 'Under thresholds' };
}

/**
 * Mark priming turns in a conversation history.
 * Call this after applying priming to tag the turns for preservation during pruning.
 *
 * @param turns - Conversation turns
 * @param primingCount - Number of priming turns that were added
 * @returns Turns with priming flags set
 */
export function markPrimingTurns(
  turns: ConversationTurn[],
  primingCount: number
): ConversationTurn[] {
  // Priming turns are added after system prompt, so they're at indices 1 through primingCount
  return turns.map((turn, idx) => {
    // Skip system prompt (index 0)
    // Priming turns are 1 through primingCount
    const isPrimingTurn = idx > 0 && idx <= primingCount;
    return {
      ...turn,
      isPriming: isPrimingTurn || turn.isPriming,
    };
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export const DEFAULT_PRIMING_CONFIG: ConversationPrimingConfig = {
  enabled: true,
  personaId: 'ferni',
  logLevel: 'info',
  primeCriticalTools: true,
  primeJsonFormat: true,
};
