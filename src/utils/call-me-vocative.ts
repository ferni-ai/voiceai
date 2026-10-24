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
 *   call placed this session: most likely a request, so offer to ring. A
 *   question about a call is checked first and is never `ring`: "Did you call
 *   me, Ferni?" holds "call me, Ferni" too.
 * - `already-called`: `ring` or `clarify` once callUser ran this session, so
 *   no reading ever asks for a second call.
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

export type CallMeIntent = 'ring' | 'clarify' | 'did-you-call' | 'already-called';

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
/** "did/have/were you (just) call me / give me a call / try calling me": a question, never a request. */
const ASKS_IF_CALLED = String.raw`\b(?:did|have|has|were|was)\s+(?:you|ya)\s+(?:(?:just|already|ever|been|even)\s+){0,2}(?:g[ai]ve\s+me\s+a\s+(?:call|ring|buzz)|call(?:ed|ing)?\s+me|ring(?:ed|ing)?\s+me|phon(?:e|ed|ing)\s+me|tr(?:y|ied|ying)\s+(?:to\s+call|to\s+ring|calling|ringing)\s+me)`;
const WHEN = String.raw`(?:\s+(?:yet|today|earlier|before|already|back|yesterday|last night|this morning))?`;

/** "call me <one of names>": `ring`, or `clarify` after a nickname cue or when it is their own name. */
function ringIntent(words: string, names: string[], callerName?: string): CallMeIntent | null {
  const ring = new RegExp(
    String.raw`\bcall\s+me[\s,.…-]+(?:(?:up|now|please)[\s,.]+)?(${alt(names)})${END}`,
    'iu'
  ).exec(words);
  if (!ring) return null;
  const heard = ring[1].toLowerCase();
  const own = callerName?.split(/\s+/)[0]?.toLowerCase() === heard;
  return own || NICKNAME_CUE.test(words.slice(0, ring.index)) ? 'clarify' : 'ring';
}

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
  if (new RegExp(ASKS_IF_CALLED, 'iu').test(words)) {
    // "Did you just call me crazy?" asks about a call too, but isn't one: nothing.
    const plain = new RegExp(
      String.raw`${ASKS_IF_CALLED}${WHEN}(?:[\s,]+(?:${alt(names)}))?\s*(?:[?.!]|$)`,
      'iu'
    );
    return plain.test(words) && opts.called !== true ? 'did-you-call' : null;
  }
  const asks = ringIntent(words, names, opts.callerName);
  if (!asks) return null;
  return opts.called === true ? 'already-called' : asks;
}

/** "call me <Ferni or a teammate>" in any reading: never a name for the caller. */
export function callMeAddressesTeam(words: string): boolean {
  return TEAM_FIRST_NAMES.some((persona) => ringIntent(words, vocativesFor(persona)) !== null);
}

/** A word right after "call me" that is Ferni or a teammate as STT spells it. */
export function isTeamVocative(word: string): boolean {
  const w = word.trim().toLowerCase();
  return TEAM_FIRST_NAMES.some((persona) => vocativesFor(persona).includes(w));
}
