/**
 * A gentle check-in for a classifier-only crisis read (CRISIS_IMMINENT_SOFT_CHECK=on, off by default).
 *
 * Prod, the 7 days to 2026-10-16: the classifier alone escalated 21 harmless
 * turns, each with pattern=none. On 10-15 19:25:52 the caller said "I'm not
 * online, we're talking directly", the read was imminent and the reply became
 * the 911 script; "If you call my mom" got a 988 line, and the caller said
 * "You're out of control." The agreement gate (crisis-agreement.ts) never
 * touches an imminent read.
 *
 * With the flag on, such a read of a short turn about the call itself, in a
 * call whose every caller turn so far used only call and function words, asks
 * one direct question instead (CHECK_IN_LINE), at most once per call. The
 * answer is read here, never by the LLM: only a clear yes clears it; a
 * pattern, risk content, a no or anything unclear gets the full response the
 * read called for. Silence: agents/safety/crisis-check-in-silence.ts.
 *
 * @module CrisisSoftCheck
 */

import { createLogger } from '../../utils/safe-logger.js';
import { endorses, hasRiskContent } from './crisis-agreement.js';
import type { CrisisVerdict, PatternOutcome } from './crisis-classifier.js';
import type { CrisisDetectionResult } from './crisis-guard.js';

const log = createLogger({ module: 'CrisisSoftCheck' });

export function resolveCrisisSoftCheck(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.CRISIS_IMMINENT_SOFT_CHECK?.trim().toLowerCase() === 'on';
}

/** What Ferni says instead of the script. */
export const CHECK_IN_LINE = 'Hey, I want to make sure I heard you right. Are you safe right now?';
/** After a quiet spell, or a question cut off: once. */
export const CHECK_IN_REPEAT = "Take your time, I'm right here. Are you safe right now?";
/** After a second quiet spell: the numbers, softly. Never read as a question. */
export const CHECK_IN_RESOURCES =
  "I'm still here with you. If things ever feel like too much, you can call or text 988 any time, and if you're in danger right now, please call 911.";

/** The reply after a clear yes. */
export const CHECK_IN_CLEARED = `[SAFETY - CHECK-IN CLEARED]
You just asked whether they were safe, and they told you they are. Take them at their word.
1. Carry on with what you were talking about
2. If it fits, own the mix-up in a few light words ("sorry, I think I misheard you there")
3. Do not ask about their safety again or mention hotlines unless they bring up something heavier`;

/** Every later reply in a call whose check-in was cleared. */
export const CHECK_IN_RESOURCES_NOTE =
  'Safety note: earlier they told you they are safe; do not bring it up. If they ask for help or something heavier comes up, offer the 988 Suicide & Crisis Lifeline (call or text 988), or 911 in an emergency';

/** How long after the check-in the caller's reply still counts as the answer. */
const ANSWER_WINDOW_MS = 180_000;
/** One check-in per call: remembered this long (a long call). */
const CALL_TTL_MS = 4 * 60 * 60 * 1000;
/** One turn's repeat reads (preemptive and final request) arrive within this. */
const SAME_TURN_MS = 30_000;
const MAX_CALLS = 512;

export interface CheckInTurn {
  pattern: PatternOutcome;
  verdicts: ReadonlyArray<CrisisVerdict | null>;
  latest: string;
  earlier?: readonly string[];
  companion?: string;
}

/**
 * Whether this classifier-escalated turn may get the check-in instead. Needs:
 * no pattern reading at all (words or voice); reads valid, about the caller,
 * and not two agreeing on imminent; the turn about the call and every earlier
 * caller turn in call vocabulary; no risk content or warning sign in the
 * caller's words, nor risk or a safety question in Ferni's line. Errors
 * escalate.
 */
export function checkInEligible(turn: CheckInTurn, patterns: CrisisDetectionResult): boolean {
  try {
    const { pattern, latest, companion, earlier = [] } = turn;
    if (pattern !== 'none' || !patternsQuiet(patterns) || !readsAllow(turn.verdicts)) return false;
    if (typeof latest !== 'string' || !latest.trim()) return false;
    if (endorses(latest) || !aboutTheCall(latest)) return false;
    const said = [latest, ...earlier];
    if (!earlier.every(callVocabulary) || said.some(risky)) return false;
    // Absent is not unreadable: with no Ferni line there is nothing to check.
    return companion === undefined || !ferniRisky(companion);
  } catch {
    return false;
  }
}

