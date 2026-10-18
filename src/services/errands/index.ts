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
