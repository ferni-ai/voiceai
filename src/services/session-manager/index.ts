/**
 * Session Manager Service
 *
 * Core session lifecycle management for voice agent sessions.
 *
 * @module services/session-manager
 */

// Main session creation and management
export {
  createSessionServices,
  getSessionServices,
  getActiveSessionIds,
  getActiveSessionCount,
  clearAllSessions,
  startSessionCleanup,
  stopSessionCleanup,
} from './create-session.js';

// Extracted modules
export * from './access.js';
export * from './cleanup.js';
export * from './constants.js';
export * from './end-session.js';
export * from './engine-factory.js';
export * from './session-primer.js';
export * from './utils.js';
export * from './validation.js';

// Merged from session-context/
export * from './session-summary.js';

// Merged from session/
export * from './session-lifecycle-hooks.js';
export * from './tts-registry.js';
