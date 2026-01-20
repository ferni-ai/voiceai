/**
 * FTIS V2 Integration for Turn Processor
 *
 * Integrates FTIS V2 hierarchical classification with direct tool execution
 * into the turn processing pipeline.
 *
 * This module:
 * 1. Runs FTIS V2 classification on user text
 * 2. If confidence > threshold, executes tool directly
 * 3. Returns result for LLM to respond to naturally
 *
 * @module agents/processors/ftis-v2-integration
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { SemanticRoutingResult } from './types.js';
import {
  recordFTISV2DirectExecution,
  recordFTISV2FallbackToLLM,
} from '../../services/observability/ftis-metrics.js';

const log = createLogger({ module: 'ftis-v2-integration' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Environment flag for FTIS V2 only mode.
 * 
 * **ENABLED BY DEFAULT** (Jan 2026)
 * 
 * When enabled (default):
 * - FTIS V2 handles ALL tool classification
 * - LLM doesn't use native function calling
 * - JSON workaround is disabled
 * - Tools execute directly based on classification
 * 
 * To disable: Set `FTIS_V2_ONLY_MODE=false`
 */
export function isFTISV2OnlyMode(): boolean {
  // FTIS V2 is now ENABLED BY DEFAULT
  // Only disable if explicitly set to 'false'
  if (process.env.FTIS_V2_ONLY_MODE === 'false') {
    return false;
  }
  // Default: enabled (or explicit 'true' for legacy support)
  return true;
}

/**
 * Confidence threshold for direct execution.
 */
const DIRECT_EXECUTION_THRESHOLD = 0.85;

// ============================================================================
// TYPES
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
}

export interface FTISV2RoutingResult {
  /** Whether FTIS V2 routing was attempted */
  attempted: boolean;
  /** Whether to bypass LLM for tool calling */
  bypassLLM: boolean;
  /** Tool execution result (if bypassing LLM) */
  toolResult?: {
    toolId: string;
    output: string;
    success: boolean;
    speakableResponse: string;
  };
  /** Classification details */
  classification?: {
    superCategory: string;
    fineCategory: string;
    confidence: number;
    usedFallback: boolean;
    latencyMs: number;
  };
  /** Total processing time */
  processingTimeMs: number;
  /** Error if classification/execution failed */
  error?: string;
}

// ============================================================================
// MAIN ROUTING FUNCTION
// ============================================================================

/**
 * Run FTIS V2 classification and potentially execute tool directly.
 *
 * @param userText - User's transcript
 * @param context - Routing context (user, session, persona)
 * @returns Routing result with potential tool execution
 */
