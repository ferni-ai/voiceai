/**
 * System State Awareness Context Builder
 *
 * Provides the LLM with CONTINUOUS awareness of system state:
 * - Music playing status (track, artist, duration)
 * - Active timers
 * - Last tool executed
 * - Pre-handled actions (what UTO did on the LLM's behalf)
 *
 * Phase 3 BTH Communication Overhaul additions:
 * - Turn latency awareness (fast/normal/slow)
 * - User waiting time since speech ended
 * - Conversation pace (rapid/normal/reflective)
 * - Tools currently in flight
 *
 * P0-#1 UTO Fix (January 2026):
 * - Full tool execution history from conversation state (last 5 tools)
 * - Enables LLM to reason about sequential tool calls
 * - Prevents tool re-invocation when already executed
 *
 * P0-#3 UTO Fix (January 2026):
 * - Service health awareness via self-healing integration
 * - LLM knows when Spotify, weather, calendar, etc. are degraded
 * - Enables graceful acknowledgment of service issues
 *
 * "Better than Human" Philosophy:
 * - The LLM should NEVER hallucinate tool usage
 * - If we already handled something, say "Done" not "I'll do that"
 * - If music is playing, acknowledge it naturally
 * - If a tool was just executed, reference the result
 * - Adapt response style to timing pressure (brief when fast, thoughtful when slow)
 *
 * This runs on EVERY turn (high priority) so the LLM always knows
 * what's happening in the system. Without this, the LLM might say
 * "I'll play some music" when music is already playing.
 *
 * @module intelligence/context-builders/awareness/system-state-awareness
 */

import { getLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory } from '../core/categories.js';
import { createHighInjection, registerContextBuilder } from '../index.js';
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../core/types.js';
import type { ToolHistoryEntry } from '../../../services/conversation-state.js';
import {
  getSystemPromptInjection,
  getHealthContext,
} from '../../../services/self-healing/index.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface SystemStateContext {
  music: {
    isPlaying: boolean;
    currentTrack?: { name: string; artist: string };
    playDurationSeconds?: number;
    isDucked: boolean;
  };
  timers: {
    active: number;
    nextExpiry?: Date;
  };
  lastToolExecuted?: {
    toolId: string;
    timestamp: Date;
    result?: string;
  };
}

/**
 * Timing state for LLM awareness (Phase 3 BTH Communication Overhaul)
 *
 * Gives the LLM insight into system timing pressure so it can adapt:
 * - Fast mode: Keep responses brief, user is in rapid exchange
 * - Slow mode: You have time for a thoughtful response
 * - Tools in flight: Acknowledge the wait naturally
 */
export interface TimingState {
  /** Turn latency classification based on recent performance */
  turnLatency: 'fast' | 'normal' | 'slow';
  /** Milliseconds since user finished speaking */
  userWaitingTime: number;
  /** Overall conversation pace based on turn gap patterns */
  conversationPace: 'rapid' | 'normal' | 'reflective';
  /** Tools currently being executed */
  toolsInFlight: string[];
  /** Recent average E2E latency (ms) for context */
  avgE2ELatency?: number;
  /** Whether the system is under time pressure */
  isUnderPressure: boolean;
}

// ============================================================================
// TIMING THRESHOLDS (Phase 3 BTH Communication Overhaul)
// ============================================================================

const TIMING_THRESHOLDS = {
  // Turn latency classification
  FAST_TURN_MS: 1000, // < 1s is fast
  NORMAL_TURN_MS: 2000, // 1-2s is normal
  SLOW_TURN_MS: 3000, // > 2s is slow

  // User waiting - when to acknowledge
  WAITING_ACKNOWLEDGE_MS: 2000, // Acknowledge if waiting > 2s

  // Conversation pace - based on average turn gap
  RAPID_PACE_GAP_MS: 1500, // < 1.5s average gap = rapid
  REFLECTIVE_PACE_GAP_MS: 4000, // > 4s average gap = reflective

  // Pressure thresholds
  PRESSURE_THRESHOLD_MS: 3000, // System under pressure if > 3s
} as const;

// ============================================================================
// STATE RETRIEVAL
// ============================================================================

/**
 * Get current music state from DJ Controller
 */
