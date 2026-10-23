/**
 * Rules for what compromise-dates 3.9.0 misses or reads against Ferni's
 * (local test 2026-10-22): bare ordinals ("the 30th") return nothing; "last
 * Monday" said on a Thursday is the Monday before; a weekday said on that
 * weekday is today (#2335 A8: next week's); "this weekend" said on a Sunday is
 * next weekend; "tonight" is the whole day. A modifier moves the day it names
 * ("a week from Thursday", "after the weekend", "the Friday after next"); one
 * no rule here reads leaves the day unsure, never exact (#2482 round 1).
 *
 * @module understanding/temporal/rules
 */
import * as C from './civil.js';
import type { Certainty, CivilTime, RuleContext } from './civil.js';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const ORDINAL = /\b(?:on )?the (\d{1,2})(?:st|nd|rd|th)\b(?!\s+of\b)/;
const RELATIVE_DAY =
  /\b((?:day after |day before )?(?:tomorrow|yesterday)|today|tonight|this (?:morning|afternoon|evening))\b/;
const WEEKDAY = new RegExp(`\\b(?:(last|this past|past|this|next|on) )?(${WEEKDAYS.join('|')})\\b`);
/** Said with a weekday that is today, these make it today's, not next week's (#2335 A8). */
const SAME_DAY = /\b(today|tonight|this morning|this afternoon|this evening|later)\b/;
const WEEKEND = /\b(?:(this|next|last) )?weekend\b/;
const CLOCK = /\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\b/;
const PART = /\b(morning|afternoon|evening|tonight|night)\b/;
const PARTS: Record<string, number[]> = { morning: [6, 12], afternoon: [12, 17] };
const COUNTS = ['a', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const ANCHOR_DAY = `(?:the |this |next )?weekend|(?:this |next )?(?:${WEEKDAYS.join('|')})`;
/** "a week from Thursday", "two weeks from Friday", "3 days from tomorrow". */
const OFFSET_FROM = new RegExp(
  `\\b(\\d{1,2}|an?|${COUNTS.slice(1).join('|')}) (day|week)s? from (.+)$`
);
/** "the Thursday after next", "weekend after next". */
const AFTER_NEXT = new RegExp(`\\b(?:the )?(${WEEKDAYS.join('|')}|weekend) after next\\b`);
/** "after the weekend", "after Monday", "after the 30th"; not "the day after tomorrow". */
const AFTER = new RegExp(
  `(?<!\\bday )\\bafter (${ANCHOR_DAY}|today|tonight|tomorrow|the \\d{1,2}(?:st|nd|rd|th))\\b`
);
/** Words that move a day this file's other rules would read as exact. */
const MODIFIER = /\b(from|after|before|following|weeks?)\b/;
/** Modifiers the relative-day rule reads itself. */
const READ_BY_RELATIVE_DAY = /\bday (?:after|before) (?:tomorrow|yesterday)\b/g;

function isoDate(text: string): CivilTime | null {
  const m = ISO_DATE.exec(text);
  const [y, mo, d] = [Number(m?.[1]), Number(m?.[2]) - 1, Number(m?.[3])];
  if (!m || mo > 11 || d < 1 || d > C.daysInMonth(y, mo)) return null;
  return C.day(Date.UTC(y, mo, d), 'exact', `date=${m[0]}`);
}

/** "the 30th": the next 30th on or after today (the last one, for a past report). */
function ordinal(text: string, ctx: RuleContext): CivilTime | null {
  const n = Number(ORDINAL.exec(text)?.[1]);
  if (!(n >= 1 && n <= 31)) return null;
  const t = new Date(ctx.today);
  const step = ctx.tense === 'past' ? -1 : 1;
  let month = t.getUTCMonth() + (step * n < step * t.getUTCDate() ? step : 0);
  // A month without that day (the 31st in November) rolls on to the next that has it.
  while (C.daysInMonth(t.getUTCFullYear(), month) < n) month += step;
  const dir = step > 0 ? 'next' : 'last';
  return C.day(Date.UTC(t.getUTCFullYear(), month, n), 'exact', `day_of_month=${n};dir=${dir}`);
}

function relativeDay(text: string, ctx: RuleContext): CivilTime | null {
  const word = RELATIVE_DAY.exec(text)?.[1];
  if (!word) return null;
  const sign = word.endsWith('tomorrow') ? 1 : word.endsWith('yesterday') ? -1 : 0;
  const offset = sign * (word.startsWith('day ') ? 2 : 1);
  return C.day(ctx.today + offset * C.DAY_MS, 'exact', `relative_day=${offset}`);
}

/** A past report: the last one before today, or today when the line says so. */
const lastWeekday = (back: number, today: boolean, unsure: boolean): [number, Certainty] =>
  today ? [0, 'exact'] : [-back, unsure ? 'ambiguous' : 'exact'];

/**
 * A weekday. Said on that weekday it is next week's unless the line says today
 * (A8). "Next Friday" while this week's Friday is still to come is the
 * following week's, marked ambiguous. A past report is the last one before today.
 */
function weekday(text: string, ctx: RuleContext): CivilTime | null {
  const m = WEEKDAY.exec(text);
  if (!m) return null;
  const [mod = '', name] = [m[1], m[2]];
  const [target, dow] = [WEEKDAYS.indexOf(name), C.weekdayOf(ctx.today)];
  const ahead = (target - dow + 7) % 7;
  const sameDay = ahead === 0 && SAME_DAY.test(text);
  const at = (offset: number, certainty: Certainty, dir: string): CivilTime =>
    C.day(ctx.today + offset * C.DAY_MS, certainty, `weekday=${name};dir=${dir}`);
  const saysLast = /last|past/.test(mod);
  if (saysLast || (ctx.tense === 'past' && mod !== 'next')) {
    return at(
      ...lastWeekday((dow - target + 7) % 7 || 7, sameDay && !saysLast, !ahead && !saysLast),
      'last'
    );
  }
  if (mod === 'next' && ahead && C.isoIndex(target) > C.isoIndex(dow)) {
    return at(ahead + 7, 'ambiguous', 'next+7d');
  }
  if (ahead === 0 && !sameDay) return at(7, 'assumed', 'next;same_day=+7d');
  return at(ahead, 'exact', 'next');
}

/** Saturday 00:00 to Monday 00:00; on a Sunday "this weekend" is the one under way. */
function weekend(text: string, ctx: RuleContext): CivilTime | null {
  const m = WEEKEND.exec(text);
  if (!m) return null;
  const dow = C.weekdayOf(ctx.today);
  const inWeekend = dow === 0 || dow === 6;
  const mod = m[1] ?? (ctx.tense === 'past' && !inWeekend ? 'last' : 'this');
  const shift = mod === 'next' ? 7 : mod === 'last' ? -7 : 0;
  const start = ctx.today + ((dow === 0 ? -1 : 6 - dow) + shift) * C.DAY_MS;
  const certainty = mod === 'next' && !inWeekend ? 'ambiguous' : 'exact';
  return C.interval(start, start + 2 * C.DAY_MS, 'span', certainty, `weekend=${mod}`);
}

const shift = (t: CivilTime, days: number, canonical: string): CivilTime =>
  C.interval(
    t.start + days * C.DAY_MS,
    t.end + days * C.DAY_MS,
    t.precision,
    t.certainty,
    canonical
  );

/** "a week from Thursday": the anchor day moved on by N days or weeks; "now" is today. */
function offsetFrom(text: string, ctx: RuleContext): CivilTime | null {
  const m = OFFSET_FROM.exec(text);
  if (!m) return null;
  const n = /\d/.test(m[1]) ? Number(m[1]) : Math.max(1, COUNTS.indexOf(m[1]));
  const anchor = /^now\b/.test(m[3]) ? C.day(ctx.today, 'exact', 'now') : customRules(m[3], ctx);
  const days = n * (m[2] === 'week' ? 7 : 1);
  return anchor && shift(anchor, days, `${anchor.canonical};plus=P${days}D`);
}

/** "the Friday after next": the coming one, then a week on. */
function afterNext(text: string, ctx: RuleContext): CivilTime | null {
  const name = AFTER_NEXT.exec(text)?.[1];
  if (name === undefined) return null;
  const ahead = { ...ctx, tense: 'future' as const };
  const anchor = name === 'weekend' ? weekend(name, ahead) : weekday(name, ahead);
  return anchor ? shift(anchor, 7, `${anchor.canonical};after_next=+7d`) : null;
}

/** "after the weekend": open-ended from the day after it ends, so the start is assumed. */
function afterDay(text: string, ctx: RuleContext): CivilTime | null {
  const said = AFTER.exec(text)?.[1];
  const anchor = said ? customRules(said, ctx) : null;
  if (!anchor) return null;
  return C.day(C.midnight(anchor.end - 1) + C.DAY_MS, 'assumed', `after(${anchor.canonical})`);
}

/**
 * The first custom rule that matches, in priority order: modifiers first, then
 * the day they would move. A day matched inside a modifier none of them reads
 * ("the day before Thursday", "Friday next week") is assumed, never exact.
 */
export function customRules(text: string, ctx: RuleContext): CivilTime | null {
  const modified = [offsetFrom, afterNext, afterDay].reduce<CivilTime | null>(
    (hit, rule) => hit ?? rule(text, ctx),
    null
  );
  if (modified) return modified;
  const rules = [ordinal, relativeDay, weekday, weekend];
  const hit = rules.reduce<CivilTime | null>((h, rule) => h ?? rule(text, ctx), isoDate(text));
  const partial = MODIFIER.test(text.replace(READ_BY_RELATIVE_DAY, ' '));
  if (!hit || !partial || hit.certainty !== 'exact') return hit;
  return { ...hit, certainty: 'assumed', canonical: `${hit.canonical};partial` };
}

/** A whole day narrowed by a clock time ("at 3pm", "noon") or a part of the day ("morning"). */
export function narrowToTimeOfDay(base: CivilTime, text: string): CivilTime {
  if (base.precision !== 'day') return base;
  const clock = CLOCK.exec(text) ?? (/\bnoon\b/.test(text) ? ['', '12', '00', 'p'] : null);
  const [h, min] = [Number(clock?.[1]), Number(clock?.[2] ?? 0)];
  if (clock && h <= 12 && min < 60) {
    const hour = (h % 12) + (clock[3] === 'p' ? 12 : 0);
    const start = base.start + hour * C.HOUR_MS + min * C.MINUTE_MS;
    const at = `${hour}:${String(min).padStart(2, '0')}`;
    return C.interval(
      start,
      start + C.HOUR_MS,
      'hour',
      base.certainty,
      `${base.canonical};at=${at}`
    );
  }
  const part = PART.exec(text)?.[1];
  if (!part) return base;
  const [from, to] = PARTS[part] ?? [17, 24];
  const [start, end] = [base.start + from * C.HOUR_MS, base.start + to * C.HOUR_MS];
  return C.interval(start, end, 'part_of_day', base.certainty, `${base.canonical};part=${part}`);
}
