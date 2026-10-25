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

/** gRPC status numbers, kebab codes ('unavailable', 'auth/user-not-found') and errno names */
const SAFE_CODE = /^(?:\d{1,4}|(?:[a-z]+(?:-[a-z]+)*\/)?[a-z]+(?:-[a-z]+)*|[A-Z][A-Z_]*)$/;
const SAFE_NAME = /^[A-Za-z]\w{0,63}$/;

/**
 * What an erasure log may say about a failure: the error's class and its code, never
 * its message. A Firestore, BulkWriter or Firebase Auth message can name the document
 * or account it failed on, and those ids are a phone number (bogle_users/phone:{e164})
 * or an email (the base64 ids of waitlist/{email}). A code that doesn't look like one
 * of the shapes those SDKs use is dropped rather than logged.
 */
export function erasureErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return typeof error;
  const name = SAFE_NAME.test(error.name) ? error.name : 'Error';
  const { code } = error as { code?: unknown };
  const shown = typeof code === 'number' || typeof code === 'string' ? String(code) : '';
  return shown.length <= 64 && SAFE_CODE.test(shown) ? `${name}:${shown}` : name;
}

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
      log.warn({ error: erasureErrorCode(e), userId }, failureMessage);
      results[key] = false;
    }
  };
}
