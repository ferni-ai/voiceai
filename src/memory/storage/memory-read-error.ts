/**
 * A failed memory read must never look like "this user has no memories".
 *
 * getUserMemories used to catch every error and return [], so a missing
 * composite index (FAILED_PRECONDITION) or a permissions error read exactly
 * like an empty profile, and callers carried on as if the user were new.
 * Now a failed read throws MemoryReadError: non-transient codes log at error
 * level (they need a fix, usually an index deploy), transient ones at warn.
 *
 * @module memory/storage/memory-read-error
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'MemoryRead' });

/** gRPC codes worth retrying; anything else needs a human (index, IAM, bad query). */
const TRANSIENT_GRPC_CODES = new Set([1, 4, 8, 10, 13, 14]); // CANCELLED, DEADLINE_EXCEEDED, RESOURCE_EXHAUSTED, ABORTED, INTERNAL, UNAVAILABLE
const TRANSIENT_NAMES = new Set([
  'cancelled',
  'deadline-exceeded',
  'resource-exhausted',
  'aborted',
  'internal',
  'unavailable',
]);
const FAILED_PRECONDITION = 9;

export class MemoryReadError extends Error {
  override readonly name = 'MemoryReadError';
  constructor(
    readonly userId: string,
    readonly code: number | string | undefined,
    readonly transient: boolean,
    readonly cause: unknown
  ) {
    super(`Memory read failed for ${userId}: ${String(cause)}`);
  }
}

/** True for errors a retry may clear; false for index, permission and query errors. */
export function isTransientFirestoreError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'number') return TRANSIENT_GRPC_CODES.has(code);
  if (typeof code === 'string') return TRANSIENT_NAMES.has(code.toLowerCase().replace('_', '-'));
  return false;
}

/** Log the failed read at the right level and build the error to throw. */
export function memoryReadFailed(error: unknown, userId: string): MemoryReadError {
  const code = (error as { code?: number | string } | null)?.code;
  const transient = isTransientFirestoreError(error);
  const fields = { error: String(error), code, userId };
  if (transient) {
    log.warn(fields, 'Memory read failed (transient); not treating it as zero memories');
  } else {
    const hint =
      code === FAILED_PRECONDITION || code === 'failed-precondition'
        ? ' - likely a missing composite index; check firestore.indexes.json'
        : '';
    log.error(fields, `Memory read failed${hint}; not treating it as zero memories`);
  }
  return new MemoryReadError(userId, code, transient, error);
}
