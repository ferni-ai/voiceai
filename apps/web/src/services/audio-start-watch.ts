/**
 * Audio Start Watch
 *
 * Notices when Ferni has joined the call but none of his audio is playing, so
 * the app can say so instead of showing a live call over silence. iOS has the
 * same watchdog (CallSession `audioDidNotStart`).
 *
 * Armed once the agent has joined. Stands down for good on the first agent
 * audio element that is actually playing (subscribed and attached is not
 * enough: an attached track can still never play), when the browser blocks
 * playback ("Tap to hear Ferni" owns that case), or on cleanup.
 *
 * Fires at most once, and never once the user is hanging up or the room has
 * dropped. It only reports: the connection state stays what it is.
 */

import { createLogger } from '../utils/logger.js';
import { AUDIO_PLAY_BLOCKED_EVENT } from './audio-play-blocked.js';

const log = createLogger('AudioStartWatch');

/** The iOS deadline (CallSession `audioStartTimeout`), counted from the agent joining. */
export const AUDIO_START_DEADLINE_MS = 3_000;

export interface AudioStartRoom {
  state: string;
  /** LiveKit: false while the browser refuses to play audio. */
  canPlaybackAudio?: boolean;
  on(event: 'audioPlaybackChanged', callback: () => void): unknown;
  off(event: 'audioPlaybackChanged', callback: () => void): unknown;
}

export interface AudioStartDeps {
  /** The elements attached to the agent's subscribed audio tracks. */
  agentAudio: () => Iterable<HTMLMediaElement>;
  /** True once the user has started hanging up. */
  userHangingUp: () => boolean;
  /** Ferni is here, and nothing he sends is playing. */
  onAudioNotStarted: () => void;
  deadlineMs?: number;
}

/** Playing, not just attached: play() went through and media is flowing. */
export function isPlaying(element: HTMLMediaElement): boolean {
  return !element.paused && !element.ended && element.readyState >= element.HAVE_FUTURE_DATA;
}

/**
 * Start the deadline on `room` (call it once the agent has joined). Returns the
 * cleanup function; the connection service runs it on hang-up and every teardown.
 */
export function watchAudioStart(room: AudioStartRoom, deps: AudioStartDeps): () => void {
  const deadlineMs = deps.deadlineMs ?? AUDIO_START_DEADLINE_MS;
  const heard = (): boolean => [...deps.agentAudio()].some(isPlaying);
  if (room.canPlaybackAudio === false || heard()) return () => undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function standDown(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    document.removeEventListener('playing', onPlaying, true);
    document.removeEventListener(AUDIO_PLAY_BLOCKED_EVENT, standDown);
    room.off('audioPlaybackChanged', onPlaybackChanged);
  }
  function onPlaying(event: Event): void {
    if ([...deps.agentAudio()].some((element) => element === event.target)) standDown();
  }
  function onPlaybackChanged(): void {
    if (room.canPlaybackAudio === false) standDown();
  }
  function expire(): void {
    const stillOnTheLine = !deps.userHangingUp() && room.state === 'connected';
    const silent = !heard();
    standDown();
    if (!stillOnTheLine || !silent) return;
    log.warn('Ferni joined but none of his audio is playing', { deadlineMs });
    deps.onAudioNotStarted();
  }

  // 'playing' doesn't bubble; the agent's elements live in the document, so capture it.
  document.addEventListener('playing', onPlaying, true);
  document.addEventListener(AUDIO_PLAY_BLOCKED_EVENT, standDown);
  room.on('audioPlaybackChanged', onPlaybackChanged);
  timer = setTimeout(expire, deadlineMs);
  return standDown;
}
