/**
 * Transcript-Level Semantic Router Integration
 *
 * This module integrates the semantic router directly into the voice agent's
 * transcript handler. Unlike the turn-processor integration (which is not used
 * by the Live API flow), this hooks into the actual transcript events.
 *
 * ARCHITECTURE:
 * 1. Final transcript arrives
 * 2. Semantic router runs BEFORE Gemini processes
 * 3. High confidence → Execute tool, then guide Gemini with generateReply()
 * 4. Medium/Low → Let Gemini handle normally
 *
 * @module tools/semantic-router/integration/transcript-integration
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { routeUserInput } from '../router.js';
import type { ToolMatch } from '../types.js';
import {
  recordLLMBypass,
  recordHintAdded,
  recordConversation,
  recordRoutingError,
} from './metrics.js';
import { isSemanticRoutingEnabled as isRoutingEnabledFromConfig } from '../config.js';

const log = createLogger({ module: 'semantic-router-transcript' });

// ============================================================================
// FEATURE FLAG
// ============================================================================

/**
 * Check if semantic routing is enabled
 * Uses centralized config which defaults to true
 */
export function isSemanticRoutingEnabled(): boolean {
  return isRoutingEnabledFromConfig();
}

// ============================================================================
// TYPES
// ============================================================================

/** Context for routing a transcript */
export interface TranscriptRoutingContext {
  userId: string;
  sessionId: string;
  personaId: string;
  /** Voice session instance - uses generic to accept any AgentSession type */
  session: {
    generateReply: (options: { instructions: string; allowInterruptions?: boolean }) => void;
  };
  conversationHistory?: Array<{ role: string; content: string }>;
  recentTools?: string[];
}

/** Result from transcript routing */
export interface TranscriptRoutingResult {
  /** Whether routing was attempted */
  attempted: boolean;

  /** Whether the router handled the request (high confidence) */
  handled: boolean;

  /** Natural response if handled */
  response?: string;

  /** Tool that was executed */
  toolId?: string;

  /** Confidence of the match */
  confidence?: number;

  /** Error message if any */
  error?: string;
}

// ============================================================================
// ROUTER INITIALIZATION
// ============================================================================

let routerInitialized = false;

/**
 * Ensure the semantic router is initialized
 */
async function ensureRouterInitialized(): Promise<void> {
  if (!routerInitialized) {
    try {
      const { initializeSemanticRouter } = await import('./init.js');
      await initializeSemanticRouter();
      routerInitialized = true;
      log.info('🎯 Semantic router initialized for transcript handling');
    } catch (error) {
      log.warn({ error: String(error) }, 'Failed to initialize semantic router');
      throw error;
    }
  }
}

// ============================================================================
// MAIN INTEGRATION
// ============================================================================

/**
 * Route a final transcript through the semantic router
 *
 * Call this at the START of processFinalTranscript() to intercept
 * high-confidence tool requests before Gemini processes the transcript.
 *
 * @param transcript - The final user transcript
 * @param context - Routing context with session and user info
 * @returns Routing result indicating if the request was handled
 */
