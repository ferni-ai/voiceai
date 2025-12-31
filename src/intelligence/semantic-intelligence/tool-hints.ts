/**
 * Phase 1: Tool Hints for LLM Context
 *
 * Instead of auto-executing tools (which caused false positives),
 * we inject hints into the LLM context so it can make better decisions.
 *
 * The key insight: Semantic routing is GREAT at finding likely tools,
 * it just shouldn't AUTO-EXECUTE. Let the LLM make the final call.
 *
 * @module intelligence/semantic-intelligence/tool-hints
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  ToolMatch,
  SemanticRouterResult,
  ToolCategory,
} from '../../tools/semantic-router/types.js';

const log = createLogger({ module: 'SemanticIntelligence.ToolHints' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * A hint about a likely tool to include in LLM context
 */
export interface ToolHint {
  /** Tool identifier */
  toolId: string;

  /** Tool name (human readable) */
  toolName: string;

  /** Why this tool might be relevant */
  reason: string;

  /** Confidence that this is the right tool (0-1) */
  confidence: number;

  /** Category of the tool */
  category: ToolCategory | 'conversation';

  /** Which matching layers contributed to this hint */
  matchedBy: string[];

  /** Extracted arguments that seem likely */
  suggestedArgs?: Record<string, unknown>;
}

/**
 * Result from getting tool hints
 */
export interface ToolHintResult {
  /** Hints about likely tools (sorted by confidence) */
  hints: ToolHint[];

  /** The detected intent category */
  intentCategory: string;

  /** Whether this seems like a tool request vs conversation */
  isToolRequest: boolean;

  /** Total processing time in ms */
  processingTimeMs: number;

  /** Human-readable injection for LLM context */
  contextInjection: string;
}

/**
 * Context for generating tool hints
 */
export interface ToolHintContext {
  /** User ID for personalization */
  userId: string;

  /** Session ID */
  sessionId: string;

  /** Current persona */
  personaId: string;

  /** The user's input text */
  inputText: string;

  /** Recent tools used in this session */
  recentTools?: string[];

  /** Recent conversation topics */
  recentTopics?: string[];
}

// ============================================================================
// TOOL NAME MAPPING
// ============================================================================

/**
 * Human-readable names for tool IDs
 * This helps the LLM understand what tools do
 */
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  // Music
  playMusic: 'Play Music',
  searchMusic: 'Search Songs',
  pauseMusic: 'Pause Music',

  // Calendar
  getEvents: 'Check Calendar',
  createEvent: 'Schedule Event',
  getCalendarSummary: 'Calendar Summary',

  // Weather
  getWeather: 'Weather Check',
  getWeatherForecast: 'Weather Forecast',

  // Memory
  saveMemory: 'Remember This',
  searchMemory: 'Recall Memory',
  getMemories: 'List Memories',

  // Habits
  checkHabit: 'Habit Check-in',
  createHabit: 'Start New Habit',
  getHabitStreak: 'Habit Streak',

  // Handoff
  transferToAgent: 'Hand Off to Team Member',

  // Communication
  sendSMS: 'Send Text Message',
  sendEmail: 'Send Email',

  // Information
  searchWeb: 'Web Search',
  getNews: 'News Headlines',
  searchStocks: 'Stock Lookup',

  // Default fallback
  default: 'Tool',
};

/**
 * Get human-readable name for a tool
 */
function getToolDisplayName(toolId: string): string {
  return TOOL_DISPLAY_NAMES[toolId] ?? toolId.replace(/([A-Z])/g, ' $1').trim();
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get semantic tool hints for LLM context injection
 *
 * This analyzes the user's input and returns hints about which tools
 * might be relevant. Unlike auto-execution, this lets the LLM decide.
 *
 * @example
 * ```typescript
 * const result = await getSemanticToolHints({
 *   userId: 'user-123',
 *   sessionId: 'session-456',
 *   personaId: 'ferni',
 *   inputText: 'play some jazz music',
 * });
 *
 * // Result:
 * // {
 * //   hints: [{ toolId: 'playMusic', confidence: 0.95, ... }],
 * //   contextInjection: '[TOOL HINT: playMusic (95%) - User wants music]',
 * //   isToolRequest: true,
 * // }
 * ```
 */
// Track if semantic router has been initialized for tool hints
let semanticRouterInitialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Ensure semantic router is initialized with tools (lazy initialization)
 * This is separate from the main semantic routing system - we just need
 * the tool registry populated to generate hints.
 */
async function ensureSemanticRouterInitialized(): Promise<void> {
  if (semanticRouterInitialized) return;

  // Prevent concurrent initialization
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      // Try to initialize the semantic router with tool definitions
      const { initializeSemanticRouter } =
        await import('../../tools/semantic-router/integration/init.js');
      await initializeSemanticRouter();
      semanticRouterInitialized = true;
      log.info('Semantic router initialized for tool hints');
    } catch (error) {
      // If initialization fails, we can still continue - hints will be empty
      log.warn(
        { error: String(error) },
        'Failed to initialize semantic router for tool hints (will use fallback)'
      );
      semanticRouterInitialized = true; // Mark as initialized to avoid retrying
    }
  })();

  return initializationPromise;
}

/**
 * Reset initialization state (for testing)
 */
export function resetToolHintsInitialization(): void {
  semanticRouterInitialized = false;
  initializationPromise = null;
}

