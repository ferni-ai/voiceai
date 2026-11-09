/**
 * Ferni's own crisis reply is not evidence against the caller's next turn
 * (CRISIS_OWN_SCRIPT_NOT_EVIDENCE=on, off by default).
 *
 * The crisis classifier reads Ferni's last line as COMPANION. After a crisis
 * turn that line is Ferni's own 988/911 guidance or script, and an ordinary
 * reply to it ("thanks", "sounds good") read as risk again: the full-path
 * simulator counted 29 of 112 must-not-alarm turns that alarmed straight after
 * an alarm. A neutral stub in its place fixed most of those but hid that a
 * crisis was just in play, and a reply agreeing with Ferni lost its catch.
 *
 * With the flag on, the classifier reads a fixed marker in that line's place,
 * saying crisis resources were just offered, and one rule: judge the reply on
 * the caller's own words. Only the classifier's request holds the marker;
 * nothing is spoken, stored or logged with it.
 *
 * Only for a sign-off after a line that asked nothing: when Ferni's line has a
 * question ("Do you have access to anything you could use to hurt yourself?"),
 * the caller may be answering it, and a bare "yes" is the risk; and only a
 * caller turn made wholly of thanks, okays and goodbyes (isSignOff) reads the
 * marker. Anything else reads the full line, as off.
 *
 * Which line is Ferni's own crisis reply comes from structured state, never
 * from its text: each writer notes whether the reply it is producing offers
 * crisis help (the reply gate for its guide or script, the turn handler for its
 * crisis response), and the commit keeps that for the line it records.
 *
 * Never lower: patterns are untouched; a line with a question, a reply that is
 * not a plain sign-off, one with risk words of its own, or one agreeing with
 * Ferni reads the full line as off; an error reads as off.
 *
 * @module CrisisOwnReply
 */

import { stripSSML } from '../../utils/text-utils.js';
import { endorses, hasRiskContent } from './crisis-agreement.js';
import type { CrisisClassifierInput } from './crisis-classifier.js';

function resolveOwnScriptNotEvidence(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.CRISIS_OWN_SCRIPT_NOT_EVIDENCE?.trim().toLowerCase() === 'on';
}

/** What the classifier reads in place of Ferni's own crisis reply. */
export const OWN_CRISIS_REPLY_MARKER =
  'The companion just offered crisis resources (988 or 911) and asked nothing.';

export const OWN_CRISIS_REPLY_RULE = `
When COMPANION is exactly "${OWN_CRISIS_REPLY_MARKER}", the companion's own safety words are not signs that the caller is at risk: judge LATEST on the caller's own words, with EARLIER as usual. A plain thanks, okay or sign-off with nothing else in it is risk "none". Anything else in LATEST, and any risk in EARLIER, is judged as above.`;

/** The call state this reads and writes (UserData in the voice agent). */
export interface OwnCrisisReplyState {
  lastAgentResponse?: string;
  /** Whether the reply being produced offers crisis help, by writer; cleared at commit. */
  crisisHelpInReply?: { gate?: boolean; turn?: boolean };
  /** True when lastAgentResponse is Ferni's own crisis reply, committed uninterrupted. */
  lastAgentResponseCrisisHelp?: boolean;
}

/** A writer notes whether the reply it is producing offers crisis help (last write wins). */
export function noteCrisisHelp(
  state: OwnCrisisReplyState,
  by: 'gate' | 'turn',
  offered: boolean
): void {
  state.crisisHelpInReply = { ...state.crisisHelpInReply, [by]: offered };
}

/**
 * At commit: a recorded reply is Ferni's own crisis reply when a writer said so
 * and it was not cut off. A reply not recorded (empty, acknowledgement only)
 * leaves lastAgentResponse, and what it was, as they are.
 */
