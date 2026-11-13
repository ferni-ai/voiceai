/**
 * CRISIS_TIMEOUT_CHECKIN (off by default): a crisis read that could not be made is never a quiet
 * "none" when the caller's own words touch on their safety.
 *
 * The classifier resolves to no verdict on a timeout, an error or an unusable reply
 * (crisis-classifier.ts), and the gate then speaks an ordinary reply. On main, "i have a bottle
 * of pills and i want to take them all" with the classifier timing out got no 988 at all. With
 * the flag on, a turn the patterns read as nothing, whose read failed, and whose latest caller
 * line holds a word from EN_WORDS or ES_WORDS gets the check-in: Ferni asks, warmly, whether
 * they are safe right now, offers 988, and carries on. Never the crisis script, and never
 * silent: when the reply lacks 988 or a safety question, code says them after it
 * (withCheckinEnding).
 *
 * A plain denial ("i'm not going to hurt myself") is not a reason to check in, but only when the
 * line is that denial and nothing more (a "lol", "i'm good" or "promise" aside) and nothing on the
 * call carried risk before it. Anything else keeps the check-in: a false check-in is far cheaper
 * than a missed one.
 *
 * Only adds: never on a turn the patterns, a gentle offer or a re-ask already handle, and never
 * when the classifier answered (a "none" is a read). Notes no call risk; logs counts only.
 *
 * @module CrisisTimeoutCheckin
 */

import { ReadableStream } from 'node:stream/web';
import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { CrisisVerdict } from './crisis-classifier.js';
import { TALK_TO_988, TALK_TO_988_ES } from './crisis-guard-replies.js';
import { withReplyEnding } from './crisis-grounded-screen.js';

const log = createLogger({ module: 'CrisisTimeoutCheckin' });

type Env = Record<string, string | undefined>;

/** The words end their clause: "i can't go on." but not "i can't go on the trip". */
const CLAUSE_END = '(?=\\s*(?:[.!?,;]|$))';

/**
 * Words next to risk to the caller's own life or safety. Narrow on purpose, unlike the agreement
 * gate's list (hasRiskContent), which only keeps an escalation: this one adds a check-in.
 */
const EN_WORDS = [
  // dying and suicide
  'suicid\\w*|kill(?:ing)? myself|kms|ctb|unaliv\\w*|sewer ?slide|want(?:ed)? to die\\b(?! (?:my|your|her|his|their|the|it)\\b)|wanna die|wish i (?:was|were) dead|better off dead',
  "end(?:ing)? (?:it all|my life|things)|take my (?:own )?life|no reason to live|better off without me|don'?t want to (?:be here|live|exist|wake up)|not (?:be|being) (?:here|around|alive) (?:anymore|tomorrow)",
  "can'?t go on (?:anymore|any ?longer|living)|can'?t (?:do|take) (?:this|it) anymore|can'?t keep going(?: like this| anymore| on)\\b",
  `can'?t go on${CLAUSE_END}(?![^.!?]*\\b(?:so|too) (?:full\\b(?! of)|stuffed\\b))`, // not "i'm so full"
  `nothing (?:left )?to live for|no point (?:in )?(?:living|being alive|going on)|tired of living${CLAUSE_END}`,
  '(?:give|giving|gave|given) up on (?:life|living)(?! (?:admin|hacks?|goals?|coaching|insurance|advice|lessons))',
  "(?:hope|wish) i (?:don'?t|never|won'?t) wake up|never want to wake up",
  '(?:want(?:ed)? to|wanna|wish i could) disappear (?:forever|for good)',
  // self-harm
  'self[- ]?harm\\w*|(?:cut|cutting|hurt|hurting|harm|harming|burn|burning|starv\\w*) myself',
  'hang myself|slit my wrists?|shoot myself(?! in the (?:foot|feet))',
  'stab myself(?! with (?:a|my|the) (?:fork|pen|pencil|toothpick))',
  'drown myself(?! in (?:work|homework|paperwork|coffee|chocolate|netflix))',
  // means
  'overdos\\w*(?! on\\b)|(?:all|bottle|handful|whole bunch) of (?:my |the |these |those )?(?:pills|meds|tablets)|take them all|swallow(?:ed)? (?:them|it) all|noose|razor ?blades?|gun to my',
  'jump(?:ing)? (?:off|from) (?:a|the|this|that) (?:bridge|roof|building|ledge|cliff|balcony|overpass)|in front of (?:a|the) (?:train|bus|truck|car)',
  // their own safety
  "unsafe|not safe (?:with|around|by) myself|(?:can'?t|don'?t) trust myself|scared of (?:myself|what i (?:might|could|will) do)",
];
const ES_WORDS = [
  'matarme|quitarme la vida|(?:me )?quiero morir(?:me)?|no quiero (?:vivir|seguir viviendo|despertar)|acabar con (?:todo|mi vida)',
  'hacerme da(?:ñ|n)o|cortarme|todas (?:las|mis) pastillas|tomarme todas|no estoy a salvo',
  'suicidarme|suicidio|ahorcarme|lastimarme',
  `no (?:tengo|hay) (?:raz(?:ó|o)n|motivo) para vivir|no vale la pena vivir|ya no (?:puedo|aguanto) m(?:á|a)s${CLAUSE_END}`,
];
const pattern = (list: readonly string[]): RegExp => new RegExp(`\\b(?:${list.join('|')})\\b`, 'g');
const EN = pattern(EN_WORDS);
const ES = pattern(ES_WORDS);

