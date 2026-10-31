/**
 * A date the caller told Ferni about can be the hello's one thread
 * (DATES_IN_HELLO, default off; docs/plans/2026-10-31-right-moment-memory.md §5.5).
 *
 * - The same date the first recall note would raise (dates/recall.ts): a one-time
 *   date from 10 days ago to 3 days ahead, or a yearly one within the week.
 * - Picking writes nothing. Only the arbiter's winner calls commit(line), and it
 *   claims the call's opener and marks the date raised only when the spoken line
 *   names the date (its day or a word of it), as a letter and an anniversary are
 *   marked. A date that loses, or that the line passed over, comes back later.
 * - A sensitive date (sensitive-date.ts, where unsure counts) is presence, never a
 *   question and never its topic word: "Thinking of your grandma, with Thursday
 *   coming up." The person comes from the label, else "you". Its hello has its own
 *   base direction (PRESENCE_GREETING_DIRECTION), with no question in it.
 * - Verified members only (never a phone:, device: or anon: id, which anyone can
 *   present), never with crisis risk on the call, and never within CRISIS_QUIET_DAYS
 *   of a crisis-level signal (hadRecentCrisis, as the pondered ask). greeting-direction.ts
 *   adds the rest of the order: an unknown caller, a stranger and a same-day return get none.
 *
 * @module agents/multi-agent/greeting-date
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import type { DatesRecallDeps, DueDate } from '../../intelligence/index.js';
import { hadRecentCrisis } from '../../intelligence/pondering/index.js';
import { claimOpenerFollowUp } from '../../memory/index.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import { isUnverifiedUserId } from '../../services/identity/unverified-user-id.js';
import { crisisRiskThisCall } from '../../services/safety/index.js';
import { userTimeZone } from '../../utils/caller-time-zone.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { lineAsks } from './greeting-claim.js';

const log = createLogger({ module: 'greeting-date' });

/** An ordinary date, by where it falls. "soon" is the spec's wording, word for word. */
const ORDINARY: Record<DueDate['moment'], string> = {
  soon: ' There is something on their calendar soon: you may say hello, then mention it once and let them take it where they want, naming it in their words ("Hey Riley. Priya\'s visit is Saturday, isn\'t it. Looking forward to it?"). Not a report.',
  today:
    " Something on their calendar is today: you may say hello, then wish them well for it once, naming it in their words (\"Hey Riley. Priya's visit is today, isn't it. Hope it's a good one.\"). Not a report.",
  passed:
    ' Something on their calendar just happened: you may say hello, then ask how it went once, as an open question, naming it in their words ("Hey Riley. How was Priya\'s visit?"). Never guess how it went. Not a report.',
};

/** The hello's base under a sensitive date: GREETING_DIRECTION with no question and no callback. */
export const PRESENCE_GREETING_DIRECTION =
  'They just called you. Answer like you would a friend calling: quiet and low-key, one short sentence, and no question at all. No exclamation marks, no "so good to hear your voice", no cheer, do not list what you can do or introduce yourself, and do not pick up from last time.';

/** A sensitive date: who it is about and the day, never what it is, never a question. */
function presenceDirection(due: DueDate, person: string | null, day: string): string {
  const who = person ? `your ${person}` : 'you';
  const line = {
    soon: `Thinking of ${who}, with ${day} coming up.`,
    today: `Thinking of ${who} today.`,
    passed: `Thinking of ${who} ${day}.`, // "this week"
  }[due.moment];
  return ` Something on their calendar may weigh on them: say hello, then only that you are thinking of them, with no question and nothing about what it is, and let them lead ("Hey Riley. ${line}").`;
}

/** "tomorrow", "Friday", "next Tuesday": the date's day in the caller's zone. */
function dayWord(days: number, now: Date, zone: string): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  const at = new Date(now.getTime() + days * 86_400_000);
  const weekday = at.toLocaleDateString('en-US', { weekday: 'long', timeZone: zone });
  if (Math.abs(days) < 7) return weekday;
  return days > 0 ? `next ${weekday}` : 'last week';
}