export function commitCrisisHelp(
  state: OwnCrisisReplyState,
  recorded: boolean,
  interrupted: boolean | undefined
): void {
  const help = state.crisisHelpInReply;
  state.crisisHelpInReply = undefined;
  if (recorded) state.lastAgentResponseCrisisHelp = !interrupted && !!(help?.gate || help?.turn);
}

/** Any question mark in Ferni's line, in any script: the caller may be answering it. */
const ASKS = /[?？¿؟]/;

/**
 * Whole clauses a caller thanks, agrees or says goodbye with, and nothing else
 * (lower case, single spaces). Not "yes", "no", "sure" or "goodnight": an
 * answer or a farewell can carry the risk, so they read as off.
 */
const SIGN_OFF_CLAUSE = new RegExp(
  `^(?:${[
    '(?:(?:ok(?:ay)?|alright|all right) )?(?:thanks|thank you|thx|ty)(?: (?:so much|a lot|very much))?(?: ferni)?',
    '(?:i )?appreciate (?:it|that|you)',
    'ok(?:ay)?|alright|all right|got it|sounds good|will do|cool|great|perfect|you too',
    '(?:ok(?:ay)? )?bye(?: bye| now| for now)?',
    "(?:i(?:'|’)?ll )?talk (?:to you )?(?:later|soon|tomorrow)",
    'see (?:you|ya)(?: later| tomorrow| soon)?',
    "(?:i(?:'|’)?m|i am) (?:good|ok(?:ay)?)",
  ].join('|')})$`
);

/** Whether the caller's turn is only thanks, okays and goodbyes ("Thanks, talk later."). */
export function isSignOff(latest: string): boolean {
  const clauses = latest
    .toLowerCase()
    .split(/[.,!;:…]+/)
    .map((clause) => clause.trim().replace(/ +/g, ' '))
    .filter(Boolean);
  return clauses.length > 0 && clauses.every((clause) => SIGN_OFF_CLAUSE.test(clause));
}

/**
 * With the flag on: whether `companion` is Ferni's own crisis reply and asked the caller
 * nothing. False on any error.
 */
export function ownCrisisReply(
  callState: unknown,
  companion: string | undefined,
  env: Record<string, string | undefined> = process.env
): boolean {
  try {
    const state = callState as OwnCrisisReplyState | null | undefined;
    if (!resolveOwnScriptNotEvidence(env) || state?.lastAgentResponseCrisisHelp !== true) {
      return false;
    }
    // Both sides as the classifier reads them: stripSSML also folds a script's line breaks.
    const line = stripSSML(companion ?? '').trim();
    if (line === '' || ASKS.test(line)) return false; // a question: the reply may answer it
    return line === stripSSML(state.lastAgentResponse ?? '').trim();
  } catch {
    return false; // fail closed: the classifier reads the line as off
  }
}

const same = <T>(value: T): T => value;
const AS_OFF = { key: [] as string[], input: same<CrisisClassifierInput>, prompt: same<string> };

/**
 * How one turn's classifier read changes: the marker for the companion line and
 * the rule in the prompt, when the line is Ferni's own crisis reply and LATEST is
 * a plain sign-off with no risk words that does not agree with it. Otherwise, or
 * on any error, as off. LATEST and EARLIER are never changed.
 */
export function ownReplyRead(
  own: boolean | undefined,
  latest: string
): {
  key: string[];
  input: (i: CrisisClassifierInput) => CrisisClassifierInput;
  prompt: (p: string) => string;
} {
  try {
    if (!own || !isSignOff(latest) || hasRiskContent(latest) || endorses(latest)) return AS_OFF;
    return {
      key: ['own-crisis-reply'],
      input: (i) => ({ ...i, companion: OWN_CRISIS_REPLY_MARKER }),
      prompt: (p) =>
        p.replace('\n\nReturn JSON only', `\n${OWN_CRISIS_REPLY_RULE}\n\nReturn JSON only`),
    };
  } catch {
    return AS_OFF; // fail closed
  }
}
