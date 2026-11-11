/**
 * When they last talked: the system prompt's line for it (agent-setup.ts) and
 * the RECENT_CALL_RESTRAINT rule that goes with it, plus the shared sensitive-
 * thread check (health, grief, money, relationships stay theirs to raise).
 *
 * @module agents/multi-agent/welcome-back
 */

import { isSensitiveThread } from '../../memory/recall/sensitive.js';

export { isSensitiveThread };

/** The lines the system prompt gets for when they last talked (agent-setup.ts). */
export function lastTalkedAwareness(
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