export async function getSemanticToolHints(context: ToolHintContext): Promise<ToolHintResult> {
  const startTime = performance.now();

  try {
    // Ensure semantic router is initialized with tools
    await ensureSemanticRouterInitialized();

    // Lazy import to avoid circular dependencies
    const { routeUserInput } = await import('../../tools/semantic-router/router.js');

    // Even when semantic routing is "disabled" for auto-execution,
    // we still use it for HINTS (that's the whole point of this module)
    const routerResult = await routeUserInput(context.inputText, {
      userId: context.userId,
      sessionId: context.sessionId,
      personaId: context.personaId,
      recentTools: context.recentTools,
    });

    // Convert router matches to hints
    const hints = convertMatchesToHints(routerResult);

    // Determine if this looks like a tool request
    const isToolRequest = determineIfToolRequest(routerResult, context.inputText);

    // Build context injection string
    const contextInjection = buildToolHintInjection(hints, isToolRequest);

    const processingTimeMs = performance.now() - startTime;

    log.debug(
      {
        inputText: context.inputText.substring(0, 50),
        hintCount: hints.length,
        topHint: hints[0]?.toolId,
        topConfidence: hints[0]?.confidence,
        isToolRequest,
        processingTimeMs,
      },
      'Generated tool hints'
    );

    return {
      hints,
      intentCategory: routerResult.intent?.category ?? 'conversation',
      isToolRequest,
      processingTimeMs,
      contextInjection,
    };
  } catch (error) {
    log.warn(
      { error: String(error), inputText: context.inputText },
      'Failed to get tool hints, returning empty'
    );

    return {
      hints: [],
      intentCategory: 'conversation',
      isToolRequest: false,
      processingTimeMs: performance.now() - startTime,
      contextInjection: '',
    };
  }
}

/**
 * Convert semantic router matches to tool hints
 */
function convertMatchesToHints(routerResult: SemanticRouterResult): ToolHint[] {
  const matches = routerResult.matches ?? [];

  return matches
    .filter((match) => match.confidence >= 0.3) // Only include meaningful matches
    .slice(0, 3) // Top 3 hints only (don't overwhelm LLM context)
    .map((match): ToolHint => {
      return {
        toolId: match.toolId,
        toolName: getToolDisplayName(match.toolId),
        reason: match.matchReason ?? 'Semantic match',
        confidence: match.confidence,
        category: (routerResult.intent?.category as ToolCategory) ?? 'conversation',
        matchedBy: match.matchedBy ?? [],
        suggestedArgs:
          Object.keys(match.extractedArgs ?? {}).length > 0 ? match.extractedArgs : undefined,
      };
    });
}

/**
 * Determine if the input looks like a tool request vs pure conversation
 *
 * Uses multiple signals:
 * - High confidence on top match
 * - Intent mood (command/request vs question/statement)
 * - Pattern matches (very reliable signal)
 */
function determineIfToolRequest(routerResult: SemanticRouterResult, inputText: string): boolean {
  const topMatch = routerResult.matches?.[0];

  // No matches = probably conversation
  if (!topMatch) {
    return false;
  }

  // High confidence = likely tool request
  if (topMatch.confidence >= 0.7) {
    return true;
  }

  // Pattern match = very likely tool request
  if (topMatch.matchedBy?.includes('pattern')) {
    return true;
  }

  // Command/request mood = likely tool request
  const mood = routerResult.intent?.mood;
  if (mood === 'command' || mood === 'request') {
    return topMatch.confidence >= 0.5;
  }

  // Question mood with decent confidence = might be tool request
  if (mood === 'question' && topMatch.confidence >= 0.6) {
    return true;
  }

  // Default: not a tool request
  return false;
}

/**
 * Build a human-readable tool hint injection for LLM context
 *
 * This is designed to be concise but informative, helping the LLM
 * make better tool decisions without overwhelming the context.
 */
export function buildToolHintInjection(hints: ToolHint[], isToolRequest: boolean): string {
  if (hints.length === 0) {
    return '';
  }

  const lines: string[] = [];

  if (isToolRequest) {
    lines.push('[SEMANTIC HINT] This appears to be a tool request.');
  }

  // Only include top 2 hints in injection to keep it concise
  const topHints = hints.slice(0, 2);

  for (const hint of topHints) {
    const confidencePercent = Math.round(hint.confidence * 100);
    const argsNote = hint.suggestedArgs
      ? ` (args: ${Object.keys(hint.suggestedArgs).join(', ')})`
      : '';

    lines.push(
      `[TOOL HINT] ${hint.toolName} (${confidencePercent}% match) - ${hint.reason}${argsNote}`
    );
  }

  // If there are more hints, note that
  if (hints.length > 2) {
    lines.push(
      `[Also possible: ${hints
        .slice(2)
        .map((h) => h.toolName)
        .join(', ')}]`
    );
  }

  return lines.join('\n');
}

/**
 * Quick check if semantic hints should be generated
 *
 * Skip hint generation for very short inputs or obvious non-tool requests
 */
export function shouldGenerateHints(inputText: string): boolean {
  const trimmed = inputText.trim();

  // Too short to be meaningful
  if (trimmed.length < 3) {
    return false;
  }

  // Simple greetings - don't bother with hints
  const simpleGreetings =
    /^(hi|hey|hello|yo|sup|morning|evening|night|bye|goodbye|thanks|thank you|ok|okay)$/i;
  if (simpleGreetings.test(trimmed)) {
    return false;
  }

  // Single word responses - usually not tool requests
  if (!trimmed.includes(' ') && trimmed.length < 10) {
    return false;
  }

  return true;
}
