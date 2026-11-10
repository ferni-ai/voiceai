/**
 * The voice reply's crisis gate (crisis-gate.ts) for a typed message: the same patterns,
 * classifier and scripts, read before the route touches anything else.
 *
 * The typed turn and its earlier turns go into a chat context the way the voice turn's
 * request carries them, so startCrisisGate reads exactly what it reads on a call. A
 * classifier escalation supersedes the patterns, as it does for the held voice reply.
 *
 * @module CrisisGateText
 */

import { llm } from '@livekit/agents';
import { startCrisisGate, type CrisisGateOptions } from './crisis-gate.js';
import { crisisScriptFor } from './crisis-gate-words.js';

/** One earlier turn of a typed conversation. */
export interface TypedTurn {
  from: 'person' | 'agent';
  text: string;
}

export type TypedCrisisRead =
  /** The crisis script, as the voice turn speaks it; the model is not asked. */
  | { action: 'replace'; reply: string }
  /**
   * The person's words as typed, and the voice turn's crisis guidance as a note. The route
   * puts the note last in its prompt (only the speaker cue after it): the end of a prompt
   * carries the most weight, so no style line or instruction may follow the guidance.
   */
  | { action: 'guide'; message: string; guidanceNote: string }
  | { action: 'pass'; message: string };

/** The crisis read of a typed message, before the model or any read of the person's data. */
export async function readTypedMessageForCrisis(
  message: string,
  earlier: readonly TypedTurn[] = [],
  options: CrisisGateOptions = {}
): Promise<TypedCrisisRead> {
  // No words to read. (The chat route reads a scene opening as the message itself.)
  if (!message.trim()) return { action: 'pass', message };
  const chatCtx = llm.ChatContext.empty();
  for (const turn of earlier)
    chatCtx.addMessage({ role: turn.from === 'person' ? 'user' : 'assistant', content: turn.text });
  chatCtx.addMessage({ role: 'user', content: message });

  const gate = startCrisisGate(chatCtx, undefined, options);
  if (!gate) return { action: 'pass', message };
  const escalated =
    gate.decision.action === 'replace' ? null : await gate.escalation?.catch(() => null);
  const decision = escalated && escalated.action !== 'pass' ? escalated : gate.decision;
  if (decision.action === 'replace') {
    const reply = crisisScriptFor(decision.script, chatCtx, undefined, options.env ?? process.env);
    return { action: 'replace', reply };
  }
  if (decision.action === 'pass') return { action: 'pass', message };
  return { action: 'guide', message, guidanceNote: `(${decision.guidance})` };
}
