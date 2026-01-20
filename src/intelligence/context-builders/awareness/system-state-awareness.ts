/**
 * System State Awareness Context Builder
 *
 * Provides the LLM with CONTINUOUS awareness of system state:
 * - Music playing status (track, artist, duration)
 * - Active timers
 * - Last tool executed
 * - Pre-handled actions (what UTO did on the LLM's behalf)
 *
 * "Better than Human" Philosophy:
 * - The LLM should NEVER hallucinate tool usage
 * - If we already handled something, say "Done" not "I'll do that"
 * - If music is playing, acknowledge it naturally
 * - If a tool was just executed, reference the result
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
      lines.push(`🎵 Music is playing: "${state.music.currentTrack.name}" by ${state.music.currentTrack.artist}${duration}${duckStatus}`);
      
      // Guidance: Don't offer to play music when it's already playing
      guidance.push('Music is already playing. If asked about music: acknowledge it\'s on, ask if they want to change it, skip, or adjust volume.');
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
    guidance.push('Timer is running. If asked about timers: mention the active one(s). Offer to cancel or set additional timers if needed.');
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
// CONTEXT BUILDER
// ============================================================================

async function buildSystemStateAwareness(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];
  
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

    return injections;
  } catch (error) {
    log.debug({ error: String(error) }, 'System state awareness failed (non-critical)');
    return [];
  }
}

/**
 * Get tool hint from userData if available
 */
function getToolHint(input: ContextBuilderInput): { toolId: string; guidance: string; confidence: number } | undefined {
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
  description: 'Provides LLM with continuous awareness of music, timers, and recent tool executions',
  priority: 10, // Very high priority - LLM needs to know state before responding
  category: BuilderCategory.CONTEXT,
  build: buildSystemStateAwareness,
};

registerContextBuilder(systemStateAwarenessBuilder);

export { buildSystemStateAwareness, formatSystemState, getMusicState };
export default systemStateAwarenessBuilder;
