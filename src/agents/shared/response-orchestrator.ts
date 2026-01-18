/**
 * Response Orchestrator
 *
 * Central controller for response generation that ensures:
 * 1. SDK and Ferni don't compete for response generation
 * 2. Clear ownership: SDK handles normal turns, Ferni handles proactive moments
 * 3. No duplicate or racing responses
 *
 * Architecture:
 * - SDK emits generation_created when it starts generating a response
 * - Orchestrator tracks this state
 * - Proactive systems check canTriggerProactive() before triggering
 * - Only trigger proactive responses when SDK is idle
 *
 * @module response-orchestrator
 */

import { createLogger } from '../../utils/safe-logger.js';
import { generateReply, type GatewayOptions, type GatewayResult } from './generate-reply-gateway.js';
import type { voice } from '@livekit/agents';
import type { UserData } from './types.js';

const log = createLogger({ module: 'ResponseOrchestrator' });

// ============================================================================
// TYPES
// ============================================================================

export interface ProactiveOptions extends Omit<GatewayOptions, 'instructions'> {
  /** Context for this proactive trigger (e.g., 'silence', 'check-in') */
  context: string;
  /** Instructions for the LLM */
  instructions: string;
}

interface SessionOrchestratorState {
  /** True if SDK is currently generating a response (generation_created fired) */
  sdkGenerating: boolean;
  /** Timestamp when SDK generation started */
  sdkGenerationStartedAt?: number;
  /** Response ID from generation_created event */
  currentResponseId?: string;
  /** True if agent is currently speaking (from AgentStateChanged) */
  agentSpeaking: boolean;
  /** Timestamp when agent started speaking */
  agentSpeakingStartedAt?: number;
  /** Last time a proactive response was triggered */
  lastProactiveAt?: number;
  /** Count of proactive responses triggered this session */
  proactiveCount: number;
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const sessionStates = new Map<string, SessionOrchestratorState>();

function getOrCreateState(sessionId: string): SessionOrchestratorState {
  let state = sessionStates.get(sessionId);
  if (!state) {
    state = {
      sdkGenerating: false,
      agentSpeaking: false,
      proactiveCount: 0,
    };
    sessionStates.set(sessionId, state);
  }
  return state;
}

// ============================================================================
// SDK EVENT HANDLERS - Call these from voice agent event listeners
// ============================================================================

/**
 * Call when SDK emits generation_created event.
 * This indicates the SDK (OpenAI/Gemini) is handling a response.
 */
export function onGenerationStarted(sessionId: string, responseId?: string): void {
  const state = getOrCreateState(sessionId);
  state.sdkGenerating = true;
  state.sdkGenerationStartedAt = Date.now();
  state.currentResponseId = responseId;

  log.debug(
    { sessionId, responseId },
    '📡 SDK generation started - orchestrator tracking'
  );
}

/**
 * Call when generation completes (all audio played, response done).
 * This can be triggered by AgentStateChanged to 'idle' or response completion.
 */
export function onGenerationComplete(sessionId: string): void {
  const state = sessionStates.get(sessionId);
  if (!state) return;

  const duration = state.sdkGenerationStartedAt
    ? Date.now() - state.sdkGenerationStartedAt
    : undefined;

  state.sdkGenerating = false;
  state.sdkGenerationStartedAt = undefined;
  state.currentResponseId = undefined;

  log.debug(
    { sessionId, durationMs: duration },
    '✅ SDK generation complete - orchestrator cleared'
  );
}

/**
 * Call when agent state changes (from AgentStateChanged event).
 */
export function onAgentStateChanged(
  sessionId: string,
  newState: 'speaking' | 'listening' | 'thinking' | 'initializing'
): void {
  const state = getOrCreateState(sessionId);

  if (newState === 'speaking') {
    state.agentSpeaking = true;
    state.agentSpeakingStartedAt = Date.now();
  } else if (state.agentSpeaking) {
    // Agent stopped speaking
    state.agentSpeaking = false;
    state.agentSpeakingStartedAt = undefined;

    // If SDK was generating and agent finished speaking, mark generation complete
    if (state.sdkGenerating) {
      onGenerationComplete(sessionId);
    }
  }
}

/**
 * Call when user starts speaking (interruption).
 * Clears SDK generation state since the user is taking over.
 */
export function onUserSpeaking(sessionId: string): void {
  const state = sessionStates.get(sessionId);
  if (!state) return;

  if (state.sdkGenerating || state.agentSpeaking) {
    log.debug(
      { sessionId, wasGenerating: state.sdkGenerating, wasSpeaking: state.agentSpeaking },
      '🙋 User speaking - clearing SDK generation state'
    );
  }

  state.sdkGenerating = false;
  state.sdkGenerationStartedAt = undefined;
  state.currentResponseId = undefined;
  state.agentSpeaking = false;
  state.agentSpeakingStartedAt = undefined;
}

// ============================================================================
// PROACTIVE SYSTEM API - Use these for silence handlers, check-ins, etc.
// ============================================================================

/**
 * Check if it's safe to trigger a proactive response.
 *
 * Returns true ONLY when:
 * 1. SDK is not currently generating a response
 * 2. Agent is not currently speaking
 *
 * This is the KEY function for preventing race conditions.
 * All proactive systems should call this before triggering.
 */
export function canTriggerProactive(sessionId: string): boolean {
  const state = sessionStates.get(sessionId);
  if (!state) {
    // No state = no activity = safe to trigger
    return true;
  }

  // Not safe if SDK is generating
  if (state.sdkGenerating) {
    log.debug(
      { sessionId, generatingFor: state.sdkGenerationStartedAt ? Date.now() - state.sdkGenerationStartedAt : 0 },
      '🚫 Cannot trigger proactive - SDK is generating'
    );
    return false;
  }

  // Not safe if agent is speaking
  if (state.agentSpeaking) {
    log.debug(
      { sessionId, speakingFor: state.agentSpeakingStartedAt ? Date.now() - state.agentSpeakingStartedAt : 0 },
      '🚫 Cannot trigger proactive - agent is speaking'
    );
    return false;
  }

  return true;
}

/**
 * Trigger a proactive response if safe to do so.
 *
 * This is the ONLY way proactive systems should trigger responses.
 * It checks canTriggerProactive() and then uses the gateway.
 *
 * @returns Result indicating success/failure and whether it was skipped
 */
export async function triggerProactiveResponse(
  session: voice.AgentSession<UserData>,
  sessionId: string,
  options: ProactiveOptions
): Promise<GatewayResult & { skippedByOrchestrator?: boolean }> {
  // Check if safe to trigger
  if (!canTriggerProactive(sessionId)) {
    log.info(
      { sessionId, context: options.context },
      '⏭️ Proactive response skipped - SDK is active'
    );
    return {
      success: false,
      usedFallback: false,
      skipped: true,
      skippedByOrchestrator: true,
    };
  }

  // Track this proactive trigger
  const state = getOrCreateState(sessionId);
  state.lastProactiveAt = Date.now();
  state.proactiveCount++;

  log.info(
    { sessionId, context: options.context, proactiveCount: state.proactiveCount },
    '🚀 Triggering proactive response via orchestrator'
  );

  // Use the gateway for actual generation
  return generateReply(session, sessionId, {
    instructions: options.instructions,
    context: options.context,
    priority: options.priority || 'normal',
    allowInterruptions: options.allowInterruptions ?? true,
    waitForPlayout: options.waitForPlayout ?? false,
    fallbackMessage: options.fallbackMessage,
    timeoutMs: options.timeoutMs,
  });
}

// ============================================================================
// DIAGNOSTICS
// ============================================================================

/**
 * Get orchestrator state for a session (for debugging/observability).
 */
export function getOrchestratorState(sessionId: string): SessionOrchestratorState | undefined {
  return sessionStates.get(sessionId);
}

/**
 * Check if SDK is currently generating for a session.
 */
export function isSdkGenerating(sessionId: string): boolean {
  return sessionStates.get(sessionId)?.sdkGenerating ?? false;
}

/**
 * Check if agent is currently speaking for a session.
 */
export function isAgentSpeaking(sessionId: string): boolean {
  return sessionStates.get(sessionId)?.agentSpeaking ?? false;
}

/**
 * Clean up orchestrator state for a session.
 * Call when session ends.
 */
export function cleanupSession(sessionId: string): void {
  sessionStates.delete(sessionId);
  log.debug({ sessionId }, '🧹 Orchestrator session cleaned up');
}

/**
 * Get statistics for all active sessions.
 */
export function getStats(): {
  activeSessions: number;
  sessionsGenerating: number;
  sessionsSpeaking: number;
} {
  let generating = 0;
  let speaking = 0;

  for (const state of sessionStates.values()) {
    if (state.sdkGenerating) generating++;
    if (state.agentSpeaking) speaking++;
  }

  return {
    activeSessions: sessionStates.size,
    sessionsGenerating: generating,
    sessionsSpeaking: speaking,
  };
}
