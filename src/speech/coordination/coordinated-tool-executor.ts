/**
 * Coordinated Tool Executor
 *
 * Wraps tool execution with intelligent speech coordination to prevent
 * overlap and ensure natural, human-like responses.
 *
 * REPLACES the ad-hoc approach in tool-call-sanitizer.ts with:
 * 1. SpeechCoordinator for priority-based queuing
 * 2. Adaptive timing for acknowledgments
 * 3. Persona-aware acknowledgment generation
 * 4. Clean state management via state machine
 *
 * @module speech/coordination/coordinated-tool-executor
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getSpeechCoordinator, SpeechPriority } from './speech-coordinator.js';
import {
  generateAcknowledgment,
  shouldAcknowledge,
  getToolCategory,
} from './persona-acknowledgments.js';

const log = createLogger({ module: 'coordinated-tool-executor' });

// ============================================================================
// TYPES
// ============================================================================

/** Tool execution request */
export interface ToolExecutionRequest {
  /** Tool ID/name */
  toolId: string;
  /** Tool arguments */
  args: Record<string, unknown>;
  /** Active persona ID */
  personaId: string;
  /** User ID (for preference learning) */
  userId?: string;
  /** Session for speaking results */
  session?: unknown; // voice.AgentSession - avoiding circular import
  /** Estimated execution time (ms) */
  estimatedDurationMs?: number;
}

/** Tool execution result */
export interface ToolExecutionResult {
  success: boolean;
  result?: unknown;
  speakDirectly?: boolean;
  error?: string;
}

/** Tool executor function type */
export type ToolExecutor = (args: Record<string, unknown>) => Promise<ToolExecutionResult>;

// ============================================================================
// TOOL TIMING DATABASE
// Learned from real execution times, not hardcoded
// ============================================================================

interface ToolTimingStats {
  avgDurationMs: number;
  sampleCount: number;
  p95DurationMs: number;
  lastUpdated: number;
}

const toolTimings = new Map<string, ToolTimingStats>();
const toolDurations = new Map<string, number[]>(); // For calculating percentiles

// Initial estimates (will be overwritten by learned values)
const INITIAL_ESTIMATES: Record<string, number> = {
  // Fast tools (<500ms typically)
  speak: 100,
  handoff: 200,
  memory: 300,
  // Medium tools (500-2000ms)
  playmusic: 1000,
  weather: 1500,
  calendar: 1200,
  // Slow tools (2000ms+)
  news: 3000,
  search: 2500,
  finance: 2800,
};

/**
 * Get estimated duration for a tool (learned or initial)
 */
export function getEstimatedDuration(toolId: string): number {
  const stats = toolTimings.get(toolId.toLowerCase());
  if (stats && stats.sampleCount >= 3) {
    // Use p95 for acknowledgment decisions (be conservative)
    return stats.p95DurationMs;
  }

  // Check initial estimates
  const lower = toolId.toLowerCase();
  for (const [key, estimate] of Object.entries(INITIAL_ESTIMATES)) {
    if (lower.includes(key)) {
      return estimate;
    }
  }

  return 1500; // Default estimate
}

/**
 * Record actual tool execution time for learning
 */
export function recordToolDuration(toolId: string, durationMs: number): void {
  const key = toolId.toLowerCase();

  // Track durations for percentile calculation
  let durations = toolDurations.get(key);
  if (!durations) {
    durations = [];
    toolDurations.set(key, durations);
  }
  durations.push(durationMs);

  // Keep last 50 samples
  if (durations.length > 50) {
    durations.shift();
  }

  // Calculate stats
  const sorted = [...durations].sort((a, b) => a - b);
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  const p95Index = Math.floor(sorted.length * 0.95);
  const p95 = sorted[p95Index] ?? sorted[sorted.length - 1];

  toolTimings.set(key, {
    avgDurationMs: avg,
    sampleCount: durations.length,
    p95DurationMs: p95,
    lastUpdated: Date.now(),
  });

  log.debug({ toolId, durationMs, avg, p95, samples: durations.length }, 'Tool timing recorded');
}

