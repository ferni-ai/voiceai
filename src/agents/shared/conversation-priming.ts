/**
 * Conversation Priming for JSON Function Calling
 *
 * CRITICAL INSIGHT (Dec 2024):
 * Testing revealed that Gemini only outputs JSON function calls reliably when
 * the conversation history contains prior examples of JSON output. This module
 * provides "priming" - adding hidden conversation turns that teach Gemini
 * the expected output format.
 *
 * WHY THIS WORKS:
 * - Gemini uses in-context learning from conversation history
 * - Seeing prior JSON outputs primes it to continue the pattern
 * - System prompt alone is NOT sufficient (verified via testing)
 *
 * WHAT THIS MODULE DOES:
 * 1. Adds synthetic "priming" turns after greeting
 * 2. These turns demonstrate JSON output format
 * 3. They're hidden from the user but visible to Gemini
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
export function getPrimingTurns(config: ConversationPrimingConfig): PrimingTurn[] {
  const turns: PrimingTurn[] = [];

  // 🎯 FTIS ONLY MODE: Skip JSON priming entirely
  // When FTIS handles all tools, Gemini should NOT know about JSON format
  // It would output JSON as speech instead of natural language
  if (process.env.FTIS_ONLY_MODE === 'true') {
    log.info(
      '🎯 FTIS_ONLY_MODE=true: Skipping JSON priming (FTIS handles all tools)'
    );
    return turns;
  }
  
  // 🎯 SEMANTIC ROUTING PRIMARY: Skip JSON priming entirely
  // When semantic routing handles tools, we don't want to teach the LLM
  // the JSON format (it would output JSON as speech instead of natural language)
  if (process.env.SEMANTIC_ROUTING_PRIMARY === 'true') {
    log.info(
      '🎯 SEMANTIC_ROUTING_PRIMARY=true: Skipping JSON priming (semantic router handles tools)'
    );
    return turns;
  }

  if (!config.enabled) {
    log.debug('Conversation priming disabled');
    return turns;
  }

  log.info(
    { personaId: config.personaId, primeCriticalTools: config.primeCriticalTools },
    '🎯 PRIMING: Generating conversation priming turns'
  );

  // 1. JSON FORMAT PRIMING - Show Gemini what JSON output looks like
  if (config.primeJsonFormat) {
    turns.push({
      role: 'user',
      content: '[system: format check]',
      isVisible: false,
      description: 'Format check trigger (hidden)',
    });

    turns.push({
      role: 'assistant',
      content: '{"fn":"getCurrentTime","args":{}}',
      isVisible: false,
      description: 'JSON output example (teaches format)',
    });

    log.debug('🎯 PRIMING: Added JSON format priming turn');
  }

  // 2. CRITICAL TOOL PRIMING - Prime for handoffs and music
  if (config.primeCriticalTools) {
    // Music priming - DIRECT COMMAND (most common pattern)
    turns.push({
      role: 'user',
      content: '[user: play some jazz]',
      isVisible: false,
      description: 'Music direct command (hidden)',
    });

    turns.push({
      role: 'assistant',
      content: '{"fn":"playMusic","args":{"query":"jazz"}}',
      isVisible: false,
      description: 'Music JSON example (direct command)',
    });

    // CRITICAL: Music priming - POLITE REQUEST (Gemini problem pattern!)
    // Gemini often says "Sure! I'd be happy to play..." instead of calling the tool
    turns.push({
      role: 'user',
      content: '[user: can you play some relaxing music]',
      isVisible: false,
      description: 'Music polite request - Gemini problem pattern (hidden)',
    });

    turns.push({
      role: 'assistant',
      content: '{"fn":"playMusic","args":{"query":"relaxing music"}}',
      isVisible: false,
      description: 'Music JSON example (polite request → still JSON!)',
    });

    log.debug('🎯 PRIMING: Added music tool priming turns (including polite pattern)');

    // Weather priming - DIRECT QUESTION (most common pattern)
    turns.push({
      role: 'user',
      content: "[user: what's the weather]",
      isVisible: false,
      description: 'Weather direct question (hidden)',
    });

    turns.push({
      role: 'assistant',
      content: '{"fn":"getWeather","args":{}}',
      isVisible: false,
      description: 'Weather JSON example (direct question)',
    });

    // Weather priming - POLITE REQUEST (another Gemini problem pattern)
    turns.push({
      role: 'user',
      content: '[user: could you check the weather]',
      isVisible: false,
      description: 'Weather polite request - Gemini problem pattern (hidden)',
    });

    turns.push({
      role: 'assistant',
      content: '{"fn":"getWeather","args":{}}',
      isVisible: false,
      description: 'Weather JSON example (polite request → still JSON!)',
    });

    // Weather priming - CAPABILITY QUESTION (Gemini often explains instead of doing!)
    turns.push({
      role: 'user',
      content: '[user: can you tell me the weather]',
      isVisible: false,
      description: 'Weather capability question - Gemini explains instead of doing (hidden)',
    });

    turns.push({
      role: 'assistant',
      content: '{"fn":"getWeather","args":{}}',
      isVisible: false,
      description: 'Weather JSON example (capability question → JUST DO IT!)',
    });

    log.debug('🎯 PRIMING: Added weather tool priming turns (direct, polite, capability)');

    // Handoff priming based on persona
    if (config.personaId === 'ferni') {
      // Handoff priming - DIRECT
      turns.push({
        role: 'user',
        content: '[user: talk to maya about my habits]',
        isVisible: false,
        description: 'Handoff direct command (hidden)',
      });

      turns.push({
        role: 'assistant',
        content: '{"fn":"handoffToMaya","args":{"reason":"habits"}}',
        isVisible: false,
        description: 'Handoff JSON example (direct)',
      });

      // CRITICAL: Handoff priming - POLITE REQUEST (Gemini problem pattern!)
      turns.push({
        role: 'user',
        content: '[user: can I speak with Peter about my investments]',
        isVisible: false,
        description: 'Handoff polite request - Gemini problem pattern (hidden)',
      });

      turns.push({
        role: 'assistant',
        content: '{"fn":"handoffToPeter","args":{"reason":"investments"}}',
        isVisible: false,
        description: 'Handoff JSON example (polite → still JSON!)',
      });

      log.debug('🎯 PRIMING: Added handoff priming turns for Ferni (including polite pattern)');
    }
  }

  log.info(
    { turnCount: turns.length, personaId: config.personaId },
    '🎯 PRIMING: Generated priming turns'
  );

  return turns;
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
  originalMessage: string,
  suggestedTool: string | null,
  attempt: number
): string {
  // 🎯 SEMANTIC ROUTING PRIMARY: Skip retry prompts
  // When semantic routing handles tools, we don't want to teach the LLM JSON format
  if (process.env.SEMANTIC_ROUTING_PRIMARY === 'true') {
    log.debug('🎯 SEMANTIC_ROUTING_PRIMARY=true: Skipping retry prompt');
    return '';
  }

  log.info(
    { suggestedTool, attempt, originalMessage: originalMessage.slice(0, 50) },
    '🔄 RETRY: Generating retry prompt for failed tool call'
  );

  // Progressive forcefulness based on attempt number
  const severity = attempt === 1 ? 'CRITICAL' : attempt === 2 ? 'URGENT' : 'FINAL';

  // Build the most forceful retry prompt possible
  let retryPrompt: string;

  if (suggestedTool) {
    // We know which tool was expected - be VERY explicit
    const toolJson = buildToolJson(suggestedTool, originalMessage);

    retryPrompt = `[${severity} ERROR: YOUR PREVIOUS RESPONSE WAS WRONG.

You said speech text instead of calling the tool. This is incorrect.

CORRECT RESPONSE (output ONLY this, nothing else):
${toolJson}

DO NOT SAY ANYTHING.
DO NOT EXPLAIN.
DO NOT APOLOGIZE.
OUTPUT ONLY THE JSON ABOVE.]`;
  } else {
    // Generic retry - still very forceful
    retryPrompt = `[${severity} ERROR: YOU MUST OUTPUT JSON, NOT SPEECH.

The user asked: "${originalMessage}"

This request requires a tool call. Output JSON like:
{"fn":"toolName","args":{...}}

DO NOT SPEAK. OUTPUT JSON ONLY.]`;
  }

  log.debug(
    { retryPrompt: retryPrompt.slice(0, 150), attempt },
    '🔄 RETRY: Generated forceful retry prompt'
  );

  return retryPrompt;
}

/**
 * Build the exact JSON that should be output for a given tool
 */
