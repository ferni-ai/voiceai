/**
 * Tool Wrapper Utilities
 *
 * Provides decorators and wrappers to add consistent:
 * - Input validation
 * - Analytics tracking
 * - Error handling with Result types
 * - Performance monitoring
 * - Deprecation warnings
 * - **Self-healing resilience** (retry with backoff)
 *
 * This enables standardizing tool behavior across all domains without
 * modifying each tool individually.
 *
 * USAGE:
 *
 * // Wrap an existing tool definition
 * const wrappedTool = wrapToolDefinition(myToolDef, {
 *   enableAnalytics: true,
 *   enableValidation: true,
 *   enableErrorHandling: true,
 *   enableResilience: true, // NEW: automatic retry
 * });
 *
 * // Or use the factory for new tools
 * const myTool = createEnhancedTool({
 *   id: 'myTool',
 *   domain: 'career',
 *   // ... tool config
 * });
 */

import { createLogger } from '../../utils/safe-logger.js';
import { withResilience, humanizeError } from '../../services/self-healing/index.js';
import { isLifeCoachAnalyticsEnabled, trackToolUsage } from '../domains/shared/index.js';
import type { Tool, ToolContext, ToolDefinition, ToolDomain } from '../registry/types.js';
import { sanitizePlainText } from '../validation.js';

const log = createLogger({ module: 'tool-wrapper' });

// Lazy import anomaly detection to avoid circular deps
let anomalyMonitor: {
  recordLatency: (service: string, latencyMs: number) => void;
  recordSuccessRate: (service: string, rate: number) => void;
} | null = null;

// Initialize anomaly detection lazily
async function initAnomalyDetection(): Promise<void> {
  if (anomalyMonitor) return;
  try {
    const { recordLatency, recordSuccessRate } = await import(
      '../../services/self-healing/anomaly-detection.js'
    );
    anomalyMonitor = { recordLatency, recordSuccessRate };
  } catch {
    // Anomaly detection not available
  }
}

// Trigger initialization (non-blocking)
initAnomalyDetection().catch((err) => {
  log.debug({ error: String(err) }, 'Anomaly detection init failed (non-critical)');
});

// Track success/failure for anomaly detection per tool
const toolStats = new Map<string, { successes: number; failures: number; lastReport: number }>();
const STATS_REPORT_INTERVAL_MS = 30000; // Report every 30 seconds

function recordToolExecution(toolId: string, success: boolean, durationMs: number): void {
  // Record latency for anomaly detection
  anomalyMonitor?.recordLatency(`tool:${toolId}`, durationMs);

  // Track success/failure rate
  let stats = toolStats.get(toolId);
  if (!stats) {
    stats = { successes: 0, failures: 0, lastReport: Date.now() };
    toolStats.set(toolId, stats);
  }

  if (success) {
    stats.successes++;
  } else {
    stats.failures++;
  }

  // Periodically report success rate
  const now = Date.now();
  if (now - stats.lastReport > STATS_REPORT_INTERVAL_MS) {
    const total = stats.successes + stats.failures;
    if (total > 0) {
      const successRate = (stats.successes / total) * 100;
      anomalyMonitor?.recordSuccessRate(`tool:${toolId}`, successRate);
    }
    // Reset for next interval
    stats.successes = 0;
    stats.failures = 0;
    stats.lastReport = now;
  }
}

// ============================================================================
// RESULT TYPE
// ============================================================================

/**
 * Standard Result type for tool returns
 */
export type ToolResult<T = unknown> =
  | { success: true; data: T; metadata?: ToolResultMetadata }
  | { success: false; error: string; code?: string; metadata?: ToolResultMetadata };

export interface ToolResultMetadata {
  executionTimeMs?: number;
  toolId?: string;
  domain?: ToolDomain;
  timestamp?: string;
}

/**
 * Create a success result
 */
export function success<T>(data: T, metadata?: ToolResultMetadata): ToolResult<T> {
  return { success: true, data, metadata };
}

/**
 * Create an error result
 */
export function failure(
  error: string,
  code?: string,
  metadata?: ToolResultMetadata
): ToolResult<never> {
  return { success: false, error, code, metadata };
}

// ============================================================================
// WRAPPER OPTIONS
// ============================================================================

export interface WrapperOptions {
  /** Enable analytics tracking */
  enableAnalytics?: boolean;

  /** Enable input validation/sanitization */
  enableValidation?: boolean;

  /** Enable Result type error handling (catch all errors) */
  enableErrorHandling?: boolean;

