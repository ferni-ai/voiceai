/**
 * Direct Tool Router - Intelligent Pre-LLM Tool Execution
 *
 * This module provides a high-confidence, low-false-positive tool routing
 * that runs BEFORE Gemini. Unlike the full semantic router (which has too many
 * false positives), this only handles OBVIOUS tool requests with very high certainty.
 *
 * WHY THIS EXISTS:
 * Gemini Live API sometimes returns NOTHING when users make tool requests like
 * "Could you play some music?". The function calling reinforcement in turn-processor.ts
 * is never executed because handleUserTurn() is never called in the Gemini Live flow.
 *
 * This router provides a surgical fix by:
 * 1. Detecting OBVIOUS tool intents (music, weather, handoff) with high confidence
 * 2. Executing the tool directly and letting Gemini respond naturally
 * 3. Falling back to Gemini for anything uncertain
 *
 * FALSE POSITIVE PREVENTION:
 * - Only match very specific patterns (not generic words)
 * - Require action verbs + domain nouns (not just domain words)
 * - Skip if user is in the middle of a conversation about the topic
 *
 * @module voice-agent/direct-tool-router
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'DirectToolRouter' });

// ============================================================================
// TYPES
// ============================================================================

export interface DirectRouteResult {
  /** Whether the tool was executed directly */
  handled: boolean;
  /** Tool ID if executed */
  toolId?: string;
  /** Confidence of the match (0-1) */
  confidence: number;
  /** Human-readable intent detected */
  intent?: string;
  /** Response to speak (if any) */
  speechResponse?: string;
  /** Error if execution failed */
  error?: string;
}

export interface DirectRouteContext {
  userId: string;
  sessionId: string;
  personaId: string;
  /** Recent conversation context to avoid false positives */
  recentTopics?: string[];
  /** Last thing the agent said */
  lastAgentMessage?: string;
  /** User's IP-detected location (for weather, local info personalization) */
  userLocation?: {
    city?: string;
    regionCode?: string;
    countryCode?: string;
  };
}

// ============================================================================
// HIGH-CONFIDENCE INTENT PATTERNS
// ============================================================================

/**
 * Music intent patterns - VERY specific to avoid "bluegrass" → music false positives
 *
 * IMPORTANT: Allow common conversation starters like "Yeah", "Okay", "Sure" before commands
 * because users often start requests with affirmations after the agent asks "What kind of music?"
 */
const CONVERSATION_STARTERS = '(?:yeah|yes|yep|okay|ok|sure|alright|actually|um+|uh+|so|well|hey|oh|hmm),?\\s*';

const MUSIC_PATTERNS = [
  // Direct commands with "play" - allow conversation starters
  new RegExp(`^${CONVERSATION_STARTERS}?(can you |could you |would you |please )?(play|put on|start|queue)(\\s+me)?\\s+(some\\s+)?(.+\\s+)?(music|songs?|tunes?)`, 'i'),
  // Direct commands with specific genres (including "morning music", "workout music", etc.)
  new RegExp(`^${CONVERSATION_STARTERS}?(can you |could you |would you |please )?(play|put on|start|queue)(\\s+me)?\\s+(some\\s+)?(jazz|rock|pop|classical|lofi|lo-fi|hip\\s*hop|rap|country|blues|r&b|soul|funk|electronic|house|techno|ambient|chill|relaxing|upbeat|happy|sad|focus|study|workout|sleep|meditation|calm|acoustic|indie|alternative|metal|punk|reggae|latin|k-?pop|morning|evening|night|spotify|playlist)`, 'i'),
  // "Play something" variations
  new RegExp(`^${CONVERSATION_STARTERS}?(can you |could you |would you |please )?(play|put on)\\s+something(\\s+\\w+)?$`, 'i'),
  // Direct artist/song requests
  new RegExp(`^${CONVERSATION_STARTERS}?(can you |could you |would you |please )?(play|put on)\\s+.+\\s+by\\s+.+$`, 'i'),
  // "Some music please"
  new RegExp(`^${CONVERSATION_STARTERS}?(some\\s+)?(music|songs?|tunes?)\\s+please$`, 'i'),
  // Mood-based requests
  new RegExp(`^${CONVERSATION_STARTERS}?(play|put on|i want|give me)\\s+something\\s+(relaxing|upbeat|calm|energizing|chill|focus|morning)`, 'i'),
  // "Play some more music" - continuation requests
  new RegExp(`^${CONVERSATION_STARTERS}?(can you |could you |would you |please )?(play|put on)(\\s+some)?\\s+more\\s+(music|songs?|tunes?)`, 'i'),
];

