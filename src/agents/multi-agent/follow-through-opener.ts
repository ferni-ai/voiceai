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
 *   Behind FOLLOW_THROUGH_CLOSE_SOURCE, a plain done or let-go answer also
 *   has Ferni ask in the same reply whether to take the todo off their list,
 *   once ever per item, and only the owner's clear yes to that question
 *   closes the todo where it lives (close-confirm.ts), never a safety item.
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
  asksToClose,
  closeSourceItem,
  CONFIRM_TTL_MS,
  confirmNote,
  contentWords,
  hedgedAnswer,
  mentionsItem,
  sourceAskable,
  type FollowUp,
  type FollowUpEvent,
  type FollowUpStore,
  type ReplyVerdict,
  type SourceClosers,
} from '../../services/follow-through/index.js';
import { envForCaller } from '../../services/platform/cohort-flags.js';
import { crisisDecidedOn, crisisVerdictPending } from '../safety/crisis-gate-signal.js';
import type { CohortStore } from '../../services/platform/cohort-firestore.js';
import { firestoreSourceClosers } from '../../services/stores/source-closers.js';
import { firestoreFollowUpStore } from '../../services/stores/follow-through-store.js';
import { forgottenInProcess, isForgotten } from '../../memory/recall/forget.js';
import { loadOpenerPick } from '../../services/follow-through/opener-pick.js';
import { isClearYes } from '../../tools/domains/communication/outreach/index.js';
import { withTimeout } from '../../utils/async.js';
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
/** The follow-up's own close never waits longer than this on the "may Ferni ask?" read: slow is no. */
const ASKABLE_WAIT_MS = 2_000;

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

/** Ferni's question to take a closed follow-up's todo off the list, bound to the call it was asked on. */
interface PendingConfirm {
  followUp: FollowUp;
  how: 'done' | 'release';
  sessionId: string;
  at: number;
  /** Ferni's reply did ask it: only then can a yes answer it. */
  asked: boolean;
}
const pendingFor = new Map<string, PendingConfirm>();

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
  pendingFor.clear();
}