// ============================================================================
// COORDINATED EXECUTOR
// ============================================================================

/**
 * Execute a tool with intelligent speech coordination.
 * Handles acknowledgments, result speaking, and overlap prevention.
 */
export async function executeToolWithCoordination(
  request: ToolExecutionRequest,
  executor: ToolExecutor
): Promise<ToolExecutionResult> {
  const { toolId, args, personaId, userId, session, estimatedDurationMs } = request;
  const coordinator = getSpeechCoordinator();

  // Get estimated duration (learned or provided)
  const estimate = estimatedDurationMs ?? getEstimatedDuration(toolId);

  // Decide if we should acknowledge
  const shouldAck = shouldAcknowledge(estimate, userId);

  let acknowledgmentSpoken = false;
  const startTime = Date.now();

  try {
    // Maybe speak acknowledgment before tool runs
    if (shouldAck && session) {
      const ackText = generateAcknowledgment({
        personaId,
        userId,
        toolId,
        toolCategory: getToolCategory(toolId),
        estimatedWaitMs: estimate,
      });

      const ackResult = await coordinator.speakAcknowledgment(ackText);
      if (ackResult.accepted) {
        acknowledgmentSpoken = true;
        log.info({ toolId, ackText }, '⏳ Acknowledgment queued via coordinator');
      }
    }

    // Execute the tool
    log.info({ toolId, args }, '🔧 Executing tool with coordination');
    const result = await executor(args);

    // Record duration for learning
    const duration = Date.now() - startTime;
    recordToolDuration(toolId, duration);

    // Handle result
    if (result.success && result.result && session) {
      const resultText =
        typeof result.result === 'string' ? result.result : JSON.stringify(result.result);

      // Speak directly or via LLM
      if (result.speakDirectly) {
        // Direct speech - queue with tool result priority
        const speakResult = await coordinator.speakToolResult(resultText, toolId);
        log.info(
          { toolId, accepted: speakResult.accepted },
          '🎤 Tool result queued for direct speech'
        );
      } else {
        // Generate reply via LLM - use safeGenerateReply
        await speakToolResultViaLLM(session, toolId, resultText);
      }
    }

    return result;
  } catch (error) {
    log.error({ toolId, error: String(error) }, '❌ Tool execution failed');
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * Speak tool result via LLM (with behavioral instructions)
 */
async function speakToolResultViaLLM(
  session: unknown,
  toolId: string,
  resultText: string
): Promise<void> {
  try {
    const { safeGenerateReply, formatToolResult } =
      await import('../../agents/shared/safe-generate-reply.js');

    // Music tools need special handling - TTS + music coordination can take >3.5s
    const isMusicTool = toolId.toLowerCase().includes('music');

    // Format tool result with behavioral instructions (no <context> leakage risk)
    const instructions = formatToolResult(toolId, resultText);

    await safeGenerateReply(session as Parameters<typeof safeGenerateReply>[0], {
      instructions,
      allowInterruptions: true,
      context: `tool-result-${toolId}`,
      // For music tools: don't wait for playout (TTS + music coordination can be slow)
      waitForPlayout: !isMusicTool,
      timeoutMs: isMusicTool ? 6000 : 5000,
      fallbackMessage: isMusicTool ? "Here's some music for you." : 'Got it!',
    });

    log.info({ toolId, isMusicTool }, '✅ Tool result spoken via safeGenerateReply');
  } catch (err) {
    log.warn({ toolId, error: String(err) }, '⚠️ Could not speak tool result via LLM');
  }
}

// ============================================================================
// SLOW TOOL DETECTION (Replaces hardcoded list)
// ============================================================================

/**
 * Determine if a tool is "slow" (needs acknowledgment).
 * INTELLIGENT: Based on learned timing, not hardcoded list.
 */
export function isSlowTool(toolId: string): boolean {
  const estimate = getEstimatedDuration(toolId);
  // Tools taking >1s typically need acknowledgment
  return estimate > 1000;
}

/**
 * Get tool timing stats for debugging
 */
export function getToolTimingStats(): Map<string, ToolTimingStats> {
  return new Map(toolTimings);
}
