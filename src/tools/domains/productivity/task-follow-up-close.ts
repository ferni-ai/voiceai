/**
 * Completing a task with the task tool closes the follow-up made from it, as
 * done (FOLLOW_THROUGH_SOURCE_CLOSE, the caller's own flags). Off, nothing is
 * read. A failure is logged and never fails the completion itself.
 *
 * Tools (L3) may not import the Firestore store, so the live call installs it
 * (agents/follow-through-source-close.ts). Not installed: nothing is closed.
 *
 * @module tools/domains/productivity/task-follow-up-close
 */
import { flagOn, type Env } from '../../../config/env-flag.js';
import { closeFromSource, type FollowUpStore } from '../../../services/follow-through/index.js';
import { envForCaller, type CohortStore } from '../../../services/platform/cohort-flags.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'task-follow-up-close' });

let followUps: (() => FollowUpStore | null) | undefined;

/** Install the follow-up store the task tool closes through; safe to call on every call. */
export function setTaskFollowUpStore(next: (() => FollowUpStore | null) | undefined): void {
  followUps = next;
}

export interface TaskFollowUpCloseDeps {
  env?: Env;
  cohorts?: CohortStore;
  /** Injected for tests; defaults to the installed store. */
  store?: FollowUpStore | null;
}

/** How many follow-ups the completed task closed. */
export async function closeTaskFollowUp(
  userId: string,
  taskId: string,
  now: Date,
  deps: TaskFollowUpCloseDeps = {}
): Promise<number> {
  try {
    const env = await envForCaller(userId, { env: deps.env, store: deps.cohorts });
    if (!flagOn('FOLLOW_THROUGH_SOURCE_CLOSE', env)) return 0;
    const store = deps.store === undefined ? (followUps?.() ?? null) : deps.store;
    if (!store) return 0;
    const closed = await closeFromSource(
      store,
      userId,
      { store: 'tasks', ref: taskId },
      'done',
      now
    );
    log.info({ closed }, 'TASK_FOLLOW_UP_CLOSED');
    return closed;
  } catch (error) {
    log.warn({ error: String(error) }, 'Task follow-up not closed');
    return 0;
  }
}
