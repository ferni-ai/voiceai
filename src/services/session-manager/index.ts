/**
 * Session Manager - Re-export Shim
 *
 * @deprecated Import from '../session/index.js' instead.
 * This barrel exists for backward compatibility during the DDD migration.
 * Leftover near-identical (not byte-identical) copies left with C-2 confidence:
 * conversation-state, billing vs integrations, deployment vs performance ops,
 * daily-rituals, session-summary variants, dj-service. Dynamically loaded
 * paths were not deleted.

 */
export * from '../session/access.js';
export * from '../session/cleanup.js';
export * from '../session/constants.js';
export * from '../session/end-session.js';
export * from '../session/engine-factory.js';
export * from '../session/session-primer.js';
export * from '../session/utils.js';
export * from '../session/validation.js';
export * from './summarization.js';
export * from '../session/state-persistence.js';
export * from '../session/session-end-cleanup.js';