export async function runFTISV2Routing(
  userText: string,
  context: FTISV2RoutingContext
): Promise<FTISV2RoutingResult> {
  const startTime = performance.now();

  // Skip empty text
  if (!userText || userText.trim().length === 0) {
    return {
      attempted: false,
      bypassLLM: false,
      processingTimeMs: 0,
    };
  }

  try {
    // Import FTIS V2 classifier
    const { getFTISClassifierV2 } = await import(
      '../../tools/intelligence/ftis-classifier-v2.js'
    );

    const classifier = getFTISClassifierV2();

    // Check if classifier is ready
    if (!classifier.isReady()) {
      log.debug('FTIS V2 classifier not ready, skipping');
      return {
        attempted: false,
        bypassLLM: false,
        processingTimeMs: performance.now() - startTime,
        error: 'Classifier not initialized',
      };
    }

    // Classify the user's text
    const classification = await classifier.classify(userText);

    if (!classification) {
      log.debug('FTIS V2 classification returned null');
      return {
        attempted: true,
        bypassLLM: false,
        processingTimeMs: performance.now() - startTime,
        error: 'Classification failed',
      };
    }

    log.info(
      {
        query: userText.slice(0, 50),
        superCategory: classification.superCategory,
        fineCategory: classification.fineCategory,
        confidence: `${(classification.combinedConfidence * 100).toFixed(0)}%`,
        usedFallback: classification.usedFallback,
        latencyMs: classification.latencyMs,
        trace: 'FTIS_V2_CLASSIFY',
      },
      `🧠 FTIS V2: ${classification.fineCategory} (${(classification.combinedConfidence * 100).toFixed(0)}%)`
    );

    // Check if confidence is high enough for direct execution
    if (
      classification.combinedConfidence < DIRECT_EXECUTION_THRESHOLD ||
      classification.fineCategory === 'conversation'
    ) {
      // Low confidence or conversation - don't execute directly, fallback to LLM
      recordFTISV2FallbackToLLM();
      
      return {
        attempted: true,
        bypassLLM: false,
        classification: {
          superCategory: classification.superCategory,
          fineCategory: classification.fineCategory,
          confidence: classification.combinedConfidence,
          usedFallback: classification.usedFallback,
          latencyMs: classification.latencyMs,
        },
        processingTimeMs: performance.now() - startTime,
      };
    }

    // High confidence - execute directly!
    const { executeDirectFromClassification, formatResultForLLM } = await import(
      '../../tools/intelligence/ftis-v2-executor.js'
    );

    const execResult = await executeDirectFromClassification(classification, userText, {
      userId: context.userId,
      sessionId: context.sessionId,
      personaId: context.personaId,
      userLocation: context.userLocation,
    });

    if (execResult.success) {
      const totalProcessingMs = performance.now() - startTime;
      
      // Record successful direct execution metrics
      recordFTISV2DirectExecution({
        category: classification.fineCategory,
        latencyMs: totalProcessingMs,
        success: true,
      });
      
      log.info(
        {
          toolId: execResult.toolId,
          durationMs: execResult.durationMs,
          totalProcessingMs,
          trace: 'FTIS_V2_EXEC_SUCCESS',
        },
        `✅ FTIS V2 Direct Execution: ${execResult.toolId} succeeded`
      );

      return {
        attempted: true,
        bypassLLM: true,
        toolResult: {
          toolId: execResult.toolId,
          output: execResult.naturalResponse,
          success: true,
          speakableResponse: execResult.naturalResponse,
        },
        classification: {
          superCategory: classification.superCategory,
          fineCategory: classification.fineCategory,
          confidence: classification.combinedConfidence,
          usedFallback: classification.usedFallback,
          latencyMs: classification.latencyMs,
        },
        processingTimeMs: totalProcessingMs,
      };
    }

    // Execution failed - fall back to LLM
    const failedProcessingMs = performance.now() - startTime;
    
    // Record failed direct execution metrics
    recordFTISV2DirectExecution({
      category: classification.fineCategory,
      latencyMs: failedProcessingMs,
      success: false,
    });
    
    log.warn(
      {
        toolId: execResult.toolId,
        error: execResult.error,
        processingMs: failedProcessingMs,
        trace: 'FTIS_V2_EXEC_FAIL',
      },
      `⚠️ FTIS V2 Direct Execution failed: ${execResult.error}`
    );

    return {
      attempted: true,
      bypassLLM: false,
      classification: {
        superCategory: classification.superCategory,
        fineCategory: classification.fineCategory,
        confidence: classification.combinedConfidence,
        usedFallback: classification.usedFallback,
        latencyMs: classification.latencyMs,
      },
      processingTimeMs: failedProcessingMs,
      error: execResult.error,
    };
  } catch (error) {
    log.error(
      { error: String(error), userText: userText.slice(0, 50), trace: 'FTIS_V2_ERROR' },
      'FTIS V2 routing failed'
    );

    return {
      attempted: true,
      bypassLLM: false,
      processingTimeMs: performance.now() - startTime,
      error: String(error),
    };
  }
}

/**
 * Convert FTIS V2 routing result to SemanticRoutingResult for compatibility.
 * Uses existing type values to maintain compatibility with turn-processor.
 */
export function convertToSemanticRoutingResult(
  ftisResult: FTISV2RoutingResult
): SemanticRoutingResult {
  if (!ftisResult.attempted) {
    return {
      routed: false,
      bypassLLM: false,
      metrics: {
        latencyMs: ftisResult.processingTimeMs,
        cacheHit: false,
        confidence: 0,
        matchPath: 'none',
      },
      routingPath: 'disabled',
    };
  }

  if (ftisResult.bypassLLM && ftisResult.toolResult) {
    return {
      routed: true,
      bypassLLM: true,
      toolResult: ftisResult.toolResult,
      metrics: {
        latencyMs: ftisResult.processingTimeMs,
        cacheHit: false,
        confidence: ftisResult.classification?.confidence || 0,
        matchPath: 'combined', // FTIS V2 uses combined classification
      },
      routingPath: 'semantic_auto_execute', // Compatible with existing type
    };
  }

  return {
    routed: ftisResult.classification !== undefined,
    bypassLLM: false,
    metrics: {
      latencyMs: ftisResult.processingTimeMs,
      cacheHit: false,
      confidence: ftisResult.classification?.confidence || 0,
      matchPath: ftisResult.classification ? 'combined' : 'none',
    },
    routingPath: ftisResult.classification ? 'semantic_hint' : 'disabled',
  };
}

