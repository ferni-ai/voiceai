/**
 * A date the caller told Ferni about can be the hello's one thread
 * (DATES_IN_HELLO, default off; docs/plans/2026-10-31-right-moment-memory.md §5.5).
 *
 * - The same date the first recall note would raise (dates/recall.ts): a one-time
 *   date from 10 days ago to 3 days ahead, or a yearly one within the week.
 * - Picking writes nothing. Only the arbiter's winner calls commit(), which claims
 *   the call's opener and marks the date raised, so a date that loses to their own
 *   reason, call news or a letter is still there for a later call.
 * - A sensitive date (sensitive-date.ts, where unsure counts) is presence, never a
 *   question and never its topic word: "Thinking of your grandma, with Thursday
 *   coming up." The person comes from the label, else "you".
 * - Verified members only (never a phone:, device: or anon: id, which anyone can
 *   present), never with crisis risk on the call. greeting-direction.ts adds
 *   the rest of the order: an unknown caller and a same-day return get none.
 *
 * @module agents/multi-agent/greeting-date
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import type { DatesRecallDeps, DueDate } from '../../intelligence/index.js';
import { claimOpenerFollowUp } from '../../memory/index.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import { isUnverifiedUserId } from '../../services/identity/unverified-user-id.js';
import { crisisRiskThisCall } from '../../services/safety/index.js';
import { userTimeZone } from '../../utils/caller-time-zone.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'greeting-date' });

/** An ordinary date, by where it falls. "soon" is the spec's wording, word for word. */
const ORDINARY: Record<DueDate['moment'], string> = {
  soon: ' There is something on their calendar soon: you may say hello, then mention it once and let them take it where they want, naming it in their words ("Hey Riley. Priya\'s visit is Saturday, isn\'t it. Looking forward to it?"). Not a report.',
  today:
    " Something on their calendar is today: you may say hello, then wish them well for it once, naming it in their words (\"Hey Riley. Priya's visit is today, isn't it. Hope it's a good one.\"). Not a report.",
  passed:
    ' Something on their calendar just happened: you may say hello, then ask how it went once, as an open question, naming it in their words ("Hey Riley. How was Priya\'s visit?"). Never guess how it went. Not a report.',
};

/** A sensitive date: who it is about and the day, never what it is, never a question. */
function presenceDirection(due: DueDate, person: string | null, day: string): string {
  const who = person ? `your ${person}` : 'you';
  const line = {
    soon: `Thinking of ${who}, with ${day} coming up.`,
    today: `Thinking of ${who} today.`,
    passed: `Thinking of ${who} this week.`,
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
  /** The arbiter's winner only: claims the opener and marks the date raised. */
  commit: () => void;
}

/**
 * The one date for the hello, or undefined: flag off, not a verified member, crisis risk
 * on this call, none due, too slow or a read failed. No side effects; never rejects.
 */
export async function dateFor(
  caller: { userId?: string; sessionId: string; zone?: string },
  deps: Omit<DatesRecallDeps, 'userId' | 'sessionId' | 'timezone'> & { env?: Env } = {}
): Promise<DateCandidate | undefined> {
  const { userId, sessionId } = caller;
  const { env = process.env, ...load } = deps;
  if (!flagOn('DATES_IN_HELLO', env) || !isMemberIdentity(userId) || isUnverifiedUserId(userId))
    return undefined;
  try {
    if (crisisRiskThisCall(sessionId)) return undefined;
    const zone = caller.zone ?? userTimeZone({ sessionId, userId }) ?? 'UTC';
    const { createDatesRecall, personFromLabel, sensitiveDate } =
      await import('../../intelligence/index.js');
    const dates = createDatesRecall({ ...load, userId, sessionId, timezone: zone });
    await dates.ready;
    const due = dates.due?.();
    if (!due) return undefined;
    const careful = sensitiveDate(due.what);
    const day = dayWord(due.days, load.now?.() ?? new Date(), zone);
    const commit = (): void => {
      claimOpenerFollowUp(userId, 'greeting-date');
      dates.raised();
    };
    log.info({ id: due.id, moment: due.moment, careful }, 'Date for the hello');
    const base = { careful, factId: due.id, commit };
    if (careful)
      return {
        ...base,
        direction: presenceDirection(due, personFromLabel(due.what), day),
        facts: {},
      };
    const facts = { 'something on their calendar': due.what, when: day };
    return { ...base, direction: ORDINARY[due.moment], facts };
  } catch (error) {
    log.warn({ error: String(error) }, 'No date for the hello');
    return undefined;
  }
}
