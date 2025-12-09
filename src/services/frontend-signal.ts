/**
 * Frontend Signal Service
 *
 * Provides a way for lower layers (tools, services) to send signals to the
 * frontend without directly importing from the agents layer.
 *
 * The agents layer initializes this service with the actual publisher.
 *
 * @module services/frontend-signal
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'FrontendSignal' });

// ============================================================================
// TYPES
// ============================================================================

export type SignalSender = (
  type: string,
  data?: Record<string, unknown>
) => Promise<void>;

// ============================================================================
// STATE
// ============================================================================

let signalSender: SignalSender | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the frontend signal service with a sender function.
 * Called by the agents layer after setting up the frontend publisher.
 */
export function initFrontendSignal(sender: SignalSender): void {
  signalSender = sender;
  log.debug('Frontend signal service initialized');
}

/**
 * Clear the signal sender (for cleanup)
 */
export function clearFrontendSignal(): void {
  signalSender = null;
  log.debug('Frontend signal service cleared');
}

// ============================================================================
// SIGNAL SENDING
// ============================================================================

/**
 * Send a signal to the frontend.
 * Returns true if sent successfully, false if service not initialized.
 */
export async function sendFrontendSignal(
  type: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  if (!signalSender) {
    log.debug('Frontend signal service not initialized, signal not sent');
    return false;
  }

  try {
    await signalSender(type, data);
    log.debug({ type }, 'Frontend signal sent');
    return true;
  } catch (error) {
    log.debug({ type, error }, 'Failed to send frontend signal');
    return false;
  }
}

/**
 * Check if the frontend signal service is available
 */
export function isFrontendSignalAvailable(): boolean {
  return signalSender !== null;
}

