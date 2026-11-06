/**
 * Audio Start Watch
 *
 * Notices when Ferni is on the call but none of his audio is playing, so the app
 * can say so instead of showing a live call over silence. iOS has the same
 * watchdog (CallSession `audioDidNotStart`). Off unless WEB_AUDIO_START_WATCH is
 * on (config/audio-start-watch-flag.ts); the timing line (audio-start-timing.ts)
 * is logged on every call either way.
 *
 * Two deadlines, so a slow start is never called a failure:
 * - once Ferni's audio track exists (published or subscribed, whichever we see
 *   first), it has AUDIO_START_DEADLINE_MS to start playing. This is the iOS case:
 *   his audio is there but we can't hear it.
 * - if he joins and never sends an audio track at all, AUDIO_PUBLISH_DEADLINE_MS
 *   from his joining covers that silence instead.
 *
 * Only Ferni's audio counts (agent-audio.ts): a guest's audio playing does not
 * stand it down. Stands down for good on the first of his elements that is
 * actually playing (subscribed and attached is not enough: an attached track can
 * still never play), when the browser blocks playback ("Tap to hear Ferni" owns
 * that case), or on cleanup.
 *
 * Fires at most once per call, and never once the user is hanging up, the room
 * has dropped, or Ferni has left (the agent-lost prompt explains that silence).
 * It only reports: the connection state stays what it is. Once it has fired it
 * keeps watching, and standing down (his audio starts late, playback is blocked,
 * cleanup) removes its own notice through the handle the notice returned. It
 * never clears anything else on screen.
 */

import { isAudioStartWatchOn } from '../config/audio-start-watch-flag.js';
import { createLogger } from '../utils/logger.js';
import {
  agentAudioElements,
  agentHasAudioTrack,
  agentInRoom,
  isPlaying,
  onAgentAudioPlaying,
  onAgentAudioTrack,
  type AgentAudioRoom,
} from './agent-audio.js';
import { AUDIO_PLAY_BLOCKED_EVENT } from './audio-play-blocked.js';
import { timeAudioStart } from './audio-start-timing.js';

const log = createLogger('AudioStartWatch');

/** The iOS deadline (CallSession `audioStartTimeout`), counted from his audio track appearing. */
export const AUDIO_START_DEADLINE_MS = 3_000;
/** Counted from his joining, for when he never sends an audio track at all. */
export const AUDIO_PUBLISH_DEADLINE_MS = 8_000;

export interface AudioStartDeps {
  /** True once the user has started hanging up. */
  userHangingUp: () => boolean;
  /** Show the notice; returns the function that removes it (and nothing else), if shown. */
  onAudioNotStarted: () => (() => void) | undefined;
}

/**
 * Watch `room` from the moment Ferni has joined. Returns the cleanup function;
 * the caller runs it on hang-up and on every room teardown.
 */
export function watchAudioStart(room: AgentAudioRoom, deps: AudioStartDeps): () => void {
  const heard = (): boolean => agentAudioElements(room).some(isPlaying);
  if (room.canPlaybackAudio === false || heard()) return () => undefined;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let trackSeen = agentHasAudioTrack(room);
  let done = false;
  let removeNotice: (() => void) | undefined;
  const stops: (() => void)[] = [];

  function arm(ms: number): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(expire, ms);
  }
  function standDown(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    done = true;
    removeNotice?.();
    removeNotice = undefined;
    for (const stop of stops.splice(0)) stop();
  }
  function onTrack(): void {
    if (trackSeen || done) return;
    trackSeen = true;
    arm(AUDIO_START_DEADLINE_MS);
  }
  function onPlaybackChanged(): void {
    if (room.canPlaybackAudio === false) standDown();
  }
  function expire(): void {
    timer = null;
    const stillOnTheLine = !deps.userHangingUp() && room.state === 'connected';
    if (!stillOnTheLine || !agentInRoom(room) || heard()) return standDown();
    done = true;
    log.warn(
      trackSeen
        ? 'Ferni sent audio but none of it is playing'
        : 'Ferni joined but sent no audio track'
    );
    removeNotice = deps.onAudioNotStarted();
  }

  room.on('audioPlaybackChanged', onPlaybackChanged);
  document.addEventListener(AUDIO_PLAY_BLOCKED_EVENT, standDown);
  stops.push(
    () => room.off('audioPlaybackChanged', onPlaybackChanged),
    () => document.removeEventListener(AUDIO_PLAY_BLOCKED_EVENT, standDown),
    onAgentAudioTrack(room, onTrack),
    onAgentAudioPlaying(room, standDown)
  );
  arm(trackSeen ? AUDIO_START_DEADLINE_MS : AUDIO_PUBLISH_DEADLINE_MS);
  return standDown;
}

/**
 * Everything a call does about Ferni's audio starting, from the moment he has
 * joined: always the timing line, and the notice only with the flag on.
 * Returns the cleanup function.
 */
export function watchCallAudio(room: AgentAudioRoom, deps: AudioStartDeps): () => void {
  const stopTiming = timeAudioStart(room);
  const stopWatch = isAudioStartWatchOn() ? watchAudioStart(room, deps) : () => undefined;
  return () => {
    stopWatch();
    stopTiming();
  };
}
