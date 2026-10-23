/**
 * "Call me, Ferni" is a phone call, not a nickname (CALL_ME_VOCATIVE=on).
 *
 * Prod 2026-10-23, the owner's own sessions: STT wrote "Can you call me
 * Fern?" for "Can you call me, Ferni?", and Ferni said "Oh, you want me to
 * call you Fern? I can absolutely do that." Only "No, call me on the phone."
 * rang. Another time "Did you give me a call?" (for "can you give me a
 * call?") got "No, I didn't." and the call came on the third phrasing.
 *
 * So, read in code from the caller's words:
 * - `ring`: "call me" then the persona's own name or an STT spelling of it
 *   ("call me Fern", "call me, Maya"): they are addressing the persona.
 * - `clarify`: the same words after a nickname cue ("you can call me Fern",
 *   "just call me Ferni"), or the name is also the caller's own: ask once.
 * - `did-you-call`: "did you call me?" / "did you give me a call?" with no
 *   call placed this session: most likely a request, so offer to ring.
 * Any other name ("call me Sam"), "call me later", "call me crazy" and "did
 * you call my mom?" are none of these. Words match whole, never as substrings.
 *
 * @module utils/call-me-vocative
 */

import { flagOn, type Env } from '../config/env-flag.js';
import { FERNI_HEARD_AS, HEARD_AS, TEAM_FIRST_NAMES } from './teammate-talk.js';

export function callMeVocativeEnabled(env: Env = process.env): boolean {
  return flagOn('CALL_ME_VOCATIVE', env);
}

export type CallMeIntent = 'ring' | 'clarify' | 'did-you-call';

/**
 * STT spellings of "Ferni" after "call me", beyond FERNI_HEARD_AS. Only here:
 * "Fern" is a real name, so "I'm Fern" stays a name everywhere else.
 */
const FERNI_AFTER_CALL_ME = ['fern', 'fernee', 'fern-ee'];

/** The persona's first name and its STT spellings, lowercase. */
export function vocativesFor(personaFirstName: string): string[] {
  const name = personaFirstName.trim().toLowerCase();
  if (!name) return [];
  const heard = Object.keys(HEARD_AS).filter((w) => HEARD_AS[w].split('-')[0] === name);
  const ferni = name === 'ferni' ? [...FERNI_HEARD_AS, ...FERNI_AFTER_CALL_ME] : [];
  return [name, ...heard, ...ferni];
}

const alt = (words: string[]): string => [...words].sort((a, b) => b.length - a.length).join('|');
const END = String.raw`(?![\p{L}'’-])`;
const NICKNAME_CUE =
  /\b(?:you can|you could|just|everyone|everybody|people|they|friends|folks)\s+$|\bi go by\s+$/i;
const DID_YOU_CALL = String.raw`\bdid\s+(?:you|ya)\s+(?:just\s+|already\s+|ever\s+)?(?:give\s+me\s+a\s+(?:call|ring|buzz)|call\s+me|ring\s+me|phone\s+me|try\s+(?:to\s+call|to\s+ring|calling|ringing)\s+me)`;
const WHEN = String.raw`(?:\s+(?:yet|today|earlier|before|already|back|yesterday|last night|this morning))?`;

/**
 * What "call me ..." / "did you call me?" in `words` asks of `persona`, or
 * null. `callerName` is the name Ferni has for the caller; `called` whether
 * a call was placed for them this session.
 */
export function callMeIntent(
  words: string,
  opts: { persona: string; callerName?: string; called?: boolean }
): CallMeIntent | null {
  const names = vocativesFor(opts.persona);
  if (!words || names.length === 0) return null;
  const ring = new RegExp(
    String.raw`\bcall\s+me[\s,.…-]+(?:(?:up|now|please)[\s,.]+)?(${alt(names)})${END}`,
    'iu'
  ).exec(words);
  if (ring) {
    const heard = ring[1].toLowerCase();
    const own = opts.callerName?.split(/\s+/)[0]?.toLowerCase() === heard;
    return own || NICKNAME_CUE.test(words.slice(0, ring.index)) ? 'clarify' : 'ring';
  }
  if (opts.called) return null;
  const asked = new RegExp(
    String.raw`${DID_YOU_CALL}${WHEN}(?:[\s,]+(?:${alt(names)}))?\s*(?:[?.!]|$)`,
    'iu'
  );
  return asked.test(words) ? 'did-you-call' : null;
}

/** "call me <Ferni or a teammate>" in any reading: never a name for the caller. */
export function callMeAddressesTeam(words: string): boolean {
  return TEAM_FIRST_NAMES.some((persona) => {
    const intent = callMeIntent(words, { persona, called: true });
    return intent === 'ring' || intent === 'clarify';
  });
}

/** A word right after "call me" that is Ferni or a teammate as STT spells it. */
export function isTeamVocative(word: string): boolean {
  const w = word.trim().toLowerCase();
  return TEAM_FIRST_NAMES.some((persona) => vocativesFor(persona).includes(w));
}