/**
 * Build tool hint injection for medium-confidence classifications.
 *
 * When FTIS V2 is confident but not enough for direct execution,
 * we add a hint to guide the LLM.
 */
export function buildFTISV2ToolHint(classification: FTISV2RoutingResult['classification']): string | null {
  if (!classification || classification.confidence < 0.5) {
    return null;
  }

  // Get the primary tool ID for this category
  const toolIdMap: Record<string, string> = {
    play_music: 'playMusic',
    music_control: 'musicControl',
    weather: 'getWeather',
    alarm_set: 'setAlarm',
    timer_set: 'setTimer',
    reminder_set: 'setReminder',
    item_add: 'addTask',
    habit_view: 'getHabits',
    habit_create: 'createHabit',
    activity_log: 'logHabit',
    handoff_maya: 'handoffToMaya',
    handoff_peter: 'handoffToPeter',
    handoff_alex: 'handoffToAlex',
    handoff_jordan: 'handoffToJordan',
    handoff_nayan: 'handoffToNayan',
    call_make: 'makePhoneCall',
    message_send: 'sendMessage',
    time: 'getCurrentTime',
    date: 'getCurrentDate',
    lights: 'controlLights',
    thermostat: 'setThermostat',
  };

  const toolId = toolIdMap[classification.fineCategory] || classification.fineCategory;

  return `[TOOL HINT from FTIS V2 Classification]
Detected intent: ${classification.fineCategory} (${(classification.confidence * 100).toFixed(0)}% confidence)
Suggested tool: ${toolId}

If the user is requesting this action, respond naturally and the system will execute the tool.
If they're just conversing, respond naturally without expecting tool execution.`;
}

// ============================================================================
// TOOL RESPONSE GUIDANCE (BETTER THAN HUMAN)
// ============================================================================

/**
 * Tool-specific guidance for natural responses.
 */
const TOOL_RESPONSE_GUIDANCE: Record<string, { success: string; failure: string }> = {
  playMusic: {
    success: 'Music is now playing. A brief "Here we go" or warm acknowledgment is enough - the music speaks for itself.',
    failure: "Music couldn't play. Ask what else they'd like to hear or suggest checking their connection.",
  },
  getWeather: {
    success: 'Share the weather conversationally. Start with the most relevant info (temp if asking generally, rain if they asked about umbrella).',
    failure: "Couldn't get weather. Offer to try again or suggest they check their weather app.",
  },
  createHabit: {
    success: 'Celebrate this with them! Starting a new habit is exciting. Be encouraging but not over-the-top.',
    failure: 'Habit creation failed. Ask if they want to try with different details.',
  },
  logHabit: {
    success: 'Acknowledge their progress warmly. Reference their streak if impressive.',
    failure: "Couldn't log it. Reassure them it still counts and you'll try again.",
  },
  addTask: {
    success: "Confirm the task briefly. If it has a due date, mention when it's due.",
    failure: 'Task creation failed. Offer to remember it another way.',
  },
  setTimer: {
    success: 'Confirm the timer is set with the duration. Keep it brief.',
    failure: "Timer couldn't be set. Offer an alternative or suggest their phone timer.",
  },
  setReminder: {
    success: 'Confirm when the reminder will trigger. Keep it brief.',
    failure: "Reminder couldn't be set. Offer to help another way.",
  },
  handoff: {
    success: "You're transitioning to another persona. Say goodbye warmly and hand off naturally.",
    failure: 'Handoff failed. Reassure user you can still help, or try again.',
  },
};

/**
 * Persona-specific voice guidance for responses.
 */
const PERSONA_VOICE_GUIDANCE: Record<string, string> = {
  'ferni': 'Warm, grounded life coach. Supportive but not saccharine. Like a wise friend.',
  'maya-santos': 'Energetic habit coach. Encouraging and action-oriented. Celebrates progress.',
  'peter-john': 'Calm research advisor. Thoughtful and precise. Explains with clarity.',
  'alex-chen': 'Professional communications coach. Clear and efficient. Gets to the point.',
  'jordan-taylor': 'Creative event planner. Enthusiastic about celebrations and milestones.',
  'nayan-patel': 'Wise philosopher. Reflective and deep. Finds meaning in moments.',
};

