/**
 * The time of day a caller said, read strictly, for Bookends (ENGAGEMENT-SPEC
 * §2.3): "biopsy Friday at 3pm" happens at 15:00. It only ever fills a date
 * fact's `at`; the day is timex.ts's alone and this never changes it.
 *
 * A missing time is fine, a wrong one is not: it would time a reminder. So
 * only forms with one reading count:
 *
 * - "3pm", "3:30 p.m.", "12pm" (12:00), "12am" (00:00): an hour 1 to 12 with am or pm;
 * - "15:00", "08:30", "00:15": a 24-hour clock, zero-padded or 13 to 23
 *   ("10:30" and "3:30" could be morning or night, so they don't count);
 * - "noon", "12 noon"; "midnight", "12 midnight".
 *
 * Everything else gives null: a bare hour ("at 3"), "5.30", "5 30", "three
 * o'clock", a range ("2-4pm"), "10 to 5pm", "before 3pm", and two different
 * times ("3pm or 4pm").
 *
 * @module intelligence/world-model/dates/strict-time
 */

export interface StrictTime {
  /** HH:MM, 24-hour, in the caller's zone. */
  at: string;
  /** 12am or midnight: which night is easy to get wrong, so the day is confirmed first. */
  midnight: boolean;
  /** The words with the time (and an "at" or "around" before it) taken out. */
  rest: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');

const NUMBER =
  '\\d|\\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|half|quarter)';
/** Words that make a time the edge of something ("before 3pm", "2 to 4pm", "10 to 5pm"). */
const EDGE = '(?:to|till|til|until|through|thru|past|after|before|by|from|between|and|or|-|–)';
/** Not part of a longer number or a range: no number, dot, colon or edge word just before... */
const NOT_AFTER = `(?<!(?:${NUMBER})[\\s.,:;/'-]*)(?<!\\b${EDGE}\\s*)(?<![-–]\\s*)`;
/** ...and no number, edge word or am/pm just after. */
const NOT_BEFORE = `(?![\\s.,:;/-]*\\d)(?!\\s*${EDGE}\\s*(?:${NUMBER}))(?!\\s*[ap]m\\b)`;

const RULES: ReadonlyArray<[RegExp, (m: RegExpExecArray) => string | null]> = [
  // "3pm", "3:30 pm", "12am": 12am is 00:00 and 12pm is 12:00.
  [/\b(\d{1,2})(?::([0-5]\d))? ?([ap])m\b/, (m) => {
    const h = Number(m[1]);
    if (h < 1 || h > 12) return null;
    return `${pad((h % 12) + (m[3] === 'p' ? 12 : 0))}:${m[2] ?? '00'}`;
  }],
  // "15:00", "08:30": only an hour that can't be a 12-hour one.
  [/\b(0\d|1[3-9]|2[0-3]):([0-5]\d)\b/, (m) => `${m[1]}:${m[2]}`],
  [/\b(?:(?:12|twelve) ?)?noon\b/, () => '12:00'],
  [/\b(?:(?:12|twelve) ?)?midnight\b/, () => '00:00'],
]; // prettier-ignore

/** An "at", "around" or "about" just before a time goes with it. */
const LEAD_IN = /(?:\b(?:at|around|about)\s+)+$/;

/** The one time of day `text` names, or null when it names none, or more than one. */
export function strictTimeOfDay(text: string): StrictTime | null {
  const words = text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/(?<![a-z])([ap])\. ?m\b\.?/g, '$1m');
  const found: Array<{ at: string; start: number; end: number; midnight: boolean }> = [];
  for (const [pattern, read] of RULES) {
    const guarded = new RegExp(`${NOT_AFTER}${pattern.source}${NOT_BEFORE}`, 'g');
    for (const m of words.matchAll(guarded)) {
      const at = read(m);
      const start = m.index ?? 0;
      if (!at || found.some((f) => start < f.end && f.start < start + m[0].length)) continue;
      found.push({ at, start, end: start + m[0].length, midnight: at.startsWith('00:') && !/^0/.test(m[0]) }); // prettier-ignore
    }
  }
  if (found.length === 0 || new Set(found.map((f) => f.at)).size > 1) return null;
  let rest = words;
  for (const f of [...found].sort((a, b) => b.start - a.start)) {
    const before = rest.slice(0, f.start).replace(LEAD_IN, '');
    rest = `${before} ${rest.slice(f.end)}`;
  }
  return {
    at: found[0].at,
    midnight: found.some((f) => f.midnight),
    rest: rest.replace(/\s+/g, ' ').trim(),
  };
}
