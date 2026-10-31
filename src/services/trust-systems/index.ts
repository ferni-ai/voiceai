/**
 * @deprecated This module has moved.
 * Import from '../trust/index.js' instead.
 *
 * This shim exists for backward compatibility during the services DDD refactor.
 * It will be removed once all consumers are updated.
 *
 * Old path: services/trust-systems/index.ts
 */

export * from '../trust/index.js';
export { default } from '../trust/index.js';
// MINOR_CARE: a reader in any process applies the stored held windows (held-window.ts)
export { loadHeldWindows } from './held-window.js';
// Persona growth after the call (agents/personas/persona-growth-after-call.ts) reads and saves here
export { loadUnifiedProfile, saveSystemData } from './unified-persistence.js';
