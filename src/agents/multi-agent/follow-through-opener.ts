/**
 * The call opener's follow-up comes from the follow-through store, and the
 * caller's answer closes it (FOLLOW_THROUGH_OPENER).
 *
 * Before this, the opener asked about a thread derived from the last call
 * summaries (session-recall's followUps), and nothing came of the answer: "I
 * did call her" left the follow-up open, so the text job could still nag about
 * it (docs/plans/2026-10-12-follow-through.md, PRs 4 and 5). Now:
 *
 * - At call start the opener reads the caller's live follow-ups from
 *   bogle_users/{uid}/follow_through and picks one that is due or waiting for
 *   a call. Ferni's own promises and read-back actions are not asked about:
 *   "did you call her?" is the caller's to answer, not Ferni's.
 * - Only when the note carrying the ask goes out is it marked surfaced
 *   (`opener`), so a follow-up is raised once.
 * - Ferni has to actually ask: the reply that follows must mention it. Then
 *   the caller's next final transcript, and only that one, goes through
 *   closeFromReply: done (kept), replan (moved a day on) or release (dropped).
 *   Done or dropped closes the todo it came from too, behind
 *   FOLLOW_THROUGH_CLOSE_SOURCE (close-to-source.ts), so the brief stops texting it,
 *   but only when the answer names the todo and never a safety item.
 *   Ferni's own words never close anything: they only arm the listener.
 * - A follow-up about a topic the caller asked Ferni to forget is never
 *   picked (the same forgotten-topic list and match recall uses), and when
 *   that list can't be read the opener offers nothing at all: no stored row,
 *   and no fall back to the summary threads. Fails closed, like recall.
 * - A reply that talks about something else closes nothing ("work's done for
 *   the week" is not "I called mom"), and only the account owner's answer
 *   counts.
 *
 * The raised follow-up lives in this agent process (one call per worker),
 * like opener-claim.ts.
 *
 * @module agents/multi-agent/follow-through-opener
 */

import {
  apply,
  closeFromReply,
  closeSourceItem,
  contentWords,
  mentionsItem,
  namesItem,
  type FollowUp,
  type FollowUpEvent,
  type FollowUpStore,
  type ReplyVerdict,
  type SourceClosers,
} from '../../services/follow-through/index.js';
import { envForCaller } from '../../services/platform/cohort-flags.js';
import type { CohortStore } from '../../services/platform/cohort-firestore.js';
import { firestoreSourceClosers } from '../../services/stores/source-closers.js';
import { firestoreFollowUpStore } from '../../services/stores/follow-through-store.js';
import { forgottenInProcess, isForgotten } from '../../memory/recall/forget.js';
import { loadOpenerPick } from '../../services/follow-through/opener-pick.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'FollowThroughOpener' });

export function followThroughOpenerEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.FOLLOW_THROUGH_OPENER === 'on';
}

export { pickOpenerFollowUp } from '../../services/follow-through/opener-pick.js';

/** Ferni's replies after the raise that may carry the ask before the listener stands down. */
const ASK_WITHIN_REPLIES = 2;
const DAY_MS = 86_400_000;
/** A raise lapses after this, so one call's ask never reaches the next call (as opener-claim.ts). */
export const RAISED_MS = 10 * 60_000;

/** Shares a content word with the follow-up ("did you ring your mom?" ~ "call mom"). */
export function mentions(text: string, f: FollowUp): boolean {
  return mentionsItem(text, f.text);
}

/** The caller's answer is about this follow-up: it names it, or it is a bare answer ("yeah, I did"). */
export function answersIt(reply: string, f: FollowUp): boolean {
  return mentions(reply, f) || contentWords(reply).size === 0;
}

export function eventFor(verdict: NonNullable<ReplyVerdict>, now: Date): FollowUpEvent {
  if (verdict === 'replan')
    return { type: 'replan', dueAt: new Date(now.getTime() + DAY_MS).toISOString() };
  return { type: verdict };
}

interface Raised {
  followUp: FollowUp;
  asked: boolean;
  replies: number;
  at: number;
}
const raisedFor = new Map<string, Raised>();

/** The follow-up raised on this caller's call, if the raise is recent. */
function raisedNow(userId: string): Raised | undefined {
  const raised = raisedFor.get(userId);
  if (raised && Date.now() - raised.at < RAISED_MS) return raised;
  raisedFor.delete(userId);
  return undefined;
}

/** For tests. */
export function clearRaisedFollowUps(): void {
  raisedFor.clear();
}

/** Applies `event` and saves; on a lost write, re-reads once and tries again. */
async function save(store: FollowUpStore, f: FollowUp, event: FollowUpEvent, now: Date) {
  for (let current: FollowUp | undefined = f, i = 0; current && i < 2; i++) {
    const next = apply(current, event, now);
    if (!next.success) return null;
    if (await store.save(next.data, current.updatedAt)) return next.data;
    current = (await store.live(f.userId)).find((x) => x.id === f.id);
  }
  return null;
}

export interface FollowThroughOpener {
  ready: Promise<void>;
  /** Null only when off (the derived threads stand); on, the one follow-up's text, or none. */
  threads(): string[] | null;
  /** The opener's ask went out with these threads: the picked follow-up is surfaced (opener). */
  raised(threads: readonly string[]): void;
}

const INERT: FollowThroughOpener = {
  ready: Promise.resolve(),
  threads: () => null,
  raised: () => undefined,
};

