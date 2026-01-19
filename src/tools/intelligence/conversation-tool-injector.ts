/**
 * Conversation Tool Injector
 *
 * When FTIS_ONLY_MODE is enabled, this module monitors conversation turns
 * and injects tool results into Gemini's context. Gemini has NO tool knowledge -
 * it just sees the results naturally.
 *
 * Flow:
 * 1. User says: "What's the weather like?"
 * 2. FTIS detects tool intent with high confidence
 * 3. Tool executes: getWeather() returns "72F, sunny"
 * 4. Inject into Gemini context: [SYSTEM: Weather result - 72F and sunny]
 * 5. Gemini responds naturally: "It's a beautiful 72 degrees and sunny!"
 *
 * @module tools/intelligence/conversation-tool-injector
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { FTISRoutingResult } from './ftis-integration.js';
import { getFTISIntegration } from './ftis-integration.js';

const log = createLogger({ module: 'ConversationToolInjector' });

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationContext {
  userId: string;
  sessionId: string;
  personaId: string;
  turnNumber: number;
  recentHistory?: string[];
}

export interface ToolInjectionDecision {
  /** Whether to inject a tool result */
  shouldInject: boolean;
  /** Tool ID to execute (if shouldInject is true) */
  toolId?: string;
  /** Arguments for the tool */
  args?: Record<string, unknown>;
  /** Confidence in the tool detection */
  confidence: number;
  /** Reason for the decision */
  reason: string;
}

export interface InjectedToolResult {
  /** The tool that was executed */
  toolId: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Natural language result to inject */
  naturalResponse: string;
  /** Raw data from tool (for debugging) */
  data?: unknown;
  /** Execution time in ms */
  durationMs: number;
}

export interface ConversationToolInjector {
  /** Analyze turn for tool-relevant content */
  analyzeTurn(
    transcript: string,
    context: ConversationContext
  ): Promise<ToolInjectionDecision>;

  /** Execute tool and format result for injection */
  executeAndFormat(
    toolId: string,
    args: Record<string, unknown>,
    context: ConversationContext
  ): Promise<InjectedToolResult>;

  /** Format result as system message for Gemini context */
  formatAsSystemMessage(result: InjectedToolResult): string;

