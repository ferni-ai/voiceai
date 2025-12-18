/**
 * Trust Module
 *
 * Enforcement layer for "Better Than Human" trust systems.
 * Ensures trust signals are acted upon, not just suggested.
 *
 * @module Trust
 */

export {
  enforceTrustContext,
  buildRegenerationPrompt,
  type TrustEnforcementResult,
  type EnforcementContext,
} from './trust-enforcer.js';
