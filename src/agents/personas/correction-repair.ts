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
import { carriesDistress } from './turn-distress.js';

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

/**
 * REPAIR_UNEARNED=on (#3490): the caller sets the record straight on something
 * Ferni never said ("No, Lisbon. Not Lisburn." after "Lisbon in the spring").
 * isCorrection rightly ignores it, but with no note the model owns a miss it
 * never made ("I totally misunderstood that"). The note fires only when the
 * whole turn is the putting-straight, never on a turn that says anything more:
 * the red team's hard news ("No, my mom, not my dad. She won't wake up.") and
 * polite refusals got it, so a missed note is the price of precision (verify
 * of #3491).
 */
function unearnedRepairEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.REPAIR_UNEARNED === 'on';
}

const SETS_STRAIGHT = /^\s*(?:no|nope|nah|wait)\b/i;
/** The "no, no," or "wait," the caller opens with: not their version of anything. */
const OPENER = /^\s*(?:(?:no|nope|nah|wait)\b[\s,.;:!?\u2013\u2014-]*)+/i;
/** Where one clause ends and the next starts: "Lisbon. Not", "Thursday, not", "Tuesday — Thursday". */
const BREAK = /(?:[,.;:!?\u2013\u2014]|\s-{1,2}(?=\s))/;
/** A polite no ("no thanks", "no worries", "not a fan, but thanks"): it declines, it puts nothing straight. */
const POLITE_NO = /\b(?:thanks|thank you|no worries|no problem|not a (?:fan|problem))\b/i;
/** The caller's version and the thing ruled out are each a name or a short thing, not a sentence. */
const MAX_PHRASE_WORDS = 3;
/** The word a "not ..." clause rules out, as isCorrection's contrast reads it. */
const RULES_OUT = new RegExp(`^${CONTRAST.source}`, 'i');
/** Never a name or a thing being ruled out: "not him", "not anyone". */
const NOT_A_NAME = new Set(
  'me him her them us myself yourself himself herself themselves anyone anybody anything everyone everybody everything someone somebody something'.split(
    ' '
  )
);
/**
 * A line about how someone is, never a correction: "I'm not okay", "he's not
 * sorry", "I'm fine, not upset", "it's not fine".
 */
