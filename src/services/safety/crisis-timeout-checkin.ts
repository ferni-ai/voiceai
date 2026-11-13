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
 * A plain denial ("i'm not going to hurt myself") is not a reason to check in, but only in a line
 * that neither hedges, limits it in time, turns on a contrast nor asks; one mention the caller
 * does not deny keeps the check-in.
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
  `can'?t go on${CLAUSE_END}`,
  `nothing (?:left )?to live for|no point (?:in )?(?:living|being alive|going on)|tired of living${CLAUSE_END}|(?:give|giving|gave|given) up on (?:life|living)`,
  "(?:hope|wish) i (?:don'?t|never|won'?t) wake up|never want to wake up",
  '(?:want(?:ed)? to|wanna|wish i could) disappear (?:forever|for good)',
  // self-harm
  'self[- ]?harm\\w*|(?:cut|cutting|hurt|hurting|harm|harming|burn|burning|starv\\w*) myself',
  '(?:hang|shoot|drown|stab) myself|slit my wrists?',
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

/**
 * A plain denial right before the words: "i'm not going to hurt myself", "i would never kill
 * myself", "no thoughts of hurting myself", "no voy a hacerme daño". Wanting not to ("i don't
 * want to die"), trying not to, couldn't and didn't are not denials and stay check-ins.
 */
const DENIED_BEFORE = new RegExp(
  `(?:${[
    "\\b(?:i'?m|am|will|would|i'?ll) not",
    "\\b(?:won'?t|wouldn'?t)",
    '\\bnever(?: (?:would|will|ever))?',
    '\\bno (?:plans?|intention|intent|thoughts?|desire|urges?) (?:to|of|about)',
    '\\b(?:no|nunca|jam(?:á|a)s) (?:voy a|pienso|planeo|me voy a)',
  ].join('|')})(?: (?:ever|even))?(?: (?:going|gonna|planning|about|trying)(?: (?:to|on))?)?\\s+$`
);

/**
 * A line that hedges, limits a denial in time, turns on a contrast or asks keeps every check-in:
 * "i won't hurt myself tonight", "maybe i won't", "i'd never kill myself, but...".
 */
const HEDGED = new RegExp(
  [
    '\\?',
    "\\b(?:if|unless|maybe|probably|might|hope|think|can'?t promise|cannot promise|not sure|don'?t know (?:if|whether))\\b",
    '\\b(?:yet|tonight|today|now|again|any ?more|but|though|although)\\b',
    '\\b(?:no s(?:é|e)|tal vez|quiz(?:á|a)s?|ojal(?:á|a)|todav(?:í|i)a|esta noche|hoy|ahora|otra vez|ya no|pero|aunque)(?![\\wáéíóúñ])',
  ].join('|')
);

const wordsOf = (line: string): string =>
  line.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'");

/** Words the caller plainly denies, in a line with no hedge, are not a reason to check in. */
const denied = (words: string, at: number): boolean =>
  DENIED_BEFORE.test(words.slice(0, at)) && !HEDGED.test(words);

/**
 * Which check-in words the caller's line holds and does not deny: 'es' for the Spanish ones, or
 * null for none. One mention that is not denied is enough.
 */
function checkinWordsIn(line: string): 'en' | 'es' | null {
  const words = wordsOf(line);
  const said = (list: RegExp): boolean =>
    [...words.matchAll(list)].some((m) => !denied(words, m.index ?? 0));
  if (said(ES)) return 'es';
  return said(EN) ? 'en' : null;
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
 * patterns read nothing, not a re-ask, and the latest caller line holds a check-in word.
 */
function timeoutCheckin(
  turn: {
    verdict: CrisisVerdict | null;
    decision: { action: string };
    reask?: boolean;
    latest: string;
  },
  env: Env = process.env
): string | null {
  if (!flagOn('CRISIS_TIMEOUT_CHECKIN', env) || turn.verdict !== null) return null;
  if (turn.decision.action !== 'pass' || turn.reask) return null;
  if (!checkinWordsIn(turn.latest)) return null;
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
