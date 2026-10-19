/**
 * The friendship anniversary, said once (FRIEND_CELEBRATIONS, off by default).
 *
 * A friend notices "it's been a year since we met" without making a fuss of
 * it. The profile has the day of their first call (firstContact), so on the
 * week of one month, three months, six months, a year and each year after,
 * the greeting may say so once, with the true number, in the caller's own
 * day. Each milestone is said once (bogle_users/{uid}/celebrations/{key}):
 * a caller who doesn't call that week simply doesn't hear it.
 *
 * Ferni never supplies a date: no firstContact, no anniversary. Too few calls
 * and it isn't a friendship yet, so it stays quiet.
 *
 * @module agents/multi-agent/friendship-anniversary
 */

import { flagOn } from '../../config/env-flag.js';
import { daysBetween } from '../../intelligence/world-model/dates/timex.js';
import { callMomentFor } from '../../intelligence/world-model/extraction/extraction-prompt.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';

const log = createLogger({ module: 'friendship-anniversary' });

export function friendCelebrationsOn(
  env: Record<string, string | undefined> = process.env
): boolean {
  return flagOn('FRIEND_CELEBRATIONS', env);
}

export interface Anniversary {
  /** Stored once said: "3m", "1y". */
  key: string;
  /** How it's said: "three months", "a year". */
  words: string;
}

/** Calls before a first-call anniversary means anything. */
export const MIN_CALLS = 4;
/** Days after the milestone it can still be said. */
const WINDOW_DAYS = 6;
const MONTHS: ReadonlyArray<[number, string]> = [
  [1, 'one month'],
  [3, 'three months'],
  [6, 'six months'],
];
const YEAR_WORDS = ['a year', 'two years', 'three years', 'four years', 'five years'];

/** The day `months` calendar months after `day` (the month's last day when it is shorter). */
function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = total % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d, last))).toISOString().slice(0, 10);
}

type Milestone = Anniversary & { months: number };

/** Every milestone up to `years` years, in order. */
function milestones(years: number): Milestone[] {
  const early = MONTHS.map(([months, words]) => ({ key: `${months}m`, words, months }));
  const yearly = Array.from({ length: years }, (_, i) => ({
    key: `${i + 1}y`,
    words: YEAR_WORDS[i] ?? `${i + 1} years`,
    months: (i + 1) * 12,
  }));
  return [...early, ...yearly];
}

/**
 * The anniversary to say today, or null (pure). `firstDay` and `today` are the
 * caller's own days (YYYY-MM-DD); `said` holds the keys already said.
 */
export function anniversaryDue(
  firstDay: string,
  today: string,
  calls: number,
  said: ReadonlySet<string>
): Anniversary | null {
  if (calls < MIN_CALLS || today <= firstDay) return null;
  const years = Math.floor(daysBetween(firstDay, today) / 365) + 1;
  const due = milestones(years).filter((m) => {
    const gap = daysBetween(addMonths(firstDay, m.months), today);
    return gap >= 0 && gap <= WINDOW_DAYS && !said.has(m.key);
  });
  const last = due.at(-1);
  return last ? { key: last.key, words: last.words } : null;
}

/** The greeting's direction when there is one to say. */
export function anniversaryDirection(a: Anniversary): string {
  return ` It has been ${a.words} since you first talked. You may say so once, lightly, the way a friend notices ("Hey Sam. Hard to believe it's been ${a.words} of these talks."). Say exactly "${a.words}", no other number or date, no fuss, and never make it about how often they call.`;
}

/** True when the spoken line says this anniversary ("three months", "a year"), so it counts as said. */
export function lineSaysAnniversary(line: string, a: Anniversary): boolean {
  const words = a.words.replace(/^(?:a|one) /, '(?:a|one) ').replace(/ /g, '\\s+');
  return new RegExp(`\\b${words}\\b`, 'i').test(line);
}

export interface AnniversaryStore {
  said: (userId: string) => Promise<Set<string>>;
  mark: (userId: string, key: string, day: string) => Promise<void>;
}

const celebrations = (userId: string) =>
  getFirestoreDb()?.collection('bogle_users').doc(userId).collection('celebrations');

export const firestoreAnniversaryStore: AnniversaryStore = {
  async said(userId) {
    const col = celebrations(userId);
    if (!col) return new Set();
    const snap = await col.get();
    return new Set(snap.docs.map((d) => d.id));
  },
  async mark(userId, key, day) {
    await celebrations(userId)?.doc(key).set({ saidOn: day, kind: 'friendship-anniversary' });
  },
};

export interface AnniversaryAsk extends Anniversary {
  /** Records it as said, so no later call says it again. Never rejects. */
  mark: () => void;
}

/** How long the greeting waits for what was already said before going without. */
const WAIT_MS = 400;

/**
 * The anniversary for this call, or undefined: flag off, no first-call day,
 * too few calls, none due, or the store too slow.
 */
export async function anniversaryFor(
  userId: string | undefined,
  history: { calls: number; firstContact?: string } | undefined,
  timezone: string | undefined,
  deps: { store?: AnniversaryStore; now?: Date; env?: Record<string, string | undefined> } = {}
): Promise<AnniversaryAsk | undefined> {
  if (!isMemberIdentity(userId) || !friendCelebrationsOn(deps.env)) return undefined;
  if (!history?.firstContact || history.calls < MIN_CALLS) return undefined;
  const zone = timezone ?? 'UTC';
  const now = deps.now ?? new Date();
  const firstDay = callMomentFor(new Date(history.firstContact), zone).date;
  const today = callMomentFor(now, zone).date;
  const store = deps.store ?? firestoreAnniversaryStore;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), WAIT_MS);
  });
  const read = store.said(userId).catch((error: unknown) => {
    log.warn({ error: String(error) }, 'Celebrations not read for the greeting');
    return undefined;
  });
  const said = await Promise.race([read, late]);
  clearTimeout(timer);
  if (!said) return undefined;
  const due = anniversaryDue(firstDay, today, history.calls, said);
  if (!due) return undefined;
  log.info({ key: due.key }, 'Friendship anniversary to say');
  return {
    ...due,
    mark: () => {
      store
        .mark(userId, due.key, today)
        .catch((error: unknown) => log.warn({ error: String(error) }, 'Anniversary not marked'));
    },
  };
}
