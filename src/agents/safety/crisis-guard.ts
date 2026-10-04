/**
 * Crisis Guard re-export. The guard lives in services/safety so the safety
 * service can use it: services may not import from agents/.
 *
 * @module CrisisGuard
 */

export * from '../../services/safety/crisis-guard.js';
export { default } from '../../services/safety/crisis-guard.js';