/** The pattern guard read nothing at all into the turn, words or voice. */
const patternsQuiet = (p: CrisisDetectionResult): boolean =>
  !p.isCrisis && p.severity === 0 && p.indicators.length === 0 && p.subject !== 'third_party';

/**
 * At least one risky read; every read valid and about the caller; and either
 * one risky read or all of them crisis. Two agreeing imminent reads always
 * escalate: a reflexive "yeah, I'm fine" must not outweigh them.
 */
function readsAllow(verdicts: ReadonlyArray<CrisisVerdict | null>): boolean {
  const reads: ReadonlyArray<CrisisVerdict | null> = Array.isArray(verdicts) ? verdicts : [];
  // A read that timed out or failed might have been the one that saw risk.
  const valid = (v: CrisisVerdict | null): v is CrisisVerdict =>
    v !== null && (v.risk === 'imminent' || v.risk === 'crisis' || v.risk === 'none');
  const raised = reads.filter((v) => v?.risk !== 'none');
  return (
    reads.length > 0 &&
    reads.every(valid) &&
    reads.every((v) => v?.subject === 'self') &&
    raised.length > 0 &&
    (raised.length === 1 || raised.every((v) => v?.risk === 'crisis'))
  );
}

/**
 * A risk lexicon cannot vouch for a statement: it misses "just bought
 * charcoal and tape for the bathroom" (blind set) and 32 of 38 short probes
 * ("I took them all.", fixtures/crisis-short-probes-2026-10-17.json). So the
 * words must show the turn is about the call, as the prod false alarms were:
 * at most 8 words, no digits, only function and call words.
 */
const MAX_WORDS = 8;
const FUNCTION_WORDS = new Set(
  (
    "i i'm im i've ive i'd i'll me my you you're your u we we're our us it it's its " +
    'the a an and or but so if to of in on at for with about this that these those ' +
    "is are was were be been am do does did don't doesn't didn't not no yes yeah yep " +
    "ok okay oh um uh hey hi hello what what's why how who where when can could would will just " +
    'really actually her him his she he they them their'
  ).split(' ')
);
/** The call, the line, who Ferni would call: what the prod false alarms were about. */
const CALL_WORDS = new Set(
  (
    'call calls calling called phone number online offline talk talking talked directly line ' +
    'wait waiting text texting texted message video app connection hear hearing heard mean meant ' +
    'mom mum dad mother father sister brother wife husband friend ferni fern'
  ).split(' ')
);

/** Every word a function or call word: an earlier turn with nothing else in it. */
export function callVocabulary(text: string): boolean {
  if (typeof text !== 'string' || /[0-9]/.test(text)) return false;
  const said = plain(text).split(' ').filter(Boolean);
  return said.length <= MAX_WORDS && said.every((w) => FUNCTION_WORDS.has(w) || CALL_WORDS.has(w));
}

function aboutTheCall(latest: string): boolean {
  return (
    callVocabulary(latest) &&
    plain(latest)
      .split(' ')
      .some((w) => CALL_WORDS.has(w))
  );
}

/**
 * Warning signs the shared lexicon lacks (stopping treatment, giving things
 * away, goodbyes, not being around): checked here, not added to the shared
 * list (crisis-agreement.ts), so the agreement gate is unchanged.
 */