async function getMusicState(): Promise<SystemStateContext['music']> {
  try {
    const { getDJController } = await import('../../../audio/dj-controller.js');
    const djController = getDJController();
    const djState = djController.getState();

    let playDurationSeconds: number | undefined;
    if (djState.trackStartTime && djController.isMusicActive()) {
      playDurationSeconds = Math.round((Date.now() - djState.trackStartTime) / 1000);
    }

    return {
      isPlaying: djController.isMusicActive(),
      currentTrack: djState.currentTrack
        ? { name: djState.currentTrack.name, artist: djState.currentTrack.artist }
        : undefined,
      playDurationSeconds,
      isDucked: djState.state === 'ducking',
    };
  } catch {
    return { isPlaying: false, isDucked: false };
  }
}

/**
 * Get state from userData if available (set by UTO)
 */
function getStoredSystemState(input: ContextBuilderInput): SystemStateContext | undefined {
  if (input.userData?.systemState) {
    // Convert from ContextUserData.systemState to our SystemStateContext
    const stored = input.userData.systemState;
    return {
      music: {
        isPlaying: stored.music.isPlaying,
        currentTrack: stored.music.currentTrack,
        playDurationSeconds: stored.music.playDurationSeconds,
        isDucked: stored.music.isDucked,
      },
      timers: {
        active: stored.timers.active,
        nextExpiry: stored.timers.nextExpiry,
      },
      lastToolExecuted: stored.lastToolExecuted
        ? {
            toolId: stored.lastToolExecuted.toolId,
            timestamp: stored.lastToolExecuted.timestamp,
            result: stored.lastToolExecuted.result,
          }
        : undefined,
    };
  }
  return undefined;
}

// ============================================================================
// CONTEXT FORMATTING
// ============================================================================

/**
 * Format duration in human-readable form
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} seconds`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins} minutes ${secs} seconds` : `${mins} minutes`;
}

/**
 * Format system state for LLM context with "Better than Human" guidance
 */
function formatSystemState(state: SystemStateContext): string {
  const lines: string[] = [];
  const guidance: string[] = [];

  // Music state - most important
  if (state.music.isPlaying) {
    if (state.music.currentTrack) {
      const duration = state.music.playDurationSeconds
        ? ` (playing for ${formatDuration(state.music.playDurationSeconds)})`
        : '';
      const duckStatus = state.music.isDucked ? ', ducked for conversation' : '';
      lines.push(
        `🎵 Music is playing: "${state.music.currentTrack.name}" by ${state.music.currentTrack.artist}${duration}${duckStatus}`
      );

      // Guidance: Don't offer to play music when it's already playing
      guidance.push(
        "Music is already playing. If asked about music: acknowledge it's on, ask if they want to change it, skip, or adjust volume."
      );
    } else {
      lines.push('🎵 Music is playing');
      guidance.push('Music is playing. Don\'t offer to "play some music" - it\'s already on.');
    }
  }

  // Timers
  if (state.timers.active > 0) {
    const expiry = state.timers.nextExpiry
      ? ` (next expires at ${state.timers.nextExpiry.toLocaleTimeString()})`
      : '';
    lines.push(`⏱️ ${state.timers.active} active timer(s)${expiry}`);
    guidance.push(
      'Timer is running. If asked about timers: mention the active one(s). Offer to cancel or set additional timers if needed.'
    );
  }

  // Last tool - only if recent (< 30s) - this is the "I just did this for you" signal
  if (state.lastToolExecuted) {
    const agoMs = Date.now() - state.lastToolExecuted.timestamp.getTime();
    if (agoMs < 30000) {
      const agoSec = Math.round(agoMs / 1000);
      const toolId = state.lastToolExecuted.toolId;

      lines.push(`✅ Just executed: ${toolId} (${agoSec}s ago)`);

      // Tool-specific guidance - tell LLM how to acknowledge what we did
      const toolGuidance = getToolAcknowledgmentGuidance(toolId, state.lastToolExecuted.result);
      if (toolGuidance) {
        guidance.push(toolGuidance);
      }
    }
  }

  // Build final output
  if (lines.length === 0) {
    return '';
  }

  let output = lines.join('\n');

  if (guidance.length > 0) {
    output += '\n\n[GUIDANCE: ' + guidance.join(' ') + ']';
  }

  return output;
}

/**
 * Get natural acknowledgment guidance for a recently executed tool
 * This helps the LLM respond naturally to what we just did
 */