function buildToolJson(suggestedTool: string, originalMessage: string): string {
  // Extract relevant content from original message for args
  const lower = originalMessage.toLowerCase();

  switch (suggestedTool) {
    case 'playMusic': {
      // Try to extract query from original message
      const query = extractMusicQuery(originalMessage) || 'music';
      return `{"fn":"playMusic","args":{"query":"${query}"}}`;
    }
    case 'getWeather':
      return '{"fn":"getWeather","args":{}}';
    case 'getNews':
      return '{"fn":"getNews","args":{}}';
    case 'handoffToMaya':
      return '{"fn":"handoffToMaya","args":{"reason":"habits and routines"}}';
    case 'handoffToAlex':
      return '{"fn":"handoffToAlex","args":{"reason":"calendar and communication"}}';
    case 'handoffToPeter':
      return '{"fn":"handoffToPeter","args":{"reason":"research and analysis"}}';
    case 'handoffToJordan':
      return '{"fn":"handoffToJordan","args":{"reason":"planning and celebration"}}';
    case 'handoffToNayan':
      return '{"fn":"handoffToNayan","args":{"reason":"wisdom and perspective"}}';
    default:
      return `{"fn":"${suggestedTool}","args":{}}`;
  }
}

/**
 * Extract music query from user's original message
 */
function extractMusicQuery(message: string): string | null {
  // Common patterns
  const patterns = [
    /play\s+(?:me\s+)?(?:some\s+)?(.+)/i,
    /put\s+on\s+(?:some\s+)?(.+)/i,
    /(?:can|could|would)\s+you\s+play\s+(?:me\s+)?(?:some\s+)?(.+)/i,
    /i(?:'d|\s+would)\s+like\s+(?:to\s+)?(?:hear|listen\s+to)\s+(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      // Clean up the query
      return match[1]
        .replace(/\s+please\s*$/i, '')
        .replace(/\s+for\s+me\s*$/i, '')
        .trim();
    }
  }

  return null;
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
  const shouldPrune = turns.length > config.maxTurns || result.estimatedTokensBefore > config.tokenThreshold;

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
  const preservedCount = systemTurns.length + primingTurns.length + toolCallTurns.length + recentTurns.length;
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
  result.estimatedTokensAfter = result.keptTurns.reduce((sum, turn) => sum + estimateTokens(turn.content), 0);

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
    return { shouldPrune: true, reason: `Turn count (${turns.length}) exceeds max (${config.maxTurns})` };
  }

  const estimatedTokens = turns.reduce((sum, turn) => sum + estimateTokens(turn.content), 0);
  if (estimatedTokens > config.tokenThreshold) {
    return { shouldPrune: true, reason: `Token count (~${estimatedTokens}) exceeds threshold (${config.tokenThreshold})` };
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
export function markPrimingTurns(turns: ConversationTurn[], primingCount: number): ConversationTurn[] {
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
