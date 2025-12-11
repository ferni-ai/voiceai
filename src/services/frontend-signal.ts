/**
 * Frontend Signal Service
 *
 * Provides a way for lower-level services to send signals to the frontend
 * without directly importing the realtime publisher.
 *
 * This decouples services from the LiveKit room initialization order.
 *
 * @module FrontendSignal
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'frontend-signal' });

// Type for the signal sender callback
type SignalSender = (type: string, data?: Record<string, unknown>) => Promise<void>;

// The callback set by voice-agent after publisher is initialized
let signalSender: SignalSender | null = null;

/**
 * Initialize the frontend signal service with a sender callback.
 * Called by voice-agent after the frontend publisher is ready.
 */
export function initFrontendSignal(sender: SignalSender): void {
  signalSender = sender;
  log.debug('Frontend signal service initialized');
}

/**
 * Send a signal to the frontend.
 * Returns true if the signal was sent, false if not initialized.
 *
 * @param type - The signal type (e.g., 'wrap_up', 'mood_shift')
 * @param data - Optional data payload
 */
export async function sendFrontendSignal(
  type: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  if (!signalSender) {
    log.debug({ type }, 'Frontend signal service not initialized, signal not sent');
    return false;
  }

  try {
    await signalSender(type, data);
    return true;
  } catch (error) {
    log.warn({ error, type }, 'Failed to send frontend signal');
    return false;
  }
}

/**
 * Check if the frontend signal service is ready.
 */
export function isFrontendSignalReady(): boolean {
  return signalSender !== null;
}