/** Said around a plain denial and nothing more: "lol", "i'm good", "promise", "relax". */
const FILLER = [
  'lol\\w*',
  'lmao',
  'haha\\w*',
  'jaja\\w*',
  'ok(?:ay)?',
  'no',
  'nah',
  'nope',
  'yeah',
  'relax',
  'honestly',
  'seriously',
  '(?:i )?promise',
  "don'?t worry",
  'no worries',
  "i'?m (?:good|fine|ok(?:ay)?|alright)",
  '(?:te )?lo prometo',
  'no te preocupes',
  'tranquil[oa]',
  'estoy bien',
];
/** Filler and plain punctuation only: no other word, no emoji, no question. */
const AROUND = `(?:[\\s.,!]|\\b(?:${FILLER.join('|')})\\b)*`;

/**
 * A plain denial of the words that follow: "i'm not going to", "i would never", "no thoughts of",
 * "no voy a". Wanting not to ("i don't want to die"), trying not to, couldn't and didn't are not
 * denials.
 */
const DENIAL = [
  "(?:i'?m|i am|i will|i would|i'?ll|i'?d|am|will|would) not",
  "(?:i'?m )?not",
  "(?:i )?(?:won'?t|wouldn'?t)",
  "(?:i(?:'?d|'?ll|'?m| would| will| am)? )?never(?: (?:would|will|ever))?",
  "(?:i have |i'?ve |i got |there'?s )?no (?:plans?|intention|intent|thoughts?|desire|urges?) (?:to|of|about)",
  '(?:yo )?(?:no|nunca|jam(?:á|a)s) (?:voy a|pienso|planeo|me voy a)',
];
const DENIED_BEFORE = new RegExp(
  `^${AROUND}(?:${DENIAL.join('|')})(?: (?:ever|even))?(?: (?:going|gonna|planning|about|trying)(?: (?:to|on))?)?\\s+$`
);
const NOTHING_AFTER = new RegExp(`^${AROUND}$`);

const wordsOf = (line: string): string =>
  line.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'");

/** Every check-in word the words hold. */
const mentions = (words: string): RegExpExecArray[] => [
  ...words.matchAll(ES),
  ...words.matchAll(EN),
];

/** The line is a plain denial of this mention and nothing more. */
const plainDenial = (words: string, mention: RegExpExecArray): boolean =>
  DENIED_BEFORE.test(words.slice(0, mention.index)) &&
  NOTHING_AFTER.test(words.slice(mention.index + mention[0].length));

/**
 * Which check-in words the caller's line holds: 'es' for Spanish ones, or null for none. A line
 * that only plainly denies them is none, unless the call carried risk before it.
 */
function checkinWordsIn(line: string, riskBefore = true): 'en' | 'es' | null {
  const words = wordsOf(line);
  const found = mentions(words);
  if (!found.length) return null;
  if (!riskBefore && found.every((mention) => plainDenial(words, mention))) return null;
  return [...words.matchAll(ES)].length ? 'es' : 'en';
}

