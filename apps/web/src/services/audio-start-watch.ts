/**
 * Audio Start Watch
 *
 * Notices when Ferni is on the call but none of his audio is playing, so the app
 * can say so instead of showing a live call over silence. iOS has the same
 * watchdog (CallSession `audioDidNotStart`).
 *
 * Two deadlines, so a slow start is never called a failure:
 * - once Ferni's audio track exists (published or subscribed, whichever we see
 *   first), it has AUDIO_START_DEADLINE_MS to start playing. This is the iOS case:
 *   his audio is there but we can't hear it.
 * - if he joins and never sends an audio track at all, AUDIO_PUBLISH_DEADLINE_MS
 *   from his joining covers that silence instead.
 *
 * Stands down for good on the first agent audio element that is actually playing
 * (subscribed and attached is not enough: an attached track can still never
 * play), when the browser blocks playback ("Tap to hear Ferni" owns that case),
 * or on cleanup.
 *
 * Fires at most once per call, and never once the user is hanging up or the room
 * has dropped. It only reports: the connection state stays what it is. Once it
 * has fired it keeps watching, and standing down (his audio starts late, playback
 * is blocked, cleanup) removes its own notice through the handle the notice
 * returned. It never clears anything else on screen.
 */

import { createLogger } from '../utils/logger.js';
import { isAgentParticipant, type PresenceParticipant } from './agent-presence.js';
import { AUDIO_PLAY_BLOCKED_EVENT } from './audio-play-blocked.js';

const log = createLogger('AudioStartWatch');

/** The iOS deadline (CallSession `audioStartTimeout`), counted from his audio track appearing. */
export const AUDIO_START_DEADLINE_MS = 3_000;
/** Counted from his joining, for when he never sends an audio track at all. */
export const AUDIO_PUBLISH_DEADLINE_MS = 8_000;

export interface AudioStartParticipant extends PresenceParticipant {
  /** LiveKit: the participant's audio tracks, subscribed or not. */
  audioTrackPublications?: ReadonlyMap<string, unknown>;
}

/** A LiveKit track or publication: all the watch reads is its kind. */
interface TrackKind {
  kind?: string;
}
type PlaybackChanged = () => void;
type TrackPublished = (publication: TrackKind, participant?: PresenceParticipant) => void;
type TrackSubscribed = (
  track: TrackKind,
  publication: unknown,
  participant?: PresenceParticipant
) => void;

/** Event names are livekit-client's RoomEvent values. */
export interface AudioStartRoom {
  state: string;
  /** LiveKit: false while the browser refuses to play audio. */
  canPlaybackAudio?: boolean;
  remoteParticipants?: ReadonlyMap<string, AudioStartParticipant>;
  on(event: 'audioPlaybackChanged', callback: PlaybackChanged): unknown;
  on(event: 'trackPublished', callback: TrackPublished): unknown;
  on(event: 'trackSubscribed', callback: TrackSubscribed): unknown;
  off(event: 'audioPlaybackChanged', callback: PlaybackChanged): unknown;
  off(event: 'trackPublished', callback: TrackPublished): unknown;
  off(event: 'trackSubscribed', callback: TrackSubscribed): unknown;
}

export interface AudioStartDeps {
  /** The elements attached to the agent's subscribed audio tracks. */
  agentAudio: () => Iterable<HTMLMediaElement>;
  /** True once the user has started hanging up. */
  userHangingUp: () => boolean;
  /** Ferni is here, and nothing he sends is playing. Returns what removes its notice. */
  onAudioNotStarted: () => (() => void) | undefined;
}

/** Playing, not just attached: play() went through and media is flowing. */
export function isPlaying(element: HTMLMediaElement): boolean {
  return !element.paused && !element.ended && element.readyState >= element.HAVE_FUTURE_DATA;
}

function agentHasAudioTrack(room: AudioStartRoom): boolean {
  for (const participant of room.remoteParticipants?.values() ?? []) {
    if (isAgentParticipant(participant) && (participant.audioTrackPublications?.size ?? 0) > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Start watching `room` (call it once the agent has joined). Returns the cleanup
 * function; the connection service runs it on hang-up and every teardown.
 */
export function watchAudioStart(room: AudioStartRoom, deps: AudioStartDeps): () => void {
  const heard = (): boolean => [...deps.agentAudio()].some(isPlaying);
  if (room.canPlaybackAudio === false || heard()) return () => undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let trackSeen = agentHasAudioTrack(room);
  let done = false;
  let removeNotice: (() => void) | undefined;

  function arm(deadlineMs: number): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(expire, deadlineMs);
  }
  function standDown(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    done = true; // nothing re-arms it after this
    removeNotice?.();
    removeNotice = undefined;
    document.removeEventListener('playing', onPlaying, true);
    document.removeEventListener(AUDIO_PLAY_BLOCKED_EVENT, standDown);
    room.off('audioPlaybackChanged', onPlaybackChanged);
    room.off('trackPublished', onPublished);
    room.off('trackSubscribed', onSubscribed);
  }
  function onAgentTrack(kind: string | undefined, participant?: PresenceParticipant): void {
    if (trackSeen || done || kind !== 'audio') return;
    if (!participant || !isAgentParticipant(participant)) return;
    trackSeen = true;
    arm(AUDIO_START_DEADLINE_MS);
  }
  const onPublished: TrackPublished = (publication, participant) =>
    onAgentTrack(publication.kind, participant);
  const onSubscribed: TrackSubscribed = (track, _publication, participant) =>
    onAgentTrack(track.kind, participant);
  function onPlaying(event: Event): void {
    if ([...deps.agentAudio()].some((element) => element === event.target)) standDown();
  }
  function onPlaybackChanged(): void {
    if (room.canPlaybackAudio === false) standDown();
  }
  function expire(): void {
    timer = null;
    const stillOnTheLine = !deps.userHangingUp() && room.state === 'connected';
    if (!stillOnTheLine || heard()) return standDown();
    done = true;
    log.warn(
      trackSeen
        ? 'Ferni sent audio but none of it is playing'
        : 'Ferni joined but sent no audio track'
    );
    removeNotice = deps.onAudioNotStarted();
  }

  // 'playing' doesn't bubble; the agent's elements live in the document, so capture it.
  document.addEventListener('playing', onPlaying, true);
  document.addEventListener(AUDIO_PLAY_BLOCKED_EVENT, standDown);
  room.on('audioPlaybackChanged', onPlaybackChanged);
  room.on('trackPublished', onPublished);
  room.on('trackSubscribed', onSubscribed);
  arm(trackSeen ? AUDIO_START_DEADLINE_MS : AUDIO_PUBLISH_DEADLINE_MS);
  return standDown;
}
