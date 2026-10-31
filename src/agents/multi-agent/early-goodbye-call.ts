/**
 * The call's side of HANDOFF_EARLY_GOODBYE (tools/handoff/early-goodbye.ts): the
 * persona on the call, whether the goodbye must wait (a handoff already running or
 * holding the call's handoff lock, or a crisis verdict holding the reply), and the
 * departure line the orchestrator would pick (family-table.ts).
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

/** The call's handoff lock (multi-agent-mode.ts): held, the voiceSwitch handler would refuse */
interface HandoffLockView {
  held(): boolean;
}

export function earlyGoodbyeCall(
  orchestrator: Orchestrated,
  callId: string,
  userEmotion: () => string | undefined,
  lock?: HandoffLockView
): EarlyGoodbyeCall {
  return {
    activeAgent: () => orchestrator.getActiveAgent(),
    running: () => orchestrator.isHandoffInProgress() || Boolean(lock?.held()),
    busy: () =>
      orchestrator.isHandoffInProgress() ||
      Boolean(lock?.held()) ||
      crisisHeld(orchestrator.getActiveAgent()),
    line: (agent, to) =>
      familyDeparture(agent, { targetPersonaId: to, userEmotion: userEmotion() }, callId),
  };
}

/** Lend this call to its handoff tools for the early goodbye; returns the undo. */
export function startEarlyGoodbye(
  orchestrator: Orchestrated,
  call: {
    services: {
      sessionId?: unknown;
      sessionPriming?: { emotionalContext?: { lastEmotion?: string } } | null;
    };
    sessionId: string;
  },
  lock: HandoffLockView
): () => void {
  const { services, sessionId } = call;
  const emotion = (): string | undefined => services.sessionPriming?.emotionalContext?.lastEmotion;
  return registerEarlyGoodbye(
    String(services.sessionId),
    earlyGoodbyeCall(orchestrator, sessionId, emotion, lock)
  );
}