export async function routeTranscript(
  transcript: string,
  context: TranscriptRoutingContext
): Promise<TranscriptRoutingResult> {
  const { userId, sessionId, personaId, session } = context;

  // Check feature flag
  if (!isSemanticRoutingEnabled()) {
    return { attempted: false, handled: false };
  }

  const startTime = performance.now();
  log.info({ transcript: transcript.slice(0, 50) }, '🎯 Routing transcript');

  try {
    // Ensure router is ready
    await ensureRouterInitialized();

    // Route the transcript
    const routeResult = await routeUserInput(transcript);
    const latencyMs = Math.round(performance.now() - startTime);

    const topMatch = routeResult.matches[0];
    log.info(
      {
        action: routeResult.action?.type,
        confidence: topMatch?.confidence,
        toolId: topMatch?.toolId,
        latencyMs,
      },
      '🎯 Route result'
    );

    // No action or conversation - let Gemini handle
    if (!routeResult.action || routeResult.action.type === 'conversation') {
      recordConversation(userId, sessionId, transcript, latencyMs);
      return {
        attempted: true,
        handled: false,
      };
    }

    // High confidence - execute tool and guide Gemini
    if (routeResult.action.type === 'execute' && routeResult.matches.length > 0) {
      const topMatch = routeResult.matches[0];

      try {
        // Execute the tool
        const execResult = await executeToolForTranscript(topMatch, context);
        const totalLatencyMs = Math.round(performance.now() - startTime);

        if (execResult.success && execResult.naturalResponse) {
          // Record successful bypass
          recordLLMBypass(
            userId,
            sessionId,
            transcript,
            topMatch.toolId,
            topMatch.confidence,
            determineMatchPath(topMatch),
            totalLatencyMs,
            false
          );

          // Guide Gemini to speak the response
          log.info(
            { toolId: topMatch.toolId, response: execResult.naturalResponse.slice(0, 50) },
            '🎯 Guiding Gemini with tool result'
          );

          session.generateReply({
            instructions: `The user said: "${transcript}"\n\nI've already executed the ${topMatch.toolId} tool for them. Speak this response naturally, as if you just did it:\n\n"${execResult.naturalResponse}"`,
            allowInterruptions: true,
          });

          return {
            attempted: true,
            handled: true,
            response: execResult.naturalResponse,
            toolId: topMatch.toolId,
            confidence: topMatch.confidence,
          };
        }

        // Tool execution failed - fall through to Gemini
        log.warn(
          { toolId: topMatch.toolId, error: execResult.error },
          'Tool execution failed, letting Gemini handle'
        );
        recordRoutingError(
          userId,
          sessionId,
          transcript,
          execResult.error || 'Unknown error',
          totalLatencyMs
        );

        return {
          attempted: true,
          handled: false,
          error: execResult.error,
        };
      } catch (execError) {
        const totalLatencyMs = Math.round(performance.now() - startTime);
        log.warn({ error: String(execError) }, 'Tool execution threw, letting Gemini handle');
        recordRoutingError(userId, sessionId, transcript, String(execError), totalLatencyMs);

        return {
          attempted: true,
          handled: false,
          error: String(execError),
        };
      }
    }

    // Medium confidence - add hint but let Gemini handle
    if (routeResult.matches.length > 0) {
      const topMatch = routeResult.matches[0];
      recordHintAdded(
        userId,
        sessionId,
        transcript,
        topMatch.toolId,
        topMatch.confidence,
        determineMatchPath(topMatch),
        latencyMs
      );

      // Could inject a hint into the session context here
      // For now, just let Gemini handle naturally
    }

    return {
      attempted: true,
      handled: false,
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startTime);
    log.error({ error: String(error) }, '🚨 Semantic routing failed');
    recordRoutingError(userId, sessionId, transcript, String(error), latencyMs);

    return {
      attempted: false,
      handled: false,
      error: String(error),
    };
  }
}

// ============================================================================
// TOOL EXECUTION
// ============================================================================

/**
 * Execute a matched tool for transcript routing
 */
async function executeToolForTranscript(
  match: ToolMatch,
  context: TranscriptRoutingContext
): Promise<{ success: boolean; naturalResponse?: string; error?: string }> {
  const { getToolRegistry } = await import('../registry.js');
  const registry = getToolRegistry();

  // Look up the tool
  const tool = registry.get(match.toolId);
  if (!tool) {
    return {
      success: false,
      error: `Tool ${match.toolId} not found in registry`,
    };
  }

  log.info(
    { toolId: match.toolId, confidence: match.confidence },
    '⚡ Executing tool via semantic router'
  );

  try {
    // Build execution context
    const execContext = {
      userId: context.userId,
      sessionId: context.sessionId,
      personaId: context.personaId,
      conversationHistory: (context.conversationHistory || []).map((h) => ({
        role: h.role as 'user' | 'assistant',
        text: h.content,
        timestamp: new Date(),
      })),
      services: null,
      originalText: (match.extractedArgs?.originalText as string) || '',
      confidence: match.confidence,
    };

    // Execute
    const result = await tool.execute(match.extractedArgs, execContext);

    if (result.success) {
      log.info({ toolId: match.toolId }, '✅ Tool executed successfully');
      return {
        success: true,
        naturalResponse: result.naturalResponse,
      };
    }

    return {
      success: false,
      error: result.error || 'Tool returned failure',
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Determine which matching path was primary
 */
function determineMatchPath(match: ToolMatch): 'pattern' | 'keyword' | 'embedding' | 'combined' {
  const scores = match.layerScores;
  const pattern = scores.pattern || 0;
  const keyword = scores.keyword || 0;
  const embedding = scores.embedding || 0;

  if (pattern > 0.8) return 'pattern';
  if (keyword > embedding * 1.5) return 'keyword';
  if (embedding > keyword * 1.5) return 'embedding';
  return 'combined';
}
