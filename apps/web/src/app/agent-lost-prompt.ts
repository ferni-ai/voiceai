/**
 * Agent-lost prompt: what the caller sees when Ferni's side of the call ends
 * while they are still on it (services/agent-drop-watch.ts decides when).
 *
 * One call notice, "Ferni dropped off the line. Reconnect?", with Reconnect
 * (hang up this dead call, then the normal connect path: new token and agent
 * dispatch, so the server can pick the conversation back up) and End call.
 * Focus moves to Reconnect because the prompt appears on its own, mid-call.
 */

import { connectFailure } from '../services/connect-failure.js';
import { showCallNotice } from '../ui/call-status.ui.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('AgentLostPrompt');

export interface AgentLostCall {
  /** The app's standard hang-up (room, UI and stats). */
  endCall(): Promise<void>;
  /** The app's normal connect path. */
  connect(): Promise<void>;
}

export function showAgentLostPrompt(call: AgentLostCall): void {
  showCallNotice(connectFailure('agent_left'), {
    onRetry: () => {
      void call
        .endCall()
        .then(() => call.connect())
        .catch((err: unknown) => log.warn('Reconnect after agent drop failed', err));
    },
    onEnd: () => {
      void call
        .endCall()
        .catch((err: unknown) => log.warn('End call after agent drop failed', err));
    },
    focusAction: true,
  });
}
