/**
 * UserData Proxy Inspection
 *
 * Helpers to tell whether a UserData object is a SessionStateManager-backed
 * proxy and to reach the manager behind it.
 *
 * Extracted from user-data-proxy.ts.
 *
 * @module session/user-data-proxy-inspection
 */

import type { SessionStateManager } from './session-state.js';
import type { UserData } from './user-data-proxy.js';

/**
 * Check if a UserData object is a proxy
 */
export function isUserDataProxy(userData: UserData): boolean {
  return userData.__stateManager !== undefined;
}

/**
 * Get the underlying SessionStateManager from a UserData proxy
 */
export function getStateManager(userData: UserData): SessionStateManager | undefined {
  return userData.__stateManager;
}
