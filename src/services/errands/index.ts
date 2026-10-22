/**
 * Errands: things Ferni gets done for its owner out in the world, as durable
 * workflows (errands design, 2026-10-18). Behind ERRANDS (config/errands-flag.ts);
 * nothing calls this yet. Other contexts import from here only.
 *
 * @module services/errands
 */

export * from './errand.js';
export {
  RETRY_POLICY,
  isRetryable,
  retryDelayMs,
  type RetryPolicy,
  type RetryableError,
} from './retry-policy.js';
export {
  DEFAULT_HOURS,
  DEFAULT_POLICY,
  WEEKDAYS,
  inWindow,
  nextDialAt,
  parallelAllowed,
  textWaitMs,
  withinHours,
  type ErrandPolicy,
  type ErrandPrefs,
} from './policy.js';
export type { StepContext, StepResult } from './draft.js';
export type {
  Claim,
  EffectLease,
  EffectOutbox,
  EffectStatus,
  ErrandStore,
  NewErrand,
  OutboxEffect,
} from './ports.js';
export { step, CURRENT_STEP_VERSION } from './step.js';
