/**
 * Self-correction: when the caller corrects Ferni, he owns it in one short line
 * and goes by what they said for the rest of the call.
 *
 * On Seth's prod call (2026-10-11) Ferni said "five am on a Sunday" in the
 * small hours, and when he was told he'd taken a wrong turn he kept explaining
 * it ("got my wires crossed") instead of owning it once and moving on. A
 * friend says "ah, my mistake" and uses the right fact from then on.
 *
 * Precision comes first: owning a mistake Ferni never made is its own tell (a
 * reviewed call: "cheerfully accepted blame for a mix-up it had hallucinated").
 * So unlike detectCorrection (services/superhuman/user-corrections.ts), which
 * takes any "No, ..." as a correction, only these count:
 *
 *   explicit   "that's not what I said", "I didn't say that", "you misheard",
 *              "you got that wrong"; or a reply to something he stated that
 *              opens "that's wrong" / "that's not true"
 *   contrast   "<this>, not <that>" where <that> is in something Ferni stated
 *              (not asked) in his last few lines: "Galway, not Dublin"
 *   value      a "No, ..." giving a different time, number or day than the one
 *              Ferni just stated ("No, it's two." after "five am")
 *
 * The correction goes into this reply's turn reminder; later replies on the
 * call are reminded of it, so Ferni doesn't slide back to his version. The
 * durable side already exists: turn-learning.ts records corrections through
 * userCorrections.autoRecord, and memory extraction keeps the new fact.
 * FRIEND_REPAIR=on (friend-repair.ts) keeps a "<this>, not <that>" correction
 * across calls, retires the fact it corrects, and names the miss when owning it.
 *
 * REPAIR_MODE=on enables it (with the mishear checks).
 *
 * @module agents/personas/correction-repair
 */

import type { llm } from '@livekit/agents';

import { createLogger } from '../../utils/safe-logger.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';

const log = createLogger({ module: 'CorrectionRepair' });

export function correctionRepairEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.REPAIR_MODE === 'on';
}

/** About what was said: always a correction of Ferni. */
const ABOUT_SAYING =
  /\b(?:that'?s not what i (?:said|meant)|i (?:didn'?t say|never said) that|not what i meant|you misheard|you (?:got|have) (?:it|that|me) wrong|you'?re wrong)\b/i;
