/**
 * A call screener on an on-behalf call (CALL_OPENING_AMD on): Google Call
 * Screen or iOS asking "say your name and why you're calling", then "please
 * stay on the line". Ferni answers it once, with the same AI-disclosing intro
 * as the opener, then stays silent until a real person comes on.
 *
 * LiveKit's answering-machine detection has no screener category: its prompt
 * files a screening prompt under `machine-ivr` (a phone menu), which the
 * opening would hang up on. So a screener is a non-human verdict whose
 * transcript has a screener phrase (whole words) and no voicemail cue.
 *
 * After the one answer, detection runs again, round after round, while Ferni
 * says nothing (with interruptOnMachine, a machine verdict also skips the
 * model's reply to that turn):
 * - a person ("Hello?")          -> 'person': the reply to it is the opener;
 * - the screener sends it to voicemail -> the voicemail, then a hang-up;
 * - a full mailbox               -> a quiet hang-up;
 * - another prompt, or silence   -> keep waiting (silence is not a person);
 * - nobody within a minute       -> a quiet hang-up.
 *
 * @module agents/outbound-call/call-screener
 */

import { isCallOpeningAmdEnabled } from '../../config/call-opening-flag.js';
import { ferniIntro, type OutboundParties } from '../../services/outreach/opening-line.js';
import type { Answered, CallOpeningPorts, FirstWords } from './call-opening.js';

/** How long Ferni waits for a person after answering the screener. */
export const PERSON_WAIT_MS = 60_000;
/** Detection rounds while waiting; a backstop if rounds end faster than expected. */
const MAX_ROUNDS = 12;

const SCREENER_PHRASES =
  /\b(screening|call screen(er)?|(say|state|record) your name|your name and (the )?(reason|why)|reason for (your )?call(ing)?|why (you're|you are) calling|stay on the line|see if (this person|they|he|she) (is |are )?available)\b/i;

/** A voicemail greeting can ask for a name and reason too; then it is voicemail. */
const VOICEMAIL_CUES = /\b(leave (a|your) message|after the (tone|beep))\b/i;

/** True when the words are a screener's prompt (whole words, any apostrophe). */
export function isScreenerPrompt(transcript: string): boolean {
  const text = transcript.replace(/[‘’]/g, "'");
  return SCREENER_PHRASES.test(text) && !VOICEMAIL_CUES.test(text);
}

/** A screener answered: a non-human verdict on a screener's prompt. Only with the flag on. */
export function isCallScreener(heard: FirstWords): boolean {
  if (!isCallOpeningAmdEnabled()) return false;
  if (heard.category === 'human' || heard.category === 'machine-unavailable') return false;
  return isScreenerPrompt(heard.transcript);
}

/** The one line a screener hears: who is calling, and why. */
export function screenerLine(parties: OutboundParties): string {
  const intro = ferniIntro(parties);
  if (!parties.personal) return `Hi, ${intro}.`;
  const on = parties.recipientName ? ` on ${parties.recipientName}` : '';
  return `Hi, ${intro}, calling to check in${on}.`;
}

/**
 * Answer the screener once, then wait in silence for a person, a voicemail
 * or a minute to pass. Throws only if a port does (openOnBehalfCall catches).
 */
export async function waitThroughScreener(
  parties: OutboundParties,
  ports: CallOpeningPorts,
  now: () => number = Date.now
): Promise<Answered> {
  await ports.answerScreener(screenerLine(parties));
  const giveUpAt = now() + PERSON_WAIT_MS;
  for (let round = 0; round < MAX_ROUNDS && now() < giveUpAt; round++) {
    const heard = await ports.hearFirstWords({ afterScreener: true });
    switch (heard.category) {
      case 'machine-vm':
        await ports.leaveVoicemail();
        await ports.hangUp('voicemail_left');
        return 'voicemail';
      case 'machine-unavailable':
        await ports.hangUp('unreachable');
        return 'unreachable';
      case 'machine-ivr':
        continue; // the screener asking again
      default: {
        const said = heard.transcript.trim();
        // Silence, or the screener again: keep quiet. Anything else is a person.
        if (said !== '' && !isScreenerPrompt(said)) return 'person';
      }
    }
  }
  await ports.hangUp();
  return 'screened';
}
