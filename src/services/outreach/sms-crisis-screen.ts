/**
 * SMS_CRISIS_SCREEN: a text to Ferni that reads as a crisis gets 988.
 *
 * Until 2026-10-25 no inbound text was read for crisis: "I want to die" was
 * stored in a conversation thread nobody reads, and got no reply (or, if it
 * also said "call me", a false "Let me call you now...").
 *
 * The read is the one a call's reply gate uses (crisis-gate.ts): the pattern
 * guard (detectCrisis) and the crisis classifier, and either one is enough. A
 * read is never lowered here: no easing, no agreement gate, no grounded
 * release; a text has no call around it to explain the words. A classifier
 * timeout or error leaves the pattern read alone.
 *
 * On a crisis read the reply is SMS_CRISIS_REPLY and nothing else changes
 * (STOP, consent and the minor-care hold run as before). Seth, 2026-10-25:
 * reply only, nobody else is alerted. Only the outcome is logged, never the
 * words.
 *
 * @module services/outreach/sms-crisis-screen
 */
import { randomUUID } from 'node:crypto';
import { flagModeOf } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  classifyCrisis,
  createGeminiCrisisGenerate,
  type ClassifierRisk,
  type CrisisGenerateFn,
} from '../safety/crisis-classifier.js';
import {
  inboundKeyword,
  isExactKeyword,
  keywordReply,
  normalizeSms,
} from '../messaging/sms-keywords.js';
import { detectCrisis } from '../safety/crisis-guard.js';
import { escapeXml } from './twilio-ssml.js';

const log = createLogger({ module: 'SmsCrisisScreen' });

/** Seth approved this wording, 2026-10-25. */
export const SMS_CRISIS_REPLY =
  "I'm really glad you told me, and I'm here. If you might act on these thoughts or you're not safe right now, please call or text 988 (Suicide & Crisis Lifeline), or text HOME to 741741. If you're in immediate danger, call 911. You can open Ferni anytime and we'll talk.";

/** A text isn't a live turn: Twilio waits ~15 s for the webhook, so the classifier gets longer than a call's 1 s. */
export const SMS_CLASSIFIER_TIMEOUT_MS = 4_000;
/** Twilio's longest inbound message; anything longer is not a real text and is cut before a read. */
export const SMS_MAX_CHARS = 1_600;

/** Never gated: a person in crisis may text just "help". */
const HELP_WORDS: ReadonlySet<string> = new Set(['help', 'info']);

export interface SmsCrisisRead {
  crisis: boolean;
  pattern: boolean;
  /** The classifier's risk, or null when it timed out, failed or isn't configured. */
  risk: ClassifierRisk | null;
}

/** The pattern guard and the classifier on one text; either one makes it a crisis. */
export async function readSmsCrisis(
  text: string,
  generate: CrisisGenerateFn = createGeminiCrisisGenerate()
): Promise<SmsCrisisRead> {
  const pattern = detectCrisis(text).isCrisis;
  const verdict = await classifyCrisis(
    { latest: text, earlier: [] },
    generate,
    SMS_CLASSIFIER_TIMEOUT_MS
  );
  const risk = verdict?.risk ?? null;
  return { crisis: pattern || risk === 'crisis' || risk === 'imminent', pattern, risk };
}

/**
 * The reply to send instead of the usual one, or null. Never rejects: a read
 * that throws falls back to the pattern guard alone.
 */
