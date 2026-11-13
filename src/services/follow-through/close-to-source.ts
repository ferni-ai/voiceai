/**
 * A todo the person closed in conversation closes where it lives: the task, the
 * reminder or the commitment, not only its follow-up. Before this, "yeah I did
 * it" closed at most the follow-up, the source item stayed open, and the next
 * morning brief texted it again (close-from-source.ts is the other direction:
 * closed in the app, so the follow-up closes).
 *
 * It runs only on the caller's yes to Ferni's question (close-confirm.ts):
 * sourceAskable says whether to ask, and closeSourceItem writes through the
 * store's own writer (SourceClosers, stores/source-closers.ts), both behind
 * FOLLOW_THROUGH_CLOSE_SOURCE. A failed read or write is logged by store, never
 * thrown, so the follow-up's own close still stands.
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
/**
 * closed: this write closed it; already: it was not open any more; missing: no
 * such item; safety: a safety item (services/safety/safety-item.ts), which
 * conversation never closes.
 */
export type CloseWrite = 'closed' | 'already' | 'missing' | 'safety';
/** What a read found: open, or why it can't be closed. */
export type SourceState = 'open' | Exclude<CloseWrite, 'closed'>;

/** One reader and writer per store; each write is its own compare-and-set (stores/source-closers.ts). */
export interface SourceClosers {
  peek: (userId: string, source: SourceRef) => Promise<SourceState>;
  close: (userId: string, source: SourceRef, how: SourceClose) => Promise<CloseWrite>;
}

/**
 * Whether Ferni may ask to close it: the flag is on for this caller (read first,
 * so with it off no store is read) and the item is open and no safety item.
 * Unreadable is no. Never throws.
 */
export async function sourceAskable(
  closers: SourceClosers,
  userId: string,
  source: SourceRef,
  env: Env
): Promise<boolean> {
  if (!flagOn('FOLLOW_THROUGH_CLOSE_SOURCE', env)) return false;
  try {
    return (await closers.peek(userId, source)) === 'open';
  } catch (error) {
    log.warn({ store: source.store, error: String(error) }, 'FOLLOW_THROUGH_SOURCE_PEEK_FAILED');
    return false;
  }
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