  /** Enable performance monitoring */
  enablePerformanceTracking?: boolean;

  /** Show deprecation warnings */
  enableDeprecationWarnings?: boolean;

  /**
   * Enable self-healing resilience (retry with backoff)
   * When enabled, transient failures will be automatically retried
   */
  enableResilience?: boolean;

  /** Maximum retry attempts when resilience is enabled (default: 2) */
  maxRetries?: number;

  /** Custom validation function */
  customValidator?: (params: Record<string, unknown>) => { valid: boolean; error?: string };

  /** Fields to sanitize (text sanitization) */
  sanitizeFields?: string[];

  /** Maximum execution time before warning (ms) */
  slowExecutionThresholdMs?: number;

  /** Custom function to determine if error is retryable */
  shouldRetry?: (error: Error) => boolean;
}

// Default: errors that indicate transient failures worth retrying
const DEFAULT_RETRYABLE_PATTERNS = [
  /timeout/i,
  /network/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /socket hang up/i,
  /fetch failed/i,
  /temporarily unavailable/i,
  /rate limit/i,
  /429/,
  /502/,
  /503/,
  /504/,
];

function isDefaultRetryable(error: Error): boolean {
  const errorStr = `${error.name} ${error.message}`;
  return DEFAULT_RETRYABLE_PATTERNS.some((pattern) => pattern.test(errorStr));
}

const DEFAULT_OPTIONS: WrapperOptions = {
  enableAnalytics: true,
  enableValidation: true,
  enableErrorHandling: true,
  enablePerformanceTracking: true,
  enableDeprecationWarnings: true,
  enableResilience: true, // Enable by default for all tools
  maxRetries: 2,
  slowExecutionThresholdMs: 2000,
  shouldRetry: isDefaultRetryable,
};

// ============================================================================
// TOOL WRAPPER
// ============================================================================

/**
 * Wrap a tool's execute function with additional capabilities
 */
export function wrapToolExecute(
  toolId: string,
  domain: ToolDomain,
  originalExecute: (
    params: Record<string, unknown>,
    context?: { ctx: ToolContext }
  ) => Promise<unknown>,
  ctx: ToolContext,
  options: WrapperOptions = {}
): (params: Record<string, unknown>, context?: { ctx: ToolContext }) => Promise<unknown> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (params: Record<string, unknown>, execContext?: { ctx: ToolContext }) => {
    const startTime = Date.now();
    const tracker =
      opts.enableAnalytics && isLifeCoachAnalyticsEnabled()
        ? trackToolUsage(toolId, domain, { agentId: ctx.agentId })
        : null;

    try {
      // Input validation
      if (opts.enableValidation) {
        // Custom validation
        if (opts.customValidator) {
          const validation = opts.customValidator(params);
          if (!validation.valid) {
            const error = validation.error || 'Invalid input';
            tracker?.error(new Error(error));
            if (opts.enableErrorHandling) {
              return failure(error, 'VALIDATION_ERROR');
            }
            throw new Error(error);
          }
        }

        // Sanitize string fields
        if (opts.sanitizeFields) {
          for (const field of opts.sanitizeFields) {
            if (typeof params[field] === 'string') {
              params[field] = sanitizePlainText(params[field] as string);
            }
          }
        }
      }

      // Execute the original tool - with or without resilience
      let result: unknown;
      
      if (opts.enableResilience) {
        // Wrap execution with self-healing retry logic
        result = await withResilience(
          () => originalExecute(params, execContext),
          {
            maxRetries: opts.maxRetries ?? 2,
            baseDelay: 500, // Tools should retry quickly
            maxDelay: 3000,
            operationName: `tool:${toolId}`,
            shouldRetry: (error) => {
              // Use custom retry logic if provided, else use default
              const shouldRetryFn = opts.shouldRetry ?? isDefaultRetryable;
              return shouldRetryFn(error);
            },
            onRetry: (attempt, error, delay) => {
              log.debug(
                { toolId, domain, attempt, error: error.message, delay },
                'Tool execution retry'
              );
            },
          }
        );
      } else {
        result = await originalExecute(params, execContext);
      }

      // Execute after_tool_call hook (non-blocking, fire-and-forget)
      try {
        const { onAfterToolCall } = await import(
          '../../personas/bundles/extensibility-integration.js'
        );
        // Don't await - hooks shouldn't slow down tool execution
        void onAfterToolCall({
          personaId: ctx.agentId,
          userId: ctx.userId,
          toolName: toolId,
          toolResult: result,
        });
      } catch {
        // Hook execution is non-critical - don't fail the tool
      }

      // Performance tracking
      const executionTimeMs = Date.now() - startTime;
      if (
        opts.enablePerformanceTracking &&
        executionTimeMs > (opts.slowExecutionThresholdMs || 2000)
      ) {
        log.warn({ toolId, domain, executionTimeMs }, 'Slow tool execution');
      }

      // Record for anomaly detection
      recordToolExecution(toolId, true, executionTimeMs);

      // Analytics success
      tracker?.success({ executionTimeMs, ...params });

      // Wrap result if error handling is enabled and result is a string
      if (opts.enableErrorHandling && typeof result === 'string') {
        return success(result, {
          executionTimeMs,
          toolId,
          domain,
          timestamp: new Date().toISOString(),
        });
      }

      return result;
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));
      const errorMessage = err.message;

      // Get human-friendly error message for better UX
      const humanized = humanizeError(err);

      // Record failure for anomaly detection
      recordToolExecution(toolId, false, executionTimeMs);

      log.error(
        { 
          toolId, 
          domain, 
          error: errorMessage, 
          executionTimeMs,
          severity: humanized.severity,
          technicalSummary: humanized.technicalSummary,
        }, 
        'Tool execution error'
      );
      tracker?.error(err);

      if (opts.enableErrorHandling) {
        // Use humanized message for user-facing errors when appropriate
        const userMessage = humanized.shouldNotifyUser 
          ? humanized.userMessage 
          : errorMessage;
        
        return failure(userMessage, 'EXECUTION_ERROR', {
          executionTimeMs,
          toolId,
          domain,
          timestamp: new Date().toISOString(),
        });
      }

      throw error;
    }
  };
}