function getToolAcknowledgmentGuidance(toolId: string, result?: string): string | null {
  switch (toolId) {
    case 'playMusic':
      return 'Music started! Respond naturally: "There we go" / "How\'s that?" / brief acknowledgment. DON\'T say "I\'ll play music" - it\'s already playing.';

    case 'pauseMusic':
      return 'Music paused. Brief acknowledgment: "Done" / "Paused" / "There you go". Stay present.';

    case 'setTimer':
      return 'Timer set! Confirm: "Got it, timer\'s running" / "You\'re all set". DON\'T offer to set a timer - it\'s already set.';

    case 'cancelTimer':
      return 'Timer cancelled. Acknowledge: "Cancelled" / "Done" / "No problem".';

    case 'getWeather':
      return result
        ? `Weather retrieved. Share the info naturally, don't just read data. Personalize if relevant.`
        : 'Weather requested. If you have the result, share it naturally.';

    case 'handoffToMaya':
    case 'handoffToPeter':
    case 'handoffToAlex':
    case 'handoffToJordan':
    case 'handoffToNayan':
    case 'handoffToFerni':
      return 'Handoff initiated. The other team member will take over - no need to say anything else.';

    default:
      return `Tool "${toolId}" was executed. Acknowledge naturally, don't repeat the action.`;
  }
}

// ============================================================================
// TIMING STATE RETRIEVAL (Phase 3 BTH Communication Overhaul)
// ============================================================================

// Session-level storage for tools in flight
const toolsInFlightBySession = new Map<string, Set<string>>();

// Recent turn gaps for pace calculation
const recentTurnGapsBySession = new Map<string, number[]>();

// Last turn end time per session (for gap calculation)
const lastTurnEndTimeBySession = new Map<string, number>();

/**
 * Register a tool as currently executing.
 * Call this when a tool starts executing.
 */
export function registerToolInFlight(sessionId: string, toolId: string): void {
  if (!toolsInFlightBySession.has(sessionId)) {
    toolsInFlightBySession.set(sessionId, new Set());
  }
  toolsInFlightBySession.get(sessionId)!.add(toolId);
  log.debug({ sessionId, toolId }, 'Tool registered in flight');
}

/**
 * Remove a tool from in-flight status.
 * Call this when a tool completes.
 */
export function completeToolInFlight(sessionId: string, toolId: string): void {
  toolsInFlightBySession.get(sessionId)?.delete(toolId);
}

/**
 * Record a turn gap for pace calculation.
 * Call this at the start of each turn with the gap from previous turn.
 */
export function recordTurnGap(sessionId: string, gapMs: number): void {
  if (!recentTurnGapsBySession.has(sessionId)) {
    recentTurnGapsBySession.set(sessionId, []);
  }
  const gaps = recentTurnGapsBySession.get(sessionId)!;
  gaps.push(gapMs);
  // Keep last 10 gaps
  if (gaps.length > 10) {
    gaps.shift();
  }
}

/**
 * Record when a turn ends.
 * Call this at the end of each turn to enable gap calculation.
 */
export function recordTurnEndTime(sessionId: string): void {
  lastTurnEndTimeBySession.set(sessionId, Date.now());
}

/**
 * Get and record the gap from the previous turn.
 * Call this at the START of each turn.
 * Returns the gap in milliseconds (0 for first turn).
 */
export function calculateAndRecordTurnGap(sessionId: string): number {
  const lastEndTime = lastTurnEndTimeBySession.get(sessionId);
  if (!lastEndTime) {
    // First turn - no gap to record
    return 0;
  }

  const gapMs = Date.now() - lastEndTime;
  recordTurnGap(sessionId, gapMs);
  return gapMs;
}

/**
 * Clear timing data for a session.
 * Call this on session cleanup.
 */
export function clearTimingState(sessionId: string): void {
  toolsInFlightBySession.delete(sessionId);
  recentTurnGapsBySession.delete(sessionId);
  lastTurnEndTimeBySession.delete(sessionId);
}

/**
 * Get current timing state for LLM awareness.
 * Exported for use by timing-aware-injection.ts (Phase 3 BTH Communication Overhaul)
 */