/**
 * Build rich tool response guidance for FTIS V2 direct execution.
 * 
 * This creates "Better Than Human" responses with full context,
 * similar to buildToolResponseGuidance in transform-stream.ts.
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
  const { toolId, result, success, personaId, userName, userEmotion, timeOfDay } = params;

  // Get tool-specific guidance
  const toolKey = toolId.replace(/^handoffTo.*/, 'handoff');
  const toolGuidance = TOOL_RESPONSE_GUIDANCE[toolKey] || TOOL_RESPONSE_GUIDANCE[toolId];
  const specificGuidance = toolGuidance
    ? success
      ? toolGuidance.success
      : toolGuidance.failure
    : success
      ? 'Respond naturally as if YOU did the action.'
      : 'Acknowledge the issue warmly and offer to help differently.';

  // Get persona voice
  const personaVoice = personaId && PERSONA_VOICE_GUIDANCE[personaId]
    ? `[PERSONA: ${PERSONA_VOICE_GUIDANCE[personaId]}]`
    : '[PERSONA: Warm and authentic, like a supportive friend]';

  // Build context parts
  const parts: string[] = [];

  if (success) {
    parts.push(`[TOOL_RESULT: ${toolId}]`);
    parts.push('Status: SUCCESS');
    parts.push(`Result: ${result.slice(0, 800)}`);
  } else {
    parts.push(`[TOOL_RESULT: ${toolId}]`);
    parts.push('Status: FAILED');
    parts.push(`Error: ${result || 'Unknown error'}`);
  }

  parts.push('');
  parts.push(personaVoice);
  
  if (userName) {
    parts.push(`[USER: ${userName}]`);
  }
  
  if (userEmotion) {
    parts.push(`[EMOTIONAL CONTEXT: User seems ${userEmotion}. Match their energy appropriately.]`);
  }
  
  if (timeOfDay) {
    const isLateNight = ['night', 'late_night', 'evening'].includes(timeOfDay.toLowerCase());
    if (isLateNight) {
      parts.push('[TIME: Late - be gentle and calming]');
    }
  }

  parts.push('');
  parts.push(`[GUIDANCE: ${specificGuidance}]`);
  parts.push('');
  parts.push('[RESPONSE RULES:]');
  parts.push("- Respond as if YOU did this, not a tool (never say \"the tool\" or \"I executed\")");
  parts.push('- Be conversational and warm, like telling a friend');
  parts.push('- Keep it brief (1-2 sentences usually)');
  parts.push("- Match the user's emotional energy");
  parts.push('- Never output JSON');

  return parts.join('\n');
}

/**
 * Get instructions for FTIS V2 mode.
 *
 * These replace the JSON function-calling instructions when in FTIS V2 mode.
 */
export async function getFTISV2Instructions(): Promise<string> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const { fileURLToPath } = await import('url');

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const instructionsPath = path.join(
      __dirname,
      '../../personas/bundles/shared/ftis-v2-instructions.md'
    );

    return await fs.readFile(instructionsPath, 'utf-8');
  } catch {
    // Fallback inline instructions
    return `# Automatic Tool Execution

Tools execute automatically based on what the user says. You don't call tools.

When you see [TOOL_RESULT: ...], respond naturally to what happened.
- SUCCESS: Acknowledge briefly and warmly
- FAILED: Acknowledge the issue, offer to help differently

Never output JSON. Never try to call tools. Just be conversational.`;
  }
}

// ============================================================================
// FTIS V2 TOOL RESULT - SYSTEM MESSAGE FORMAT
// ============================================================================

/**
 * Tool-specific natural response guidance.
 */
const TOOL_NATURAL_RESPONSES: Record<string, { success: string; failure: string }> = {
  playMusic: {
    success: 'Brief acknowledgment like "Here we go!" - music speaks for itself',
    failure: 'Warmly acknowledge, suggest checking connection or ask what else',
  },
  getWeather: {
    success: 'Share weather conversationally - start with most relevant info',
    failure: 'Apologize briefly, offer to try again or suggest alternatives',
  },
  setTimer: {
    success: 'Confirm the duration briefly',
    failure: 'Acknowledge and offer alternative or retry',
  },
  setAlarm: {
    success: 'Confirm the time briefly',
    failure: 'Acknowledge and offer alternative',
  },
  addTask: {
    success: 'Confirm briefly, mention due date if relevant',
    failure: 'Acknowledge and offer to remember another way',
  },
  logHabit: {
    success: 'Celebrate warmly, mention streak if impressive',
    failure: 'Reassure them it still counts',
  },
  createHabit: {
    success: 'Celebrate starting something new - be encouraging',
    failure: 'Ask if they want to try with different details',
  },
};