/**
 * Weather intent patterns - simple and specific
 */
const WEATHER_PATTERNS = [
  /^(what('s| is)|how('s| is)|check)\s+(the\s+)?weather/i,
  /^(is it|will it)\s+(going to\s+)?(rain|snow|cold|hot|warm|sunny|cloudy)/i,
  /^weather\s*(forecast|today|tomorrow|this week)?$/i,
  /^(do i need|should i bring)\s+(an?\s+)?(umbrella|jacket|coat)/i,
];

/**
 * Handoff intent patterns - explicit persona switches
 */
const HANDOFF_PATTERNS: Array<{ pattern: RegExp; personaId: string }> = [
  {
    pattern: /^(talk to|speak with|switch to|transfer( me)? to|let me talk to)\s+maya/i,
    personaId: 'maya-santos',
  },
  {
    pattern: /^(talk to|speak with|switch to|transfer( me)? to|let me talk to)\s+peter/i,
    personaId: 'peter-john',
  },
  {
    pattern: /^(talk to|speak with|switch to|transfer( me)? to|let me talk to)\s+alex/i,
    personaId: 'alex-chen',
  },
  {
    pattern: /^(talk to|speak with|switch to|transfer( me)? to|let me talk to)\s+jordan/i,
    personaId: 'jordan-taylor',
  },
  {
    pattern: /^(talk to|speak with|switch to|transfer( me)? to|let me talk to)\s+nayan/i,
    personaId: 'nayan-patel',
  },
  {
    pattern: /^(talk to|speak with|switch to|transfer( me)? to|let me talk to)\s+ferni/i,
    personaId: 'ferni',
  },
];

// ============================================================================
// INTENT DETECTION
// ============================================================================

interface DetectedIntent {
  type: 'music' | 'weather' | 'handoff' | 'none';
  confidence: number;
  query?: string;
  targetPersonaId?: string;
}

/**
 * Detect high-confidence tool intent from transcript
 */
function detectIntent(transcript: string, context: DirectRouteContext): DetectedIntent {
  const text = transcript.trim();

  // Skip very short or very long messages (not likely to be direct commands)
  if (text.length < 3 || text.length > 150) {
    return { type: 'none', confidence: 0 };
  }

  // Skip if this looks like a continuation of a conversation about the topic
  // (e.g., "I love playing music" is not a request to play music)
  if (
    context.recentTopics?.includes('music') &&
    !text.match(/^(can|could|would|please|play|put)/i)
  ) {
    return { type: 'none', confidence: 0 };
  }

  // Check music patterns
  for (const pattern of MUSIC_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // Extract the query (everything after "play/put on", ignoring conversation starters)
      // Handle: "Yeah, play some morning music" → "morning music"
      // Handle: "Play some jazz" → "jazz"
      const queryMatch = text.match(/(?:play|put on|start|queue)(?:\s+me)?\s+(?:some\s+)?(?:more\s+)?(.+)/i);
      let query = queryMatch?.[1] || 'music';

      // Clean up the query - remove trailing punctuation and "please"
      query = query.replace(/[.!?]+$/i, '').replace(/\s+please$/i, '').trim();

      // If query is just "music" or empty, use a sensible default
      if (!query || query.toLowerCase() === 'music' || query.toLowerCase() === 'songs' || query.toLowerCase() === 'tunes') {
        query = 'music';
      }

      log.info({ transcript: text.slice(0, 50), query }, '🎵 Music intent detected');
      return {
        type: 'music',
        confidence: 0.95,
        query,
      };
    }
  }

  // Check weather patterns
  for (const pattern of WEATHER_PATTERNS) {
    if (pattern.test(text)) {
      log.info({ transcript: text.slice(0, 50) }, '🌤️ Weather intent detected');
      return { type: 'weather', confidence: 0.95 };
    }
  }

  // Check handoff patterns
  for (const { pattern, personaId } of HANDOFF_PATTERNS) {
    if (pattern.test(text)) {
      log.info(
        { transcript: text.slice(0, 50), targetPersona: personaId },
        '🤝 Handoff intent detected'
      );
      return {
        type: 'handoff',
        confidence: 0.98,
        targetPersonaId: personaId,
      };
    }
  }

  return { type: 'none', confidence: 0 };
}

// ============================================================================
// TOOL EXECUTION
// ============================================================================

/**
 * Execute a tool directly based on detected intent
 */