export async function smsCrisisReply(
  body: string,
  read: (text: string) => Promise<SmsCrisisRead> = readSmsCrisis
): Promise<string | null> {
  const mode = flagModeOf('SMS_CRISIS_SCREEN');
  const text = body.slice(0, SMS_MAX_CHARS);
  if (mode === 'off' || !text.trim()) return null;
  if (mode === 'shadow') {
    // Shadow never holds the reply: the read runs beside it. On Cloud Run the
    // CPU may be throttled once the reply is sent, so the classifier's line can
    // come late or not at all; the pattern and HELP fields are logged first,
    // before any network call, so they always land.
    // One random id per text pairs its two lines, so a pattern line with no
    // classifier line reads as "the read never finished", not as "not a crisis".
    const screenId = randomUUID();
    const pattern = detectCrisis(text).isCrisis;
    logScreen(mode, text, { crisis: pattern, pattern, risk: null }, 'pattern', screenId);
    // Nothing in this chain may reject: the web server has no unhandledRejection
    // handler, so a rejection here would crash it (#2914).
    void screenSms(text, read)
      .then((outcome) => logScreen(mode, text, outcome, 'classifier', screenId))
      .catch(() => undefined);
    return null;
  }
  const outcome = await screenSms(text, read);
  logScreen(mode, text, outcome, 'classifier', randomUUID());
  return outcome.crisis ? SMS_CRISIS_REPLY : null;
}

/** The read, falling back to the pattern guard alone when it throws. Never rejects. */
async function screenSms(
  text: string,
  read: (text: string) => Promise<SmsCrisisRead>
): Promise<SmsCrisisRead> {
  let outcome: SmsCrisisRead;
  try {
    outcome = await read(text);
  } catch (error) {
    const pattern = detectCrisis(text).isCrisis;
    log.warn({ error: String(error), pattern }, 'SMS crisis read failed; pattern guard alone');
    outcome = { crisis: pattern, pattern, risk: null };
  }
  // A bare stop or start keyword ("STOP", "opt out", "START") read as crisis by
  // the classifier alone got 988 over its consent notice: only a pattern hit
  // counts there. HELP and INFO are always read in full: someone in crisis
  // types "help", and 988 beside Twilio's HELP reply is better than silence.
  if (isKeywordOnly(text) && !outcome.pattern) outcome = { ...outcome, crisis: false };
  return outcome;
}

function isKeywordOnly(text: string): boolean {
  return isExactKeyword(text) && !HELP_WORDS.has(normalizeSms(text));
}

/** One line per read, with verdicts and booleans only, never the words. */
function logScreen(
  mode: 'shadow' | 'on',
  text: string,
  outcome: SmsCrisisRead,
  stage: 'pattern' | 'classifier',
  screenId: string
): void {
  // Twilio may answer HELP and INFO itself. `help` (any punctuation) and
  // `bareHelp` (the word alone) tell the shadow logs whether they reach us.
  // A log failure must never change what the person gets back, in any mode:
  // the pattern line runs inside the request, where a throw becomes a 500.
  try {
    log.info(
      {
        mode,
        stage,
        screenId,
        crisis: outcome.crisis,
        pattern: outcome.pattern,
        risk: outcome.risk,
        keyword: isKeywordOnly(text),
        help: HELP_WORDS.has(normalizeSms(text)),
        bareHelp: HELP_WORDS.has(text.trim().toLowerCase()),
      },
      'SMS_CRISIS_SCREEN'
    );
  } catch {
    // Nothing to do: the reply goes out as it would with the screen off.
  }
}

/**
 * The TwiML that answers a crisis text. 988 replaces the usual reply, except an
 * opt-out or opt-in confirmation the app sends itself ("You're unsubscribed…"):
 * that is still owed, so it goes first and 988 follows.
 */
export function withCrisisReply(
  handlerTwiml: string | undefined,
  crisis: string,
  body: string
): string {
  const confirmation = keywordReply(inboundKeyword(body));
  if (confirmation && handlerTwiml?.includes('</Response>')) {
    return handlerTwiml.replace(
      '</Response>',
      `<Message>${escapeXml(crisis)}</Message></Response>`
    );
  }
  return smsReplyTwiml(crisis);
}

/** The TwiML that sends `reply` back to the texter. */
export function smsReplyTwiml(reply: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(reply)}</Message></Response>`;
}