  /** Check if FTIS-only mode is enabled */
  isEnabled(): boolean;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Minimum confidence threshold for automatic tool injection */
const INJECTION_CONFIDENCE_THRESHOLD = 0.85;

/** Maximum time to wait for tool execution before giving up */
const TOOL_EXECUTION_TIMEOUT_MS = 5000;

// ============================================================================
// IMPLEMENTATION
// ============================================================================

/**
 * Create a ConversationToolInjector instance.
 *
 * This is only active when FTIS_ONLY_MODE=true.
 */
export function createConversationToolInjector(): ConversationToolInjector {
  return {
    isEnabled(): boolean {
      return process.env.FTIS_ONLY_MODE === 'true';
    },

    async analyzeTurn(
      transcript: string,
      context: ConversationContext
    ): Promise<ToolInjectionDecision> {
      // Not enabled - no injection
      if (!this.isEnabled()) {
        return {
          shouldInject: false,
          confidence: 0,
          reason: 'FTIS_ONLY_MODE not enabled',
        };
      }

      // Empty transcript - no injection
      if (!transcript || transcript.trim().length === 0) {
        return {
          shouldInject: false,
          confidence: 0,
          reason: 'Empty transcript',
        };
      }

      try {
        // Route through FTIS to detect tool intent
        const ftis = getFTISIntegration();
        const ftisDecision: FTISRoutingResult = await ftis.route({
          query: transcript,
          userId: context.userId,
          sessionId: context.sessionId,
          personaId: context.personaId,
          availableTools: [], // Will use default available tools
        });

        const { complexity, predictions, sequence } = ftisDecision;

        // High confidence direct tool detection
        if (
          complexity.suggestedApproach === 'direct' &&
          complexity.confidence >= INJECTION_CONFIDENCE_THRESHOLD &&
          predictions &&
          predictions.length > 0
        ) {
          const primaryTool = predictions[0];

          log.info(
            {
              userId: context.userId,
              toolId: primaryTool.toolId,
              confidence: complexity.confidence,
              transcript: transcript.substring(0, 50),
            },
            '🎯 Tool injection detected'
          );

          return {
            shouldInject: true,
            toolId: primaryTool.toolId,
            args: {},
            confidence: complexity.confidence,
            reason: `FTIS detected tool with ${Math.round(complexity.confidence * 100)}% confidence`,
          };
        }

        // Sequence of tools - inject first one
        if (
          complexity.suggestedApproach === 'sequence' &&
          complexity.confidence >= INJECTION_CONFIDENCE_THRESHOLD &&
          sequence &&
          sequence.steps.length > 0
        ) {
          const firstStep = sequence.steps[0];

          log.info(
            {
              userId: context.userId,
              toolId: firstStep.toolId,
              sequenceLength: sequence.steps.length,
              confidence: complexity.confidence,
            },
            '🎯 Tool sequence injection detected'
          );

          return {
            shouldInject: true,
            toolId: firstStep.toolId,
            args: {},
            confidence: complexity.confidence,
            reason: `FTIS detected tool sequence (${sequence.steps.length} tools)`,
          };
        }

        // No high-confidence tool match
        return {
          shouldInject: false,
          confidence: complexity.confidence,
          reason: ftisDecision.useSimpleExecution
            ? 'Simple query - no tool needed'
            : `Low confidence (${Math.round(complexity.confidence * 100)}%)`,
        };
      } catch (error) {
        log.error(
          { error: String(error), userId: context.userId },
          'Tool analysis failed'
        );
        return {
          shouldInject: false,
          confidence: 0,
          reason: `Analysis error: ${error}`,
        };
      }
    },

    async executeAndFormat(
      toolId: string,
      args: Record<string, unknown>,
      context: ConversationContext
    ): Promise<InjectedToolResult> {
      const startTime = performance.now();

      try {
        // Import domain bridge for tool execution
        const { executeDomainTool } = await import(
          '../semantic-router/domain-bridge.js'
        );

        // Execute with timeout
        // Note: Using minimal context since conversation-tool-injector doesn't
        // have access to full session services or history
        const resultPromise = executeDomainTool(toolId, args, {
          userId: context.userId,
          sessionId: context.sessionId,
          personaId: context.personaId,
          conversationHistory: [],
          services: null as unknown, // Not available in injection context
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Tool execution timeout')),
            TOOL_EXECUTION_TIMEOUT_MS
          )
        );

        const result = await Promise.race([resultPromise, timeoutPromise]);
        const durationMs = Math.round(performance.now() - startTime);

        log.info(
          {
            toolId,
            success: result.success,
            durationMs,
            userId: context.userId,
          },
          '🔧 Tool executed for injection'
        );

        return {
          toolId,
          success: result.success,
          naturalResponse: result.naturalResponse || 'Tool completed.',
          data: result.data,
          durationMs,
        };
      } catch (error) {
        const durationMs = Math.round(performance.now() - startTime);

        log.error(
          { error: String(error), toolId, userId: context.userId },
          'Tool execution failed'
        );

        return {
          toolId,
          success: false,
          naturalResponse: "I couldn't complete that action right now.",
          durationMs,
        };
      }
    },

    formatAsSystemMessage(result: InjectedToolResult): string {
      // Format as a system message that Gemini will see in context
      // This should be natural and informative without being verbose
      if (result.success) {
        return `[TOOL_RESULT: ${result.toolId}]\n${result.naturalResponse}\n[/TOOL_RESULT]`;
      } else {
        return `[TOOL_RESULT: ${result.toolId}]\nUnable to complete the action.\n[/TOOL_RESULT]`;
      }
    },
  };
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let injectorInstance: ConversationToolInjector | null = null;

/**
 * Get the singleton ConversationToolInjector instance.
 */
export function getConversationToolInjector(): ConversationToolInjector {
  if (!injectorInstance) {
    injectorInstance = createConversationToolInjector();
  }
  return injectorInstance;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Analyze a transcript and inject tool result if needed.
 *
 * This is the main entry point for turn-handler integration.
 *
 * @returns The system message to inject, or null if no injection needed
 */
export async function analyzeAndInject(
  transcript: string,
  context: ConversationContext
): Promise<string | null> {
  const injector = getConversationToolInjector();

  // Not enabled
  if (!injector.isEnabled()) {
    return null;
  }

  // Analyze for tool intent
  const decision = await injector.analyzeTurn(transcript, context);

  if (!decision.shouldInject || !decision.toolId) {
    return null;
  }

  // Execute the tool
  const result = await injector.executeAndFormat(
    decision.toolId,
    decision.args || {},
    context
  );

  // Format as system message
  return injector.formatAsSystemMessage(result);
}

/**
 * Check if conversation tool injection is enabled.
 */
export function isToolInjectionEnabled(): boolean {
  return getConversationToolInjector().isEnabled();
}
