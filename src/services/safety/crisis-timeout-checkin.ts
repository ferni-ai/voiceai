/**
 * CRISIS_TIMEOUT_CHECKIN (off by default): a crisis read that could not be made is never a quiet
 * "none" when the caller's own words touch on their safety.
 *
 * The classifier resolves to no verdict on a timeout, an error or an unusable reply
 * (crisis-classifier.ts), and the gate then speaks an ordinary reply. On main, "i have a bottle
 * of pills and i want to take them all" with the classifier timing out got no 988 at all. With
 * the flag on, a turn the patterns read as nothing, whose read failed, and whose latest caller
 * line holds a word from CHECKIN_WORDS gets the check-in: Ferni asks, warmly, whether they are
 * safe right now, offers 988, and carries on. Never the crisis script, and never silent: when the
 * reply lacks 988 or a safety question, code says them after it (withCheckinEnding).
 *
 * Only adds: never on a turn the patterns, a gentle offer or a re-ask already handle, and never
 * when the classifier answered (a "none" is a read). Notes no call risk; logs counts only.
 *
 * @module CrisisTimeoutCheckin
 */

import type { ReadableStream } from 'node:stream/web';
import { flagOn } from '../../config/env-flag.js';
import type { CrisisVerdict } from './crisis-classifier.js';
import { TALK_TO_988, TALK_TO_988_ES } from './crisis-guard-replies.js';
import { withReplyEnding } from './crisis-grounded-screen.js';

type Env = Record<string, string | undefined>;

/**
 * Words next to risk to the caller's own life or safety. Narrow on purpose, unlike the agreement
 * gate's list (hasRiskContent), which only keeps an escalation: this one adds a check-in.
 */
const EN_WORDS = [
  // dying and suicide
  'suicid\\w*|kill(?:ing)? myself|kms|ctb|unaliv\\w*|sewer ?slide|want(?:ed)? to die\\b(?! (?:my|your|her|his|their|the|it)\\b)|wanna die|wish i (?:was|were) dead|better off dead',
  "end(?:ing)? (?:it all|my life|things)|take my (?:own )?life|no reason to live|better off without me|don'?t want to (?:be here|live|exist|wake up)|not (?:be|being) (?:here|around|alive) (?:anymore|tomorrow)",
  "can'?t go on (?:anymore|any ?longer|living)|can'?t (?:do|take) (?:this|it) anymore|can'?t keep going(?: like this| anymore| on)\\b",
  // self-harm
  'self[- ]?harm\\w*|(?:cut|cutting|hurt|hurting|harm|harming|burn|burning|starv\\w*) myself',
  // means
  'overdos\\w*(?! on\\b)|(?:all|bottle|handful|whole bunch) of (?:my |the |these |those )?(?:pills|meds|tablets)|take them all|swallow(?:ed)? (?:them|it) all|noose|razor ?blades?|gun to my',
  'jump(?:ing)? (?:off|from) (?:a|the|this|that) (?:bridge|roof|building|ledge|cliff|balcony|overpass)|in front of (?:a|the) (?:train|bus|truck|car)',
  // their own safety
  "unsafe|not safe (?:with|around|by) myself|(?:can'?t|don'?t) trust myself|scared of (?:myself|what i (?:might|could|will) do)",
];
const ES_WORDS = [
  'matarme|quitarme la vida|(?:me )?quiero morir(?:me)?|no quiero (?:vivir|seguir viviendo|despertar)|acabar con (?:todo|mi vida)',
  'hacerme da(?:ñ|n)o|cortarme|todas (?:las|mis) pastillas|tomarme todas|no estoy a salvo',
];
const pattern = (list: readonly string[]): RegExp => new RegExp(`\\b(?:${list.join('|')})\\b`);
const EN = pattern(EN_WORDS);
const ES = pattern(ES_WORDS);

const wordsOf = (line: string): string =>
  line.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'");

/** Which check-in words the caller's line holds: 'es' for the Spanish ones, or null for none. */
export function checkinWordsIn(line: string): 'en' | 'es' | null {
  const words = wordsOf(line);
  if (ES.test(words)) return 'es';
  return EN.test(words) ? 'en' : null;
}

/** The check-in, as the reply's crisis guidance: the last thing the model reads. */
export const TIMEOUT_CHECKIN = `[SAFETY - CHECK-IN]
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
export function timeoutCheckin(
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
  return checkinWordsIn(turn.latest) ? TIMEOUT_CHECKIN : null;
}

/**
 * The check-in reply with what it lacks said after it, in the caller's language: the safety
 * question when it asked none, the 988 line when it never said 988; both when the model gave
 * nothing.
 */
export function withCheckinEnding<T>(
  reply: ReadableStream<T>,
  latest: string
): ReadableStream<T | string> {
  const lang = checkinWordsIn(latest) === 'es' ? 'es' : 'en';
  return withReplyEnding(reply, (said) => {
    const missing = [
      ASKED_SAFE.test(said) ? '' : SAFETY_QUESTION[lang],
      SAID_988.test(said) ? '' : LINE_988[lang],
    ].filter(Boolean);
    if (!missing.length) return '';
    return `${said.trim() ? ' ' : ''}${missing.join(' ')}`;
  });
}
