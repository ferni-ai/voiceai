/**
 * Which of the agent's audio tracks is his voice, by the name it was published under.
 *
 * - `roomio_audio`: the voice. The LiveKit agents SDK's room output publishes
 *   the TTS under this name.
 * - `background_*`: everything else Ferni plays. `background_audio` is the
 *   SDK's BackgroundAudioPlayer (music, ambient clips) and
 *   `background_reactions` is the direct clip track
 *   (src/agents/integrations/direct-clip-track.ts).
 *
 * Anything else is 'unknown', and the caller falls back to arrival order.
 */

export const VOICE_TRACK_NAME = 'roomio_audio';
export const BACKGROUND_TRACK_PREFIX = 'background_';

export type AgentAudioTrackKind = 'voice' | 'music' | 'unknown';

/** Classifies a remote track publication (livekit-client's `trackName`). */
export function agentAudioTrackKind(publication: unknown): AgentAudioTrackKind {
  const name =
    typeof publication === 'object' && publication !== null
      ? (publication as { trackName?: unknown }).trackName
      : undefined;
  if (typeof name !== 'string') return 'unknown';
  if (name === VOICE_TRACK_NAME) return 'voice';
  return name.startsWith(BACKGROUND_TRACK_PREFIX) ? 'music' : 'unknown';
}
