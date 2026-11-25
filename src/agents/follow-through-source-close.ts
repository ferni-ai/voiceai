/**
 * When the caller's answer closes a raised follow-up ("I did it", "forget
 * it"), the item it was made from closes too: the task is completed, the
 * reminder is marked done so it is never sent, the commitment is closed
 * (services/stores/source-closer.ts). Behind FOLLOW_THROUGH_SOURCE_CLOSE (the
 * caller's own flags, through their cohort); off, nothing is read or written.
 *
 * A "not yet" (replan) closes nothing. The close lands in Firestore first;
 * then this worker's own copies are updated (the task tool's cache, the
 * productivity store's memory and the reminder scheduler's queue), so a later
 * save in this process doesn't write the item back as open and the scheduler
 * doesn't send a reminder they already did. No words are logged.
 *
 * The other direction, a task completed with the task tool closing its
 * follow-up, runs in the tool (tools/domains/productivity/task-follow-up-close.ts)
 * through the store installSourceClose hands it.
 *
 * @module agents/follow-through-source-close
 */
import { flagOn, type Env } from '../config/env-flag.js';
import type { FollowUp, ReplyVerdict, SourceCloser } from '../services/follow-through/index.js';
import { envForCaller, type CohortStore } from '../services/platform/cohort-flags.js';
import { getPendingReminders } from '../services/scheduling/index.js';
import { getProductivityStore } from '../services/stores/productivity-store.js';
import { firestoreFollowUpStore } from '../services/stores/follow-through-store.js';
import { firestoreSourceCloser, type ClosedItem } from '../services/stores/source-closer.js';
import { getUserTasks, setTaskFollowUpStore } from '../tools/domains/productivity/index.js';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'follow-through-source-close' });

/** This process's copies of a closed item take the close (the getters hand back the held objects). */
function syncClosedHere(item: ClosedItem): void {
  if (item.store === 'tasks') {
    const iso = item.at.toISOString();
    const done = item.status === 'completed';
    const stored = getProductivityStore().getTask(item.ref) as
      (Record<string, unknown> & { userId?: string }) | undefined;
    if (stored?.userId === item.userId)
      Object.assign(stored, {
        status: item.status,
        updatedAt: iso,
        ...(done && { completedAt: iso }),
      });
    const cached = getUserTasks(item.userId).find((t) => t.id === item.ref);
    if (cached)
      Object.assign(cached, {
        status: item.status,
        updatedAt: item.at,
        ...(done && { completedAt: item.at }),
      });
  } else if (item.store === 'reminders') {
    const queued = getPendingReminders(item.userId).find((r) => r.id === item.ref);
    if (queued && item.status !== 'dismissed') queued.status = item.status;
  }
}

export interface SourceCloseDeps {
  env?: Env;
  cohorts?: CohortStore;
  /** Injected for tests; defaults to Firestore, with this process's copies kept in step. */
  closer?: SourceCloser | null;
}

/** Closes the source item of a follow-up the caller's answer just closed; whether it did. */
export async function closeSourceAfterReply(
  f: Pick<FollowUp, 'userId' | 'source' | 'kind'>,
  verdict: NonNullable<ReplyVerdict>,
  now: Date,
  deps: SourceCloseDeps = {}
): Promise<boolean> {
  if (verdict === 'replan') return false;
  const env = await envForCaller(f.userId, { env: deps.env, store: deps.cohorts });
  if (!flagOn('FOLLOW_THROUGH_SOURCE_CLOSE', env)) return false;
  const closer =
    deps.closer === undefined ? firestoreSourceCloser({ closed: syncClosedHere }) : deps.closer;
  if (!closer) return false;
  try {
    const closed = await closer.close(f.userId, f.source, verdict, now);
    log.info(
      { kind: f.kind, store: f.source.store, verdict, closed },
      'FOLLOW_THROUGH_SOURCE_CLOSE'
    );
    return closed;
  } catch (error) {
    log.warn({ error: String(error), store: f.source.store }, 'Follow-up source not closed');
    return false;
  }
}

/** The live call installs the store the task tool closes a task's follow-up through. */
export function installSourceClose(): void {
  setTaskFollowUpStore(firestoreFollowUpStore);
}
