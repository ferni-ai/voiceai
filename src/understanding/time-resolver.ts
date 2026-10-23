/**
 * Time phrases resolved by code, not by the model: LLMs do date arithmetic
 * badly (58% on expressions relative to the moment of speaking). Each phrase
 * the reader found is re-read by compromise-dates against the caller's local
 * clock (Intl; node 22 has no Temporal), so "in two weeks" stays right across
 * the DST change. The model's dates stay only where the parser finds nothing,
 * or where its interval contradicts the tense the model read ("I went on
 * Monday" parses as next Monday).
 *
 * @module understanding/time-resolver
 */
import { createRequire } from 'node:module';
import type { TurnReading } from './schema.js';

interface DatesView {
  dates: (o: { timezone: string; today: string }) => {
    json: () => Array<{ dates?: { start?: string; end?: string } }>;
  };
}
type Nlp = ((text: string) => DatesView) & { plugin: (p: unknown) => void };

/**
 * A compromise of our own: its CommonJS build is a separate instance, so the
 * dates plugin never changes how the shared ESM one tags words elsewhere
 * (with the plugin, "noon" stops being a noun for commitment-quality.ts).
 */
let parse: Nlp | null = null;
function parser(): Nlp {
  if (!parse) {
    const require = createRequire(import.meta.url);
    const nlp = require('compromise') as Nlp;
    const dates = require('compromise-dates') as { default?: unknown };
    nlp.plugin(dates.default ?? dates);
    parse = nlp;
  }
  return parse;
}

/** The wall clock in `zone` at `at`, "YYYY-MM-DDTHH:mm". */
export function localClock(at: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

type Relation = TurnReading['time_expressions'][number]['relation'];
function relationOf(start: number, end: number, now: number): Relation {
  if (end < now) return 'past';
  return start > now ? 'future' : 'ongoing';
}

/** The reading with parser-resolved dates, and how many phrases the parser resolved. */
export function resolveTimes(
  reading: TurnReading,
  at: Date,
  zone: string | undefined
): { reading: TurnReading; resolved: number } {
  if (!zone || reading.time_expressions.length === 0) return { reading, resolved: 0 };
  let today: string;
  try {
    today = localClock(at, zone);
  } catch {
    return { reading, resolved: 0 }; // not an IANA zone
  }
  let resolved = 0;
  const times = reading.time_expressions.map((t) => {
    const hit = parser()(t.text).dates({ timezone: zone, today }).json()[0]?.dates;
    if (!hit?.start || !hit.end) return t;
    const rel = relationOf(Date.parse(hit.start), Date.parse(hit.end), at.getTime());
    if (rel !== 'ongoing' && rel !== t.relation) return t;
    resolved++;
    return { ...t, start_iso: hit.start, end_iso: hit.end };
  });
  return { reading: { ...reading, time_expressions: times }, resolved };
}
