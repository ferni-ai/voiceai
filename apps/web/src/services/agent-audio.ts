/**
 * Agent Audio
 *
 * Which of a LiveKit room's audio is Ferni's. Only the agent participant's
 * tracks count (agent-presence.ts): a guest's audio playing is not Ferni
 * speaking. Read from the room itself (each track's attached elements), so the
 * main call and the demo answer the same way. Shared by audio-start-watch.ts
 * and audio-start-timing.ts.
 */

import { isAgentParticipant, type PresenceParticipant } from './agent-presence.js';

/** LiveKit's TrackPublication: its track once subscribed, with the elements attach() made. */
export interface AgentAudioPublication {
  track?: { attachedElements?: readonly HTMLMediaElement[] };
}

export interface AgentAudioParticipant extends PresenceParticipant {
  audioTrackPublications?: ReadonlyMap<string, AgentAudioPublication>;
}

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

/** The slice of a LiveKit Room this reads. Event names are livekit-client's RoomEvent values. */
export interface AgentAudioRoom {
  state: string;
  canPlaybackAudio?: boolean;
  remoteParticipants?: ReadonlyMap<string, AgentAudioParticipant>;
  on(event: 'audioPlaybackChanged', callback: PlaybackChanged): unknown;
  on(event: 'trackPublished', callback: TrackPublished): unknown;
  on(event: 'trackSubscribed', callback: TrackSubscribed): unknown;
  off(event: 'audioPlaybackChanged', callback: PlaybackChanged): unknown;
  off(event: 'trackPublished', callback: TrackPublished): unknown;
  off(event: 'trackSubscribed', callback: TrackSubscribed): unknown;
}

function agents(room: AgentAudioRoom): AgentAudioParticipant[] {
  return [...(room.remoteParticipants?.values() ?? [])].filter(isAgentParticipant);
}

/** Ferni is still in the room. */
export function agentInRoom(room: AgentAudioRoom): boolean {
  return agents(room).length > 0;
}

/** Ferni has published an audio track. */
export function agentHasAudioTrack(room: AgentAudioRoom): boolean {
  return agents(room).some((agent) => (agent.audioTrackPublications?.size ?? 0) > 0);
}

/** The elements playing (or meant to play) Ferni's audio tracks. */
export function agentAudioElements(room: AgentAudioRoom): HTMLMediaElement[] {
  return agents(room).flatMap((agent) =>
    [...(agent.audioTrackPublications?.values() ?? [])].flatMap(
      (publication) => publication.track?.attachedElements ?? []
    )
  );
}

/** Media really flowing: not paused or ended, with data ahead of the playhead. */
export function isPlaying(element: HTMLMediaElement): boolean {
  return !element.paused && !element.ended && element.readyState >= element.HAVE_FUTURE_DATA;
}

/** Calls `onTrack` each time the client sees one of Ferni's audio tracks. Returns the stop. */
export function onAgentAudioTrack(room: AgentAudioRoom, onTrack: () => void): () => void {
  const seen = (kind?: string, participant?: PresenceParticipant): void => {
    if (kind === 'audio' && participant && isAgentParticipant(participant)) onTrack();
  };
  const onPublished: TrackPublished = (publication, participant) =>
    seen(publication.kind, participant);
  const onSubscribed: TrackSubscribed = (track, _publication, participant) =>
    seen(track.kind, participant);
  room.on('trackPublished', onPublished);
  room.on('trackSubscribed', onSubscribed);
  return () => {
    room.off('trackPublished', onPublished);
    room.off('trackSubscribed', onSubscribed);
  };
}

/** Calls `onPlaying` when one of Ferni's audio elements starts playing. Returns the stop. */
export function onAgentAudioPlaying(room: AgentAudioRoom, onPlaying: () => void): () => void {
  const onEvent = (event: Event): void => {
    if (agentAudioElements(room).some((element) => element === event.target)) onPlaying();
  };
  document.addEventListener('playing', onEvent, true);
  return () => document.removeEventListener('playing', onEvent, true);
}