/** Disputing a claim: only at the start of a reply to something Ferni stated ("My boss yelled. That's not right." isn't). */
const DISPUTES =
  /^\s*(?:no,?\s*)?(?:that'?s|that is) (?:wrong|not right|not true|not correct|incorrect)\b/i;
const CONTRAST = /\bnot (?:(?:the|a|an|my|your|his|her|their|our) )?([a-z][a-z'-]{2,})\b/gi;
/** Words after "not" that are hedges, not the thing being corrected ("not really", "not bad"). */
const NOT_A_THING = new Set(
  'really sure that this those these much quite exactly yet even bad good great too very anymore always ever now today tonight right true fault'.split(
    ' '
  )
);
const HOURS = 'one two three four five six seven eight nine ten eleven twelve'.split(' ');
const NUM = `(?:\\d{1,2}(?::\\d{2})?|${HOURS.join('|')})`;
const OF_DAY = "(?:am|pm|a\\.m\\.|p\\.m\\.|o'?clock|in the (?:morning|afternoon|evening)|at night)";
/** A time or a day: "2am", "two in the morning", "it's two", "noon", "Sunday". "That one" or "3 kids" is not. */
const WHEN = new RegExp(
  `\\b${NUM}(?= ?${OF_DAY}(?![a-z]))|\\b\\d{1,2}:\\d{2}\\b|(?<=\\bit'?s |\\bit is )${NUM}\\b|\\b(?:noon|midnight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b`,
  'gi'
);
/** "five" and "5" and "5:00" are one time. */
const normal = (v: string): string => {
  const word = HOURS.indexOf(v);
  return word >= 0 ? String(word + 1) : v.replace(/:00$/, '');
};
const STARTS_NO = /^\s*(?:no|nope|nah)\b/i;

/** Ferni's statements in these lines: sentences that don't end in a question mark. */
function statements(lines: string[]): string {
  return lines
    .flatMap((l) => l.match(/[^.!?]+[.!?]*/g) ?? [])
    .filter((s) => !s.trim().endsWith('?'))
    .join(' ')
    .toLowerCase();
}

const whenIn = (text: string): Set<string> =>
  new Set((text.toLowerCase().match(WHEN) ?? []).map(normal));

/**
 * "<this>, not <that>" where <that> is a word Ferni stated (not asked) in his
 * last few lines: the "not ..." words, where they start, and the word; null when none.
 */
export function contrastWith(
  said: string,
  ferni: string[]
): { text: string; index: number; word: string } | null {
  const stated = new Set(statements(ferni.slice(-3)).match(/[a-z][a-z'-]*/g) ?? []);
  for (const match of said.matchAll(CONTRAST)) {
    const word = (match[1] ?? '').toLowerCase();
    if (!NOT_A_THING.has(word) && stated.has(word)) {
      return { text: match[0], index: match.index ?? 0, word };
    }
  }
  return null;
}

/**
 * Whether the caller's words correct something Ferni said in `ferni` (his
 * recent lines, oldest first; the last one is what they answer).
 */
export function isCorrection(said: string, ferni: string[]): boolean {
  if (ABOUT_SAYING.test(said)) return true;
  const last = statements(ferni.slice(-1));
  if (last && DISPUTES.test(said)) return true;
  if (contrastWith(said, ferni)) return true;
  // "No, it's two." after "five am": a different time or day than the one he gave.
  if (!STARTS_NO.test(said)) return false;
  const his = whenIn(last);
  return his.size > 0 && [...whenIn(said)].some((v) => !his.has(v));
}

/** At most this many corrections are carried, the latest first. */
const MAX_CARRIED = 3;
const MAX_CHARS = 160;

/** Each call's corrections so far, in the caller's words. */
const corrections = new WeakMap<object, string[]>();

/** Keep a correction, replacing an earlier request's partial words for the same turn. */
function remember(session: object, said: string): string[] {
  const kept = (corrections.get(session) ?? []).filter((c) => !said.startsWith(c));
  const next = [...kept, said].slice(-MAX_CARRIED);
  corrections.set(session, next);
  return next;
}

const clip = (text: string): string =>
  text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 3)}...` : text;

/**
 * With FRIEND_REPAIR=on the line names what he had wrong, light only if they are (friend-repair.ts).
 * `scriptFree` (SCRIPT_FREE_REMINDER, script-free.ts): their words only, no quoted line to say.
 */
const OWN_IT = 'Own it in one short line, the way a friend would ("Ah, my mistake.")';
const OWN_IT_FRIEND =
  'Own it in one short line that names what you had wrong, light if they are ("Ha, I had your sister as the one in Denver, my mistake."), plain if not ("My mistake, your brother.")';
const OWN_IT_PLAIN = 'Own it in one short line';
const OWN_IT_FRIEND_PLAIN =
  'Own it in one short line that names what you had wrong, light if they are, plain if not';

export function correctionNote(said: string, friend = false, scriptFree = false): string {
  const own = scriptFree
    ? friend
      ? OWN_IT_FRIEND_PLAIN
      : OWN_IT_PLAIN
    : friend
      ? OWN_IT_FRIEND
      : OWN_IT;
  return `They just corrected you ("${clip(said)}"). ${own}, then go on with what they said. Don't argue, explain why, or repeat your old version.`;
}

export function settledNote(earlier: string[]): string {
  const quoted = earlier.map((c) => `"${clip(c)}"`).join('; ');
  return `Earlier on this call they corrected you (${quoted}): go by what they said, never your old version.`;
}

interface MessageView {
  type?: string;
  role?: string;
  textContent?: string;
}

/** The caller's words this reply answers and Ferni's lines before them, turn notes aside. */
function linesOf(chatCtx: llm.ChatContext): { said: string; ferni: string[] } {
  const ferni: string[] = [];
  let latest: string[] = [];
  for (const item of chatCtx.items as MessageView[]) {
    const text = item.type === 'message' ? (item.textContent?.trim() ?? '') : '';
    if (!text || text.startsWith(TURN_CONTEXT_HEADER)) continue;
    if (item.role === 'assistant') {
      ferni.push(text);
      latest = [];
    } else if (item.role === 'user') latest.push(text);
  }
  return { said: latest.join(' '), ferni };
}

/**
 * The correction notes for this request: owning a correction the caller just
 * made, and the ones made earlier on the call. '' when there are none or
 * REPAIR_MODE is off.
 */
export function correctionNotesFor(
  chatCtx: llm.ChatContext,
  session: object,
  env: Record<string, string | undefined> = process.env,
  scriptFree = false
): string {
  if (!correctionRepairEnabled(env)) return '';
  const { said, ferni } = linesOf(chatCtx);
  const correcting = Boolean(said) && isCorrection(said, ferni);
  const carried = correcting ? remember(session, said) : (corrections.get(session) ?? []);
  // An earlier one is anything not this turn's words (or a partial of them).
  const earlier = carried.filter((c) => !said.startsWith(c)).reverse();
  if (correcting) log.info({ carried: carried.length }, 'CORRECTION_REPAIR');
  const friend = env.FRIEND_REPAIR === 'on';
  return [
    correcting ? correctionNote(said, friend, scriptFree) : '',
    earlier.length ? settledNote(earlier) : '',
  ]
    .filter(Boolean)
    .join(' ');
}
