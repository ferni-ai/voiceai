/**
 * What a handoff tool returns when the switch never happened.
 *
 * The executor marks the target as the current agent before it asks the voice handler to
 * switch, so the handler's helpers see who is coming in. When the handler then reports a
 * failure (the next persona's session or voice didn't start, the call was mid-handoff) or
 * never answers, the executor still returned success: the model was told
 * `handoff_complete` and spoke as the teammate in the old voice, the call's state named a
 * persona who wasn't there ("Already with Maya" on the next ask), and the handoff went into
 * the history the analytics and the next turn's "you just took over" note read.
 *
 * @module tools/handoff/unconfirmed-handoff
 */
import type { AgentId } from '../../services/agent-bus.js';
import type { HandoffResult } from './executor.js';
import { type HandoffSessionState, setCurrentAgent as setSessionAgent } from './session-state.js';
import { setCurrentAgent } from './state.js';

export interface UnconfirmedHandoff {
  sessionState: HandoffSessionState | null;
  previousAgent: AgentId;
  targetAgent: string;
  targetAgentName: string;
}

/** Puts the current agent back to the one still on the call, and says the handoff failed */
export function handoffNotConfirmed(h: UnconfirmedHandoff): HandoffResult {
  if (h.sessionState) setSessionAgent(h.sessionState, h.previousAgent);
  setCurrentAgent(h.previousAgent);
  return {
    success: false,
    // The model reads this: plain words, nothing technical to repeat to the caller
    error: `${h.targetAgentName} couldn't join the call, so you're still the one talking with them.`,
    targetAgent: h.targetAgent,
    targetAgentName: h.targetAgentName,
    previousAgent: h.previousAgent,
    greeting: '',
    greetingSpoken: false,
    instructionsUpdated: false,
  };
}
