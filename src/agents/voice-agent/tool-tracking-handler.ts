/**
 * Voice Agent Tool Tracking Handler
 *
 * Tracks tool execution for:
 * - Conversation state updates
 * - Tool usage analytics
 * - Deprecation analysis
 * - Pattern analysis (co-occurrence, sequences)
 * - Auto-optimizer feedback
 *
 * Extracted from voice-agent.ts to reduce file size and improve maintainability.
 *
 * @module voice-agent/tool-tracking-handler
 */

import { log, voice } from '@livekit/agents';
import type { PersonaConfig } from '../../personas/types.js';
import { diag } from '../../services/diagnostic-logger.js';
import type { SessionServices } from '../../services/index.js';
import { autoOptimizer } from '../../tools/optimization/auto-optimizer.js';
import { deprecationService } from '../../tools/deprecation.js';
import { patternAnalyzer } from '../../tools/optimization/pattern-analyzer.js';
import type { UserData } from '../shared/types.js';

// Capability learning - track tool execution for collective learning
import { onToolExecuted } from '../../intelligence/capability-learning.js';
// Safe fire-and-forget pattern for non-critical async operations
import { fireAndForget } from '../../utils/safe-fire-and-forget.js';
// Semantic tool presence - "Better than Human" tool feedback
import { startToolPresence, stopToolPresence } from '../../tools/execution/index.js';
// Tool timing context for natural LLM framing
import { recordToolTiming } from '../../intelligence/context-builders/awareness/tool-timing-awareness.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ToolTrackingContext {
  /** Voice session instance */
  session: voice.AgentSession<UserData>;
  /** User data with conversation state */
  userData: UserData;
  /** Session services */
  services: SessionServices;
  /** Current persona config */
  sessionPersona: PersonaConfig;
  /** Session identifier */
  sessionId: string;
  /** Enable debug logging */
  debugEnabled?: boolean;
  /** Enable verbose tool result logging (from admin config) */
  logToolResults?: boolean;
  /** Callback to send data messages to frontend (for behavior signals) */
  sendDataMessage?: (type: string, payload: Record<string, unknown>) => Promise<void>;
}

export interface ToolTrackingResult {
  /** Cleanup function (currently no cleanup needed) */
  cleanup: () => void;
}

// ============================================================================
// TOOL INFO TYPE
// ============================================================================

