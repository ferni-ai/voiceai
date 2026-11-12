/**
 * A todo the person closed in conversation closes where it lives: the task, the
 * reminder or the commitment, not only its follow-up. Before this, "yeah I did
 * it" closed at most the follow-up, the source item stayed open, and the next
 * morning brief texted it again (close-from-source.ts is the other direction:
 * closed in the app, so the follow-up closes).
 *
 * closeSourceItem writes through the store's own writer (SourceClosers,
 * stores/source-closers.ts), behind FOLLOW_THROUGH_CLOSE_SOURCE. A failed write
 * is logged by store, never thrown, so the follow-up's own close still stands.
 *
 * @module services/follow-through/close-to-source
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'follow-through-close-to-source' });

export interface SourceRef {
  readonly store: string;
  readonly ref: string;
}
export type SourceClose = 'done' | 'release';
/** closed: this write closed it; already: it was not open any more; missing: no such item. */
export type CloseWrite = 'closed' | 'already' | 'missing';

/** One writer per store, each with its own compare-and-set (stores/source-closers.ts). */
export interface SourceClosers {
  close: (userId: string, source: SourceRef, how: SourceClose) => Promise<CloseWrite>;
}

export type SourceCloseOutcome = CloseWrite | 'flag-off' | 'failed';

/** Closes one source item, or says why not. Never throws. */
export async function closeSourceItem(
  closers: SourceClosers,
  userId: string,
  source: SourceRef,
  how: SourceClose,
  env: Env
): Promise<SourceCloseOutcome> {
  if (!flagOn('FOLLOW_THROUGH_CLOSE_SOURCE', env)) return 'flag-off';
  try {
    return await closers.close(userId, source, how);
  } catch (error) {
    log.warn(
      { store: source.store, how, error: String(error) },
      'FOLLOW_THROUGH_SOURCE_CLOSE_FAILED'
    );
    return 'failed';
  }
}