/** Applies `event` and saves; on a lost write, re-reads once and tries again. */
async function save(
  store: FollowUpStore,
  f: FollowUp,
  event: FollowUpEvent,
  now: Date,
  mark: Partial<FollowUp> = {}
) {
  for (let current: FollowUp | undefined = f, i = 0; current && i < 2; i++) {
    const next = apply(current, event, now);
    if (!next.success) return null;
    const data = { ...next.data, ...mark };
    if (await store.save(data, current.updatedAt)) return data;
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
  pendingFor.delete(deps.userId);
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
 * `isOwner` and the session's crisis reads are checked again at every step: a
 * guest's "I did" or "yes" closes nothing, and nothing is asked or closed once
 * the crisis gate decided on the call or while its verdict is pending (no
 * session: unknown, so never asked).
 * `note` puts the close question into the reply that acknowledges the answer.
 */
export function followThroughReplyListeners(deps: {
  userId: string;
  sessionId?: string;
  isOwner: () => boolean;
  /** The live session, for its crisis reads (crisis-gate-signal.ts). */
  session?: object;
  note?: (text: string) => void;
  store?: FollowUpStore | null;
  /** Reads and closes the todo itself (FOLLOW_THROUGH_CLOSE_SOURCE, close-to-source.ts). */
  closers?: SourceClosers | null;
  /** The agent's env; the flag is read for this caller from it (envForCaller). */
  env?: Record<string, string | undefined>;
  cohorts?: CohortStore;
  now?: () => Date;
}): { onItemAdded: (event: unknown) => void; onTranscript: (event: unknown) => void } {
  const now = deps.now ?? (() => new Date());
  const sessionId = deps.sessionId ?? '';
  const { session } = deps;
  const crisisOnCall = () => !session || crisisDecidedOn(session) || crisisVerdictPending(session) !== null; // prettier-ignore
  const safe = () => deps.isOwner() && !crisisOnCall();
  const closers = () => (deps.closers === undefined ? firestoreSourceClosers() : deps.closers);
  // This caller's flags, not process.env's: by now another caller's call may have set them.
  const callerEnv = () => envForCaller(deps.userId, { env: deps.env ?? process.env, store: deps.cohorts }); // prettier-ignore
  /** Read while Ferni asks, so the answer needn't wait for it: flag on, todo open, no safety item. */
  let askable: Promise<boolean> = Promise.resolve(false);
  let replies = 0; // Ferni's replies so far: a question that missed the acknowledging reply is never asked
  return {
    onItemAdded(event) {
      const item = (event as ItemEvent)?.item;
      if (item?.role !== 'assistant' || (item.type && item.type !== 'message')) return;
      replies++;
      const pending = pendingFor.get(deps.userId);
      // Only the reply right after the note can carry the question; any later reply ends it.
      if (pending && !pending.asked && asksToClose(item.textContent ?? '', pending.followUp.text))
        pending.asked = true;
      else if (pending) pendingFor.delete(deps.userId);
      const raised = raisedNow(deps.userId);
      if (!raised || raised.asked) return;
      if (mentions(item.textContent ?? '', raised.followUp)) {
        raised.asked = true;
        const c = deps.note && !raised.followUp.sourceAskedAt ? closers() : null;
        if (c) askable = callerEnv().then((env) => sourceAskable(c, deps.userId, raised.followUp.source, env)).catch(() => false); // prettier-ignore
      } else if (++raised.replies >= ASK_WITHIN_REPLIES) raisedFor.delete(deps.userId);
    },
    onTranscript(event) {
      const { transcript, isFinal } = (event as TranscriptEvent) ?? {};
      if (!isFinal || !transcript?.trim()) return;
      const pending = pendingFor.get(deps.userId);
      if (pending) {
        pendingFor.delete(deps.userId); // one answer only
        void answerConfirm(pending, transcript);
        return;
      }
      const raised = raisedNow(deps.userId);
      if (!raised?.asked) return;
      raisedFor.delete(deps.userId); // one answer only
      const f = raised.followUp;
      const verdict = closeFromReply(transcript);
      if (!verdict || !answersIt(transcript, f) || !deps.isOwner()) {
        log.info({ verdict, kind: f.kind }, 'FOLLOW_THROUGH_REPLY_KEPT_OPEN');
        return;
      }
      const store = deps.store === undefined ? firestoreFollowUpStore() : deps.store;
      if (!store) return;
      const seen = replies;
      const wantAsk = verdict !== 'replan' && !f.repeat && !hedgedAnswer(transcript) && safe();
      void (
        wantAsk ? withTimeout(askable, ASKABLE_WAIT_MS).catch(() => false) : Promise.resolve(false)
      )
        .then(async (ask) => {
          // Marked with the close itself, so the question is asked at most once, ever.
          const mark = ask ? { sourceAskedAt: now().toISOString() } : {};
          const next = await save(store, f, eventFor(verdict, now()), now(), mark);
          log.info({ verdict, kind: f.kind, saved: next !== null }, 'FOLLOW_THROUGH_REPLY');
          if (!next || !ask || verdict === 'replan') return;
          if (replies !== seen || !safe()) {
            log.info({ outcome: 'not-asked', kind: f.kind }, 'FOLLOW_THROUGH_SOURCE_CONFIRM');
            return;
          }
          pendingFor.set(deps.userId, { followUp: next, how: verdict, sessionId, at: Date.now(), asked: false }); // prettier-ignore
          deps.note?.(confirmNote(verdict, f.text));
          log.info({ outcome: 'asked', kind: f.kind }, 'FOLLOW_THROUGH_SOURCE_CONFIRM');
        })
        .catch((error: unknown) => log.warn({ error: String(error) }, 'Follow-up not closed'));
    },
  };

  /** The owner's next words after Ferni asked: only a clear yes, on this call, in time, closes the todo. */
  async function answerConfirm(p: PendingConfirm, transcript: string): Promise<void> {
    const kind = p.followUp.kind;
    const current = p.asked && p.sessionId === sessionId && Date.now() - p.at < CONFIRM_TTL_MS;
    if (!current || !isClearYes(transcript) || !safe()) {
      log.info({ outcome: 'kept-open', kind }, 'FOLLOW_THROUGH_SOURCE_CONFIRM');
      return;
    }
    const c = closers();
    if (!c) return;
    const outcome = await closeSourceItem(c, deps.userId, p.followUp.source, p.how, await callerEnv()); // prettier-ignore
    log.info({ outcome, kind }, 'FOLLOW_THROUGH_SOURCE_CONFIRM');
  }
}
