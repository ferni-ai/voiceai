/**
 * Session Access Functions
 *
 * Functions for accessing and managing active sessions.
 *
 * @module session-manager/access
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { SessionServices } from '../types.js';
import { SHUTDOWN_TIMEOUT_MS } from './constants.js';

// Reference to active sessions map (injected from main module)
let activeSessionsRef: Map<string, SessionServices> | null = null;

/**
 * Initialize access module with reference to active sessions map
 */
export function initializeAccess(sessions: Map<string, SessionServices>): void {
  activeSessionsRef = sessions;
}

/**
 * Get existing session services
 */
export function getSessionServices(sessionId: string): SessionServices | undefined {
  return activeSessionsRef?.get(sessionId);
}

/**
 * Get all active session IDs
 */
export function getActiveSessionIds(): string[] {
  return activeSessionsRef ? Array.from(activeSessionsRef.keys()) : [];
}

/**
 * Get count of active sessions
 */
export function getActiveSessionCount(): number {
  return activeSessionsRef?.size ?? 0;
}

/**
 * Clear all active sessions (for shutdown)
 * Properly ends each session before clearing to prevent data loss
 */
export async function clearAllSessions(): Promise<number> {
  if (!activeSessionsRef) {
    return 0;
  }

  const count = activeSessionsRef.size;

  if (count === 0) {
    return 0;
  }

  getLogger().info({ count }, 'Ending all active sessions');

  // End all sessions in parallel with timeout to prevent blocking shutdown
  const endPromises: Array<Promise<void>> = [];

  for (const [sessionId, services] of activeSessionsRef) {
    const endPromise = Promise.race([
      services.endSession().catch((err) => {
        getLogger().warn({ sessionId, error: String(err) }, 'Error ending session during shutdown');
      }),
      new Promise<void>((resolve) => {
        setTimeout(() => {
          getLogger().warn({ sessionId }, 'Session end timed out during shutdown');
          resolve();
        }, SHUTDOWN_TIMEOUT_MS);
      }),
    ]) as Promise<void>;
    endPromises.push(endPromise);
  }

  await Promise.all(endPromises);
  activeSessionsRef.clear();

  getLogger().info({ count }, 'All sessions ended');
  return count;
}
