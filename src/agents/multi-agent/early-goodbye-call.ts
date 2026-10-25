/**
 * The call's side of HANDOFF_EARLY_GOODBYE (tools/handoff/early-goodbye.ts): the
 * persona on the call, whether the goodbye must wait (a handoff already running,
 * or a crisis verdict holding the reply), and the departure line the
 * orchestrator would pick (family-table.ts).
 *
 * @module agents/multi-agent/early-goodbye-call
 */
import {
  registerEarlyGoodbye,
  type EarlyGoodbyeCall,
  type OutgoingPersona,
} from '../../tools/handoff/early-goodbye.js';
import { crisisVerdictPending } from '../safety/crisis-gate-signal.js';
import { familyDeparture } from './family-table.js';

interface Orchestrated {
  getActiveAgent(): OutgoingPersona | null;
  isHandoffInProgress(): boolean;
}

const crisisHeld = (agent: OutgoingPersona | null): boolean => {
  const session = agent?.session;
  return typeof session === 'object' && session !== null && crisisVerdictPending(session) !== null;
};

export function earlyGoodbyeCall(
  orchestrator: Orchestrated,
  callId: string,
  userEmotion: () => string | undefined
): EarlyGoodbyeCall {
  return {
    activeAgent: () => orchestrator.getActiveAgent(),
    busy: () => orchestrator.isHandoffInProgress() || crisisHeld(orchestrator.getActiveAgent()),
    line: (agent, to) =>
      familyDeparture(agent, { targetPersonaId: to, userEmotion: userEmotion() }, callId),
  };
}

/** Lend this call to its handoff tools for the early goodbye; returns the undo. */
export function startEarlyGoodbye(
  orchestrator: Orchestrated,
  services: {
    sessionId?: unknown;
    sessionPriming?: { emotionalContext?: { lastEmotion?: string } } | null;
  },
  callId: string
): () => void {
  const emotion = (): string | undefined => services.sessionPriming?.emotionalContext?.lastEmotion;
  return registerEarlyGoodbye(
    String(services.sessionId),
    earlyGoodbyeCall(orchestrator, callId, emotion)
  );
}
