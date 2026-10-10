/**
 * Frontend Signal Service
 *
 * Provides a mechanism for the voice agent to send signals to the frontend
 * (e.g., conversation_end, agent_exit). Each call registers its own callback
 * at session start, bound to that call's data channel.
 */

import { createSessionBindings } from '../../utils/session-bindings.js';

type SignalCallback = (type: string, data?: Record<string, unknown>) => Promise<void>;

const signalCallbacks = createSessionBindings<SignalCallback>();

/**
 * Register the session's frontend signal callback.
 * Called once at session start to wire up that call's data channel publisher.
 */
export function initFrontendSignal(sessionId: string, callback: SignalCallback): void {
  signalCallbacks.bind(sessionId, callback);
}

/**
 * Send a signal to a session's frontend.
 *
 * Pass the session ID whenever it is known: signals like `conversation_end`
 * hang up the client. Without one, the signal is sent only while a single call
 * is live. Returns true if the signal was sent, false if no callback matched.
 */
export async function sendFrontendSignal(
  type: string,
  data?: Record<string, unknown>,
  sessionId?: string
): Promise<boolean> {
  const callback = signalCallbacks.resolve(sessionId);
  if (!callback) {
    return false;
  }

  try {
    await callback(type, data);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove a session's callback at session end, or every callback (for tests)
 * when no session ID is given.
 */
export function resetFrontendSignal(sessionId?: string): void {
  if (sessionId) {
    signalCallbacks.release(sessionId);
  } else {
    signalCallbacks.clear();
  }
}
