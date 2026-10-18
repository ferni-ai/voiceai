/**
 * A request to switch teammates is everyday call business (CRISIS_TRANSFER_EVERYDAY=on,
 * off by default).
 *
 * Prod 2026-10-18: the owner asked Alex "Can you pass me to Nayan?"; STT wrote
 * "Can you pass me to 9?". No pattern matched, the live classifier read crisis,
 * and Alex answered with the 988 line. The owner asked again and was handed to
 * Nayan, whose handoff summary still spoke of a crisis.
 *
 * With the flag on, a classifier crisis read is set to none when ALL of these hold:
 * - no pattern matched (pattern 'none'), and the read is crisis, never imminent;
 * - the caller's latest words are only a request to switch to a teammate: "pass
 *   me to X", "transfer me to X", "can I talk to X", "put X on", "switch me to
 *   X", where X is a teammate's name, an STT spelling of one, or a bare number
 *   from 1 to 12; never "someone", a person, a crisis line or 911/988;
 * - the call is known, and no earlier read on it found risk or failed, and no
 *   pattern matched on it (crisis-escalations.ts): a risky earlier turn keeps
 *   every later read, even one its words cannot show;
 * - nothing the caller said this call (latest and earlier), nor the companion's
 *   line they answer, holds a word from the agreement gate's risk list
 *   (hasRiskContent, crisis-agreement.ts), which also counts anything it cannot
 *   read as risk; and nothing the caller said agrees with or echoes the
 *   companion (endorses, the same module).
 * Anything else, and any error, leaves the read as it was.
 *
 * @module CrisisTransferRequest
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { HEARD_AS, TEAM_FIRST_NAMES } from '../../utils/teammate-talk.js';
import { HEARD_IN_A_TRANSFER } from '../../utils/transfer-aliases.js';
import { createLogger } from '../../utils/safe-logger.js';
import { endorses, hasRiskContent } from './crisis-agreement.js';
import type { CrisisClassifierInput, CrisisVerdict, PatternOutcome } from './crisis-classifier.js';
import { crisisRiskThisCall, noteCrisisRisk } from './crisis-escalations.js';

const log = createLogger({ module: 'CrisisTransferRequest' });

const NAME = `(?:${[
  ...TEAM_FIRST_NAMES,
  ...Object.keys(HEARD_AS),
  ...Object.keys(HEARD_IN_A_TRANSFER),
].join('|')})`;
const NUMBER = '(?:[1-9]|1[0-2]|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';
const WHO = `(?:${NAME}|${NUMBER})`;

/** Greeting, filler or the name of whoever is on the line ("Alex, can you…"). */
const LEAD = `(?:(?:hey|hi|hello|okay|ok|um|uh|so|alright|yeah|yes|yep|actually|and|oh|well|${NAME}) )*`;
const ASK = `(?:(?:can|could|would|will) (?:you|u) (?:please |just )?|(?:can|could|may) i (?:please |just )?|let me |i (?:want|wanna|need|would like|'d like|d like) (?:to )?|please |just )?`;
const REQUEST = [
  `(?:pass|transfer|switch|send|hand|put|patch|connect) (?:me |us )?(?:back |over |through )*(?:to|with) ${WHO}`,
  `(?:talk|speak|chat) (?:to|with) ${WHO}`,
  `(?:put|get|bring) ${WHO} (?:on|in)(?: (?:the|this) (?:line|call|phone))?`,
].join('|');
const TAIL = `(?: (?:please|now|real quick|quickly|for a (?:sec|second|minute|bit)|thanks|thank you|again|instead|then))*`;
const CLAUSE = `${LEAD}${ASK}(?:${REQUEST})${TAIL}`;
const TRANSFER_ONLY = new RegExp(`^${CLAUSE}(?: ${CLAUSE})*$`);

/**
 * Never a teammate: help, a person, an emergency or crisis line. Checked on
 * its own, so no grammar change can ever exempt "pass me to 988".
 */
const NEVER =
  /\b(?:911|988|999|112|crisis|hotline|lifeline|helpline|help|emergency|police|ambulance|doctor|nurse|counsel\w*|therap\w*|someone|somebody|anyone|anybody|human|person|people)\b/;

/** NFKC, lower case, every apostrophe variant as ', only letters, digits, apostrophes and spaces. */
const words = (text: string): string =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′´`ʼʹ＇]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** True when the whole line only asks to be switched to a teammate. */
export function isTransferRequestOnly(text: string): boolean {
  if (typeof text !== 'string') return false;
  const said = words(text);
  if (!said || said.split(' ').length > 24 || NEVER.test(said)) return false;
  return TRANSFER_ONLY.test(said);
}

/** Whether this turn's crisis read is set to none (see the module comment). */
export function transferRequestIsEveryday(
  input: CrisisClassifierInput,
  pattern: PatternOutcome,
  call: string | undefined,
  env: Env = process.env
): boolean {
  if (!flagOn('CRISIS_TRANSFER_EVERYDAY', env) || pattern !== 'none') return false;
  try {
    if (!call || crisisRiskThisCall(call)) return false;
    if (!Array.isArray(input.earlier) || !isTransferRequestOnly(input.latest)) return false;
    const companion = typeof input.companion === 'string' ? input.companion.trim() : '';
    const caller = [input.latest, ...input.earlier];
    // Agreeing with or echoing Ferni ("yeah, same") takes his line as the caller's own.
    if (caller.some(endorses)) return false;
    return ![...caller, ...(companion ? [companion] : [])].some(hasRiskContent);
  } catch (error) {
    log.warn({ error: String(error) }, 'Transfer-request check failed; the read stands');
    return false;
  }
}

/** A crisis read of such a turn, as none; imminent, none and a missing read stay as they are. */
export function asEverydayTransfer(verdict: CrisisVerdict | null): CrisisVerdict | null {
  if (verdict?.risk !== 'crisis') return verdict;
  // Never the caller's words: only that a crisis read was set aside.
  log.info({ risk: verdict.risk, subject: verdict.subject }, 'CRISIS_TRANSFER_EVERYDAY');
  return { risk: 'none', subject: verdict.subject };
}

type Read = Promise<CrisisVerdict | null>;

/**
 * This turn's copy of a classifier read: a crisis read of a bare transfer
 * request set to none (transferRequestIsEveryday, decided now), and any read
 * that ends up anything but none, or fails, noted against the call so later
 * transfer requests on it are left alone.
 */
export function turnReadFor(
  input: CrisisClassifierInput,
  pattern: PatternOutcome,
  call: string | undefined,
  env: Env = process.env
): (read: Read) => Read {
  const everyday = transferRequestIsEveryday(input, pattern, call, env);
  return (read) => {
    const own = everyday ? read.then(asEverydayTransfer) : read;
    own.then(
      (v) => {
        if (v?.risk !== 'none') noteCrisisRisk(call);
      },
      () => noteCrisisRisk(call)
    );
    return own;
  };
}
