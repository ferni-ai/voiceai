/**
 * The one follow-up a call's opener would ask about, as a read-only selection.
 *
 * Shared by the voice agent's opener (agents/multi-agent/follow-through-opener.ts)
 * and by anything that wants to show the same pick without raising it (GET
 * /api/home). Nothing here writes: marking a follow-up surfaced stays with the
 * opener, when Ferni actually asks.
 *
 * The rules are the opener's: only the caller's own things (not Ferni's
 * promises or read-back actions), due or waiting for a call, not already raised
 * by an opener, and never about a topic the caller asked Ferni to forget. When
 * the forgotten list can't be read nothing is offered (fails closed, like recall).
 *
 * @module services/follow-through/opener-pick
 */
import { forgottenInProcess, forgottenTopicsOrNull, isForgotten } from '../../memory/index.js';
import type { FollowUp, FollowUpKind } from './follow-up.js';
import type { FollowUpStore } from './ports.js';
import { rightMoment } from './right-moment.js';

/** The caller's own things. Ferni's promises and actions are told (promise ledger phase 3), not asked. */
const ASKABLE: ReadonlySet<FollowUpKind> = new Set([
  'commitment',
  'reminder',
  'thread',
  'date',
  'dose',
]);

/** Raised once: at or after its due time (undated: ever) by an opener. */
function raisedByOpener(f: FollowUp): boolean {
  const since = f.dueAt ? Date.parse(f.dueAt) : 0;
  return f.surfaced.some((s) => s.via === 'opener' && Date.parse(s.at) >= since);
}

/** The one follow-up to ask about now: due ones first (latest due first), then undated, newest first. */
export function pickOpenerFollowUp(live: readonly FollowUp[], now: Date): FollowUp | null {
  const askable = live.filter((f) => {
    if (!ASKABLE.has(f.kind) || f.action || raisedByOpener(f)) return false;
    const moment = rightMoment(f, now);
    return moment === 'next-call' || moment === 'text-now';
  });
  const key = (f: FollowUp) => (f.dueAt ? [1, Date.parse(f.dueAt)] : [0, Date.parse(f.createdAt)]);
  askable.sort((a, b) => {
    const [ka, kb] = [key(a), key(b)];
    return kb[0] - ka[0] || kb[1] - ka[1];
  });
  return askable[0] ?? null;
}

export type OpenerPickRead =
  /** The forgotten topics could not be read: nothing is offered. */
  | { readonly status: 'unreadable'; readonly live: number }
  | { readonly status: 'ok'; readonly live: number; readonly picked: FollowUp | null };

/**
 * Reads the caller's live follow-ups and forgotten topics and picks the one the
 * opener would ask about. Throws if the store can't be read; callers decide
 * whether that means "no pick" (the opener) or an empty answer (Home).
 */
export async function loadOpenerPick(deps: {
  userId: string;
  store: FollowUpStore;
  /** Topics the caller asked Ferni to forget, or null when unreadable (forget.ts). */
  forgotten?: (userId: string) => Promise<string[] | null>;
  now: Date;
}): Promise<OpenerPickRead> {
  const forgotten = deps.forgotten ?? ((userId: string) => forgottenTopicsOrNull(userId));
  const [live, topics] = await Promise.all([deps.store.live(deps.userId), forgotten(deps.userId)]);
  // Recall's rule for raw words: unreadable forgotten topics mean nothing is offered.
  if (topics === null) return { status: 'unreadable', live: live.length };
  const all = [...topics, ...forgottenInProcess(deps.userId)];
  const kept = live.filter((f) => !isForgotten(f.text, all));
  return { status: 'ok', live: live.length, picked: pickOpenerFollowUp(kept, deps.now) };
}
