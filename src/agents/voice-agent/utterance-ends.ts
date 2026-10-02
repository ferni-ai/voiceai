/**
 * Utterance Ends
 *
 * Adapts a LiveKit AgentSession into the audio processor's `utteranceEnds`
 * subscription, so voice emotion is analyzed at the end of each utterance
 * rather than when the audio stream ends (call end).
 *
 * @module voice-agent/utterance-ends
 */

import { voice } from '@livekit/agents';

/** Subscribe to the end of each user utterance; returns the unsubscribe */
export type UtteranceEndsSubscriber = (onEnd: () => void) => () => void;

/** utteranceEnds for a LiveKit AgentSession: fires each time the caller stops speaking. */
export function utteranceEndsOf<T>(session: voice.AgentSession<T>): UtteranceEndsSubscriber {
  return (onEnd) => {
    const handler = (ev: voice.UserStateChangedEvent): void => {
      if (ev.oldState === 'speaking' && ev.newState !== 'speaking') onEnd();
    };
    session.on(voice.AgentSessionEventTypes.UserStateChanged, handler);
    return () => session.off(voice.AgentSessionEventTypes.UserStateChanged, handler);
  };
}
