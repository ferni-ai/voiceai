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
 * one Try again, and End call stays in the call controls. That notice is added
 * beside anything already showing (a crisis line must stay visible) and is
 * removed only through the handle it returns.
 *
 * One message, never two: once Ferni has dropped off, that is what the silence
 * means. The drop prompt takes down this module's own "sound didn't start", and
 * "sound didn't start" is not shown while the drop prompt is up.
 */

import { connectFailure } from '../services/connect-failure.js';
import { addCallNotice, showCallNotice, shownCallNoticeKind } from '../ui/call-status.ui.js';
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

/** Removes the "sound didn't start" notice this module showed, if it is still up. */
let removeAudioNotStarted: (() => void) | undefined;

export function showAgentLostPrompt(call: AgentLostCall): void {
  removeAudioNotStarted?.();
  removeAudioNotStarted = undefined;
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

/** Returns the function that removes this notice, and only this notice; nothing if Ferni has dropped off. */
export function showAudioNotStartedPrompt(call: AgentLostCall): (() => void) | undefined {
  if (shownCallNoticeKind() === 'agent_left') return undefined;
  const remove = addCallNotice(connectFailure('audio_not_started'), () =>
    rejoin(call, 'silent start')
  );
  removeAudioNotStarted = remove;
  return remove;
}
