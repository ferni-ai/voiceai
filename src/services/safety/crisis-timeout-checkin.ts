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

import { ReadableStream } from 'node:stream/web';
import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { CrisisVerdict } from './crisis-classifier.js';
import { TALK_TO_988, TALK_TO_988_ES } from './crisis-guard-replies.js';
import { withReplyEnding } from './crisis-grounded-screen.js';

const log = createLogger({ module: 'CrisisTimeoutCheckin' });

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
function checkinWordsIn(line: string): 'en' | 'es' | null {
  const words = wordsOf(line);
  if (ES.test(words)) return 'es';
  return EN.test(words) ? 'en' : null;
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
    decision: { action: string; about?: string };
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
 * Whether a pattern-guided turn's reply still gets the check-in's ending: the flag on, the read
 * failed, a guide about the caller (never someone else), not a re-ask, a check-in word in the
 * latest line, and the escalation kept a guide or none (never a script). On main these lines read
 * as nothing and got the check-in; a guide must never leave their 988 to the model alone.
 */
function guideKeepsEnding(
  turn: Parameters<typeof timeoutCheckin>[0],
  next: { action: string } | null,
  env: Env = process.env
): boolean {
  if (!flagOn('CRISIS_TIMEOUT_CHECKIN', env) || turn.verdict !== null) return false;
  if (turn.decision.action !== 'guide' || turn.decision.about || turn.reask) return false;
  return next?.action !== 'replace' && !!checkinWordsIn(turn.latest);
}

/**
 * The check-in reply with what it lacks said after it, in the caller's language: the safety
 * question when it asked none, the 988 line when it never said 988; both when the model gave
 * nothing. With `ends`, only once it settles true.
 */
function withCheckinEnding<T>(
  reply: ReadableStream<T> | null,
  caller: { latest: string },
  ends: Promise<boolean> | true = true
): ReadableStream<T | string> {
  const lang = checkinWordsIn(caller.latest) === 'es' ? 'es' : 'en';
  const empty = new ReadableStream<T>({ start: (controller) => controller.close() });
  return withReplyEnding(reply ?? empty, async (said) => {
    if (!(await ends)) return '';
    const missing = [
      ASKED_SAFE.test(said) ? '' : SAFETY_QUESTION[lang],
      SAID_988.test(said) ? '' : LINE_988[lang],
    ].filter(Boolean);
    if (!missing.length) return '';
    return `${said.trim() ? ' ' : ''}${missing.join(' ')}`;
  });
}

type GateTurn = Omit<Parameters<typeof timeoutCheckin>[0], 'verdict'> & { env?: Env };
type GateEnds<G extends GateTurn, D> = Pick<G, 'decision' | 'reask'> & {
  escalation: Promise<D | { action: 'guide'; guidance: string } | null>;
  ends: Promise<boolean>;
};

/**
 * The voice gate's touch points (crisis-gate.ts), one call each. `escalation`: once the read
 * is in, a failed read (null) on check-in words is the check-in and every other read goes to
 * `escalate`; no live read (undefined) escalates nothing. `ending`: on the check-in's reply only,
 * code says what the reply lacks; every other reply passes untouched. `turn` and `guided` do the
 * same for a pattern-guided turn whose read failed (guideKeepsEnding).
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
  /** The gate turn: `escalation`, and whether a pattern-guided reply still gets the ending. */
  turn<D extends { action: string }, G extends GateTurn>(
    read: Promise<CrisisVerdict | null | undefined>,
    turn: G,
    escalate: (verdict: CrisisVerdict | null) => Promise<D | null>
  ): GateEnds<G, D> {
    const escalation = checkin.escalation(read, turn, escalate);
    const ends = Promise.all([read, escalation]).then(
      ([verdict, next]) =>
        verdict !== undefined && guideKeepsEnding({ ...turn, verdict }, next, turn.env),
      () => false
    );
    return { decision: turn.decision, reask: turn.reask, escalation, ends };
  },
  /** A pattern-guided reply, with the check-in's ending once `ends` settles true. */
  guided<T>(
    reply: ReadableStream<T>,
    ends: Promise<boolean> | undefined,
    caller: { latest: string }
  ): ReadableStream<T | string> {
    return ends ? withCheckinEnding(reply, caller, ends) : reply;
  },
  ending<T>(
    reply: ReadableStream<T> | null,
    decision: { guidance?: string },
    caller: { latest: string }
  ): ReadableStream<T | string> | null {
    return decision.guidance === TIMEOUT_CHECKIN ? withCheckinEnding(reply, caller) : reply;
  },
};
