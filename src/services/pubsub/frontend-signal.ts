/**
 * Frontend Signal Service
 *
 * Provides a mechanism for the voice agent to send signals to the frontend
 * (e.g., conversation_end, agent_exit). The signal callback is initialized
 * at session start and uses the data channel to communicate.
 */

type SignalCallback = (type: string, data?: Record<string, unknown>) => Promise<void>;

let signalCallback: SignalCallback | null = null;

/**
 * Initialize the frontend signal callback.
 * Called once at session start to wire up the data channel publisher.
 */
export function initFrontendSignal(callback: SignalCallback): void {
  signalCallback = callback;
}

/**
 * Send a signal to the frontend.
 * Returns true if the signal was sent, false if no callback is registered.
 */
export async function sendFrontendSignal(
  type: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  if (!signalCallback) {
    return false;
  }

  try {
    await signalCallback(type, data);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reset the signal callback (for testing or session cleanup).
 */
export function resetFrontendSignal(): void {
  signalCallback = null;
}