interface ToolInfo {
  name?: string;
  toolName?: string;
  result?: unknown;
  error?: unknown;
  tools?: Array<{
    name?: string;
    result?: unknown;
    error?: unknown;
    startTime?: number;
  }>;
  // OpenAI Realtime API structure
  functionCalls?: Array<{
    name?: string;
    arguments?: Record<string, unknown>;
    callId?: string;
  }>;
  functionCallOutputs?: Array<{
    name?: string;
    output?: unknown;
    callId?: string;
    isError?: boolean;
  }>;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Set up tool execution tracking on the voice session.
 *
 * Listens to FunctionToolsExecuted events and:
 * 1. Updates conversation state with tool calls
 * 2. Records tool usage analytics
 * 3. Tracks deprecation metrics
 * 4. Records pattern analysis data
 * 5. Feeds auto-optimizer
 */
// Behavior tool names that should emit signals to frontend
const BEHAVIOR_TOOLS = ['shiftMode', 'adjustPacing', 'processing', 'holdSpace', 'expressPresence'];

export function setupToolTrackingHandler(ctx: ToolTrackingContext): ToolTrackingResult {
  const {
    session,
    userData,
    services,
    sessionPersona,
    sessionId,
    debugEnabled,
    logToolResults,
    sendDataMessage,
  } = ctx;
  const logger = log();

  session.on(voice.AgentSessionEventTypes.FunctionToolsExecuted, (event) => {
    fireAndForget(async () => {
      const toolStartTime = Date.now();
      const timestamp = new Date().toISOString();

      // 🔧 ALWAYS log tool execution for native FC debugging
      // This is step 2 of the native FC flow:
      // 1. function_calls_collected (Gemini requests tool)
      // 2. FunctionToolsExecuted (tool runs, result ready) ← WE ARE HERE
      // 3. Result sent back to Gemini for response generation
      const toolInfo = event as ToolInfo;
      const toolNames: string[] = [];

      if (toolInfo.functionCallOutputs) {
        toolNames.push(...toolInfo.functionCallOutputs.map((t) => t.name || 'unknown'));
      } else if (toolInfo.tools) {
        toolNames.push(...toolInfo.tools.map((t) => t.name || 'unknown'));
      } else if (toolInfo.name) {
        toolNames.push(toolInfo.name);
      }

      process.stderr.write(`\n✅ [NATIVE FC] TOOL EXECUTED at ${timestamp}\n`);
      process.stderr.write(`   Tools: ${toolNames.join(', ') || 'unknown'}\n`);

      // Verbose tool result logging (controlled by admin config)
      if (logToolResults) {
        process.stderr.write(`\n${'='.repeat(60)}\n`);
        process.stderr.write(`🔧 [TOOL RESULT] FunctionToolsExecuted event:\n`);
        process.stderr.write(`${JSON.stringify(event, null, 2)}\n`);
        process.stderr.write(`${'='.repeat(60)}\n\n`);
      }

      // Debug logging (can be disabled in production)
      if (debugEnabled) {
        logger.debug({ event: 'FunctionToolsExecuted' }, '🔧 [TOOLS] FunctionToolsExecuted event');
      }
      logger.info({ event }, '🔧 FUNCTION TOOLS EXECUTED');

      // Update conversation state with tool execution
      if (userData?.conversationState && event) {
        const convState = userData.conversationState;

        // Get tool information from event
        // The event structure varies by LLM backend:
        // - OpenAI Realtime: { functionCallOutputs: [...] }
        // - Gemini/Other: { tools: [...] } or direct tool object
        const toolInfo = event as ToolInfo;

        // Handle different event structures:
        // 1. OpenAI Realtime API: functionCallOutputs array
        // 2. Legacy/Gemini: tools array or single tool object
        let toolCalls: Array<{
          name?: string;
          result?: unknown;
          output?: unknown;
          error?: unknown;
          isError?: boolean;
          startTime?: number;
        }>;

        if (toolInfo.functionCallOutputs && toolInfo.functionCallOutputs.length > 0) {
          // OpenAI Realtime API structure - map output to result for consistency
          toolCalls = toolInfo.functionCallOutputs.map((fco) => ({
            name: fco.name,
            result: fco.output,
            error: fco.isError ? fco.output : undefined,
            isError: fco.isError,
          }));
          logger.debug(
            { toolCount: toolCalls.length, names: toolCalls.map((t) => t.name) },
            '🔧 [TOOLS] Parsed OpenAI functionCallOutputs'
          );
        } else if (toolInfo.tools && toolInfo.tools.length > 0) {
          // Legacy/Gemini structure
          toolCalls = toolInfo.tools;
          logger.debug(
            { toolCount: toolCalls.length, names: toolCalls.map((t) => t.name) },
            '🔧 [TOOLS] Parsed legacy tools array'
          );
        } else {
          // Single tool object fallback - log warning to diagnose unexpected structure
          toolCalls = [toolInfo];
          logger.warn(
            {
              hasName: !!toolInfo.name,
              hasToolName: !!toolInfo.toolName,
              hasFunctionCallOutputs: !!toolInfo.functionCallOutputs,
              functionCallOutputsLength: toolInfo.functionCallOutputs?.length,
              hasTools: !!toolInfo.tools,
              toolsLength: toolInfo.tools?.length,
              eventKeys: Object.keys(toolInfo),
            },
            '🔧 [TOOLS] WARNING: Falling back to single tool object - unexpected event structure'
          );
        }

        for (const tool of toolCalls) {
          const toolName = tool.name || toolInfo.name || toolInfo.toolName || 'unnamed_tool';
          // Handle both legacy (error) and OpenAI Realtime (isError) error indicators
          const hasError = !!tool.error || !!tool.isError || !!toolInfo.error;
          // Use result or output (OpenAI uses output, legacy uses result)
          const toolResult = tool.result ?? tool.output;
          const resultSummary =
            toolResult === undefined
              ? '(no result)'
              : typeof toolResult === 'string'
                ? toolResult.slice(0, 200)
                : JSON.stringify(toolResult).slice(0, 200);

          // 🔍 DIAGNOSTIC: Track tool execution sequence for cross-tool debugging
          const diagTimestamp = new Date().toISOString();
          const isMusic =
            toolName.toLowerCase().includes('music') || toolName.toLowerCase().includes('play');
          const isNewsOrWeather =
            toolName.toLowerCase().includes('news') || toolName.toLowerCase().includes('weather');

          if (hasError) {
            logger.warn(
              {
                timestamp: diagTimestamp,
                toolName,
                error: String(tool.error || toolInfo.error),
                isNewsOrWeather,
                sessionId,
              },
              '🔍 [DIAG] Tool FAILED - tracking for cross-tool analysis'
            );
          }

          if (isMusic) {
            logger.info(
              {
                timestamp: diagTimestamp,
                toolName,
                status: hasError ? 'error' : 'success',
                resultPreview: resultSummary.slice(0, 100),
                sessionId,
              },
              '🔍 [DIAG] Music tool executed - check if previous news/weather errors affected this'
            );
          }

          // ================================================================
          // 🔧 FIX (Jan 2026): Speak tool results when using OpenAI Realtime
          // With createResponse=false, OpenAI doesn't auto-generate speech after
          // receiving function call results. We need to explicitly trigger a response.
          //
          // CRITICAL (Jan 2026): DO NOT call safeGenerateReply for Gemini native FC!
          // Gemini automatically continues streaming after receiving tool results.
          // Calling safeGenerateReply conflicts with Gemini's auto-continuation
          // and causes 6-second timeouts.
          //
          // Priority tools that get direct speech (info-heavy results):
          // - News, weather, sports (data that needs to be read)
          // - Music control (simple confirmations already in tool output)
          //
          // Note: Other tools let the LLM decide what to say based on context.
          // ================================================================
          const shouldSpeakDirectly = isNewsOrWeather || isMusic;

          if (shouldSpeakDirectly && !hasError && toolResult) {
            const resultToSpeak =
              typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);

            // Only speak if there's meaningful content (not empty or too short)
            if (resultToSpeak && resultToSpeak.length > 10) {
              // Check if using Gemini native FC - if so, skip safeGenerateReply
              // Gemini automatically responds after tool execution in native FC mode
              const { getModelProvider, isUsingGemini } = await import(
                '../model-provider/index.js'
              );

              const provider = getModelProvider();
              const isGeminiNativeFC = isUsingGemini() && provider.hasNativeFunctionCalling();

              if (isGeminiNativeFC) {
                logger.info(
                  {
                    toolName,
                    sessionId,
                  },
                  '🔧 Gemini native FC - skipping safeGenerateReply (Gemini auto-responds)'
                );
                // Gemini will automatically continue after tool result - no need to prompt
              } else {
                // OpenAI Realtime with createResponse=false needs explicit speech trigger
                logger.info(
                  {
                    toolName,
                    resultLength: resultToSpeak.length,
                    sessionId,
                  },
                  '🔧 Tool result - speaking via safeGenerateReply (OpenAI mode)'
                );

                // Fire-and-forget: speak the result via safeGenerateReply
                fireAndForget(async () => {
                  try {
                    const { safeGenerateReply, formatToolResult } =
                      await import('../shared/safe-generate-reply.js');

                    // Format the tool result with behavioral instructions
                    const instructions = formatToolResult(toolName, resultToSpeak);

                    await safeGenerateReply(session, {
                      instructions,
                      allowInterruptions: true,
                      context: `native-tool-result-${toolName}`,
                      waitForPlayout: true,
                      timeoutMs: 6000,
                      fallbackMessage: toolName.toLowerCase().includes('music')
                        ? 'Done!'
                        : 'Let me share what I found...',
                      sessionId,
                    });

                    logger.info({ toolName, sessionId }, '🔧 Tool result spoken successfully');
                  } catch (speakErr) {
                    logger.warn(
                      { toolName, error: String(speakErr), sessionId },
                      '🔧 Failed to speak tool result (watchdog will catch this)'
                    );
                  }
                }, `speak-tool-result-${toolName}`);
              }
            }
          }

          // Record in conversation state with full tracking (P0-#1 fix, Jan 2026)
          // - success: !hasError tells LLM if tool worked
          // - userRequest: most recent transcript that likely triggered this tool
          convState.recordToolCall(toolName, resultSummary, {
            success: !hasError,
            userRequest: userData.recentTranscripts?.[0],
          });

          // 📚 CAPABILITY LEARNING: Track tool execution for collective learning
          // This feeds into domain fluency optimization over time
          if (!hasError) {
            const sessionKey = `${services.userId || 'anon'}-${sessionId}`;
            onToolExecuted(sessionKey, toolName);
          }

          // 🔄 BEHAVIOR TOOL SIGNAL EMISSION
          // When behavior tools execute, emit signals to frontend for avatar updates
          if (sendDataMessage && BEHAVIOR_TOOLS.includes(toolName) && !hasError && tool.result) {
            try {
              const result = tool.result as Record<string, unknown>;

              // Emit the signal that the behavior tool returned
              if (result.signal) {
                await sendDataMessage('behavior_signal', result.signal as Record<string, unknown>);
                logger.debug(
                  { toolName, signal: result.signal },
                  '🔄 Behavior signal emitted to frontend'
                );
              }

              // For mode shifts, emit mode change
              if (toolName === 'shiftMode' && result.mode) {
                await sendDataMessage('behavior_signal', {
                  type: 'mode_shift',
                  mode: result.mode,
                  timestamp: Date.now(),
                });
              }

              // For pacing changes, emit pacing change
              if (toolName === 'adjustPacing' && result.speed) {
                await sendDataMessage('behavior_signal', {
                  type: 'pacing_change',
                  pacing: result.speed,
                  timestamp: Date.now(),
                });
              }

              // For processing, emit processing state
              if (toolName === 'processing') {
                await sendDataMessage('behavior_signal', {
                  type: 'processing_start',
                  expression: result.phrase,
                  timestamp: Date.now(),
                });
              }

              // For hold space, emit hold space
              if (toolName === 'holdSpace' && result.duration) {
                await sendDataMessage('behavior_signal', {
                  type: 'hold_space',
                  duration: result.duration,
                  timestamp: Date.now(),
                });
              }

              // For presence expressions
              if (toolName === 'expressPresence' && result.expression) {
                await sendDataMessage('behavior_signal', {
                  type: 'expression',
                  expression: result.expression,
                  timestamp: Date.now(),
                });
              }
            } catch (emitError) {
              logger.debug(
                { error: String(emitError), toolName },
                'Failed to emit behavior signal (non-critical)'
              );
            }
          }

          // Record analytics for tool usage optimization
          await recordToolAnalytics({
            tool,
            toolInfo,
            toolName,
            toolStartTime,
            sessionPersona,
            services,
            sessionId,
          });

          // "Better than Human" - Record tool timing for natural LLM framing
          // This helps the LLM acknowledge wait times naturally
          const toolWithStartTime = tool as { startTime?: number };
          const actualLatencyMs = toolWithStartTime.startTime
            ? Date.now() - toolWithStartTime.startTime
            : Date.now() - toolStartTime;

          // Stop semantic tool presence tracking (if it was started)
          const timingContext = stopToolPresence(sessionId, toolName);

          // Record timing for context injection into next LLM call
          recordToolTiming(
            sessionId,
            toolName,
            timingContext?.durationMs ?? actualLatencyMs,
            userData?.voiceEmotion?.primary
          );

          diag.tool('Tool execution tracked', {
            tool: toolName,
            hasResult: !!tool.result,
            hasError,
          });
        }
      }
    }, 'tool-tracking-handler');
  });

