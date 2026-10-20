/**
 * A teammate on the call stays who they are, and a request for Ferni is a
 * handoff, not a cue to become him.
 *
 * Prod call 2026-10-17: Ferni had handed the caller to Maya, Peter, Nayan and
 * then Alex. Talking to Alex, the caller said "transfer me to Fern". Alex said
 * "I'll pass you back to Ferni. Ferni here." without calling handoffToFerni
 * (open to Alex all along: it worked on the third ask), then "You mean me,
 * Ferni", until the caller said "No, you're Alex". After a swap the teammate's
 * chat holds the whole call (persona-swap.ts conversationSoFar): every
 * assistant line, Ferni's included, unlabelled as its own, and the caller's
 * "Hey Ferni". Nothing on the turn said otherwise.
 *
 * So each turn of a teammate other than Ferni carries one line: who is
 * speaking, that earlier assistant lines may be someone else's, and that a
 * request for a teammate is that teammate's handoff tool, called in this reply.
 * TEAMMATE_IDENTITY_NOTE=off turns it off.
 *
 * @module agents/personas/teammate-identity
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { isCoach } from '../../personas/persona-ids.js';
import { getPersonaPronouns } from '../../personas/persona-pronouns.js';
import { getPersonaDisplayName } from '../../personas/voice-registry.js';

/**
 * The turn's identity line for `personaId`, or '' for Ferni (or with the flag off).
 * `scriptFree` (SCRIPT_FREE_REMINDER, script-free.ts): no quoted example.
 */
export function teammateIdentityNote(
  personaId: string | undefined,
  env: Env = process.env,
  scriptFree = false
): string {
  if (!personaId || isCoach(personaId) || !flagOn('TEAMMATE_IDENTITY_NOTE', env)) return '';
  const name = getPersonaDisplayName(personaId).split(/\s+/)[0];
  const him = getPersonaPronouns('ferni').object;
  return (
    `You are ${name}. Assistant lines earlier in this call may be Ferni's or another teammate's, ` +
    `from before you joined: you are not them, so never say you are Ferni or speak as ${him}. ` +
    `If the caller asks for Ferni or a teammate, even by a misheard name${scriptFree ? '' : ' ("Fern")'}, call that ` +
    `teammate's handoff tool in this reply instead of saying you'll pass them along.`
  );
}