export async function getTimingState(sessionId: string): Promise<TimingState | null> {
  try {
    // Get E2E latency tracker data
    const { getCurrentTimeline, getLatencyStats } =
      await import('../../../agents/shared/e2e-latency-tracker.js');

    const currentTimeline = getCurrentTimeline(sessionId);
    const latencyStats = getLatencyStats();

    // Calculate user waiting time
    const userWaitingTime = currentTimeline?.userSpeechEnded
      ? Date.now() - currentTimeline.userSpeechEnded
      : 0;

    // Determine turn latency classification based on recent E2E
    let turnLatency: TimingState['turnLatency'] = 'normal';
    const avgE2E = latencyStats.avgE2E;
    if (avgE2E > 0) {
      if (avgE2E < TIMING_THRESHOLDS.FAST_TURN_MS) {
        turnLatency = 'fast';
      } else if (avgE2E > TIMING_THRESHOLDS.SLOW_TURN_MS) {
        turnLatency = 'slow';
      }
    }

    // Calculate conversation pace from recent turn gaps
    const gaps = recentTurnGapsBySession.get(sessionId) || [];
    let conversationPace: TimingState['conversationPace'] = 'normal';
    if (gaps.length >= 3) {
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      if (avgGap < TIMING_THRESHOLDS.RAPID_PACE_GAP_MS) {
        conversationPace = 'rapid';
      } else if (avgGap > TIMING_THRESHOLDS.REFLECTIVE_PACE_GAP_MS) {
        conversationPace = 'reflective';
      }
    }

    // Get tools currently in flight
    const toolsInFlight = Array.from(toolsInFlightBySession.get(sessionId) || []);

    // Determine if under pressure
    const isUnderPressure =
      userWaitingTime > TIMING_THRESHOLDS.PRESSURE_THRESHOLD_MS || toolsInFlight.length > 0;

    return {
      turnLatency,
      userWaitingTime,
      conversationPace,
      toolsInFlight,
      avgE2ELatency: avgE2E > 0 ? avgE2E : undefined,
      isUnderPressure,
    };
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get timing state (non-critical)');
    return null;
  }
}

/**
 * Format timing state into LLM-friendly guidance.
 */
function formatTimingState(timing: TimingState): string {
  const lines: string[] = [];
  const guidance: string[] = [];

  // User waiting time - most important timing signal
  if (timing.userWaitingTime > TIMING_THRESHOLDS.WAITING_ACKNOWLEDGE_MS) {
    const waitSec = Math.round(timing.userWaitingTime / 1000);
    lines.push(`⏱️ User waiting: ${waitSec}s`);
    guidance.push(
      `User has been waiting ${waitSec}s. Acknowledge naturally ("Let me see..." / "Just a moment...").`
    );
  }

  // Tools in flight
  if (timing.toolsInFlight.length > 0) {
    lines.push(`🔄 Processing: ${timing.toolsInFlight.join(', ')}`);
    guidance.push(
      `Tools are running (${timing.toolsInFlight.join(', ')}). If user is waiting, acknowledge briefly.`
    );
  }

  // Conversation pace guidance
  if (timing.conversationPace === 'rapid') {
    guidance.push('Rapid conversation pace. Keep responses concise and punchy.');
  } else if (timing.conversationPace === 'reflective') {
    guidance.push('Reflective pace. You have space for thoughtful, unhurried responses.');
  }

  // Turn latency guidance
  if (timing.turnLatency === 'fast') {
    guidance.push('System is responsive. Match the pace with brief, direct responses.');
  } else if (timing.turnLatency === 'slow') {
    guidance.push('System is running slower. Be patient and natural about any delays.');
  }

  // Build output
  if (lines.length === 0 && guidance.length === 0) {
    return '';
  }

  let output = '';
  if (lines.length > 0) {
    output = lines.join('\n');
  }
  if (guidance.length > 0) {
    const prefix = output ? '\n\n' : '';
    output += `${prefix}[TIMING GUIDANCE: ${guidance.join(' ')}]`;
  }

  return output;
}

// ============================================================================
// TOOL HISTORY FORMATTING (P0-#1 UTO Fix)
// ============================================================================

/**
 * Format tool execution history for LLM context injection.
 *
 * This gives the LLM visibility into:
 * - What tools were recently called
 * - What the user was trying to do (userRequest)
 * - Whether the tool succeeded
 * - The result summary
 *
 * This prevents the LLM from re-calling tools that already ran
 * and helps it provide continuity in multi-tool workflows.
 */
