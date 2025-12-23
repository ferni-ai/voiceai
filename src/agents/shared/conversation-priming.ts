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
    // Music priming (critical - most common tool)
    turns.push({
      role: 'user',
      content: '[system: capability check - music]',
      isVisible: false,
      description: 'Music capability check (hidden)',
    });

    turns.push({
      role: 'assistant',
      content: '{"fn":"playMusic","args":{"query":"background music"}}',
      isVisible: false,
      description: 'Music JSON example (teaches playMusic format)',
    });

    log.debug('🎯 PRIMING: Added music tool priming turn');

    // Handoff priming based on persona
    if (config.personaId === 'ferni') {
      // Ferni needs to know how to hand off to specialists
      turns.push({
        role: 'user',
        content: '[system: capability check - handoff]',
        isVisible: false,
        description: 'Handoff capability check (hidden)',
      });

      turns.push({
        role: 'assistant',
        content: '{"fn":"handoffToMaya","args":{"reason":"habits and routines"}}',
        isVisible: false,
        description: 'Handoff JSON example (teaches handoff format)',
      });

      log.debug('🎯 PRIMING: Added handoff priming turn for Ferni');
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
 */
export function generateRetryPrompt(
  originalMessage: string,
  suggestedTool: string | null,
  attempt: number
): string {
  log.info(
    { suggestedTool, attempt, originalMessage: originalMessage.slice(0, 50) },
    '🔄 RETRY: Generating retry prompt for failed tool call'
  );

  // Build retry context based on what we know
  let retryPrompt = `[SYSTEM: The previous response was incorrect. You MUST output JSON, not text.`;

  if (suggestedTool) {
    // We know which tool was expected
    retryPrompt += `\n\nOUTPUT THIS EXACTLY: {"fn":"${suggestedTool}","args":{`;

    // Add appropriate args based on tool
    switch (suggestedTool) {
      case 'playMusic':
        retryPrompt += `"query":"music"}}`;
        break;
      case 'getWeather':
        retryPrompt += `"location":"current"}}`;
        break;
      case 'getNews':
        retryPrompt += `}}`;
        break;
      case 'handoffToMaya':
        retryPrompt += `"reason":"habits and routines"}}`;
        break;
      case 'handoffToAlex':
        retryPrompt += `"reason":"calendar and communication"}}`;
        break;
      case 'handoffToPeter':
        retryPrompt += `"reason":"research and analysis"}}`;
        break;
      case 'handoffToJordan':
        retryPrompt += `"reason":"planning and celebration"}}`;
        break;
      case 'handoffToNayan':
        retryPrompt += `"reason":"wisdom and perspective"}}`;
        break;
      default:
        retryPrompt += `}}`;
    }
  } else {
    // Generic retry
    retryPrompt += `\n\nUser request: "${originalMessage}"\n\nOUTPUT JSON ONLY.]`;
  }

  log.debug({ retryPrompt: retryPrompt.slice(0, 100) }, '🔄 RETRY: Generated retry prompt');

  return retryPrompt;
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