/**
 * Build EPHEMERAL instructions for generateReply after tool execution.
 * 
 * CLEAN ARCHITECTURE (Jan 2026):
 * These instructions are passed to generateReply's `instructions` parameter,
 * which is NOT stored in chat history. This prevents the tool result from
 * leaking to subsequent turns or SDK auto-responses.
 * 
 * This is the preferred approach over context injection.
 * 
 * @param params - Tool execution details
 * @returns Formatted instructions for generateReply
 */
export function buildToolResponseInstructions(params: {
  toolId: string;
  result: string;
  success: boolean;
  personaId?: string;
  personaDisplayName?: string;
  userRequest?: string;
}): string {
  const { toolId, result, success, personaId, personaDisplayName, userRequest } = params;
  
  // Get tool-specific guidance
  const guidance = TOOL_NATURAL_RESPONSES[toolId];
  const specificGuidance = guidance
    ? (success ? guidance.success : guidance.failure)
    : (success ? 'Acknowledge naturally and briefly' : 'Acknowledge warmly, offer to help differently');

  // Persona voice guidance
  const personaVoices: Record<string, string> = {
    'ferni': 'Warm, grounded life coach. Supportive but not saccharine. Like a wise friend.',
    'maya-santos': 'Energetic habit coach. Encouraging and action-oriented. Celebrates progress.',
    'peter-john': 'Calm research advisor. Thoughtful and precise. Explains with clarity.',
    'alex-chen': 'Professional communications coach. Clear and efficient. Gets to the point.',
    'jordan-taylor': 'Creative event planner. Enthusiastic about celebrations and milestones.',
    'nayan-patel': 'Wise philosopher. Reflective and deep. Finds meaning in moments.',
  };
  
  const personaVoice = personaId && personaVoices[personaId]
    ? personaVoices[personaId]
    : personaDisplayName
      ? `Respond as ${personaDisplayName} with warmth and authenticity.`
      : 'Respond warmly and naturally, like a supportive friend.';

  if (success) {
    const parts: string[] = [
      // What happened
      `A tool just executed successfully in response to the user.`,
      userRequest ? `User said: "${userRequest.slice(0, 100)}"` : '',
      `Tool: ${toolId}`,
      `Result: ${result.slice(0, 500)}`,
      ``,
      // How to respond
      `YOUR RESPONSE:`,
      `- ${specificGuidance}`,
      `- Be brief (1-2 sentences)`,
      `- Sound natural - like YOU did this, not a tool`,
      `- NEVER say "Status SUCCESS" or echo data formats`,
      `- NEVER mention "the tool" or "I executed"`,
      `- NEVER use colons in speech (no "Result: X", say "It's X")`,
      ``,
      `PERSONA: ${personaVoice}`,
    ].filter(Boolean);
    
    return parts.join('\n');
  } else {
    const parts: string[] = [
      `A tool failed to execute.`,
      userRequest ? `User said: "${userRequest.slice(0, 100)}"` : '',
      `Tool: ${toolId}`,
      `Error: ${result.slice(0, 200)}`,
      ``,
      `YOUR RESPONSE:`,
      `- ${specificGuidance}`,
      `- Don't over-apologize or be dramatic`,
      `- Keep it brief and offer an alternative`,
      `- Sound natural - you're talking to a friend`,
      ``,
      `PERSONA: ${personaVoice}`,
    ].filter(Boolean);
    
    return parts.join('\n');
  }
}

/**
 * @deprecated Use buildToolResponseInstructions() instead.
 * This function was designed for context injection (which can leak).
 * The new function is designed for ephemeral generateReply instructions.
 */
export function buildFTISToolSystemPrompt(params: {
  toolId: string;
  result: string;
  success: boolean;
  personaId?: string;
}): string {
  // Delegate to new function for backward compatibility
  return buildToolResponseInstructions(params);
}
