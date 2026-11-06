/**
 * Agent-lost prompt: what the caller sees when Ferni's side of the call ends
 * while they are still on it (services/agent-drop-watch.ts decides when).
 *
 * One call notice, "Ferni dropped off the line. Reconnect?", with Reconnect
 * (hang up this dead call, then the normal connect path: new token and agent
 * dispatch, so the server can pick the conversation back up) and End call.
 * Focus moves to Reconnect because the prompt appears on its own, mid-call.
 *
 * The same rejoin backs "The sound didn't start. Try again in a moment." when
 * Ferni is here but none of his audio plays (services/audio-start-watch.ts):
 * one Try again, and End call stays in the call controls.
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

/** Hang up this call, then the normal connect path. */
function rejoin(call: AgentLostCall, after: string): void {
  void call
    .endCall()
    .then(() => call.connect())
    .catch((err: unknown) => log.warn(`Reconnect after ${after} failed`, err));
}

export function showAgentLostPrompt(call: AgentLostCall): void {
  showCallNotice(connectFailure('agent_left'), {
    onRetry: () => rejoin(call, 'agent drop'),
    onEnd: () => {
      void call
        .endCall()
        .catch((err: unknown) => log.warn('End call after agent drop failed', err));
    },
    focusAction: true,
  });
}

export function showAudioNotStartedPrompt(call: AgentLostCall): void {
  showCallNotice(connectFailure('audio_not_started'), {
    onRetry: () => rejoin(call, 'silent start'),
    focusAction: true,
  });
}