export interface DateCandidate {
  direction: string;
  /** Sensitive: a tender hello, no anniversary party alongside it. */
  careful: boolean;
  factId: string;
  facts: Record<string, string>;
  /** Sensitive only: the hello's base direction in place of greetingDirection(). */
  base?: string;
  /** The arbiter's winner only: when `spoken` names the date, claims the opener and marks it raised. */
  commit: (spoken: string) => void;
}

/**
 * The one date for the hello, or undefined: flag off, not a verified member, crisis risk
 * on this call or lately, none due, too slow or a read failed. No side effects; never rejects.
 */
export async function dateFor(
  caller: { userId?: string; sessionId: string; zone?: string },
  deps: Omit<DatesRecallDeps, 'userId' | 'sessionId' | 'timezone'> & {
    env?: Env;
    /** A crisis-level signal in the last CRISIS_QUIET_DAYS (unreadable counts as one). */
    recentCrisis?: (userId: string) => Promise<boolean>;
  } = {}
): Promise<DateCandidate | undefined> {
  const { userId, sessionId } = caller;
  const { env = process.env, recentCrisis = crisisLately, ...load } = deps;
  if (!flagOn('DATES_IN_HELLO', env) || !verifiedMember(userId)) return undefined;
  try {
    if (crisisRiskThisCall(sessionId)) return undefined;
    const zone = caller.zone ?? userTimeZone({ sessionId, userId }) ?? 'UTC';
    const { createDatesRecall, personFromLabel, sensitiveDate } =
      await import('../../intelligence/index.js');
    const dates = createDatesRecall({ ...load, userId, sessionId, timezone: zone });
    const [crisis] = await Promise.all([recentCrisis(userId), dates.ready]);
    const due = crisis ? null : dates.due?.();
    if (!due) return undefined;
    return candidate(
      userId,
      due,
      dates.raised,
      { sensitiveDate, personFromLabel },
      {
        now: load.now?.() ?? new Date(),
        zone,
      }
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'No date for the hello');
    return undefined;
  }
}

/** The picked date as the director's candidate; commit() writes only when the line says it. */
function candidate(
  userId: string,
  due: DueDate,
  raised: () => void,
  rules: Pick<typeof import('../../intelligence/index.js'), 'sensitiveDate' | 'personFromLabel'>,
  at: { now: Date; zone: string }
): DateCandidate {
  const careful = rules.sensitiveDate(due.what);
  const day = careful && due.moment === 'passed' ? 'this week' : dayWord(due.days, at.now, at.zone);
  const commit = (spoken: string): void => {
    if (!lineAsks(spoken, `${due.what} ${day}`))
      return log.info({ id: due.id }, 'Date not said in the hello: left for a later call');
    claimOpenerFollowUp(userId, 'greeting-date');
    raised();
  };
  log.info({ id: due.id, moment: due.moment, careful }, 'Date for the hello');
  const person = careful ? rules.personFromLabel(due.what) : null;
  return { ...wording(due, day, careful, person), careful, factId: due.id, commit };
}

/** What the director is told: presence for a sensitive date, the date in their words otherwise. */
function wording(
  due: DueDate,
  day: string,
  careful: boolean,
  person: string | null
): Pick<DateCandidate, 'direction' | 'facts' | 'base'> {
  if (careful)
    return {
      direction: presenceDirection(due, person, day),
      base: PRESENCE_GREETING_DIRECTION,
      facts: {},
    };
  const facts = { 'something on their calendar': due.what, when: day };
  return { direction: ORDINARY[due.moment], facts };
}

/** A member's own account: never a phone:, device: or anon: id, which anyone can present. */
const verifiedMember = (id: string | undefined): id is string =>
  isMemberIdentity(id) && !isUnverifiedUserId(id);

/** The pondered ask's 14-day window; no database to read counts as a crisis. */
async function crisisLately(userId: string): Promise<boolean> {
  const db = getFirestoreDb();
  return db ? hadRecentCrisis(db, userId) : true;
}
