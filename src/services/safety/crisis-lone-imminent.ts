/**
 * A classifier-only imminent read of a plain goodbye on a call with no risk.
 *
 * Dev, 2026-10-18: two calls with no risk in them (a hiking chat; puns and
 * laughter) ended "Yeah. it was great. Okay, bye." and "Bye." No pattern
 * matched either line, the classifier alone read each as imminent (its prompt
 * counts "a final goodbye" as imminent), and Ferni's goodbye was replaced with
 * the 911 and 988 script. Prod logged the same classifier-only imminent read
 * three times on 2026-10-17. The everyday rules (crisis-everyday.ts) call
 * "okay, bye" everyday, but they cannot help: "bye" is on the agreement gate's
 * risk list, so every goodbye is also read without the rules, and the more
 * severe read wins.
 *
 * Such a turn gets the soft check (SOFT_CRISIS_CHECK) instead of the script:
 * Ferni says goodbye, and checks in once if anything suggests it. Only when
 * all of these hold:
 *   - the line is a plain sign-off ("bye", "okay, bye", "talk later",
 *     "goodnight"), with only filler or a short remark about the chat around
 *     it ("yeah, it was great"). "Bye, I won't be here tomorrow", "goodbye
 *     everyone", "it's been great, goodbye" and "thanks for everything, bye"
 *     are not;
 *   - the read is imminent and about the caller;
 *   - the patterns found nothing at all in this turn (no indicator, no voice
 *     distress, no session escalation);
 *   - nothing on this call found risk before this turn (crisis-call-risk.ts:
 *     a pattern match, a classifier read that was not none or gave no verdict,
 *     or a read still in flight), and the call is known;
 *   - the caller said at least three things before it this call, and none of
 *     them matches a pattern or holds a word from the agreement gate's broad
 *     risk list (hasRiskContent): a call that is only a goodbye is itself a
 *     warning sign;
 *   - Ferni's line did not raise safety (a check-in, 988, 911), and the caller
 *     is not agreeing with it.
 * Everything else keeps the imminent script exactly as before, as does any
 * error. A rule that took the script away from every lone imminent read with
 * no risk word was measured on the labelled sets and rejected: it would have
 * dropped the 911 line for "took 30 of my adderall and my heart is going
 * crazy" and "just bought charcoal and tape for the bathroom".
 *
 * @module CrisisLoneImminent
 */

import { endorses, hasRiskContent } from './crisis-agreement.js';
import { crisisRiskThisCall, onCrisisRiskNoted } from './crisis-call-risk.js';
import type { CrisisVerdict } from './crisis-classifier.js';
import { detectCrisis, type CrisisDetectionResult } from './crisis-guard.js';
import { stripSSML } from '../../utils/text-utils.js';

