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
 * With the flag on, such a read of a short turn about the call itself asks
 * one direct question instead (CHECK_IN_LINE), at most once per call. The
 * next turn is read here, never by the LLM: only a clear yes clears it; a
 * pattern, risk content, a no or anything unclear gets the full response the
 * read called for. Silence: agents/safety/crisis-check-in-silence.ts.
 *
 * @module CrisisSoftCheck
 */

import { endorses, hasRiskContent } from './crisis-agreement.js';
import type { CrisisVerdict, PatternOutcome } from './crisis-classifier.js';
import type { CrisisDetectionResult } from './crisis-guard.js';

export function resolveCrisisSoftCheck(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.CRISIS_IMMINENT_SOFT_CHECK?.trim().toLowerCase() === 'on';
}

/** What Ferni says instead of the script. */
export const CHECK_IN_LINE = 'Hey, I want to make sure I heard you right. Are you safe right now?';
/** After a quiet spell with no answer, once. */
export const CHECK_IN_REPEAT = "Take your time, I'm right here. Are you safe right now?";
/** After a second quiet spell: the numbers, softly. */
export const CHECK_IN_RESOURCES =
  "I'm still here with you. If things ever feel like too much, you can call or text 988 any time, and if you're in danger right now, please call 911.";

/** The reply after a clear yes. */
export const CHECK_IN_CLEARED = `[SAFETY - CHECK-IN CLEARED]
You just asked whether they were safe, and they told you they are. Take them at their word.
1. Carry on with what you were talking about
2. If it fits, own the mix-up in a few light words ("sorry, I think I misheard you there")
3. Do not ask about their safety again or mention hotlines unless they bring up something heavier`;

const CHECK_LINES = [CHECK_IN_LINE, CHECK_IN_REPEAT, CHECK_IN_RESOURCES];

/** How long after the check-in the caller's reply still counts as the answer. */
const ANSWER_WINDOW_MS = 180_000;
/** One check-in per call: remembered this long (a long call). */
const CALL_TTL_MS = 4 * 60 * 60 * 1000;
/** The check-in turn's own repeat reads (preemptive and final request) arrive within this. */
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
 * Whether this classifier-escalated turn may get the check-in instead: no
 * pattern reading at all (words or voice), every read valid and about the
 * caller, and no risk content in the caller's words, now or earlier, or in
 * Ferni's line (which may have asked about their safety). Errors escalate.
 */
export function checkInEligible(turn: CheckInTurn, patterns: CrisisDetectionResult): boolean {
  try {
    const { pattern, latest, companion, earlier = [] } = turn;
    if (pattern !== 'none' || patterns.isCrisis) return false;
    if (patterns.severity > 0 || patterns.indicators.length > 0) return false;
    if (patterns.subject === 'third_party' || !readsAllow(turn.verdicts)) return false;
    if (typeof latest !== 'string' || !latest.trim()) return false;
    if (endorses(latest) || !aboutTheCall(latest)) return false;
    // Absent is not unreadable: with no Ferni line there is nothing to check.
    const texts =
      companion === undefined ? [latest, ...earlier] : [latest, ...earlier, phoneTalk(companion)];
    return !texts.some(hasRiskContent);
  } catch {
    return false;
  }
}

/** At least one risky read, every read valid and about the caller. */
function readsAllow(verdicts: ReadonlyArray<CrisisVerdict | null>): boolean {
  const reads: ReadonlyArray<CrisisVerdict | null> = Array.isArray(verdicts) ? verdicts : [];
  // A read that timed out or failed might have been the one that saw risk.
  const valid = (v: CrisisVerdict | null): v is CrisisVerdict =>
    v !== null && (v.risk === 'imminent' || v.risk === 'crisis' || v.risk === 'none');
  return (
    reads.length > 0 &&
    reads.every(valid) &&
    reads.some((v) => v?.risk !== 'none') &&
    reads.every((v) => v?.subject === 'self')
  );
}

/**
 * A risk lexicon cannot vouch for a statement: it misses "just bought
 * charcoal and tape for the bathroom" (blind set) and 32 of 38 short probes
 * ("I took them all.", fixtures/crisis-short-probes-2026-10-17.json). So the
 * words must show the turn is about the call, as the prod false alarms were:
 * at most 8 words, no digits, only function and call words, one call word.
 */
