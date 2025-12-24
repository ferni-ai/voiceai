/**
 * Tool Timing Context Builder
 *
 * Injects information about tool execution timing into the LLM context.
 * This enables the LLM to frame responses naturally based on wait times.
 *
 * Philosophy:
 * - "Better than Human" means acknowledging the wait naturally, not robotically
 * - Long waits deserve natural acknowledgment, not apology
 * - The LLM should know if the user was patient
 *
 * Example injections:
 * - "The calendar lookup took 4 seconds. Acknowledge briefly, then share results."
 * - "Memory recall was slow (6s). The user waited patiently - weave results naturally."
 *
 * @module tool-timing-context
 */

import type { ContextBuilder, ContextBuilderInput, ContextInjection } from './core/types.js';
import { registerContextBuilder, createStandardInjection } from './index.js';
import { BuilderCategory } from './core/categories.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'context:tool-timing' });

// ============================================================================
// SESSION-SCOPED TIMING STORAGE
// ============================================================================

interface ToolTiming {
  toolName: string;
  durationMs: number;
  completedAt: number;
  userEmotion?: string;
}

const sessionToolTimings = new Map<string, ToolTiming[]>();

/**
 * Record a tool execution timing for context injection.
 * Call this when a tool completes.
 */
export function recordToolTiming(
  sessionId: string,
  toolName: string,
  durationMs: number,
  userEmotion?: string
): void {
  const timings = sessionToolTimings.get(sessionId) || [];

  timings.push({
    toolName,
    durationMs,
    completedAt: Date.now(),
    userEmotion,
  });

  // Keep only last 5 tool timings
  if (timings.length > 5) {
    timings.shift();
  }

  sessionToolTimings.set(sessionId, timings);

  log.debug(
    { sessionId, toolName, durationMs },
    'Recorded tool timing for context injection'
  );
}

/**
 * Get recent tool timings for a session.
 * Only returns timings from the last 30 seconds (current turn).
 */
export function getRecentToolTimings(sessionId: string): ToolTiming[] {
  const timings = sessionToolTimings.get(sessionId) || [];
  const cutoff = Date.now() - 30000; // Last 30 seconds

  return timings.filter((t) => t.completedAt > cutoff);
}

/**
 * Clear tool timings for a session.
 */
export function clearToolTimings(sessionId: string): void {
  sessionToolTimings.delete(sessionId);
}

// ============================================================================
// TIMING THRESHOLDS
// ============================================================================

const TIMING_THRESHOLDS = {
  FAST: 1000, // < 1s - no acknowledgment needed
  NORMAL: 2000, // 1-2s - brief acknowledgment okay
  SLOW: 4000, // 2-4s - should acknowledge naturally
  VERY_SLOW: 6000, // 4-6s - definitely acknowledge
  EXTREMELY_SLOW: 10000, // > 10s - acknowledge wait explicitly
} as const;

// ============================================================================
// CONTEXT GENERATION
// ============================================================================

/**
 * Generate natural language framing hints based on timing.
 */
function generateFramingHint(timing: ToolTiming): string {
  const { toolName, durationMs, userEmotion } = timing;

  // Fast responses need no framing
  if (durationMs < TIMING_THRESHOLDS.FAST) {
    return '';
  }

  // Determine emotional adjustment
  const emotionNote =
    userEmotion === 'anxious' || userEmotion === 'stressed'
      ? ' Be warm and reassuring.'
      : '';

  if (durationMs > TIMING_THRESHOLDS.EXTREMELY_SLOW) {
    return `${toolName} took ${Math.round(durationMs / 1000)}s - acknowledge the wait naturally, then share what you found.${emotionNote}`;
  }

  if (durationMs > TIMING_THRESHOLDS.VERY_SLOW) {
    return `${toolName} took a moment - brief acknowledgment, then results.${emotionNote}`;
  }

  if (durationMs > TIMING_THRESHOLDS.SLOW) {
    return `${toolName} lookup complete - weave results naturally.${emotionNote}`;
  }

  // Normal timing - just a note
  return '';
}

/**
 * Generate combined context injection for all recent tool timings.
 */
function generateTimingContext(timings: ToolTiming[]): string | null {
  const hints = timings.map(generateFramingHint).filter((h) => h.length > 0);

  if (hints.length === 0) {
    return null;
  }

  const parts = ['## Recent Tool Timing (frame response naturally)', ...hints.map((h) => `- ${h}`)];

  return parts.join('\n');
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

export const toolTimingContextBuilder: ContextBuilder = {
  name: 'tool-timing-context',
  description: 'Injects tool execution timing context for natural response framing',
  priority: 75, // After tool execution, before response generation
  category: BuilderCategory.CONTEXT,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services } = input;
    const sessionId = services?.sessionId;

    if (!sessionId) {
      return [];
    }

    const timings = getRecentToolTimings(sessionId);

    if (timings.length === 0) {
      return [];
    }

    const context = generateTimingContext(timings);

    if (!context) {
      return [];
    }

    log.debug(
      { sessionId, toolCount: timings.length },
      'Injecting tool timing context'
    );

    return [
      createStandardInjection('tool_timing_context', context, {
        category: 'tool-timing',
      }),
    ];
  },
};

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder(toolTimingContextBuilder);

export default toolTimingContextBuilder;
