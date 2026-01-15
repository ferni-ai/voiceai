/**
 * Session Manager
 *
 * @deprecated Import from './session-manager/index.js' instead.
 * This file is a backward-compatibility stub and will be removed in a future version.
 */

// Re-export everything from the consolidated module
export {
  createSessionServices,
  getSessionServices,
  getActiveSessionIds,
  getActiveSessionCount,
  clearAllSessions,
  startSessionCleanup,
  stopSessionCleanup,
} from './session-manager/create-session.js';