/** NFKC, lower case, every apostrophe variant as ', spaces collapsed. */
const normalized = (text: string): string =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′´`ʼʹ＇]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** Letters, apostrophes and single spaces only. */
const words = (text: string): string =>
  normalized(text)
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Letters, apostrophes, spaces and pause marks only: no digits, emoticons or emoji. */
const BARE = /^[a-z' .,!?…-]+$/;

/** Ferni's line asked about the caller's safety or gave a crisis line. */
export const SAFETY_TALK =
  /\b(?:988|911|crisis|lifeline|hotline|suicid\w*|self[- ]?harm|(?:hurt|harm|kill)(?:ing)? yourself|end(?:ing)? your life|safety|emergency|(?:are )?(?:you|u)(?:'re| are)? (?:feeling |doing |being )?(?:ok|okay|alright|all right|safe)|(?:keep|keeping|stay|staying) (?:yourself )?safe)\b/;

const SIGN_OFF = [
  'bye(?: bye)*(?: now| for now)?',
  'good ?bye(?: for now)?',
  'good ?night|night night|nighty night',
  '(?:talk|speak)(?: to you| with you)? (?:later|soon|tomorrow)',
  'ttyl|later|catch you later',
  'see (?:ya|you)(?: later| soon| tomorrow)?|cya',
  'take care',
  "(?:i )?(?:gotta|got to|have to|need to|better) go|(?:i'll|i will|i'm gonna|i'm going to) let you go",
  'have a (?:good|great|nice) (?:one|day|night|evening|weekend)',
  'peace(?: out)?|cheers',
].join('|');

/** Words with no content of their own around a sign-off. No "right", "same" or "thanks". */
const FILLER =
  'yeah|yep|yes|yup|yea|ok|okay|k|alright|all right|cool|great|awesome|nice|perfect|sounds good|(?:ha)+|lol|well|so|anyway|anyways|oh|ah|um|uh|hey|mhm|mm+|hmm+|sure|fern|ferni|fernie|ferny|fernee|ferne';

/**
 * A short remark about the chat just had ("it was great", "that was fun",
 * "good talk"). Never a look back over a longer stretch ("it's been great",
 * "it has been good"), which can be a farewell.
 */
const REMARK = [
  '(?:it|that|this|today) was (?:so |really |pretty |super |a lot of )?(?:great|fun|good|nice|lovely|awesome|amazing|a blast|hilarious|funny|cool)',
  "(?:that's|thats) (?:so |really |pretty |super )?(?:great|fun|hilarious|funny)",
  '(?:good|nice|great|fun) (?:talk|chat|chatting|talking)(?: to you| with you)?',
  '(?:i )?had (?:so much |a lot of )?fun',
].join('|');

const UNIT = `(?:${SIGN_OFF}|${REMARK}|${FILLER})`;
const WHOLE_LINE = new RegExp(`^(?:${UNIT} )*${UNIT}$`);
const HAS_SIGN_OFF = new RegExp(`(?:^| )(?:${SIGN_OFF})(?: |$)`);
const MAX_SIGN_OFF_WORDS = 16;

/** The whole message is an everyday way of ending the call. */
export function isPlainSignOff(latest: string): boolean {
  if (typeof latest !== 'string') return false;
  const text = normalized(latest);
  if (!text || !BARE.test(text)) return false;
  const said = words(latest);
  if (!said || said.split(' ').length > MAX_SIGN_OFF_WORDS) return false;
  return WHOLE_LINE.test(said) && HAS_SIGN_OFF.test(said);
}

/** Any signal the patterns or the broad risk list find in one earlier caller line. */
function earlierRisk(line: string): boolean {
  if (hasRiskContent(line)) return true;
  const scored = detectCrisis(line);
  return scored.severity > 0 || scored.indicators.length > 0;
}

/**
 * Whether this call had risk before this turn, taken before this turn's own
 * reads start and shared by the gate and the turn pipeline: whichever path
 * starts the turn first records it, so this turn's own read (or the other
 * path's) never counts. An unknown call counts as risk. A snapshot is for one
 * turn: the caller's words, their line before and Ferni's line they answer,
 * reused for 5 seconds at most, and dropped as soon as anything on the call
 * notes risk, except this same turn's own reads. In memory.
 */
const SNAPSHOT_REUSE_MS = 5_000;
const SNAPSHOT_MAX = 64;
const snapshots = new Map<string, { at: number; risk: boolean; call: string; turn: string }>();

const loose = (text: string): string =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

onCrisisRiskNoted((call, turn) => {
  for (const [key, kept] of snapshots) {
    if (kept.call === call && (turn === undefined || turn !== kept.turn)) snapshots.delete(key);
  }
});

export function callRiskBeforeTurn(
  call: string | undefined,
  input: { latest: string; earlier?: readonly string[]; companion?: string },
  now = Date.now()
): boolean {
  try {
    if (!call) return true;
    const turn = loose(input.latest);
    const before = (input.earlier ?? []).map(loose).filter((line) => line !== '' && line !== turn);
    const ferni = loose(stripSSML(input.companion ?? ''));
    const key = JSON.stringify([call, turn, before.at(-1) ?? '', ferni]);
    for (const [k, v] of snapshots) if (now - v.at > SNAPSHOT_REUSE_MS) snapshots.delete(k);
    const kept = snapshots.get(key);
    if (kept) return kept.risk;
    const risk = crisisRiskThisCall(call, input.latest, now);
    if (snapshots.size >= SNAPSHOT_MAX) {
      const oldest = snapshots.keys().next().value;
      if (oldest !== undefined) snapshots.delete(oldest);
    }
    snapshots.set(key, { at: now, risk, call, turn });
    return risk;
  } catch {
    return true;
  }
}

/** For tests. */
export function resetCallRiskSnapshots(): void {
  snapshots.clear();
}

/**
 * True when this turn's classifier verdict gets the soft check instead of the
 * imminent script. False (as before) for anything else; fails closed.
 */
export function loneImminentGoodbye(args: {
  /** The patterns' reading of this turn, before the classifier. */
  detection: CrisisDetectionResult;
  verdict: CrisisVerdict | null;
  latest: string;
  /** The caller's earlier words this call, oldest first. */
  earlier?: readonly string[];
  /** Ferni's line the caller's words answer. */
  companion?: string;
  /** callRiskBeforeTurn for this turn. */
  priorRisk: boolean;
}): boolean {
  try {
    return qualifies(args);
  } catch {
    return false;
  }
}

function qualifies(args: Parameters<typeof loneImminentGoodbye>[0]): boolean {
  const { detection, verdict, latest, priorRisk } = args;
  if (priorRisk !== false) return false;
  if (verdict?.risk !== 'imminent' || verdict.subject !== 'self') return false;
  if (detection.severity !== 0 || detection.indicators.length > 0) return false;
  return isPlainSignOff(latest) && !endorses(latest) && quietContext(args);
}

/**
 * A goodbye with no conversation before it (a caller who rings up only to say
 * goodbye) is itself a warning sign, so a call needs this many earlier caller
 * lines, every one of them quiet.
 */
const MIN_EARLIER_LINES = 3;

/** Ferni's line raised no safety, and enough earlier caller lines all show no risk. */
function quietContext(args: Parameters<typeof loneImminentGoodbye>[0]): boolean {
  const { latest, companion } = args;
  const earlier: readonly unknown[] = args.earlier ?? [];
  if (companion !== undefined && typeof companion !== 'string') return false;
  if (companion !== undefined && SAFETY_TALK.test(normalized(companion))) return false;
  if (earlier.some((line) => typeof line !== 'string')) return false;
  const own = latest.trim();
  const lines = (earlier as readonly string[])
    .map((line) => line.trim())
    .filter((line) => line !== '' && line !== own);
  return lines.length >= MIN_EARLIER_LINES && !lines.some(earlierRisk);
}
