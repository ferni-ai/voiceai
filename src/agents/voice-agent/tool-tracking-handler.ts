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
import { autoOptimizer } from '../../tools/auto-optimizer.js';
import { deprecationService } from '../../tools/deprecation.js';
import { patternAnalyzer } from '../../tools/pattern-analyzer.js';
import type { UserData } from '../shared/types.js';

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
    void (async () => {
      const toolStartTime = Date.now();

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
        // The event structure varies, but typically contains tool name/id
        const toolInfo = event as ToolInfo;

        // Handle single tool or multiple tools
        const toolCalls = toolInfo.tools || [toolInfo];

        for (const tool of toolCalls) {
          const toolName = tool.name || toolInfo.name || toolInfo.toolName || 'unknown';
          const hasError = !!tool.error || !!toolInfo.error;
          const resultSummary =
            tool.result === undefined
              ? '(no result)'
              : typeof tool.result === 'string'
                ? tool.result.slice(0, 200)
                : JSON.stringify(tool.result).slice(0, 200);

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

          // Record in conversation state
          convState.recordToolCall(toolName, resultSummary);

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

          diag.tool('Tool execution tracked', {
            tool: toolName,
            hasResult: !!tool.result,
            hasError,
          });
        }
      }
    })();
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