const MAX_WORDS = 8;
const FUNCTION_WORDS = new Set(
  (
    "i i'm im i've ive i'd i'll me my you you're your u we we're our us it it's its " +
    'the a an and or but so if to of in on at for with about this that these those ' +
    "is are was were be been am do does did don't doesn't didn't not no yes yeah yep " +
    "ok okay oh um uh hey hi hello what what's why how who where when can can't could would will just " +
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
/** "I'll call you right back the second I hang up" is phone talk (prod 10-15 19:25:52). */
const phoneTalk = (companion: string): string =>
  companion.replace(/\bhang(?:ing|s)? (?:up|tight|on)\b/gi, ' ');

function aboutTheCall(latest: string): boolean {
  if (/[0-9]/.test(latest)) return false;
  const said = plain(latest).split(' ').filter(Boolean);
  if (said.length === 0 || said.length > MAX_WORDS) return false;
  return (
    said.every((w) => FUNCTION_WORDS.has(w) || CALL_WORDS.has(w)) &&
    said.some((w) => CALL_WORDS.has(w))
  );
}

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
  '(?:oh|ah|um|uh|hmm|haha|hah|ha|lol|yes|yeah|yep|yup|yea|ya|ok|okay|sure|totally|absolutely|definitely|of course|sorry|hey|fern|ferni)';
const ME = "(?:i'm|im|i am)";
const SAFE_WORD = '(?:safe|fine|okay|ok|good|alright|all right|great)';
const ADVERB = '(?:totally|completely|perfectly|really|all|just|so|very|absolutely|definitely)';
const THAT = "(?:that's|thats|that is|it's|its|it is)";
const CLEAR = [
  `${ME} (?:${ADVERB} )?${SAFE_WORD}(?: right now| now)?`,
  `${THAT} not (?:what i meant|like that|what i was saying)`,
  "i didn't mean (?:it|that)(?: like that)?",
  '(?:you|u) (?:misheard|misunderstood)(?: me)?',
  "(?:all|we're|were) good",
  'no worries',
  'nothing like that',
  `${ME} not in (?:any )?danger`,
  'yes|yeah|yep|yup|yea|ya|of course|definitely|absolutely|totally|sure|i promise',
].join('|');
const TRAIL =
  "(?:thanks|thank you|lol|haha|ferni|fern|really|i promise|promise|for real|i swear|don't worry|sorry|why|why do you ask)";
/** The whole reply is a clear yes: nothing of its own beyond the yes. */
const CLEAR_YES = new RegExp(
  `^(?:${LEAD} )*(?:${CLEAR})(?: (?:and |so |but )?(?:${LEAD} )*(?:${CLEAR}))*(?: ${TRAIL})*$`
);

export type CheckInAnswer = 'safe' | 'escalate';

/**
 * The caller's reply to "are you safe right now?". Only a clear yes is safe:
 * a pattern, risk content, a no, or anything else escalates.
 */
export function readCheckInAnswer(latest: string, pattern: PatternOutcome): CheckInAnswer {
  try {
    if (pattern !== 'none' || typeof latest !== 'string' || hasRiskContent(latest)) {
      return 'escalate';
    }
    const said = plain(latest);
    if (!BARE.test(lower(latest)) || !said || said.split(' ').length > 16) return 'escalate';
    return CLEAR_YES.test(said) ? 'safe' : 'escalate';
  } catch {
    return 'escalate';
  }
}

interface CallState {
  /** The check-in turn's words and when they were claimed. */
  turn: string;
  at: number;
  /** The crisis reading the check-in stood in for: the response an unclear answer gets. */
  crisis: CrisisDetectionResult;
  /** Ferni actually asked (the reply gate), not only the turn pipeline softened. */
  askedAt?: number;
}

const calls = new Map<string, CallState>();

function prune(now: number): void {
  for (const [id, state] of calls) if (now - state.at > CALL_TTL_MS) calls.delete(id);
}

/** One turn can be read twice, first from a partial transcript ("I'm not online"). */
function sameTurn(state: CallState, latest: string, now: number): boolean {
  const [a, b] = [plain(state.turn), plain(latest)].sort((x, y) => x.length - y.length);
  if (now - state.at > SAME_TURN_MS || a.length < 8 || !a.includes(' ')) return false;
  return b.startsWith(a);
}

/**
 * Take this call's one check-in for this turn. True when the call has none
 * yet, or this is the same turn read again. `ask`: the reply gate is about to
 * ask, so the next turn is read as the answer.
 */
export function claimCheckIn(
  sessionId: string,
  latest: string,
  crisis: CrisisDetectionResult,
  ask: boolean,
  now: number = Date.now()
): boolean {
  if (!sessionId) return false;
  prune(now);
  const state = calls.get(sessionId);
  if (state && !sameTurn(state, latest, now)) return false;
  if (!state) {
    if (calls.size >= MAX_CALLS) {
      const oldest = calls.keys().next().value;
      if (oldest !== undefined) calls.delete(oldest);
    }
    calls.set(sessionId, { turn: latest, at: now, crisis, askedAt: ask ? now : undefined });
    return true;
  }
  if (crisis.severity > state.crisis.severity) state.crisis = crisis;
  if (ask) state.askedAt ??= now;
  return true;
}

/** Ferni's line is one of the check-in lines, or the start of one (the caller cut in). */
function isCheckInLine(companion: string | undefined): boolean {
  if (typeof companion !== 'string') return false;
  const said = plain(companion.replace(/<[^>]*>/g, ' '));
  if (said.length < 10) return false;
  return CHECK_LINES.map(plain).some((line) => said.includes(line) || line.startsWith(said));
}

/**
 * The caller answering a check-in Ferni asked in this call: their reading, and
 * the crisis response an escalation gets. Null when this turn is not an answer.
 */
export function checkInAnswer(
  sessionId: string,
  turn: { latest: string; companion?: string; pattern: PatternOutcome },
  now: number = Date.now()
): { outcome: CheckInAnswer; crisis: CrisisDetectionResult } | null {
  const state = sessionId ? calls.get(sessionId) : undefined;
  if (state?.askedAt === undefined || now - state.askedAt > ANSWER_WINDOW_MS) return null;
  if (!isCheckInLine(turn.companion)) return null;
  return { outcome: readCheckInAnswer(turn.latest, turn.pattern), crisis: state.crisis };
}

/** For tests: forget every call. */
export function resetCrisisSoftCheck(): void {
  calls.clear();
}
