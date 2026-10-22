/**
 * A request to switch teammates is everyday call business (CRISIS_TRANSFER_EVERYDAY=on,
 * off by default).
 *
 * Prod 2026-10-18: the owner asked Alex "Can you pass me to Nayan?"; STT wrote
 * "Can you pass me to 9?". No pattern matched, the live classifier read crisis,
 * and Alex answered with the 988 line. The owner asked again and was handed to
 * Nayan, whose handoff summary still spoke of a crisis.
 *
 * With the flag on, a classifier-only crisis read (never an imminent read,
 * whoever it is about, and never the script) of such a turn gets the soft check-in (SOFT_CRISIS_CHECK) instead of
 * crisis guidance; never nothing, since a word list cannot overrule a read of
 * the whole conversation. The crisis gate and the turn pipeline apply it, and
 * only when ALL of these hold:
 * - no pattern matched (pattern 'none');
 * - the caller's latest words are only a request to switch to a teammate: "pass
 *   me to X", "transfer me to X", "can I talk to X", "put X on", "switch me to
 *   X", where X is a teammate's name as written or a bare number from 1 to 12
 *   (how STT wrote "Nayan" on the prod call); never "someone", a person, a
 *   crisis line, 911/988 or "nine one one";
 * - the call is known, and no earlier read on it found risk, failed or is still
 *   running, and nothing on it escalated (crisis-call-risk.ts): a risky
 *   earlier turn keeps every later read, even one its words cannot show;
 * - nothing the caller said this call (latest and earlier), nor the companion's
 *   line they answer, holds a word from the agreement gate's risk list
 *   (hasRiskContent, crisis-agreement.ts), which also counts anything it cannot
 *   read as risk; and nothing the caller said agrees with or echoes the
 *   companion (endorses, the same module);
 * - no live adjudicator is there to give the turn a fuller read (it decides),
 *   and the agreement gate did not find the turn's crisis reads agreeing.
 * Anything else, and any error, leaves the crisis handling as it was.
 *
 * @module CrisisTransferRequest
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { TEAM_FIRST_NAMES } from '../../utils/teammate-talk.js';
import { createLogger } from '../../utils/safe-logger.js';
import { endorses, hasRiskContent } from './crisis-agreement.js';
import type { CrisisClassifierInput, PatternOutcome } from './crisis-classifier.js';
import { crisisRiskThisCall } from './crisis-call-risk.js';

const log = createLogger({ module: 'CrisisTransferRequest' });

/** The team's names as written: no speech-to-text spellings, which are often ordinary words. */
const NAME = `(?:${TEAM_FIRST_NAMES.join('|')})`;
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
  /\b(?:911|988|999|112|crisis|hotline|lifeline|helpline|help|emergency|police|ambulance|doctor|nurse|counsel\w*|therap\w*|someone|somebody|anyone|anybody|human|person|people|(?:nine|9) (?:(?:one|1) (?:one|1)|(?:eight|8) (?:eight|8)))\b/;

/** NFKC, lower case, every apostrophe variant as ', only letters, digits, apostrophes and spaces. */
const words = (text: string): string =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′´`ʼʹ＇]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * True when the whole line only asks to be switched to a teammate. `grammar`
 * is for tests only: with a looser one, the hard block above must still refuse.
 */
export function isTransferRequestOnly(text: string, grammar: RegExp = TRANSFER_ONLY): boolean {
  if (typeof text !== 'string') return false;
  const said = words(text);
  if (!said || said.split(' ').length > 24 || NEVER.test(said)) return false;
  return grammar.test(said);
}

/** Whether this turn's classifier-only crisis read gets the soft check-in (see the module comment). */
export function transferRequestIsEveryday(
  input: CrisisClassifierInput,
  pattern: PatternOutcome,
  call: string | undefined,
  env: Env = process.env
): boolean {
  if (!flagOn('CRISIS_TRANSFER_EVERYDAY', env) || pattern !== 'none') return false;
  try {
    // This turn's own reads (the other path's) are not risk; any other read in flight is.
    if (!call || crisisRiskThisCall(call, input.latest)) return false;
    if (!Array.isArray(input.earlier) || !isTransferRequestOnly(input.latest)) return false;
    const companion = typeof input.companion === 'string' ? input.companion.trim() : '';
    const caller = [input.latest, ...input.earlier];
    // Agreeing with or echoing Ferni ("yeah, same") takes his line as the caller's own.
    if (caller.some(endorses)) return false;
    return ![...caller, ...(companion ? [companion] : [])].some(hasRiskContent);
  } catch (error) {
    log.warn({ error: String(error) }, 'Transfer-request check failed; crisis handling as before');
    return false;
  }
}