/**
 * Wrap a tool definition to add enhanced capabilities
 */
export function wrapToolDefinition(
  definition: ToolDefinition,
  options: WrapperOptions = {}
): ToolDefinition {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Handle deprecation warnings
  if (opts.enableDeprecationWarnings && definition.deprecated) {
    log.warn(
      { toolId: definition.id, message: definition.deprecationMessage },
      'Using deprecated tool'
    );
  }

  return {
    ...definition,
    create: (ctx: ToolContext): Tool => {
      const originalTool = definition.create(ctx);

      // If the tool doesn't have an execute function, return as-is
      if (!originalTool || typeof originalTool.execute !== 'function') {
        return originalTool;
      }

      return {
        ...originalTool,
        execute: wrapToolExecute(definition.id, definition.domain, originalTool.execute, ctx, opts),
      };
    },
  };
}

/**
 * Wrap multiple tool definitions
 */
export function wrapToolDefinitions(
  definitions: ToolDefinition[],
  options: WrapperOptions = {}
): ToolDefinition[] {
  return definitions.map((def) => wrapToolDefinition(def, options));
}

// ============================================================================
// ENHANCED TOOL FACTORY
// ============================================================================

export interface EnhancedToolConfig extends Omit<ToolDefinition, 'create'> {
  /** Tool execution function */
  execute: (
    params: Record<string, unknown>,
    ctx: ToolContext,
    execContext?: { ctx: ToolContext }
  ) => Promise<unknown>;

  /** Tool description for LLM */
  llmDescription: string;

  /** Parameter schema (Zod or JSON Schema) */
  parameters?: unknown;

  /** Wrapper options */
  wrapperOptions?: WrapperOptions;
}

/**
 * Create an enhanced tool with all wrapper capabilities built in
 */
export function createEnhancedTool(config: EnhancedToolConfig): ToolDefinition {
  const { execute, llmDescription, parameters, wrapperOptions, ...definitionFields } = config;

  const definition: ToolDefinition = {
    ...definitionFields,
    create: (ctx: ToolContext): Tool => {
      return {
        description: llmDescription,
        parameters,
        execute: async (params: Record<string, unknown>, execContext?: { ctx: ToolContext }) => {
          return execute(params, ctx, execContext);
        },
      };
    },
  };

  return wrapToolDefinition(definition, wrapperOptions || DEFAULT_OPTIONS);
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Apply wrapper to all tools in a domain
 */
export function enhanceDomainTools(
  domainTools: ToolDefinition[],
  domainOptions: WrapperOptions = {}
): ToolDefinition[] {
  return wrapToolDefinitions(domainTools, domainOptions);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  wrapToolExecute,
  wrapToolDefinition,
  wrapToolDefinitions,
  createEnhancedTool,
  enhanceDomainTools,
  success,
  failure,
};
