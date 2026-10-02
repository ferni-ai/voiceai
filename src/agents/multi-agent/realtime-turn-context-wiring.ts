/**
 * Realtime Turn Context Wiring
 *
 * Realtime models that detect turns server-side never call
 * onUserTurnCompleted, so the same per-turn context is pushed into the
 * session between turns instead (informs the next reply). This wires the
 * pusher from turn-intelligence.ts onto the session's events.
 *
 * Extracted from agent-setup.ts; behavior is unchanged.
 *
 * @module agents/multi-agent/realtime-turn-context-wiring
 */

import { createLogger } from '../../utils/safe-logger.js';
import { createRealtimeTurnContextPusher, type UserTurnHook } from './turn-intelligence.js';

const log = createLogger({ module: 'RealtimeTurnContext' });

/** The slice of the AgentSession this needs. */
export interface RealtimeTurnSession {
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
}

/** The agent the context is pushed into. */
export type RealtimeTurnAgent = Parameters<typeof createRealtimeTurnContextPusher>[1];

/** Push per-turn context between turns. Returns the unsubscribe. */
export function wireRealtimeTurnContext(
  session: RealtimeTurnSession,
  turnHook: UserTurnHook,
  agent: RealtimeTurnAgent
): () => void {
  const pusher = createRealtimeTurnContextPusher(turnHook, agent);
  const onTranscript = (event: unknown) => {
    const evt = event as { transcript?: string; isFinal?: boolean };
    if (!evt.isFinal || !evt.transcript) return;
    pusher
      .onFinalTranscript(evt.transcript)
      .catch((error: unknown) =>
        log.warn({ error: String(error) }, 'Realtime turn context failed')
      );
  };
  const onAgentState = (event: unknown) => {
    pusher
      .onAgentState((event as { newState?: string }).newState)
      .catch((error: unknown) =>
        log.warn({ error: String(error) }, 'Realtime turn context push failed')
      );
  };
  session.on?.('user_input_transcribed', onTranscript);
  session.on?.('agent_state_changed', onAgentState);
  return () => {
    session.off?.('user_input_transcribed', onTranscript);
    session.off?.('agent_state_changed', onAgentState);
  };
}