function formatToolHistory(history: ToolHistoryEntry[]): string {
  if (!history || history.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('## 📋 RECENT TOOL RESULTS (from this session)');
  lines.push('');

  for (const entry of history) {
    const agoMs = Date.now() - entry.timestamp;
    const agoSec = Math.round(agoMs / 1000);
    const timeLabel = agoSec < 60 ? `${agoSec}s ago` : `${Math.round(agoSec / 60)}m ago`;
    const status = entry.success ? '✅' : '❌';

    lines.push(`${status} **${entry.toolId}** (${timeLabel})`);

    // Show user request if available
    if (entry.userRequest) {
      lines.push(
        `   User asked: "${entry.userRequest.slice(0, 80)}${entry.userRequest.length > 80 ? '...' : ''}"`
      );
    }

    // Show result summary
    if (entry.result) {
      const resultPreview = entry.result.slice(0, 100);
      lines.push(`   Result: ${resultPreview}${entry.result.length > 100 ? '...' : ''}`);
    } else if (!entry.success) {
      lines.push('   Result: Failed (no result)');
    }

    lines.push('');
  }

  lines.push(
    "[GUIDANCE: These tools already executed. Reference results naturally. DON'T re-call unless user asks explicitly.]"
  );

  return lines.join('\n');
}

/**
 * Get tool history from conversation state.
 * Uses dynamic import to avoid circular dependency.
 */
async function getToolHistoryFromConversationState(
  sessionId: string,
  limit = 5
): Promise<ToolHistoryEntry[]> {
  try {
    const { getConversationState } = await import('../../../services/conversation-state.js');
    const convState = getConversationState(sessionId);
    return convState.getToolHistory(limit);
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not get tool history from conversation state');
    return [];
  }
}

/**
 * Get in-flight tool from conversation state.
 * Uses centralized conversation state instead of local tracking.
 */
async function getToolInFlightFromConversationState(
  sessionId: string
): Promise<{ toolId: string; elapsedMs: number; expectedDurationMs?: number } | null> {
  try {
    const { getConversationState } = await import('../../../services/conversation-state.js');
    const convState = getConversationState(sessionId);
    return convState.getToolInFlight();
  } catch {
    return null;
  }
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

async function buildSystemStateAwareness(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];
  const sessionId = input.services?.sessionId;

  try {
    // First try to use stored state from UTO (most accurate)
    let state = getStoredSystemState(input);

    // If no stored state, fetch fresh from DJ Controller
    if (!state) {
      const musicState = await getMusicState();
      state = {
        music: musicState,
        timers: { active: 0 },
      };
    }

    // Inject system state if there's something meaningful
    const formatted = formatSystemState(state);
    if (formatted) {
      log.debug({ hasMusic: state.music.isPlaying }, 'System state awareness injected');
      injections.push(
        createHighInjection('system_state_awareness', `[CURRENT SYSTEM STATE]\n${formatted}`, {
          category: 'system_state',
        })
      );
    }

    // Also inject tool hint if present (from UTO medium-confidence cases)
    const toolHint = getToolHint(input);
    if (toolHint) {
      log.debug({ toolId: toolHint.toolId }, 'Tool hint injected');
      injections.push(
        createHighInjection('tool_hint', formatToolHint(toolHint), {
          category: 'tool_hint',
        })
      );
    }

    // ================================================================
    // SERVICE HEALTH AWARENESS (P0-#3 UTO Fix - January 2026)
    // Inject service health status so LLM knows when services are down
    // ================================================================
    try {
      const healthInjection = getSystemPromptInjection();
      if (healthInjection) {
        const healthContext = getHealthContext();
        log.debug(
          {
            overallHealth: healthContext.overallHealth,
            degradedServices: healthContext.degradedServices,
            affectedCapabilities: healthContext.affectedCapabilities,
          },
          'Service health awareness injected'
        );
        injections.push(
          createHighInjection('service_health', healthInjection, {
            category: 'service_health',
          })
        );
      }
    } catch (healthError) {
      // Service health is non-critical - don't fail the builder
      log.debug({ error: String(healthError) }, 'Service health check failed (non-critical)');
    }

    // ================================================================
    // TIMING STATE (Phase 3 BTH Communication Overhaul)
    // Inject timing awareness so LLM can adapt to system pressure
    // ================================================================
    if (sessionId) {
      const timingState = await getTimingState(sessionId);
      if (timingState) {
        const timingFormatted = formatTimingState(timingState);
        if (timingFormatted) {
          log.debug(
            {
              turnLatency: timingState.turnLatency,
              conversationPace: timingState.conversationPace,
              userWaitingTime: timingState.userWaitingTime,
              toolsInFlight: timingState.toolsInFlight.length,
              isUnderPressure: timingState.isUnderPressure,
            },
            'Timing state awareness injected'
          );
          injections.push(
            createHighInjection('timing_state_awareness', `[TIMING STATE]\n${timingFormatted}`, {
              category: 'timing_state',
            })
          );
        }
      }

      // ================================================================
      // TOOL EXECUTION HISTORY (P0-#1 UTO Fix - January 2026)
      // Inject full tool history so LLM knows what already executed
      // ================================================================
      const toolHistory = await getToolHistoryFromConversationState(sessionId, 5);
      if (toolHistory.length > 0) {
        const historyFormatted = formatToolHistory(toolHistory);
        if (historyFormatted) {
          log.debug(
            { sessionId, historyCount: toolHistory.length },
            '📋 Tool execution history injected'
          );
          injections.push(
            createHighInjection('tool_execution_history', historyFormatted, {
              category: 'tool_history',
            })
          );
        }
      }

      // ================================================================
      // IN-FLIGHT TOOL FROM CONVERSATION STATE (P0-#2 UTO Fix)
      // Use centralized conversation state for in-flight tracking
      // ================================================================
      const convStateInFlight = await getToolInFlightFromConversationState(sessionId);
      if (convStateInFlight) {
        const elapsedSec = Math.round(convStateInFlight.elapsedMs / 1000);
        const expectedLabel = convStateInFlight.expectedDurationMs
          ? `, expected ${Math.round(convStateInFlight.expectedDurationMs / 1000)}s`
          : '';
        const inFlightMessage = `🔄 [TOOL IN PROGRESS] ${convStateInFlight.toolId} (running ${elapsedSec}s${expectedLabel})
[GUIDANCE: A tool is currently executing. If user is waiting, acknowledge briefly ("Just a moment..."). Don't re-call this tool.]`;

        log.debug(
          { sessionId, toolId: convStateInFlight.toolId, elapsedMs: convStateInFlight.elapsedMs },
          '🔄 In-flight tool awareness injected'
        );
        injections.push(
          createHighInjection('tool_in_flight', inFlightMessage, {
            category: 'tool_in_flight',
          })
        );
      }
    }

    return injections;
  } catch (error) {
    log.debug({ error: String(error) }, 'System state awareness failed (non-critical)');
    return [];
  }
}

/**
 * Get tool hint from userData if available
 */
function getToolHint(
  input: ContextBuilderInput
): { toolId: string; guidance: string; confidence: number } | undefined {
  const userData = input.userData as unknown as Record<string, unknown> | undefined;
  if (userData?.toolHint) {
    return userData.toolHint as { toolId: string; guidance: string; confidence: number };
  }
  return undefined;
}

/**
 * Format tool hint for LLM injection - prevents hallucination
 */
function formatToolHint(hint: { toolId: string; guidance: string; confidence: number }): string {
  return `[TOOL HINT - ${Math.round(hint.confidence * 100)}% confidence]
${hint.guidance}

CRITICAL: If you believe the user wants this action, CALL THE TOOL. Don't just talk about doing it.
- DON'T say "I'll play some music for you" without calling playMusic()
- DON'T pretend to check the weather without calling getWeather()
- DON'T hallucinate tool execution - either call it or clarify what they need`;
}

// ============================================================================
// REGISTRATION
// ============================================================================

export const systemStateAwarenessBuilder: ContextBuilder = {
  name: 'system-state-awareness',
  description:
    'Provides LLM with continuous awareness of music, timers, recent tools, and timing pressure',
  priority: 10, // Very high priority - LLM needs to know state before responding
  category: BuilderCategory.CONTEXT,
  build: buildSystemStateAwareness,
};

registerContextBuilder(systemStateAwarenessBuilder);

// Core exports
export { buildSystemStateAwareness, formatSystemState, getMusicState };

// Note: Timing state functions (registerToolInFlight, completeToolInFlight,
// recordTurnGap, clearTimingState, getTimingState) are exported at their declarations above.
// formatTimingState is internal (only used by buildSystemStateAwareness).

export default systemStateAwarenessBuilder;
