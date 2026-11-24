/**
 * Week-sized modifiers compromise-dates 3.9.0 reads as one exact day (#2499):
 * "the week after next" said Thu 10-22 came back as Mon 11-02 alone, and "the
 * week before Thanksgiving" as 11-19 alone. They name a week, and which week
 * is the listener's reading, so they resolve to a span marked assumed.
 *
 * - "the week before X": deliberately the seven days ending where X starts,
 *   not the calendar week before X's week, so a plan for it is not called
 *   over before X arrives.
 * - "the week after X" / "the week following X": the seven days from where X ends.
 * - "the week after next" / "the week before last" with no day after them
 *   ("next friday", "last christmas"): the ISO week two on, or two back.
 *
 * X must read as one day on its own ("Thanksgiving", "the 15th", "next
 * Friday"). An X that reads as more than a day ("spring break", "next
 * month") or only in part ("labor day weekend" is read as the weekend) gives
 * null, and the phrase goes to the fallback, where spanModifierSays keeps it
 * assumed. Whole words only: "weekend" never matches "week", and "a week
 * before X" (one day, seven days ahead of X) is left to the other rules.
 *
 * Not folded into rules.ts AFTER_NEXT: that rule runs before compromise
 * loads and moves a weekday or weekend by seven days, while a week here may
 * hang on a holiday only compromise reads.
 *
 * @module understanding/temporal/week-modifiers
 */
import * as C from './civil.js';
import type { CivilTime, RuleContext } from './civil.js';

/** Not after a count ("a week before", "two weeks before"): that names one day. */
const WEEK_AROUND =
  /(?<!\b(?:a|an|one|two|three|four|\d{1,2}) )\b(?:the )?week (before|after|following) (.+)$/;
/**
 * What may follow a bare "after next" / "before last": the end, punctuation,
 * or a word that starts a new phrase ("for dinner", "and then"). Anything
 * else ("next semester", "next payday") may be the day itself, so it is not
 * read as the bare week.
 */
const BARE_END =
  '(?:\\s*(?:$|[,.;:!?])|\\s+(?:for|to|at|and|or|so|with|because|i|we|you|he|she|they|it)\\b)';
const ONWARD: Record<string, RegExp> = {
  after: new RegExp(`^next${BARE_END}`),
  before: new RegExp(`^last${BARE_END}`),
};
/**
 * A unit and a direction side by side ("weeks before", "a month after"). Not
 * rules.ts MODIFIER: that one counts a bare "week", which would take "next
 * week" and "in two weeks" off exact.
 */
const SPAN_MODIFIER = /\b(?:weeks?|fortnights?|months?) (?:before|after|following|prior to)\b/;

/** True when the text moves a date by a week or more, so a single day read from it is not exact. */
export const spanModifierSays = (text: string): boolean => SPAN_MODIFIER.test(text);

/** The ISO week two on ("after next") or two back ("before last"). */
function twoWeeksOver(direction: string, ctx: RuleContext): CivilTime {
  const weeks = direction === 'before' ? -2 : 2;
  const start = C.weekContaining(ctx.today, 'assumed', '').start + weeks * 7 * C.DAY_MS;
  const canonical = `week=${weeks > 0 ? 'after_next' : 'before_last'}`;
  return C.interval(start, start + 7 * C.DAY_MS, 'week', 'assumed', canonical);
}

/**
 * A week the phrase names around a day, or null when it names none or names
 * it around something longer than a day. The day itself comes from
 * `anchorOf`, so holidays read the same way they do alone.
 */
export function weekModifier(
  text: string,
  ctx: RuleContext,
  anchorOf: (phrase: string) => CivilTime | null
): CivilTime | null {
  const m = WEEK_AROUND.exec(text);
  if (!m) return null;
  const [, direction, rest] = m;
  const anchor = anchorOf(rest);
  if (!anchor) return ONWARD[direction]?.test(rest) ? twoWeeksOver(direction, ctx) : null;
  if (anchor.end - anchor.start > C.DAY_MS || anchor.canonical.includes(';partial')) return null;
  const before = direction === 'before';
  const start = before
    ? C.midnight(anchor.start) - 7 * C.DAY_MS
    : C.midnight(anchor.end - 1) + C.DAY_MS;
  const certainty = anchor.certainty === 'ambiguous' ? 'ambiguous' : 'assumed';
  const canonical = `week_${before ? 'before' : 'after'}(${anchor.canonical})`;
  return C.interval(start, start + 7 * C.DAY_MS, 'span', certainty, canonical);
}
