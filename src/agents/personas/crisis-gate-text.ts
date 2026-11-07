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
import { withTurnStyleReminder } from './turn-style.js';

/** One earlier turn of a typed conversation. */
export interface TypedTurn {
  from: 'person' | 'agent';
  text: string;
}

export type TypedCrisisRead =
  /** The crisis script, as the voice turn speaks it; the model is not asked. */
  | { action: 'replace'; reply: string }
  /** The message for the model: with the voice turn's crisis guidance on 'guide'. */
  | { action: 'guide' | 'pass'; message: string };

/** The crisis read of a typed message, before the model or any read of the person's data. */
export async function readTypedMessageForCrisis(
  message: string,
  earlier: readonly TypedTurn[] = [],
  options: CrisisGateOptions = {}
): Promise<TypedCrisisRead> {
  // A scene opening carries no new words of theirs; each earlier turn was read when it was sent.
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
  const guided = withTurnStyleReminder(chatCtx, decision.guidance).items.at(-1);
  return { action: 'guide', message: (guided as llm.ChatMessage).textContent ?? message };
}
