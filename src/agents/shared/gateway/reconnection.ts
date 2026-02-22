/**
 * Reconnection logic for generate-reply gateway.
 * Handles LLM death detection, reconnection attempts, and graceful exit.
 *
 * @module gateway/reconnection
 */

import { voice } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { coordinatedSay } from '../../../speech/coordination/index.js';
import {
  RECONNECT_DELAY_MS,
  RECONNECT_TIMEOUT_MS,
  GRACEFUL_EXIT_TTS_WAIT_MS,
  DISCONNECT_DELAY_MS,
} from '../../../config/timeouts.js';
import { getSessionState } from './session-state.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

import type { GatewayOptions, GatewayResult } from './types.js';

// ============================================================================
// SESSION REGISTRY & RECONNECTION TRACKING
// ============================================================================

/** Track active sessions for reconnection attempts */
export const sessionObjects = new Map<string, voice.AgentSession>();

/** Track reconnection attempts to prevent loops */
const reconnectionAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_RECONNECTION_ATTEMPTS = 2;
const RECONNECTION_COOLDOWN_MS = 30_000; // 30s between reconnection attempts

/** Callbacks for session registration - set by main gateway to avoid circular imports */
type ReconnectionCallbacks = {
  onSessionRegistered?: (sessionId: string) => void;
  onSessionUnregistered?: (sessionId: string) => void;
};
let reconnectionCallbacks: ReconnectionCallbacks = {};

export function setReconnectionCallbacks(callbacks: ReconnectionCallbacks): void {
  reconnectionCallbacks = callbacks;
}

/**
 * Register a session object for potential reconnection.
 * When TTS is Higgs pipeline, the onSessionRegistered callback registers the raw-audio handler.
 */
export function registerSessionForReconnection(
  sessionId: string,
  session: voice.AgentSession
): void {
  sessionObjects.set(sessionId, session);
  reconnectionCallbacks.onSessionRegistered?.(sessionId);
}

/**
 * Unregister a session (on cleanup).
 */
export function unregisterSessionForReconnection(sessionId: string): void {
  sessionObjects.delete(sessionId);
  reconnectionAttempts.delete(sessionId);
  reconnectionCallbacks.onSessionUnregistered?.(sessionId);
}

/**
 * Generate a reply using only sessionId (looks up session from registry).
 * Uses lazy import to avoid circular dependency with generateReply.
 */
export async function generateReplyBySessionId(
  sessionId: string,
  options: GatewayOptions
): Promise<GatewayResult> {
  const session = sessionObjects.get(sessionId);

  if (!session) {
    log.warn(
      { sessionId, context: options.context },
      '⚠️ [GATEWAY] generateReplyBySessionId: Session not found in registry'
    );

    if (options.fallbackMessage) {
      try {
        coordinatedSay(sessionId, options.fallbackMessage, { allowInterruptions: true });
        return {
          success: false,
          usedFallback: true,
          error: 'Session not in registry',
        };
      } catch {
        // Ignore coordinatedSay errors
      }
    }

    return {
      success: false,
      usedFallback: false,
      error: 'Session not found in registry',
    };
  }

  const { generateReply } = await import('../generate-reply-gateway.js');
  return generateReply(session, sessionId, options);
}

/**
 * Handle Gemini death by attempting reconnection.
 * Called when isLLMDead is detected.
 */
export async function handleGeminiDeath(sessionId: string): Promise<boolean> {
  const attempts = reconnectionAttempts.get(sessionId) || { count: 0, lastAttempt: 0 };
  const now = Date.now();

  if (attempts.count >= MAX_RECONNECTION_ATTEMPTS) {
    log.warn(
      { sessionId, attempts: attempts.count },
      '💀 [GATEWAY] Max reconnection attempts reached - giving up'
    );
    return false;
  }

  if (now - attempts.lastAttempt < RECONNECTION_COOLDOWN_MS && attempts.count > 0) {
    log.debug(
      { sessionId, cooldownRemainingMs: RECONNECTION_COOLDOWN_MS - (now - attempts.lastAttempt) },
      '💀 [GATEWAY] Reconnection on cooldown'
    );
    return false;
  }

  reconnectionAttempts.set(sessionId, { count: attempts.count + 1, lastAttempt: now });

  log.warn(
    { sessionId, attempt: attempts.count + 1 },
    '💀 [GATEWAY] Gemini dead - attempting reconnection...'
  );

  const session = sessionObjects.get(sessionId);
  if (!session) {
    log.error({ sessionId }, '💀 [GATEWAY] No session object for reconnection');
    return false;
  }

  try {
    coordinatedSay(sessionId, 'One moment...', { allowInterruptions: false });

    await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Reconnection timeout')), RECONNECT_TIMEOUT_MS);
    });

    const reconnectPromise = (async () => {
      const handle = session.generateReply({
        instructions: ' ',
        allowInterruptions: true,
      });
      await handle.waitForPlayout();
    })();

    await Promise.race([reconnectPromise, timeoutPromise]);

    const state = getSessionState(sessionId);
    state.consecutiveFailures = 0;
    state.circuitBreakerOpenedAt = undefined;
    state.isReady = true;

    log.info({ sessionId }, '✅ [GATEWAY] Gemini reconnection successful!');

    coordinatedSay(sessionId, "I'm back! What were you saying?", { allowInterruptions: true });

    return true;
  } catch (err) {
    log.error(
      { sessionId, error: String(err), attempt: attempts.count + 1 },
      '💀 [GATEWAY] Gemini reconnection failed'
    );
    return false;
  }
}

/**
 * Trigger a graceful exit when LLM is completely unresponsive.
 * Attempts reconnection FIRST before giving up.
 */
export async function triggerGracefulExit(sessionId: string): Promise<void> {
  const reconnected = await handleGeminiDeath(sessionId);
  if (reconnected) {
    log.info({ sessionId }, '🔄 [GATEWAY] Reconnected during graceful exit - continuing session');
    return;
  }

  const goodbyeMessages = [
    'Oh, looks like I need to step away for a moment. Talk to you soon!',
    'Hey, I think I need to take a quick break. Catch you in a bit!',
    "Hmm, something's up on my end. Let me reconnect - talk soon!",
    'I should probably step away for a sec. Be right back!',
  ];

  const goodbye = goodbyeMessages[Math.floor(Math.random() * goodbyeMessages.length)];

  log.warn({ sessionId, goodbye: goodbye.slice(0, 50) }, '👋 [GATEWAY] Speaking graceful exit');

  try {
    await coordinatedSay(sessionId, goodbye, { allowInterruptions: false });

    await new Promise((resolve) => setTimeout(resolve, GRACEFUL_EXIT_TTS_WAIT_MS));

    const { sendFrontendSignal } = await import('../../../services/frontend-signal.js');
    await sendFrontendSignal('conversation_end', {
      reason: 'graceful_exit_failures',
      disconnectDelay: DISCONNECT_DELAY_MS,
      timestamp: Date.now(),
    });

    log.info({ sessionId }, '👋 [GATEWAY] Graceful exit complete - frontend notified');
  } catch (err) {
    log.error(
      { error: String(err), sessionId },
      '👋 [GATEWAY] Graceful exit failed - user may be stuck'
    );
  }
}