async function executeTool(
  intent: DetectedIntent,
  context: DirectRouteContext
): Promise<{ success: boolean; response?: string; error?: string }> {
  try {
    // Use executeJsonFunction which is the public API for tool execution
    const { executeJsonFunction } = await import('../shared/json-function-executor.js');

    // Helper to build a JsonFunctionCall with required 'raw' field
    const buildFunctionCall = (fn: string, args: Record<string, unknown>): { fn: string; args: Record<string, unknown>; raw: string } => ({
      fn,
      args,
      raw: JSON.stringify({ fn, args }),
    });

    switch (intent.type) {
      case 'music': {
        const result = await executeJsonFunction(
          buildFunctionCall('playMusic', { query: intent.query || 'music' }),
          {
            sessionId: context.sessionId,
            userId: context.userId,
            personaId: context.personaId,
          }
        );

        return {
          success: result.success,
          response: typeof result.result === 'string' ? result.result : undefined,
          error: result.error,
        };
      }

      case 'weather': {
        const result = await executeJsonFunction(buildFunctionCall('getWeather', {}), {
          sessionId: context.sessionId,
          userId: context.userId,
          personaId: context.personaId,
          userLocation: context.userLocation,
        });

        return {
          success: result.success,
          response: typeof result.result === 'string' ? result.result : undefined,
          error: result.error,
        };
      }

      case 'handoff': {
        const targetName = intent.targetPersonaId?.split('-')[0] || 'team member';
        const capitalizedName = targetName.charAt(0).toUpperCase() + targetName.slice(1);

        const result = await executeJsonFunction(
          buildFunctionCall(`handoffTo${capitalizedName}`, { reason: 'User requested' }),
          {
            sessionId: context.sessionId,
            userId: context.userId,
            personaId: context.personaId,
          }
        );

        return {
          success: result.success,
          response: typeof result.result === 'string' ? result.result : undefined,
          error: result.error,
        };
      }

      default:
        return { success: false, error: 'Unknown intent type' };
    }
  } catch (error) {
    log.error({ error: String(error), intent: intent.type }, 'Direct tool execution failed');
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Route transcript directly to tool execution if high-confidence intent is detected
 *
 * Call this BEFORE sending to Gemini. If it returns handled=true, skip the LLM.
 * If it returns handled=false, proceed with normal Gemini flow.
 *
 * @example
 * ```typescript
 * const routeResult = await routeDirectly(transcript, {
 *   userId,
 *   sessionId,
 *   personaId: persona.id,
 *   session,
 * });
 *
 * if (routeResult.handled) {
 *   // Tool executed, let Gemini respond naturally
 *   return;
 * }
 *
 * // Continue with normal Gemini flow
 * ```
 */
export async function routeDirectly(
  transcript: string,
  context: DirectRouteContext
): Promise<DirectRouteResult> {
  // Detect intent
  const intent = detectIntent(transcript, context);

  // Only handle high-confidence intents
  if (intent.type === 'none' || intent.confidence < 0.9) {
    return { handled: false, confidence: intent.confidence };
  }

  log.info(
    {
      transcript: transcript.slice(0, 50),
      intent: intent.type,
      confidence: intent.confidence,
      query: intent.query,
    },
    '🎯 Direct routing: High-confidence intent detected'
  );

  // Execute the tool
  const result = await executeTool(intent, context);

  if (result.success) {
    const toolId =
      intent.type === 'music'
        ? 'playMusic'
        : intent.type === 'weather'
          ? 'getWeather'
          : 'handoff';

    // Telemetry: Track which layer handled this tool call
    // 'direct-router' = Ultra-high-confidence pre-LLM routing (bypasses LLM entirely)
    log.info(
      {
        intent: intent.type,
        toolId,
        confidence: intent.confidence,
        hasResponse: !!result.response,
        handledBy: 'direct-router',
        sessionId: context.sessionId,
        trace: 'E2E_TOOL_SUCCESS',
      },
      `🔍 E2E TRACE [TOOL] Completed: ${toolId} (via direct-router)`
    );

    return {
      handled: true,
      toolId,
      confidence: intent.confidence,
      intent: intent.type,
      speechResponse: result.response,
    };
  }

  // Tool failed - let Gemini handle it
  log.warn(
    {
      intent: intent.type,
      error: result.error,
    },
    '⚠️ Direct routing: Tool failed, falling back to Gemini'
  );

  return {
    handled: false,
    confidence: intent.confidence,
    intent: intent.type,
    error: result.error,
  };
}

/**
 * Check if direct routing is enabled
 * Can be disabled via DIRECT_TOOL_ROUTING=false
 */
export function isDirectRoutingEnabled(): boolean {
  return process.env.DIRECT_TOOL_ROUTING !== 'false';
}
