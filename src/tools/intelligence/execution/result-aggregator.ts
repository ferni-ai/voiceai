/**
 * Result Aggregator
 *
 * Aggregates results from multiple tool executions into a coherent response.
 *
 * @module tools/intelligence/execution/result-aggregator
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { StepResult, ExecutionResult } from './types.js';

const log = createLogger({ module: 'ftis:result-aggregator' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Aggregated result for conversation
 */
export interface AggregatedResult {
  /** Summary of all results */
  summary: string;
  /** Primary result data */
  primaryData: unknown;
  /** Additional context from other tools */
  additionalContext: Record<string, unknown>;
  /** Suggested follow-up actions */
  suggestedFollowUps: string[];
  /** Overall sentiment/tone */
  tone: 'success' | 'partial' | 'failure';
  /** Execution metadata */
  metadata: {
    toolsExecuted: number;
    successRate: number;
    totalDurationMs: number;
  };
}

// ============================================================================
// RESULT AGGREGATOR
// ============================================================================

export class ResultAggregator {
  // ==========================================================================
  // AGGREGATION
  // ==========================================================================

  /**
   * Aggregate execution results into a coherent response
   */
  aggregate(results: StepResult[]): AggregatedResult {
    if (results.length === 0) {
      return {
        summary: 'No tools were executed.',
        primaryData: null,
        additionalContext: {},
        suggestedFollowUps: [],
        tone: 'failure',
        metadata: {
          toolsExecuted: 0,
          successRate: 0,
          totalDurationMs: 0,
        },
      };
    }

    // Separate successful and failed results
    const successful = results.filter((r) => r.success);
    const failed = results.filter(
      (r) => !r.success && r.error !== 'Skipped due to failed dependency'
    );

    // Calculate metrics
    const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);
    const successRate = results.length > 0 ? successful.length / results.length : 0;

    // Determine tone
    let tone: 'success' | 'partial' | 'failure';
    if (successRate >= 0.9) {
      tone = 'success';
    } else if (successRate >= 0.5) {
      tone = 'partial';
    } else {
      tone = 'failure';
    }

    // Extract primary data (from first successful result)
    const primaryData = successful[0]?.data || null;

    // Build additional context from other results
    const additionalContext: Record<string, unknown> = {};
    for (const result of successful.slice(1)) {
      if (result.data) {
        additionalContext[result.toolId] = result.data;
      }
    }

    // Generate summary
    const summary = this.generateSummary(successful, failed);

    // Generate follow-up suggestions
    const suggestedFollowUps = this.generateFollowUps(results, tone);

    log.debug(
      {
        successful: successful.length,
        failed: failed.length,
        tone,
        durationMs: totalDuration,
      },
      'Results aggregated'
    );

    return {
      summary,
      primaryData,
      additionalContext,
      suggestedFollowUps,
      tone,
      metadata: {
        toolsExecuted: results.length,
        successRate,
        totalDurationMs: totalDuration,
      },
    };
  }

  /**
   * Aggregate for streaming (partial results)
   */
  aggregatePartial(results: StepResult[]): {
    currentSummary: string;
    pendingCount: number;
  } {
    const completed = results.filter((r) => r.success || r.error);
    const successful = completed.filter((r) => r.success);

    const currentSummary =
      successful.length > 0
        ? `Completed ${successful.length} task${successful.length > 1 ? 's' : ''}`
        : 'Working on your request...';

    return {
      currentSummary,
      pendingCount: results.length - completed.length,
    };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Generate summary of execution
   */
  private generateSummary(successful: StepResult[], failed: StepResult[]): string {
    const parts: string[] = [];

    if (successful.length > 0) {
      const toolNames = successful.map((r) => this.humanizeTool(r.toolId));

      if (toolNames.length === 1) {
        parts.push(`Successfully completed ${toolNames[0]}.`);
      } else if (toolNames.length === 2) {
        parts.push(`Successfully completed ${toolNames[0]} and ${toolNames[1]}.`);
      } else {
        const lastTool = toolNames.pop();
        parts.push(`Successfully completed ${toolNames.join(', ')}, and ${lastTool}.`);
      }
    }

    if (failed.length > 0) {
      const failedNames = failed.map((r) => this.humanizeTool(r.toolId));

      if (failed.length === 1) {
        parts.push(`Unable to complete ${failedNames[0]}: ${failed[0].error}`);
      } else {
        parts.push(`Some tasks couldn't be completed: ${failedNames.join(', ')}`);
      }
    }

    return parts.join(' ') || 'Execution completed.';
  }

  /**
   * Generate follow-up suggestions
   */
  private generateFollowUps(
    results: StepResult[],
    tone: 'success' | 'partial' | 'failure'
  ): string[] {
    const followUps: string[] = [];
    const executedTools = new Set(results.map((r) => r.toolId));

    // Based on what was executed, suggest related actions
    if (executedTools.has('weather_current')) {
      followUps.push('Would you like to plan your day around the weather?');
    }

    if (executedTools.has('calendar_list')) {
      followUps.push('Should I help you prepare for your next meeting?');
    }

    if (tone === 'partial' || tone === 'failure') {
      followUps.push('Would you like me to try a different approach?');
    }

    return followUps.slice(0, 2);
  }

  /**
   * Convert tool ID to human-readable name
   */
  private humanizeTool(toolId: string): string {
    // Simple conversion: habit_check -> "habit check"
    return toolId.replace(/_/g, ' ');
  }

  /**
   * Extract key-value pairs from successful results
   */
  extractKeyValues(results: StepResult[]): Map<string, unknown> {
    const kvs = new Map<string, unknown>();

    for (const result of results) {
      if (result.success && result.data) {
        // Store result keyed by tool
        kvs.set(result.toolId, result.data);
      }
    }

    return kvs;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let aggregatorInstance: ResultAggregator | null = null;

export function getResultAggregator(): ResultAggregator {
  if (!aggregatorInstance) {
    aggregatorInstance = new ResultAggregator();
  }
  return aggregatorInstance;
}

export function resetResultAggregator(): void {
  aggregatorInstance = null;
}
