/**
 * Session Manager - Re-export Shim
 *
 * @deprecated Import from '../session/index.js' instead.
 * This barrel exists for backward compatibility during the DDD migration.
 */
export * from './access.js';
export * from './cleanup.js';
export * from './constants.js';
export * from './end-session.js';
export * from './engine-factory.js';
export * from './session-primer.js';
export * from './utils.js';
export * from './validation.js';

// Extracted modules from end-session.ts refactoring
export * from './summarization.js';
export * from './state-persistence.js';
export * from './session-end-cleanup.js';
