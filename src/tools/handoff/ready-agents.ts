/**
 * The next persona's Agent, built for a handoff the LLM asked for, waiting for the handoff
 * tool to hand it to the SDK (single-session handoffs, agents/multi-agent/persona-swap.ts).
 *
 * The tool can't wait for the switch itself: the switch waits for the outgoing persona's
 * speech, which waits for the tool. So the multi-agent handler builds the Agent, offers
 * it here and lets the tool finish; the tool returns `llm.handoff({ agent })` and the SDK
 * swaps once the tool call is over. Keyed by call, so concurrent calls never mix.
 */
import { toCanonicalId } from './state.js';

const offered = new Map<string, unknown>();
const key = (sessionId: string, personaId: string) => `${sessionId}:${toCanonicalId(personaId)}`;

export function offerAgent(sessionId: string, personaId: string, agent: unknown): void {
  offered.set(key(sessionId, personaId), agent);
}

/** The offered Agent, once: the tool takes it to return as its handoff */
export function takeOfferedAgent(sessionId: string, personaId: string): unknown {
  const k = key(sessionId, personaId);
  const agent = offered.get(k);
  offered.delete(k);
  return agent;
}

/** A handoff that failed before the tool took its Agent */
export function withdrawAgent(sessionId: string, personaId: string): void {
  offered.delete(key(sessionId, personaId));
}
