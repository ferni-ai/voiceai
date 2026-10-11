/**
 * Best-effort steps of account erasure (GDPR right to erasure).
 *
 * Each step records in `results[key]` whether it worked; a failure is logged on
 * the caller's logger and does not stop the rest of the erasure.
 */

import type { FallbackLogger } from '../../utils/safe-logger.js';

export type ErasureStep = (
  key: string,
  failureMessage: string,
  step: () => Promise<void>
) => Promise<void>;

export function erasureSteps(
  results: Record<string, boolean>,
  userId: string,
  log: Pick<FallbackLogger, 'warn'>
): ErasureStep {
  return async (key, failureMessage, step) => {
    try {
      await step();
      results[key] = true;
    } catch (e) {
      log.warn({ error: String(e), userId }, failureMessage);
      results[key] = false;
    }
  };
}
