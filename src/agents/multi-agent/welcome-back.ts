/**
 * When they last talked: the system prompt's line for it (agent-setup.ts) and
 * the RECENT_CALL_RESTRAINT rule that goes with it, plus the shared sensitive-
 * thread check (health, grief, money, relationships stay theirs to raise).
 *
 * @module agents/multi-agent/welcome-back
 */

import { isSensitiveThread } from '../../memory/recall/sensitive.js';
import {
  anyStillAhead,
  labelTimes,
  memoryTimeLabelsOn,
  whenSaid,
} from '../../understanding/temporal/index.js';
import { calendarDaysSince } from '../../utils/calendar-days.js';
import { isValidTimeZone } from '../../utils/time-zone.js';
import type { LastCall } from './teammate-relationship.js';

export { isSensitiveThread };

/** The lines the system prompt gets for when they last talked, by calendar days. */
function lastTalkedAwareness(
  daysSince: number,
  env: Record<string, string | undefined> = process.env
): string[] {
  const line =
    daysSince === 0
      ? 'You talked earlier today.'
      : daysSince === 1
        ? 'You talked yesterday.'
        : daysSince < 7
          ? `Last talked ${daysSince} days ago.`
          : daysSince < 30
            ? `It's been about ${Math.round(daysSince / 7)} weeks since you last talked.`
            : `It's been a while - about ${Math.round(daysSince / 30)} month${daysSince > 45 ? 's' : ''} since you last talked.`;
  if (!recentCallRestraintEnabled(env)) return [line];
  return [line, daysSince === 0 ? `${SAME_DAY_AWARENESS} ${LET_THEM_LEAD}` : LET_THEM_LEAD];
}

/**
 * RECENT_CALL_RESTRAINT (on unless "off"). Live call 10-17, second call that day: given
 * "You talked earlier today." and the last call's summary, the first reply was "I was
 * actually just thinking about how things went with Clayton and Brent after you talked
 * with Jordan earlier." Seth: "You did jump the gun." The summary stays; it just doesn't
 * get to open the call, and at most one light thing is asked about, never a presumed outcome.
 */
export function recentCallRestraintEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.RECENT_CALL_RESTRAINT !== 'off';
}

const SAME_DAY_AWARENESS =
  'You already talked today, so start like friends picking back up: a plain hello and how they are doing.';

const LET_THEM_LEAD =
  'Let them lead the start of the call; do not open with what you talked about last time. If you bring it up, ask about one light thing as a short open question ("How did that go?"). Never guess how something went, and never string several people\'s names together.';

/** LET_THEM_LEAD for a last call whose summary names something still ahead. */
const LET_THEM_LEAD_AHEAD =
  'Let them lead the start of the call; do not open with what you talked about last time. Something from last time has not happened yet, so if you bring it up, ask about it as still to come ("Is that still coming up?"). Never talk about it as done, never guess how something went, and never string several people\'s names together.';

/**
 * LET_THEM_LEAD for a last call under an hour ago whose summary names something
 * still ahead: no example question at all. Dev, 2026-11-23: with the normal
 * rule's "How did that go?" in the prompt, a return call two minutes after
 * "tournament this Saturday" asked "How did the snack mom duty end up going?".
 */
const LET_THEM_LEAD_AHEAD_SOON =
  "Let them lead the start of the call; do not open with what you talked about last time. Something from last time has not happened yet: never talk about it as done, never ask how it went, and never string several people's names together.";

/**
 * lastTalkedAwareness for the last call itself, in calendar days where the
 * caller is. With MEMORY_TIME_LABELS (#2530): under an hour ago, or under a
 * day with no known zone, it says how long ago the last call was ("Your last
 * call was a few minutes ago."; dev read a bare "You talked a minute ago." as
 * this call and told the caller they had never mentioned it), never a day word
 * that could be wrong. When the summary names something still ahead, the rule
 * never offers "How did that go?": an hour or more ago it asks about it as to
 * come, under an hour it asks nothing about it.
 */
export function lastCallAwareness(
  last: LastCall,
  summary: string | undefined,
  env: Record<string, string | undefined> = process.env
): string[] {
  const lines = lastTalkedAwareness(calendarDaysSince(last.at, last.now, last.zone), env);
  if (!memoryTimeLabelsOn(env)) return lines;
  const [at, now] = [new Date(last.at).getTime(), new Date(last.now).getTime()];
  const ago = now - at;
  const dayWordUnsure = !isValidTimeZone(last.zone) && ago < 86_400_000;
  if (Number.isFinite(ago) && (ago < 3_600_000 || dayWordUnsure)) {
    lines[0] = `Your last call was ${whenSaid(at, now, last.zone)}.`;
  }
  const ahead =
    summary !== undefined && anyStillAhead(labelTimes(summary, at, now, last.zone).states);
  if (!ahead) return lines;
  // Under an hour ago they have only just said it: "still coming up?" would sound odd.
  const rule = ago >= 3_600_000 ? LET_THEM_LEAD_AHEAD : LET_THEM_LEAD_AHEAD_SOON;
  return lines.map((l) => l.replace(LET_THEM_LEAD, rule));
}
