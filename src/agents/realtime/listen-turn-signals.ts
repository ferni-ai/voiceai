/**
 * Listen-turn signals: what the avatar needs to show it is listening.
 *
 * The speech-state dispatcher only sends `speech_pause` (and the
 * `active_listening_nod` humanization signal) while its tracker says the
 * caller is speaking, and only `dispatchSpeechStart` sets that. Nothing in
 * production called it, so pauses never reached the client and the avatar
 * never nodded. The audio processor also sent a random 12-18 breaths/min
 * every 5 s of speech as if it had measured one.
 *
 * AVATAR_LISTEN_SIGNALS=on: dispatch `speech_start` at the onset of each
 * caller turn (as the breath-pause detector sees it), so the pause nods fire,
 * and send no breath rate (nothing measures one). Off: the old behaviour,
 * random breath rate included.
 *
 * @module agents/realtime/listen-turn-signals
 */

import {
  clearSpeechStateTracker,
  dispatchBreathDetected,
  dispatchSpeechStart,
  type SendDataMessageFn,
} from './speech-state-dispatcher.js';

/** AVATAR_LISTEN_SIGNALS=on turns on the avatar's listening signals. Off by default. */
export function avatarListenSignalsEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.AVATAR_LISTEN_SIGNALS === 'on';
}

export interface ListenTurnSignals {
  /**
   * Call once per audio frame, after the breath-pause detector has seen it.
   * `userSpeaking`: the detector hears speech now (not in a pause).
   * `speechDurationMs`: the detector's current turn length; 0 once a long
   * pause has ended the turn.
   */
  onFrame(userSpeaking: boolean, speechDurationMs: number): void;
}

const sessions = new Map<string, ListenTurnSignals>();

/** Build the per-session signals. Exported for tests; production uses getListenTurnSignals. */
export function createListenTurnSignals(
  sessionId: string,
  send: SendDataMessageFn,
  enabled = avatarListenSignalsEnabled()
): ListenTurnSignals {
  let inTurn = false;
  return {
    onFrame(userSpeaking, speechDurationMs) {
      if (!enabled) {
        // Legacy: an unmeasured breath rate every 5 s of speech.
        if (speechDurationMs > 0 && speechDurationMs % 5000 < 100) {
          const estimatedBreathRate = Math.round(12 + Math.random() * 6); // 12-18 BPM
          void dispatchBreathDetected(sessionId, send, estimatedBreathRate);
        }
        return;
      }
      if (!inTurn && userSpeaking) {
        inTurn = true;
        void dispatchSpeechStart(sessionId, send);
      } else if (inTurn && !userSpeaking && speechDurationMs === 0) {
        inTurn = false;
      }
    },
  };
}

/** The session's listen-turn signals, created on first use. */
export function getListenTurnSignals(
  sessionId: string,
  send: SendDataMessageFn
): ListenTurnSignals {
  let signals = sessions.get(sessionId);
  if (!signals) {
    signals = createListenTurnSignals(sessionId, send);
    sessions.set(sessionId, signals);
  }
  return signals;
}

/** Forget a session's signals and its speech-state tracker (end of its audio stream). */
export function clearListenTurnSignals(sessionId: string): void {
  sessions.delete(sessionId);
  clearSpeechStateTracker(sessionId);
}
