/**
 * FTIS Tool Routing Integration
 *
 * Integrates the Ferni Tool Intelligence System (FTIS) with the voice agent pipeline.
 *
 * Architecture:
 *   1. Two-stage hierarchical ONNX classifier (~50ms):
 *      Stage 1: User query → domain (44 domains)
 *      Stage 2: "[domain] query" → meta-tool (112 tools)
 *   2. High confidence (≥0.85) → direct tool execution, bypass LLM
 *   3. Low confidence → Gemini handles as conversation
 *
 * @module agents/processors/tool-routing-integration
 */

import { isFTISEnabled as getConfigFTISEnabled } from '../../config/tool-routing-config.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { SemanticRoutingResult } from './types.js';

const log = createLogger({ module: 'ftis-routing' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Check if FTIS is enabled.
 * Delegates to the centralized config for single source of truth.
 */
export function isFTISEnabled(): boolean {
  return getConfigFTISEnabled();
}

/**
 * @deprecated Use isFTISEnabled() instead. Kept for backward compatibility.
 */
export function isFTISV2OnlyMode(): boolean {
  return getConfigFTISEnabled();
}

// ============================================================================
// TYPES
// ============================================================================

export interface FTISRoutingContext {
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

/** @deprecated Use FTISRoutingContext instead. */
export type FTISV2RoutingContext = FTISRoutingContext;

export interface FTISRoutingResult {
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

/** @deprecated Use FTISRoutingResult instead. */
export type FTISV2RoutingResult = FTISRoutingResult;

// ============================================================================
// FTIS ROUTING IMPLEMENTATION
// ============================================================================

/**
 * Run FTIS routing on user input.
 *
 * Uses the two-stage hierarchical ONNX classifier for fast tool detection,
 * then executes tools directly when confidence is high enough.
 *
 * @param userText - The user's transcript
 * @param context - Routing context with user/session info
 * @returns Routing result with classification and optional tool result
 */
export async function runFTISRouting(
  userText: string,
  context: FTISRoutingContext
): Promise<FTISRoutingResult> {
  const startTime = Date.now();

  // Skip if FTIS is disabled
  if (!isFTISEnabled()) {
    log.debug('FTIS disabled - using LLM native function calling');
    return {
      attempted: false,
      bypassLLM: false,
      processingTimeMs: 0,
    };
  }

  try {
    // =========================================================================
    // FTIS HIERARCHICAL CLASSIFICATION (Feb 2026)
    //
    // Uses the V7 two-stage ONNX model:
    //   Stage 1: userQuery → domain (e.g., "music_audio", "calendar")
    //   Stage 2: "[domain] userQuery" → meta-tool (e.g., "music_play", "alarm_set")
    //   Combined confidence = domain_confidence * meta_tool_confidence
    //
    // This replaces the deprecated flat IntentClassifier (V5/V6).
    // =========================================================================
    const {
      classifyHierarchicalSafe,
      isHierarchicalClassifierAvailable,
      initializeHierarchicalClassifier,
    } = await import('../../tools/semantic-router/advanced/intelligent/hierarchical-classifier.js');

    // Ensure classifier is initialized (lazy init on first call)
    if (!isHierarchicalClassifierAvailable()) {
      await initializeHierarchicalClassifier();
    }

    const v7Result = classifyHierarchicalSafe(userText);
    const classificationLatency = Date.now() - startTime;

    // If V7 classifier unavailable or returned null, fall back to conversation
    if (!v7Result || v7Result.predictions.length === 0) {
      log.debug(
        { latencyMs: classificationLatency, available: isHierarchicalClassifierAvailable() },
        '🧠 FTIS: No classification result - treating as conversation'
      );
      return {
        attempted: true,
        bypassLLM: false,
        classification: {
          superCategory: 'conversation',
          fineCategory: 'chat',
          confidence: 0,
          usedFallback: true,
          latencyMs: classificationLatency,
        },
        processingTimeMs: Date.now() - startTime,
      };
    }

    const topPrediction = v7Result.predictions[0];

    log.debug(
      {
        domain: topPrediction.domain,
        domainConfidence: topPrediction.domainConfidence.toFixed(3),
        metaTool: topPrediction.metaTool,
        metaToolConfidence: topPrediction.metaToolConfidence.toFixed(3),
        combinedConfidence: topPrediction.combinedConfidence.toFixed(3),
        latencyMs: v7Result.latencyMs,
        source: v7Result.source,
      },
      '🧠 FTIS: Hierarchical classification complete'
    );

    // 2. Check if this is a no-tool / conversation intent
    if (topPrediction.domain === '__no_tool__' || topPrediction.combinedConfidence < 0.3) {
      return {
        attempted: true,
        bypassLLM: false,
        classification: {
          superCategory: topPrediction.domain,
          fineCategory: topPrediction.metaTool,
          confidence: topPrediction.combinedConfidence,
          usedFallback: false,
          latencyMs: v7Result.latencyMs,
        },
        processingTimeMs: Date.now() - startTime,
      };
    }

    // 3. Check confidence threshold for direct execution
    const { DIRECT_EXECUTION_THRESHOLD, executeDirectFromClassification } =
      await import('../../tools/intelligence/tool-executor.js');

    // Normalize V7 label format: "music.play" → "music_play"
    // V7 Stage 2 uses dot notation (music.play, alarm.set)
    // Domain bridge expects underscore notation (music_play, alarm_set)
    const normalizedMetaTool = topPrediction.metaTool.replace(/\./g, '_');

    // Convert V7 hierarchical result to tool executor format
    const executorClassification = {
      fineCategory: normalizedMetaTool,
      toolIds: [normalizedMetaTool],
      combinedConfidence: topPrediction.combinedConfidence,
      effectiveConfidence: topPrediction.combinedConfidence,
      isOpenIntent: false,
    };

    // High confidence → execute directly
    if (topPrediction.combinedConfidence >= DIRECT_EXECUTION_THRESHOLD) {
      log.info(
        {
          domain: topPrediction.domain,
          metaTool: topPrediction.metaTool,
          normalizedMetaTool,
          combinedConfidence: topPrediction.combinedConfidence.toFixed(3),
          threshold: DIRECT_EXECUTION_THRESHOLD,
          stage1Ms: v7Result.stage1LatencyMs,
          stage2Ms: v7Result.stage2LatencyMs,
        },
        '🎯 FTIS: High confidence - executing directly'
      );

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
          superCategory: topPrediction.domain,
          fineCategory: normalizedMetaTool,
          confidence: topPrediction.combinedConfidence,
          usedFallback: false,
          latencyMs: v7Result.latencyMs,
        },
        processingTimeMs: Date.now() - startTime,
        error: execResult.success ? undefined : execResult.error,
      };
    }

    // 4. Medium confidence - return classification as hint for LLM
    log.debug(
      {
        domain: topPrediction.domain,
        metaTool: topPrediction.metaTool,
        normalizedMetaTool,
        combinedConfidence: topPrediction.combinedConfidence.toFixed(3),
        threshold: DIRECT_EXECUTION_THRESHOLD,
      },
      '🧠 FTIS: Medium confidence - providing hint to LLM'
    );

    return {
      attempted: true,
      bypassLLM: false,
      classification: {
        superCategory: topPrediction.domain,
        fineCategory: normalizedMetaTool,
        confidence: topPrediction.combinedConfidence,
        usedFallback: false,
        latencyMs: v7Result.latencyMs,
      },
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    log.warn({ error: String(error) }, 'FTIS routing failed - falling back to LLM');
    return {
      attempted: true,
      bypassLLM: false,
      processingTimeMs: Date.now() - startTime,
      error: String(error),
    };
  }
}

/**
 * Convert FTIS routing result to SemanticRoutingResult.
 *
 * Maps FTIS result fields to the SemanticRoutingResult format
 * used by the rest of the pipeline.
 */
export function convertToSemanticRoutingResult(
  ftisResult: FTISRoutingResult
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
export function buildFTISToolHint(
  classification: FTISRoutingResult['classification']
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

/** @deprecated Use buildFTISToolHint instead. */
export const buildFTISV2ToolHint = buildFTISToolHint;

/**
 * Build tool response guidance (still useful for formatting responses).
 */
export function buildFTISToolResponseGuidance(params: {
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

/** @deprecated Use buildFTISToolResponseGuidance instead. */
export const buildFTISV2ToolResponseGuidance = buildFTISToolResponseGuidance;

/**
 * Get FTIS instructions for the LLM (simplified, tool-free).
 */
export async function getFTISInstructions(): Promise<string> {
  return `# Automatic Tool Execution

Tools execute automatically based on what the user says.

When you see [TOOL_RESULT: ...], respond naturally to what happened.
- SUCCESS: Acknowledge briefly and warmly
- FAILED: Acknowledge the issue, offer to help differently

Never output JSON. Never try to call tools. Just be conversational.`;
}

/**
 * @deprecated Use runFTISRouting() instead. Kept for backward compatibility.
 */
export const runFTISV2Routing = runFTISRouting;

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
