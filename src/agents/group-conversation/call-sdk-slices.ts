/**
 * GROUP_CALL: the slices of the SDK's session, room, participant and track that the group
 * hearing uses (group-hearing.ts). The SDK objects fit them as they are, and tests pass
 * plain typed fakes.
 *
 * @module agents/group-conversation/call-sdk-slices
 */
import type { voice } from '@livekit/agents';
import type { ParticipantKind, RoomEvent, Track } from '@livekit/rtc-node';
import type { RecallAgent } from '../multi-agent/recall-note.js';

/** The slice of an SDK track the hearing reads; the room hands it only real tracks. */
export type CallTrack = Pick<Track, 'kind'>;
/** The slice of a RemoteParticipant the hearing reads. */
export interface CallParticipant {
  readonly identity: string;
  readonly name?: string;
  readonly kind?: ParticipantKind;
  readonly attributes?: Record<string, string>;
  readonly trackPublications: ReadonlyMap<string, { readonly track?: CallTrack }>;
}
type PersonEvent = RoomEvent.ParticipantConnected | RoomEvent.ParticipantDisconnected;
type OnTrack = (track: CallTrack, publication: unknown, person: CallParticipant) => void;
/** The slice of the SDK Room the hearing uses. */
export interface CallRoom {
  readonly remoteParticipants: ReadonlyMap<string, CallParticipant>;
  on: ((event: PersonEvent, listener: (person: CallParticipant) => void) => unknown) &
    ((event: RoomEvent.TrackSubscribed, listener: OnTrack) => unknown);
  off: ((event: PersonEvent, listener: (person: CallParticipant) => void) => unknown) &
    ((event: RoomEvent.TrackSubscribed, listener: OnTrack) => unknown);
}
/** The slice of the SDK AgentSession the hearing uses. */
export interface CallSession {
  readonly input: { audio: unknown };
  readonly userData: unknown;
  readonly currentAgent: RecallAgent;
  on: (event: voice.AgentSessionEventTypes.AgentStateChanged, listener: () => void) => unknown;
  off: (event: voice.AgentSessionEventTypes.AgentStateChanged, listener: () => void) => unknown;
}
