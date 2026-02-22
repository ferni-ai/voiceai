/**
 * Firestore query runner with FAILED_PRECONDITION handling.
 *
 * Use for collection group or compound queries on critical paths where
 * "index missing or building" should not fail the whole operation.
 * Catches FAILED_PRECONDITION (code 9 or message containing "index"),
 * logs once with optional context, and returns an empty snapshot.
 *
 * @see docs/audits/FIRESTORE-IMPLEMENTATION-AUDIT.md Section 3.3
 */

import type {
  DocumentData,
  Query,
  QuerySnapshot,
} from 'firebase-admin/firestore';
import { createLogger } from './safe-logger.js';

const log = createLogger({ module: 'FirestoreQuery' });

/** Empty snapshot shape for fallback when index is missing or building (callers only use .docs) */
const EMPTY_SNAPSHOT: QuerySnapshot<DocumentData, DocumentData> = {
  docs: [],
  empty: true,
  size: 0,
} as unknown as QuerySnapshot<DocumentData, DocumentData>;

/**
 * Run a Firestore query; on FAILED_PRECONDITION (missing/building index)
 * log and return empty snapshot instead of throwing.
 *
 * @param query - Firestore Query (e.g. from collectionGroup().where().limit())
 * @param options.context - Optional context string for the log message
 * @returns QuerySnapshot (real result or empty on index error)
 */
export async function runFirestoreQuery(
  query: Query<DocumentData>,
  options?: { context?: string }
): Promise<QuerySnapshot<DocumentData, DocumentData>> {
  try {
    return await query.get();
  } catch (error: unknown) {
    const code = (error as { code?: number })?.code;
    const message = (error as Error)?.message ?? '';
    if (code === 9 || message.includes('index')) {
      log.warn(
        { error: String(error), context: options?.context },
        'Index missing or building (FAILED_PRECONDITION). Returning empty.'
      );
      return EMPTY_SNAPSHOT;
    }
    throw error;
  }
}
