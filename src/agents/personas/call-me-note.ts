/**
 * CALL_ME_VOCATIVE=on: the turn line for "call me, Ferni", "call me Fern" and
 * "did you call me?".
 *
 * callUser was on every turn (same-turn-tools-config.ts), yet the model read
 * "Can you call me Fern?" as a nickname and "Did you give me a call?" as a
 * question to answer "no". This line says what the words ask
 * (utils/call-me-vocative.ts): ring now, or, when "call me <a name like
 * yours>" could be either, ask which and let the answer decide
 * (name-confirm.ts). Never a second call once callUser ran on this call, and
 * never with crisis guidance (`careful`).
 *
 * @module agents/personas/call-me-note
 */

import type { llm } from '@livekit/agents';

import { type Env } from '../../config/env-flag.js';
import { callMeVocativeEnabled, readCallMe } from '../../utils/call-me-vocative.js';
import { eitherNote, personaFirstNameOf, propose, settle } from './name-confirm.js';

/** Whether callUser was called earlier on this call. */
export function calledUserThisCall(items: readonly llm.ChatItem[]): boolean {
  return items.some((item) => item.type === 'function_call' && item.name === 'callUser');
}

const RING = (persona: string): string =>
  `They are asking you to phone them now ("call me" with your name, ${persona}, is a call, ` +
  `not a name for them). Call callUser in this reply.`;
const ALREADY = `You already called their phone on this call. Say so; don't call callUser again in this reply.`;
const DID_YOU_CALL = (plain: boolean): string =>
  `You haven't called them on this call, and asking if you did most likely means they want ` +
  `one. Don't just say no: offer to ring their phone now${plain ? '' : ' ("Want me to ring your phone now?")'}.`;

const firstOf = (name: string | undefined): string => name?.split(/\s+/)[0]?.toLowerCase() ?? '';

/**
 * One line for a turn that asks the persona to phone them, may ask it, or asks
 * whether it did; '' otherwise, with the flag off, or with crisis guidance.
 * `plain`: no quoted example (SCRIPT_FREE_REMINDER, script-free.ts).
 */
export function callMeNote(
  chatCtx: llm.ChatContext,
  session: object,
  words: string,
  opts: { plain?: boolean; careful?: boolean } = {},
  env: Env = process.env
): string {
  if (!callMeVocativeEnabled(env) || !words || opts.careful === true) return '';
  const persona = personaFirstNameOf(session);
  const plain = opts.plain === true;
  const ring = (): string => (calledUserThisCall(chatCtx.items) ? ALREADY : RING(persona));
  const answered = settle(session, 'either', words);
  if (answered && answered.outcome !== 'dropped') {
    if (answered.outcome === 'waiting') return eitherNote(answered.pending, persona, plain);
    return answered.outcome === 'ring' ? ring() : '';
  }
  const reading = readCallMe(words, persona);
  if (reading.intent === 'ring') return ring();
  if (reading.intent === 'did-you-call')
    return calledUserThisCall(chatCtx.items) ? '' : DID_YOU_CALL(plain);
  return reading.intent === 'ask' && reading.name
    ? askEither(session, words, reading.name, plain)
    : '';
}

/** "call me <a name like yours>": ask ring or name, and wait for the answer (name-confirm.ts). */
function askEither(session: object, words: string, name: string, plain: boolean): string {
  const callerName = (session as { userData?: { userName?: string } }).userData?.userName;
  const pending = {
    kind: 'either' as const,
    name,
    askedOn: words,
    ownName: firstOf(callerName) === name.toLowerCase(),
  };
  propose(session, pending);
  return eitherNote(pending, personaFirstNameOf(session), plain);
}