const STATE_LINE =
  /\b(?:(?:i['’]?m|i am|you['’]re|you are|he['’]?s|he is|she['’]?s|she is|they['’]re|they are|we['’]re|we are)\b[^.!?;]*|(?:it['’]?s|it is)\s+)\bnot\b/i;
/** Weary or stuck, which carriesDistress lets through ("so tired", "I can't"): no note either. */
const WEARY = /\b(?:tired|can['’]?t|cannot)\b/i;
/** How an offer opens: "Want me to", "Should I", "Do you want". */
const OFFER_OPENS = /^(?:want|should|do you|shall|can i)\b/i;
/** "Lisburn's" and "Lisburn", "managers" and "manager", are one word. */
const bare = (word: string): string => word.toLowerCase().replace(/'?s$/, '');
/** Ferni's lines that a ruled-out word is looked for in, his last one included. */
const UNEARNED_LOOKBACK = 6;
/** The caller's turns read for distress, this one included. */
const DISTRESS_LOOKBACK = 3;

/** Whether the word is in Ferni's last few lines ("Lisburn's" and plurals count). */
function ferniSaid(word: string, ferni: string[]): boolean {
  const his =
    ferni
      .slice(-UNEARNED_LOOKBACK)
      .join(' ')
      .match(/[a-z][a-z'-]*/gi) ?? [];
  return his.some((w) => bare(w) === bare(word));
}

/** Ferni asked or offered something ("Want me to...?"): a "no" answers him, it corrects nothing. */
function askedOrOffered(line: string): boolean {
  const sentences = (line.match(/[^.!?]+[.!?]*/g) ?? []).map((s) => s.trim());
  return /\?\W*$/.test(line.trim()) || sentences.some((s) => OFFER_OPENS.test(s));
}

/**
 * The "not Y" clause when the caller's whole turn is the putting-straight: an
 * opener ("no", "wait"), then "X, not Y" or "not Y, X" with any break between
 * ("X. Not Y", "not Y — X"), plus at most a bare restatement of X or Y
 * ("No, Lisbon, not Lisburn. Lisbon."). null when the turn says anything else,
 * whatever words it uses ("No, my son, not my daughter. He's missing."), or
 * is a polite no.
 */
export function wholeTurnRuleOut(said: string): string | null {
  if (POLITE_NO.test(said)) return null;
  const clauses = said
    .replace(OPENER, '')
    .split(BREAK)
    .map((c) => c.trim().replace(/\s+/g, ' ').toLowerCase())
    .filter(Boolean);
  const [first = '', second = '', ...more] = clauses;
  const notFirst = first.startsWith('not ');
  if (!second || notFirst === second.startsWith('not ')) return null;
  const [ruledOut, theirs] = notFirst ? [first, second] : [second, first];
  const phrases = [theirs, ruledOut.slice('not '.length)];
  if (phrases.some((p) => p.split(' ').length > MAX_PHRASE_WORDS)) return null;
  return more.every((c) => c === ruledOut || phrases.includes(c)) ? ruledOut : null;
}

/**
 * A whole-turn "No, X, not Y." or "No, not Y. X." (wholeTurnRuleOut) whose Y
 * is in none of Ferni's last few lines, questions included (a guess he asked
 * about is his to own). Never a reply to his question or offer, a line about
 * how someone is, or a turn in distress (`earlier`: the caller's turns before
 * this one, oldest first): a missed note costs little, one on a hard turn
 * costs the friendship.
 */
export function isUnearnedCorrection(
  said: string,
  ferni: string[],
  earlier: readonly string[] = []
): boolean {
  if (!SETS_STRAIGHT.test(said) || ABOUT_SAYING.test(said) || STATE_LINE.test(said)) return false;
  if (askedOrOffered(ferni.at(-1) ?? '') || WEARY.test(said)) return false;
  const word = RULES_OUT.exec(wholeTurnRuleOut(said) ?? '')?.[1]?.toLowerCase();
  if (!word || NOT_A_THING.has(word) || NOT_A_NAME.has(word)) return false;
  if (ferniSaid(word, ferni)) return false;
  return ![...earlier.slice(-(DISTRESS_LOOKBACK - 1)), said].some((t) => carriesDistress(t));
}

export const UNEARNED_NOTE =
  "They're putting it straight, but you never said the thing they're ruling out. Take their version. Don't apologise or say you misunderstood unless your own last line really had it wrong.";

export function settledNote(earlier: string[]): string {
  const quoted = earlier.map((c) => `"${clip(c)}"`).join('; ');
  return `Earlier on this call they corrected you (${quoted}): go by what they said, never your old version.`;
}

interface MessageView {
  type?: string;
  role?: string;
  textContent?: string;
}

/**
 * The caller's words this reply answers, Ferni's lines and the caller's turns
 * before them (oldest first), turn notes aside.
 */
function linesOf(chatCtx: llm.ChatContext): {
  said: string;
  ferni: string[];
  callerBefore: string[];
} {
  const ferni: string[] = [];
  const callerBefore: string[] = [];
  let latest: string[] = [];
  for (const item of chatCtx.items as MessageView[]) {
    const text = item.type === 'message' ? (item.textContent?.trim() ?? '') : '';
    if (!text || text.startsWith(TURN_CONTEXT_HEADER)) continue;
    if (item.role === 'assistant') {
      ferni.push(text);
      callerBefore.push(...latest);
      latest = [];
    } else if (item.role === 'user') latest.push(text);
  }
  return { said: latest.join(' '), ferni, callerBefore };
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
  const repair = correctionRepairEnabled(env);
  const unearnedOn = unearnedRepairEnabled(env);
  if (!repair && !unearnedOn) return '';
  const { said, ferni, callerBefore } = linesOf(chatCtx);
  const unearned = (): boolean => {
    const hit = unearnedOn && Boolean(said) && isUnearnedCorrection(said, ferni, callerBefore);
    if (hit) log.info({}, 'CORRECTION_UNEARNED');
    return hit;
  };
  if (!repair) return unearned() ? UNEARNED_NOTE : '';
  const correcting = Boolean(said) && isCorrection(said, ferni);
  const carried = correcting ? remember(session, said) : (corrections.get(session) ?? []);
  // An earlier one is anything not this turn's words (or a partial of them).
  const earlier = carried.filter((c) => !said.startsWith(c)).reverse();
  if (correcting) log.info({ carried: carried.length }, 'CORRECTION_REPAIR');
  const friend = env.FRIEND_REPAIR === 'on';
  return [
    correcting ? correctionNote(said, friend, scriptFree) : unearned() ? UNEARNED_NOTE : '',
    earlier.length ? settledNote(earlier) : '',
  ]
    .filter(Boolean)
    .join(' ');
}