export function createFollowThroughOpener(deps: {
  userId: string;
  store: FollowUpStore;
  /** Topics the caller asked Ferni to forget, or null when unreadable (forget.ts). */
  forgotten?: (userId: string) => Promise<string[] | null>;
  now?: () => Date;
}): FollowThroughOpener {
  const now = deps.now ?? (() => new Date());
  let picked: FollowUp | null = null;
  let raisedOnce = false;
  raisedFor.delete(deps.userId); // a new opener: nothing from an earlier call is still waiting
  const ready = loadOpenerPick({
    userId: deps.userId,
    store: deps.store,
    forgotten: deps.forgotten,
    now: now(),
  })
    .then((read) => {
      if (read.status === 'unreadable') {
        log.warn({}, 'Forgotten topics unreadable: the opener offers no follow-up');
        return;
      }
      picked = read.picked;
      log.info({ live: read.live, picked: picked?.kind ?? null }, 'FOLLOW_THROUGH_OPENER_LOADED');
    })
    .catch((error: unknown) => log.warn({ error: String(error) }, 'Follow-ups not loaded'));
  /** Still not forgotten: a forget asked earlier in this call applies at once. */
  const offered = (): FollowUp | null =>
    picked && !isForgotten(picked.text, forgottenInProcess(deps.userId)) ? picked : null;
  return {
    ready,
    // On means the store is the only source: a failed or fail-closed load is [], never null,
    // so the recall hook's `?? summary threads` fallback can't bring unfiltered rows back.
    threads: () => {
      const f = offered();
      return f ? [f.text] : [];
    },
    raised(threads) {
      const f = offered();
      if (!f || raisedOnce || !threads.includes(f.text)) return;
      raisedOnce = true;
      void save(deps.store, f, { type: 'surface', via: 'opener' }, now())
        .then((next) => {
          if (next)
            raisedFor.set(deps.userId, {
              followUp: next,
              asked: false,
              replies: 0,
              at: Date.now(),
            });
        })
        .catch((error: unknown) => log.warn({ error: String(error) }, 'Follow-up not surfaced'));
    },
  };
}

/** The opener's follow-up source for this caller: the store when FOLLOW_THROUGH_OPENER=on. */
export function followThroughOpenerFor(
  userId: string,
  env: Record<string, string | undefined> = process.env
): FollowThroughOpener {
  if (!followThroughOpenerEnabled(env)) return INERT;
  const store = firestoreFollowUpStore();
  return store ? createFollowThroughOpener({ userId, store }) : INERT;
}

type ItemEvent = { item?: { type?: string; role?: string; textContent?: string } };
type TranscriptEvent = { transcript?: string; isFinal?: boolean };

/**
 * Session listeners that close the raised follow-up from the caller's answer.
 * `isOwner` is asked when the answer arrives: a guest's "I did" closes nothing.
 */
export function followThroughReplyListeners(deps: {
  userId: string;
  isOwner: () => boolean;
  store?: FollowUpStore | null;
  /** Closes the todo itself too (FOLLOW_THROUGH_CLOSE_SOURCE, close-to-source.ts). */
  closers?: SourceClosers | null;
  /** The agent's env; the flag is read for this caller from it (envForCaller). */
  env?: Record<string, string | undefined>;
  cohorts?: CohortStore;
  now?: () => Date;
}): { onItemAdded: (event: unknown) => void; onTranscript: (event: unknown) => void } {
  const now = deps.now ?? (() => new Date());
  return {
    onItemAdded(event) {
      const item = (event as ItemEvent)?.item;
      const raised = raisedNow(deps.userId);
      if (!raised || raised.asked || item?.role !== 'assistant') return;
      if (item.type && item.type !== 'message') return;
      if (mentions(item.textContent ?? '', raised.followUp)) raised.asked = true;
      else if (++raised.replies >= ASK_WITHIN_REPLIES) raisedFor.delete(deps.userId);
    },
    onTranscript(event) {
      const { transcript, isFinal } = (event as TranscriptEvent) ?? {};
      const raised = raisedNow(deps.userId);
      if (!raised?.asked || !isFinal || !transcript?.trim()) return;
      raisedFor.delete(deps.userId); // one answer only
      const f = raised.followUp;
      const verdict = closeFromReply(transcript);
      if (!verdict || !answersIt(transcript, f) || !deps.isOwner()) {
        log.info({ verdict, kind: f.kind }, 'FOLLOW_THROUGH_REPLY_KEPT_OPEN');
        return;
      }
      const store = deps.store === undefined ? firestoreFollowUpStore() : deps.store;
      if (!store) return;
      void save(store, f, eventFor(verdict, now()), now())
        .then(async (next) => {
          log.info({ verdict, kind: f.kind, saved: next !== null }, 'FOLLOW_THROUGH_REPLY');
          if (!next || verdict === 'replan') return;
          // A bare "yep, done" closes the follow-up Ferni asked about, but writing
          // to the todo's own store needs the answer to name it.
          if (!namesItem(transcript, f.text)) {
            log.info({ verdict, kind: f.kind }, 'FOLLOW_THROUGH_SOURCE_NOT_NAMED');
            return;
          }
          const closers = deps.closers === undefined ? firestoreSourceClosers() : deps.closers;
          if (!closers) return;
          // This caller's flags, not process.env's: by now another caller's call may have set them.
          const env = await envForCaller(deps.userId, { env: deps.env ?? process.env, store: deps.cohorts }); // prettier-ignore
          await closeSourceItem(closers, deps.userId, f.source, verdict, env);
        })
        .catch((error: unknown) => log.warn({ error: String(error) }, 'Follow-up not closed'));
    },
  };
}