const WARNING_SIGNS =
  /\b(?:therap\w*|meds?|medication|pills?|stopp?(?:ed|ing)?|cancel\w*|giv\w* (?:\w+ ){0,2}(?:away|stuff|things|belongings)|won't be|not be (?:around|here|there)|be there|good ?bye|bye|see you|miss (?:you|me)|love (?:you|her|him|them)|sorry|forgive|tell (?:her|him|them|everyone|my)|take care of|after i|when i'm gone|last time|one last|find me|in the morning|can't|cant)\b/;
/** A warning sign the shared lexicon may miss. Backstop: call vocabulary also excludes these words. */
export const hasWarningSign = (text: string): boolean =>
  typeof text !== 'string' || WARNING_SIGNS.test(plain(text));
const risky = (text: string): boolean =>
  typeof text !== 'string' || hasRiskContent(text) || hasWarningSign(text);

/** Ferni asked about their safety, or offered help: the read may be answering that. */
const SAFETY_TALK =
  /\b(?:safe|safety|hurt (?:yourself|you)|harm\w*|988|911|lifeline|crisis|suicid\w*|therap\w*|okay\?)/;
/** "I'll call you right back the second I hang up" is phone talk (prod 10-15 19:25:52). */
const ferniRisky = (companion: string): boolean =>
  typeof companion !== 'string' ||
  hasRiskContent(companion.replace(/\bhang(?:ing|s)? (?:up|tight|on)\b/gi, ' ')) ||
  SAFETY_TALK.test(lower(companion));

const lower = (text: string): string =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′´`ʼʹ＇]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
/** Letters, apostrophes and spaces only. */
const plain = (text: string): string =>
  lower(text)
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Letters, apostrophes, spaces and pause marks only: digits ("911") or emoji are never a clear yes. */
const BARE = /^[a-z' .,!?…-]+$/;

const LEAD =
  '(?:oh|ah|um|uh|hmm|yes|yeah|yep|yup|yea|ya|ok|okay|sure|totally|absolutely|definitely|of course|hey|fern|ferni)';
const ME = "(?:i'm|im|i am)";
const SAFE_WORD = '(?:safe|fine|okay|ok|good|alright|all right|great)';
const ADVERB = '(?:totally|completely|perfectly|really|all|just|so|very|absolutely|definitely)';
const THAT = "(?:that's|thats|that is|it's|its|it is)";
/** A statement of safety or of a misunderstanding: never bare assent ("yes" may mean "you heard me right"). */
const CLEAR = [
  `${ME} (?:${ADVERB} )?${SAFE_WORD}`,
  `${THAT} not (?:what i meant|like that|what i was saying)`,
  "i didn't mean (?:it|that)(?: like that)?",
  '(?:you|u) (?:misheard|misunderstood)(?: me)?',
  "(?:all|we're|were) good",
  'nothing like that',
  `${ME} not in (?:any )?danger`,
].join('|');
const TRAIL = '(?:thanks|thank you|ferni|fern|really|i promise|promise|for real|i swear)';
/** The whole reply is a clear yes: nothing of its own beyond it. */
const CLEAR_YES = new RegExp(
  `^(?:${LEAD} )*(?:${CLEAR})(?: (?:and |so |but )?(?:${LEAD} )*(?:${CLEAR}))*(?: ${TRAIL})*$`
);

export type CheckInAnswer = 'safe' | 'escalate' | 'repeat';

/**
 * The caller's reply to "are you safe right now?". Only a clear yes is safe:
 * a pattern, risk content, a warning sign, a no, or anything else escalates.
 */
export function readCheckInAnswer(latest: string, pattern: PatternOutcome): 'safe' | 'escalate' {
  try {
    if (pattern !== 'none' || risky(latest)) return 'escalate';
    const said = plain(latest);
    if (!BARE.test(lower(latest)) || !said || said.split(' ').length > 16) return 'escalate';
    return CLEAR_YES.test(said) ? 'safe' : 'escalate';
  } catch {
    return 'escalate';
  }
}

interface CallState {
  /** The check-in turn's words and when Ferni asked. */
  turn?: string;
  at: number;
  /** The call's latest caller turn: the call is forgotten CALL_TTL_MS after it. */
  seen: number;
  /** The crisis reading the check-in stood in for: the response an unclear answer gets. */
  crisis?: CrisisDetectionResult;
  /** A caller turn in this call used words outside call vocabulary, or risk words. */
  unvetted: boolean;
  repeat?: string;
  answer?: { turn: string; outcome: 'safe' | 'escalate' };
}

const calls = new Map<string, CallState>();

function stateFor(sessionId: string, now: number): CallState {
  for (const [id, s] of calls) if (now - s.seen > CALL_TTL_MS) calls.delete(id);
  let state = calls.get(sessionId);
  if (!state) {
    if (calls.size >= MAX_CALLS) {
      const oldest = calls.keys().next().value;
      if (oldest !== undefined) calls.delete(oldest);
    }
    state = { at: now, seen: now, unvetted: false };
    calls.set(sessionId, state);
  }
  return state;
}

/**
 * Every caller turn passes here (reply gate and turn pipeline): one with
 * words outside call vocabulary, or risk words, rules out the check-in for
 * the rest of the call, whatever window either path keeps.
 */
export function noteCallerTurn(sessionId: string, latest: string, now: number = Date.now()): void {
  if (!sessionId) return;
  const state = stateFor(sessionId, now);
  state.seen = now;
  if (!callVocabulary(latest) || risky(latest)) state.unvetted = true;
}

/** One turn can be read twice, first from a partial transcript ("I'm not online"). */
function sameTurn(turn: string, latest: string): boolean {
  const [a, b] = [plain(turn), plain(latest)].sort((x, y) => x.length - y.length);
  if (a === b) return true;
  return a.length >= 8 && a.includes(' ') && b.startsWith(a);
}

/**
 * Take this call's one check-in for this turn: true when the call has none
 * yet and no unvetted caller turn, or this is the same turn read again.
 */
export function claimCheckIn(
  sessionId: string,
  latest: string,
  crisis: CrisisDetectionResult,
  now: number = Date.now()
): boolean {
  if (!sessionId) return false;
  const state = stateFor(sessionId, now);
  if (state.turn !== undefined) {
    if (now - state.at > SAME_TURN_MS || !sameTurn(state.turn, latest)) return false;
    if (state.crisis && crisis.severity > state.crisis.severity) state.crisis = crisis;
    return true;
  }
  if (state.unvetted) return false;
  Object.assign(state, { turn: latest, at: now, crisis });
  log.info({ outcome: 'asked' }, 'CRISIS_SOFT_CHECK');
  return true;
}

/** The reply gate asked on this turn: the turn pipeline may soften its own read of it. */
export function askedThisTurn(
  sessionId: string,
  latest: string,
  now: number = Date.now()
): boolean {
  const state = sessionId ? calls.get(sessionId) : undefined;
  if (state?.turn === undefined || now - state.at > SAME_TURN_MS) return false;
  return sameTurn(state.turn, latest);
}

/** The call's check-in was answered with a clear yes. */
export function checkInCleared(sessionId: string): boolean {
  return (sessionId ? calls.get(sessionId) : undefined)?.answer?.outcome === 'safe';
}

const QUESTION = plain('Are you safe right now?');
const ASKING = [CHECK_IN_LINE, CHECK_IN_REPEAT].map(plain);

/**
 * The caller answering the check-in: their reading, and the crisis response
 * an escalation gets. Only after Ferni's whole question was spoken (`cut`: the
 * line was interrupted); a cut-off question gets one repeat. Null when this
 * turn is not an answer.
 */
export function checkInAnswer(
  sessionId: string,
  turn: { latest: string; companion?: string; pattern: PatternOutcome; cut?: boolean },
  now: number = Date.now()
): { outcome: CheckInAnswer; crisis: CrisisDetectionResult } | null {
  const state = sessionId ? calls.get(sessionId) : undefined;
  if (state?.turn === undefined || !state.crisis || now - state.at > ANSWER_WINDOW_MS) return null;
  const { crisis } = state;
  if (state.answer) {
    return sameTurn(state.answer.turn, turn.latest)
      ? { outcome: state.answer.outcome, crisis }
      : null;
  }
  const asked =
    typeof turn.companion === 'string' ? plain(turn.companion.replace(/<[^>]*>/g, ' ')) : '';
  if (!asked || !ASKING.some((line) => line.startsWith(asked) || asked.includes(line))) return null;
  const outcome = answerOf(state, turn, asked.includes(QUESTION) && turn.cut !== true);
  if (outcome === 'repeat') return { outcome, crisis };
  state.answer = { turn: turn.latest, outcome };
  log.info({ outcome: outcome === 'safe' ? 'cleared' : 'escalated' }, 'CRISIS_SOFT_CHECK');
  return { outcome, crisis };
}

/** A whole question gets a reading; a cut-off one is asked once more unless the words are risky. */
function answerOf(
  state: CallState,
  turn: { latest: string; pattern: PatternOutcome },
  whole: boolean
): CheckInAnswer {
  if (whole) return readCheckInAnswer(turn.latest, turn.pattern);
  if (turn.pattern !== 'none' || risky(turn.latest)) return 'escalate';
  if (state.repeat !== undefined && !sameTurn(state.repeat, turn.latest)) return 'escalate';
  if (state.repeat === undefined) log.info({ outcome: 'repeated' }, 'CRISIS_SOFT_CHECK');
  state.repeat ??= turn.latest;
  return 'repeat';
}

/** For tests: forget every call. */
export function resetCrisisSoftCheck(): void {
  calls.clear();
}