/** The check-in, as the reply's crisis guidance: the last thing the model reads. */
const TIMEOUT_CHECKIN = `[SAFETY - CHECK-IN]
A safety read of the caller's last words could not be made, and their words touch on their own safety.
1. Check in once, plainly and warmly: are you safe right now?
2. Say they can call or text 988, the Suicide & Crisis Lifeline, any time
3. Then carry on with them, in their language. No crisis script, no list of hotlines, no lecture. If they say they are not safe, or anything about hurting themselves, take it seriously and stay with them`;

const SAFETY_QUESTION = { en: 'Are you safe right now?', es: '¿Estás a salvo ahora mismo?' };
const LINE_988 = { en: TALK_TO_988, es: TALK_TO_988_ES };
const SAID_988 = /(?<!\d)988(?!\d)|\bnine[\s,-]+eight[\s,-]+eight\b/i;
const ASKED_SAFE = /\b(?:safe|safety|a salvo|segur[oa])\b[^.!?]*\?/i;

/**
 * The check-in's guidance for this turn, or null. The flag on, no verdict (the read failed), the
 * patterns read nothing, not a re-ask, and the latest caller line holds a check-in word that is
 * not only plainly denied.
 */
function timeoutCheckin(
  turn: {
    verdict: CrisisVerdict | null;
    decision: { action: string };
    reask?: boolean;
    latest: string;
    /** The caller's earlier lines on this call, oldest first. */
    earlier?: readonly string[];
    /** Risk noted on this call before this turn (callRiskBeforeTurn); unknown counts as risk. */
    priorRisk?: boolean;
  },
  env: Env = process.env
): string | null {
  if (!flagOn('CRISIS_TIMEOUT_CHECKIN', env) || turn.verdict !== null) return null;
  if (turn.decision.action !== 'pass' || turn.reask) return null;
  const riskBefore =
    turn.priorRisk !== false ||
    (turn.earlier ?? []).some((line) => mentions(wordsOf(line)).length > 0);
  if (!checkinWordsIn(turn.latest, riskBefore)) return null;
  log.info({ action: 'guide', source: 'timeout_checkin' }, 'CRISIS_GATE'); // counts, never words
  return TIMEOUT_CHECKIN;
}

/**
 * The check-in reply with what it lacks said after it, in the caller's language: the safety
 * question when it asked none, the 988 line when it never said 988; both when the model gave
 * nothing.
 */
function withCheckinEnding<T>(
  reply: ReadableStream<T> | null,
  caller: { latest: string }
): ReadableStream<T | string> {
  const lang = checkinWordsIn(caller.latest) === 'es' ? 'es' : 'en';
  const empty = new ReadableStream<T>({ start: (controller) => controller.close() });
  return withReplyEnding(reply ?? empty, (said) => {
    const missing = [
      ASKED_SAFE.test(said) ? '' : SAFETY_QUESTION[lang],
      SAID_988.test(said) ? '' : LINE_988[lang],
    ].filter(Boolean);
    if (!missing.length) return '';
    return `${said.trim() ? ' ' : ''}${missing.join(' ')}`;
  });
}

type GateTurn = Omit<Parameters<typeof timeoutCheckin>[0], 'verdict'> & { env?: Env };

/**
 * The voice gate's two touch points (crisis-gate.ts), one call each. `escalation`: once the read
 * is in, a failed read (null) on check-in words is the check-in and every other read goes to
 * `escalate`; no live read (undefined) escalates nothing. `ending`: on the check-in's reply only,
 * code says what the reply lacks; every other reply passes untouched.
 */
export const checkin = {
  async escalation<D>(
    read: Promise<CrisisVerdict | null | undefined>,
    turn: GateTurn,
    escalate: (verdict: CrisisVerdict | null) => Promise<D | null>
  ): Promise<D | { action: 'guide'; guidance: string } | null> {
    const verdict = await read;
    if (verdict === undefined) return null;
    const guidance = timeoutCheckin({ ...turn, verdict }, turn.env);
    return guidance ? { action: 'guide' as const, guidance } : escalate(verdict);
  },
  ending<T>(
    reply: ReadableStream<T> | null,
    decision: { guidance?: string },
    caller: { latest: string }
  ): ReadableStream<T | string> | null {
    return decision.guidance === TIMEOUT_CHECKIN ? withCheckinEnding(reply, caller) : reply;
  },
};
