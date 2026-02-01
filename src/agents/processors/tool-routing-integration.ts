/**
 * Tool Routing Integration
 *
 * Integrates the intelligent routing system (FTIS) with the voice agent pipeline.
 * Uses the intent classifier for fast tool detection and the tool executor for
 * direct execution when confidence is high enough.
 *
 * Architecture:
 * 1. Intent Classifier: Pattern + keyword matching (<5ms)
 * 2. Direct Execution: Tool execution with argument extraction
 * 3. LLM Fallback: For low-confidence or conversation-like queries
 *
 * @module agents/processors/tool-routing-integration
 */

import { isFTISV2OnlyMode as getConfigFTISMode } from '../../config/tool-routing-config.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { SemanticRoutingResult } from './types.js';

const log = createLogger({ module: 'tool-routing-integration' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Check if FTIS V2 only mode is enabled.
 * Delegates to the centralized config for single source of truth.
 */
export function isFTISV2OnlyMode(): boolean {
  return getConfigFTISMode();
}

// ============================================================================
// TYPES (preserved for compatibility)
// ============================================================================

export interface FTISV2RoutingContext {
  userId: string;
  sessionId: string;
  personaId: string;
  userLocation?: {
    city?: string;
    regionCode?: string;
    countryCode?: string;
  };
  lastAgentMessage?: string;
}

export interface FTISV2RoutingResult {
  attempted: boolean;
  bypassLLM: boolean;
  toolResult?: {
    toolId: string;
    output: string;
    success: boolean;
    speakableResponse: string;
  };
  classification?: {
    superCategory: string;
    fineCategory: string;
    confidence: number;
    usedFallback: boolean;
    latencyMs: number;
  };
  processingTimeMs: number;
  error?: string;
}

// ============================================================================
// FTIS V2 ROUTING IMPLEMENTATION
// ============================================================================

/**
 * Run FTIS V2 routing on user input.
 *
 * Uses the intelligent intent classifier for fast tool detection,
 * then executes tools directly when confidence is high enough.
 *
 * @param userText - The user's transcript
 * @param context - Routing context with user/session info
 * @returns Routing result with classification and optional tool result
 */
export async function runFTISV2Routing(
  userText: string,
  context: FTISV2RoutingContext
): Promise<FTISV2RoutingResult> {
  const startTime = Date.now();

  // Skip if FTIS is disabled
  if (!isFTISV2OnlyMode()) {
    log.debug('FTIS V2 routing disabled - using LLM native function calling');
    return {
      attempted: false,
      bypassLLM: false,
      processingTimeMs: 0,
    };
  }

  try {
    // 1. Run intent classification
    const { getIntentClassifier } =
      await import('../../tools/semantic-router/advanced/intelligent/intent-classifier.js');
    const classifier = getIntentClassifier();
    const classification = await classifier.classify(userText);

    const classificationLatency = Date.now() - startTime;

    log.debug(
      {
        intent: classification.intent?.id,
        confidence: classification.confidence.toFixed(2),
        toolId: classification.toolId,
        source: classification.source,
        latencyMs: classificationLatency,
      },
      '🧠 FTIS V2: Intent classified'
    );

    // 2. Check if this is a conversation intent (no tool)
    if (
      !classification.toolId ||
      classification.intent?.id === 'conversation.chat' ||
      classification.confidence < 0.5
    ) {
      return {
        attempted: true,
        bypassLLM: false,
        classification: {
          superCategory: classification.intent?.category || 'conversation',
          fineCategory: classification.intent?.action || 'chat',
          confidence: classification.confidence,
          usedFallback: false,
          latencyMs: classificationLatency,
        },
        processingTimeMs: Date.now() - startTime,
      };
    }

    // 3. Check confidence threshold for direct execution
    const { DIRECT_EXECUTION_THRESHOLD, executeDirectFromClassification } =
      await import('../../tools/intelligence/tool-executor.js');

    // Convert intent classifier result to tool executor format
    const executorClassification = {
      fineCategory: classification.intent?.action || classification.toolId || 'unknown',
      toolIds: classification.toolId ? [classification.toolId] : [],
      combinedConfidence: classification.confidence,
      effectiveConfidence: classification.confidence,
      isOpenIntent: !classification.toolId,
    };

    // Check if confidence is high enough for direct execution
    if (classification.confidence >= DIRECT_EXECUTION_THRESHOLD) {
      log.info(
        {
          toolId: classification.toolId,
          confidence: classification.confidence.toFixed(2),
          threshold: DIRECT_EXECUTION_THRESHOLD,
        },
        '🎯 FTIS V2: High confidence - executing directly'
      );

      // Execute the tool directly
      const execResult = await executeDirectFromClassification(executorClassification, userText, {
        userId: context.userId,
        sessionId: context.sessionId,
        personaId: context.personaId,
        userLocation: context.userLocation,
      });

      return {
        attempted: true,
        bypassLLM: execResult.bypassLLM,
        toolResult: execResult.success
          ? {
              toolId: execResult.toolId,
              output: execResult.naturalResponse,
              success: true,
              speakableResponse: execResult.naturalResponse,
            }
          : undefined,
        classification: {
          superCategory: classification.intent?.category || 'unknown',
          fineCategory: classification.intent?.action || classification.toolId || 'unknown',
          confidence: classification.confidence,
          usedFallback: false,
          latencyMs: classificationLatency,
        },
        processingTimeMs: Date.now() - startTime,
        error: execResult.success ? undefined : execResult.error,
      };
    }

    // 4. Medium confidence - return classification as hint for LLM
    log.debug(
      {
        toolId: classification.toolId,
        confidence: classification.confidence.toFixed(2),
        threshold: DIRECT_EXECUTION_THRESHOLD,
      },
      '🧠 FTIS V2: Medium confidence - providing hint to LLM'
    );

    return {
      attempted: true,
      bypassLLM: false,
      classification: {
        superCategory: classification.intent?.category || 'unknown',
        fineCategory: classification.intent?.action || classification.toolId || 'unknown',
        confidence: classification.confidence,
        usedFallback: false,
        latencyMs: classificationLatency,
      },
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    log.warn({ error: String(error) }, 'FTIS V2 routing failed - falling back to LLM');
    return {
      attempted: true,
      bypassLLM: false,
      processingTimeMs: Date.now() - startTime,
      error: String(error),
    };
  }
}

/**
 * Convert FTIS V2 routing result to SemanticRoutingResult.
 *
 * Maps FTIS result fields to the SemanticRoutingResult format
 * used by the rest of the pipeline.
 */
export function convertToSemanticRoutingResult(
  ftisResult: FTISV2RoutingResult
): SemanticRoutingResult {
  // Not attempted or failed
  if (!ftisResult.attempted || ftisResult.error) {
    return {
      routed: false,
      bypassLLM: false,
      metrics: {
        latencyMs: ftisResult.processingTimeMs,
        cacheHit: false,
        confidence: 0,
        matchPath: 'none',
      },
      routingPath: ftisResult.error ? 'error' : 'disabled',
    };
  }

  // Direct execution happened
  if (ftisResult.bypassLLM && ftisResult.toolResult) {
    return {
      routed: true,
      bypassLLM: true,
      toolResult: {
        toolId: ftisResult.toolResult.toolId,
        output: ftisResult.toolResult.output,
        success: ftisResult.toolResult.success,
        speakableResponse: ftisResult.toolResult.speakableResponse,
      },
      metrics: {
        latencyMs: ftisResult.processingTimeMs,
        cacheHit: false,
        confidence: ftisResult.classification?.confidence || 0,
        matchPath: 'combined', // FTIS uses combined pattern + keyword matching
      },
      routingPath: 'semantic_auto_execute', // Direct execution = auto execute
    };
  }

  // Classification only (hint mode)
  if (ftisResult.classification) {
    return {
      routed: false,
      bypassLLM: false,
      metrics: {
        latencyMs: ftisResult.processingTimeMs,
        cacheHit: false,
        confidence: ftisResult.classification.confidence,
        matchPath: 'combined', // FTIS uses combined pattern + keyword matching
      },
      routingPath: 'semantic_hint', // Classification only = hint mode
    };
  }

  // Fallback - conversation detected
  return {
    routed: false,
    bypassLLM: false,
    metrics: {
      latencyMs: ftisResult.processingTimeMs,
      cacheHit: false,
      confidence: 0,
      matchPath: 'none',
    },
    routingPath: 'semantic_conversation', // No tool needed
  };
}

/**
 * Build a tool hint for the LLM based on FTIS classification.
 *
 * This helps the LLM understand what the classification detected,
 * even when confidence isn't high enough for direct execution.
 */
export function buildFTISV2ToolHint(
  classification: FTISV2RoutingResult['classification']
): string | null {
  if (!classification || classification.confidence < 0.5) {
    return null;
  }

  const { superCategory, fineCategory, confidence } = classification;

  // Build a natural hint for the LLM
  const parts: string[] = [
    `[INTENT HINT: The user's request appears to be about "${fineCategory}" (${superCategory} category)]`,
    `Confidence: ${(confidence * 100).toFixed(0)}%`,
    '',
    'Consider using the appropriate tool if one is available.',
    'If this seems incorrect, respond conversationally instead.',
  ];

  return parts.join('\n');
}

/**
 * Build tool response guidance (still useful for formatting responses).
 */
export function buildFTISV2ToolResponseGuidance(params: {
  toolId: string;
  result: string;
  success: boolean;
  personaId?: string;
  userName?: string;
  userEmotion?: string;
  timeOfDay?: string;
}): string {
  const { toolId, result, success, personaId, userName } = params;

  const personaVoices: Record<string, string> = {
    ferni: 'Warm, grounded life coach. Supportive but not saccharine.',
    'maya-santos': 'Energetic habit coach. Encouraging and action-oriented.',
    'peter-john': 'Calm research advisor. Thoughtful and precise.',
    'alex-chen': 'Professional communications coach. Clear and efficient.',
    'jordan-taylor': 'Creative event planner. Enthusiastic about milestones.',
    'nayan-patel': 'Wise philosopher. Reflective and deep.',
  };

  const personaVoice =
    personaId && personaVoices[personaId]
      ? `[PERSONA: ${personaVoices[personaId]}]`
      : '[PERSONA: Warm and authentic, like a supportive friend]';

  const parts: string[] = [];

  parts.push(`[TOOL_RESULT: ${toolId}]`);
  parts.push(`Status: ${success ? 'SUCCESS' : 'FAILED'}`);
  parts.push(`Result: ${result.slice(0, 800)}`);
  parts.push('');
  parts.push(personaVoice);

  if (userName) {
    parts.push(`[USER: ${userName}]`);
  }

  parts.push('');
  parts.push('[RESPONSE RULES:]');
  parts.push('- Respond as if YOU did this, not a tool');
  parts.push('- Be conversational and warm');
  parts.push('- Keep it brief (1-2 sentences)');
  parts.push('- Never output JSON');

  return parts.join('\n');
}

/**
 * Get instructions for FTIS V2 mode (returns simplified instructions).
 */
export async function getFTISV2Instructions(): Promise<string> {
  return `# Automatic Tool Execution

Tools execute automatically based on what the user says.

When you see [TOOL_RESULT: ...], respond naturally to what happened.
- SUCCESS: Acknowledge briefly and warmly
- FAILED: Acknowledge the issue, offer to help differently

Never output JSON. Never try to call tools. Just be conversational.`;
}

/**
 * Build tool response instructions for generateReply.
 */
export function buildToolResponseInstructions(params: {
  toolId: string;
  result: string;
  success: boolean;
  personaId?: string;
  personaDisplayName?: string;
  userRequest?: string;
  userName?: string;
  memoryContext?: string;
}): string {
  const {
    toolId,
    result,
    success,
    personaId,
    personaDisplayName,
    userRequest,
    userName,
    memoryContext,
  } = params;

  const personaVoices: Record<string, string> = {
    ferni: 'Warm, grounded life coach. Supportive but not saccharine.',
    'maya-santos': 'Energetic habit coach. Encouraging and action-oriented.',
    'peter-john': 'Calm research advisor. Thoughtful and precise.',
    'alex-chen': 'Professional communications coach. Clear and efficient.',
    'jordan-taylor': 'Creative event planner. Enthusiastic about milestones.',
    'nayan-patel': 'Wise philosopher. Reflective and deep.',
  };

  const personaVoice =
    personaId && personaVoices[personaId]
      ? personaVoices[personaId]
      : personaDisplayName
        ? `Respond as ${personaDisplayName} with warmth.`
        : 'Respond warmly and naturally.';

  const userContext = userName ? `You're talking to ${userName}. ` : '';
  const memorySection = memoryContext
    ? `\n[WHAT YOU REMEMBER ABOUT THEM]\n${memoryContext.slice(0, 400)}\n`
    : '';

  if (success) {
    return `[CONTEXT - DO NOT READ ALOUD]
${userContext}The user asked: "${userRequest?.slice(0, 100) || 'for help'}"
You successfully handled this using ${toolId}.
Result: ${result.slice(0, 300)}
${memorySection}
[NOW RESPOND NATURALLY]
Keep it brief (1-2 sentences). ${personaVoice}
DO NOT read this context aloud. Just respond naturally.`;
  } else {
    return `[CONTEXT - DO NOT READ ALOUD]
${userContext}The user asked: "${userRequest?.slice(0, 100) || 'for help'}"
${toolId} encountered an issue: ${result.slice(0, 150)}
${memorySection}
[NOW RESPOND NATURALLY]
Don't over-apologize. ${personaVoice}
DO NOT read this context aloud. Just respond naturally.`;
  }
}

/**
 * @deprecated Use buildToolResponseInstructions() instead.
 */
export function buildFTISToolSystemPrompt(params: {
  toolId: string;
  result: string;
  success: boolean;
  personaId?: string;
}): string {
  return buildToolResponseInstructions(params);
}
