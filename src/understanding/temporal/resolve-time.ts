/**
 * What a caller said about time, against the moment they said it, as a
 * half-open interval in their zone. Rules beat LLMs here (HeidelTime 80.0 vs
 * GPT-3.5 40.5 on TempEval-3), so no model does the sum: rules.ts first, then
 * compromise-dates 3.9.0, on the caller's calendar (civil.ts). compromise
 * loads in ~0.5-1 s, lazily via warmTemporalParser(); until then rules only.
 * @module understanding/temporal/resolve-time
 */
import { createLogger } from '../../utils/safe-logger.js';
import * as C from './civil.js';
import type { Certainty, CivilTime, Precision, RuleContext, Tense } from './civil.js';
import { customRules, narrowToTimeOfDay } from './rules.js';

const log = createLogger({ module: 'Understanding.Temporal' });

/** Epoch ms, end exclusive (RFC 5545 DTEND). */
export interface ResolvedTime {
  start: number;
  endExclusive: number;
  precision: Precision;
  certainty: Certainty;
  canonical: string;
}

interface DatesDoc {
  dates: (opts: object) => { get: () => Array<{ start?: string; end?: string }> };
}
interface Nlp {
  (text: string): DatesDoc;
  plugin: (p: unknown) => void;
}
let nlp: Nlp | undefined;
let loading: Promise<boolean> | undefined;

/** Load compromise + compromise-dates once; false (retried next call) if they do not load. */
export async function warmTemporalParser(): Promise<boolean> {
  loading ??= Promise.all([import('compromise'), import('compromise-dates')]).then(
    ([core, dates]) => {
      (core.default as unknown as Nlp).plugin(dates.default);
      nlp = core.default as unknown as Nlp;
      return true;
    },
    (error: unknown) => {
      log.warn({ error: String(error) }, 'compromise-dates did not load; custom rules only');
      loading = undefined;
      return false;
    }
  );
  return loading;
}

const COUNT = '\\d{1,2}|an?|one|two|three|four|five|six|seven|eight|nine|ten|a couple of|a few';
const DURATION = new RegExp(`\\bfor (${COUNT}) (day|week)s?\\b`);
const NUMBER_WORDS = COUNT.split('|');
const WEEK_OF = /\bthe week of\b(.+)$/;
const VAGUE = /\b(about|around|couple|few|or so|roughly)\b/;

/** compromise's reading as whole days, or an hour for a point in time ("in an hour"). */
function fromCompromise(text: string, now: C.Naive, ctx: RuleContext): CivilTime | null {
  const today = new Date(now).toISOString().slice(0, 16);
  const hit = nlp?.(text).dates({ today, timezone: 'UTC' }).get()[0];
  const s = Date.parse(String(hit?.start));
  if (Number.isNaN(s)) return null;
  const e = Date.parse(String(hit?.end)) || s;
  // A past report that compromise put in the future is kept but flagged.
  const vague = VAGUE.test(text) ? 'assumed' : 'exact';
  const certainty = ctx.tense === 'past' && s > now ? 'ambiguous' : vague;
  if (e - s < C.MINUTE_MS && s - C.midnight(s) < C.DAY_MS - C.MINUTE_MS) {
    const canonical = `compromise:${new Date(s).toISOString().slice(0, 16)}`;
    return C.interval(s, s + C.HOUR_MS, 'hour', certainty, canonical);
  }
  const [start, end] = [C.midnight(s), C.midnight(e) + C.DAY_MS];
  const canonical = `compromise:${C.ymd(start)}/${C.ymd(end)}`;
  if (end - start === C.DAY_MS) return C.day(start, certainty, canonical);
  const precision = end - start === 7 * C.DAY_MS && C.weekdayOf(start) === 1 ? 'week' : 'span';
  return C.interval(start, end, precision, certainty, canonical);
}

const resolveDay = (text: string, now: C.Naive, ctx: RuleContext): CivilTime | null =>
  customRules(text, ctx) ?? fromCompromise(text, now, ctx);

/** Days in "for N days/weeks". */
function spanDays(count: string, unit: string): number {
  const fuzzy = count === 'a couple of' ? 2 : count === 'a few' ? 3 : 0;
  const n =
    fuzzy || (/\d/.test(count) ? Number(count) : Math.max(1, NUMBER_WORDS.indexOf(count) - 1));
  return n * (unit === 'week' ? 7 : 1);
}

/** The interval a phrase names; "for N days" runs from its start, "the week of X" is X's ISO week. */
function resolveCivil(text: string, now: C.Naive, ctx: RuleContext): CivilTime | null {
  const dur = DURATION.exec(text);
  const body = dur ? text.replace(dur[0], ' ') : text;
  const weekOf = WEEK_OF.exec(body);
  let base: CivilTime | null;
  if (weekOf) {
    const inner = resolveDay(weekOf[1], now, ctx);
    base =
      inner &&
      C.weekContaining(inner.start, inner.certainty, `week_containing(${inner.canonical})`);
  } else {
    const found = resolveDay(body, now, ctx);
    base = found && narrowToTimeOfDay(found, body);
  }
  if (!dur) return base;
  // "for 3 days" with no start said runs from today, assumed.
  base ??= C.day(ctx.today, 'assumed', 'start=today');
  const days = spanDays(dur[1], dur[2]);
  const end = C.midnight(base.start) + days * C.DAY_MS;
  const certainty = dur[1] === 'a few' ? 'assumed' : base.certainty;
  return C.interval(base.start, end, 'span', certainty, `${base.canonical};span=P${days}D`);
}

/**
 * One time phrase said at `saidAt` by a caller in `callerTimeZone` (unknown =
 * UTC), forward for plans, backward with `tense: 'past'`. Null when it names no time.
 */
export function resolveTime(
  phrase: string,
  saidAt: number,
  callerTimeZone?: string,
  { tense = 'future' }: { tense?: Tense } = {}
): ResolvedTime | null {
  if (!phrase || !Number.isFinite(saidAt)) return null;
  const zone = C.zoneOrUtc(callerTimeZone);
  const now = C.toNaive(saidAt, zone);
  const civil = resolveCivil(phrase.toLowerCase(), now, { today: C.midnight(now), tense });
  if (!civil) return null;
  const { start, end, ...rest } = civil;
  return { start: C.toInstant(start, zone), endExclusive: C.toInstant(end, zone), ...rest };
}

/** Every time a longer text names, one per clause ("first round 10-19, final 10-26"). */
export function resolveTimes(
  text: string,
  saidAt: number,
  callerTimeZone?: string
): ResolvedTime[] {
  return text
    .split(/[,;!?]|\.(?=\s|$)|\b(?:and|but|then)\b/)
    .map((clause) => resolveTime(clause, saidAt, callerTimeZone))
    .filter((r): r is ResolvedTime => r !== null);
}
