/**
 * CALL_ME_VOCATIVE=on: the turn line for "call me, Ferni" and "did you call me?".
 *
 * callUser was on every turn (same-turn-tools-config.ts), yet the model read
 * "Can you call me Fern?" as a nickname and "Did you give me a call?" as a
 * question to answer "no". This line says which it is, from the words
 * (utils/call-me-vocative.ts) and whether callUser already ran on this call.
 * Never with crisis guidance (`careful`).
 *
 * @module agents/personas/call-me-note
 */

import type { llm } from '@livekit/agents';

import { type Env } from '../../config/env-flag.js';
import { getPersonaDisplayName } from '../../personas/voice-registry.js';
import { callMeIntent, callMeVocativeEnabled } from '../../utils/call-me-vocative.js';

/** Whether callUser was called earlier on this call. */
export function calledUserThisCall(items: readonly llm.ChatItem[]): boolean {
  return items.some((item) => item.type === 'function_call' && item.name === 'callUser');
}

interface Caller {
  userName?: string;
  personaId?: string;
}

/** The speaking persona's first name ("Ferni", "Maya"), as locked-teammates.ts reads it. */
const personaNameOf = (caller: Caller | undefined): string =>
  getPersonaDisplayName(caller?.personaId ?? 'ferni').split(/\s+/)[0] ?? 'Ferni';

const RING = (name: string): string =>
  `"Call me" with your name after it means they are saying your name, ${name}: ` +
  `they want you to phone them now, not to be called by your name. Call callUser in this reply.`;

/**
 * One line for a turn that asks the persona to phone them, or asks whether it
 * did; '' otherwise, with the flag off, or with crisis guidance. `plain`: no
 * quoted example (SCRIPT_FREE_REMINDER, script-free.ts).
 */
export function callMeNote(
  chatCtx: llm.ChatContext,
  session: object,
  words: string,
  opts: { plain?: boolean; careful?: boolean } = {},
  env: Env = process.env
): string {
  if (!callMeVocativeEnabled(env) || !words || opts.careful === true) return '';
  const caller = (session as { userData?: Caller }).userData;
  const name = personaNameOf(caller);
  const intent = callMeIntent(words, {
    persona: name,
    callerName: caller?.userName,
    called: calledUserThisCall(chatCtx.items),
  });
  if (intent === 'ring') return RING(name);
  if (intent === 'already-called') {
    return `You already called their phone on this call. Say so; don't call callUser again in this reply.`;
  }
  if (intent === 'clarify') {
    return (
      `"Call me" with your name could be a phone call or a name for them. Don't guess: ` +
      `ask one short question${opts.plain === true ? '' : ' ("On your phone?")'}, and call callUser only on a yes.`
    );
  }
  if (intent === 'did-you-call') {
    return (
      `You haven't called them on this call, and asking if you did most likely means they want ` +
      `one. Don't just say no: offer to ring their phone now${opts.plain === true ? '' : ' ("Want me to ring your phone now?")'}.`
    );
  }
  return '';
}