  return {
    cleanup: () => {
      // No cleanup needed - event listener is tied to session lifecycle
    },
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

interface RecordToolAnalyticsParams {
  tool: ToolInfo['tools'] extends Array<infer T> ? T : ToolInfo;
  toolInfo: ToolInfo;
  toolName: string;
  toolStartTime: number;
  sessionPersona: PersonaConfig;
  services: SessionServices;
  sessionId: string;
}

/**
 * Record tool analytics for optimization
 */
async function recordToolAnalytics(params: RecordToolAnalyticsParams): Promise<void> {
  const { tool, toolInfo, toolName, toolStartTime, sessionPersona, services, sessionId } = params;

  try {
    const { recordToolUsage } = await import('../../services/analytics/tool-usage-analytics.js');
    const toolWithStartTime = tool as { startTime?: number };
    const latencyMs = toolWithStartTime.startTime
      ? Date.now() - toolWithStartTime.startTime
      : Date.now() - toolStartTime;
    const hasError = !!tool.error || !!toolInfo.error;

    recordToolUsage(
      toolName,
      'unknown', // Domain can be inferred later from registry
      {
        agentId: sessionPersona?.id || 'unknown',
        userId: services.userId,
        sessionId: services.sessionId,
      },
      latencyMs,
      !hasError,
      hasError ? String(tool.error || toolInfo.error) : undefined
    );

    // Record for deprecation analysis (identifies unused/error-prone tools)
    deprecationService.recordUsage(toolName, !hasError, latencyMs);

    // Record for pattern analysis (co-occurrence, sequences, journeys)
    patternAnalyzer.recordToolCall(services.sessionId || sessionId, toolName, !hasError, latencyMs);

    // Record for auto-optimizer (feeds recommendation engine)
    autoOptimizer.recordToolExecution(
      services.sessionId || sessionId,
      toolName,
      !hasError,
      latencyMs
    );
  } catch (e) {
    // Analytics recording is non-critical, don't fail the tool execution
    log().debug({ error: String(e) }, 'Tool analytics recording failed (non-critical)');
  }
}

export default setupToolTrackingHandler;
