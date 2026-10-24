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
 * o'clock", a range ("2-4pm"), "10 to 5pm", and any words with two times in them
 * ("9am, 10am", even "3pm, which is 15:00"). So does a time with a hedge, a zone or
 * an alternative near it ("not at 3pm", "around 3pm", "3pm EST", "3pm, or 4"), a bare
 * number just after it ("3pm, wait, 4", "3pm room 4"), one for something else ("leave
 * at 1pm"), one a part of the day contradicts ("tomorrow morning at 3pm"), and a night
 * word with 1am to 4am ("tomorrow night at 2am": which day's small hours?). A "~" or a
 * "?" is a hedge ("~3pm", "3pm?").
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

const HOUR = '(?:\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';
/**
 * Anything that looks like a time of day, read loosely: "9am", "9.30", "9:30", "noon",
 * "at 9", "9 o'clock". Each is counted before any is trusted, so a rule below that
 * refuses one ("9am" in "9am, 10am") can't hide it and let the other through.
 */
const LOOSE = new RegExp(
  `(?:\\bat )?(?:${HOUR}(?: ?[:.] ?\\d{2})? ?[ap]m\\b|\\d{1,2} ?[:.] ?\\d{2}|` +
    `(?:\\b(?:12|twelve) ?)?\\b(?:noon|midday|midnight)\\b|${HOUR} ?o' ?clock\\b|\\bat ${HOUR}\\b)`,
  'g'
);

/**
 * Words that make a time near them (3 words either side) not the plain time of the
 * thing: a hedge or a limit, a zone or a place, an alternative, a doubt, another time
 * it used to be or a change of mind, or something else that happens then (leaving, a
 * call, a bus, the doors).
 */
const CUES: ReadonlySet<string> = new Set(
  (
    "not no never isn't won't don't can't later earlier than before after by until till til " +
    'around about approximately approx roughly ish maybe perhaps probably possibly or either ' +
    'think guess unsure unless latest earliest sometime past every each daily instead used ' +
    'originally initially supposed moved pushed changed rescheduled hour hours minutes ' +
    'time zone in est edt cst cdt mst mdt pst pdt et ct mt pt gmt bst utc cet cest ist jst ' +
    'eastern central mountain pacific london uk hawaii hst aest aedt york local z zulu ' +
    'leave leaving left depart departing head heading drive driving pick pickup arrive ' +
    'arriving call calling remind wake bus train flight doors wait actually sorry cancelled ' +
    'canceled circa tbc tba tbd'
  ).split(' ')
);

/** A part of the day, and the hours it can be. */
const PARTS: ReadonlyArray<[RegExp, (hour: number) => boolean]> = [
  [/\bmorning\b/, (h) => h < 12],
  [/\bafternoon\b/, (h) => h >= 12 && h < 18],
  [/\bevening\b/, (h) => h >= 16],
  // 1am to 4am with a night word could be either day's small hours ("tomorrow night at
  // 2am" is the day after tomorrow), so it gives none. Midnight is confirmed instead.
  [/\b(?:tonight|night|nights|overnight)\b/, (h) => h >= 18 || h === 0],
  [/\blate\b/, (h) => h === 0 || h > 4],
];

const tokens = (s: string): string[] => s.split(/[^a-z0-9']+/).filter(Boolean);

const NUMBER =
  '\\d|\\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|half|quarter)';
/** Words that make a time the edge of something ("before 3pm", "2 to 4pm", "10 to 5pm"). */
const EDGE = '(?:to|till|til|until|through|thru|past|after|before|by|from|between|and|or|-|–)';
/** Not part of a longer number or a range: no number (then a dot, a colon, a dash, "&", "+"...) or edge word just before... */
const NOT_AFTER = `(?<!(?:${NUMBER})[\\s.,:;/'&+–—-]*)(?<!\\b${EDGE}\\s*)(?<![-–]\\s*)`;
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

/** An "at" just before a time goes with it. */
const LEAD_IN = /(?:\bat\s+)+$/;

/** Lower case, one space, "p.m." as "pm". */
const normalise = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/(?<![a-z])([ap])\. ?m\b\.?/g, '$1m');

/** The one time of day `text` names, or null when it names none, or more than one. */
export function strictTimeOfDay(text: string): StrictTime | null {
  const words = normalise(text);
  // A digit in another script ("３pm") is a number the rules can't see.
  if (/\p{Nd}/u.test(words.replace(/\d/g, ''))) return null;
  // "~3pm", "3pm?", "3~4pm": a hedge, a question or a range, not the time.
  if (/[~?]/.test(words)) return null;
  const loose = [...words.matchAll(LOOSE)];
  if (loose.length !== 1) return null;
  const start = loose[0].index ?? 0;
  const end = start + loose[0][0].length;
  const after = tokens(words.slice(end)).slice(0, 3);
  if ([...tokens(words.slice(0, start)).slice(-3), ...after].some((w) => CUES.has(w))) return null;
  // A bare number just after may be the time it became ("3pm, wait, 4", "3pm room 4").
  if (after.some((w) => /^\d+$/.test(w))) return null;
  const found: Array<{ at: string; start: number; end: number; midnight: boolean }> = [];
  for (const [pattern, read] of RULES) {
    const guarded = new RegExp(`${NOT_AFTER}${pattern.source}${NOT_BEFORE}`, 'g');
    for (const m of words.matchAll(guarded)) {
      const at = read(m);
      const from = m.index ?? 0;
      if (at) found.push({ at, start: from, end: from + m[0].length, midnight: at.startsWith('00:') && !/^0/.test(m[0]) }); // prettier-ignore
    }
  }
  // The one loose time must be the one strict time: a rule that refused it gives none.
  if (found.length !== 1) return null;
  const [f] = found;
  const hour = Number(f.at.slice(0, 2));
  if (PARTS.some(([part, fits]) => part.test(words) && !fits(hour))) return null;
  const before = words.slice(0, f.start).replace(LEAD_IN, '');
  return {
    at: f.at,
    midnight: f.midnight,
    rest: `${before} ${words.slice(f.end)}`.replace(/\s+/g, ' ').trim(),
  };
}
