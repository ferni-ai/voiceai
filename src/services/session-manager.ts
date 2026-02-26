/**
 * Session Manager - Re-export Shim
 *
 * @deprecated Import from './session/index.js' or './session/session-manager.js' instead.
 * This file exists for backward compatibility during the DDD migration.
 */
export {
  createSessionServices,
  startSessionCleanup,
  stopSessionCleanup,
  getSessionServices,
  getActiveSessionIds,
  getActiveSessionCount,
  clearAllSessions,
} from './session/session-manager.js';
