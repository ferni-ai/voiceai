/**
 * Audio Start Timing
 *
 * One counts-only log line per call, flag or no flag, so the silent-start
 * deadlines (audio-start-watch.ts) can be checked against real calls
 * (p50/p95/p99) before WEB_AUDIO_START_WATCH goes on. From the moment Ferni has
 * joined, it measures:
 * - `agent_join_to_first_audio_track_ms`: to his first audio track, published or
 *   subscribed, whichever the client sees first (0 if it was already there);
 * - `first_audio_track_to_playing_ms`: from that track to one of his elements
 *   playing (agent-audio.ts: a guest's audio never counts);
 * - `playback_blocked`: the browser blocked playback on the way, so the second
 *   number includes the caller's "Tap to hear" tap.
 * A step the call never reached is null. No ids, no text. The field names are
 * the ones client_presence_counts reuses.
 *
 * Logged once, when his audio first plays or when the call is cleaned up,
 * whichever comes first. Logged at warn, like the disconnect report, because a
 * deployed build logs warn and above by default. No timers and no UI.
 */

import { createLogger } from '../utils/logger.js';
import {
  agentAudioElements,
  agentHasAudioTrack,
  isPlaying,
  onAgentAudioPlaying,
  onAgentAudioTrack,
  type AgentAudioRoom,
} from './agent-audio.js';
import { AUDIO_PLAY_BLOCKED_EVENT } from './audio-play-blocked.js';

const log = createLogger('AudioStartTiming');

export interface AudioStartTiming {
  agent_join_to_first_audio_track_ms: number | null;
  first_audio_track_to_playing_ms: number | null;
  playback_blocked: boolean;
}

const since = (from: number | null, to: number | null): number | null =>
  from === null || to === null ? null : Math.round(to - from);

/** Start timing `room` from Ferni's joining. Returns the cleanup function, which logs if nothing has yet. */
export function timeAudioStart(
  room: AgentAudioRoom,
  now: () => number = () => performance.now()
): () => void {
  const joinedAt = now();
  let trackAt = agentHasAudioTrack(room) ? joinedAt : null;
  let playingAt = agentAudioElements(room).some(isPlaying) ? joinedAt : null;
  let blocked = room.canPlaybackAudio === false;
  let logged = false;
  const stops: (() => void)[] = [];

  const onBlocked = (): void => {
    blocked = true;
  };
  const onPlaybackChanged = (): void => {
    if (room.canPlaybackAudio === false) blocked = true;
  };
  function report(): void {
    for (const stop of stops.splice(0)) stop();
    if (logged) return;
    logged = true;
    const timing: AudioStartTiming = {
      agent_join_to_first_audio_track_ms: since(joinedAt, trackAt),
      first_audio_track_to_playing_ms: since(trackAt, playingAt),
      playback_blocked: blocked,
    };
    log.warn(timing, 'Agent audio start timing');
  }

  if (playingAt !== null) {
    report();
    return report;
  }
  room.on('audioPlaybackChanged', onPlaybackChanged);
  document.addEventListener(AUDIO_PLAY_BLOCKED_EVENT, onBlocked);
  stops.push(
    () => room.off('audioPlaybackChanged', onPlaybackChanged),
    () => document.removeEventListener(AUDIO_PLAY_BLOCKED_EVENT, onBlocked),
    onAgentAudioTrack(room, () => {
      trackAt ??= now();
    }),
    onAgentAudioPlaying(room, () => {
      playingAt = now();
      report();
    })
  );
  return report;
}
