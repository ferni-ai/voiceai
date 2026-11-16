/**
 * GROUP_CALL: Ferni hears a second caller on the owner's call and knows who spoke.
 *
 * When a guest (remote, not the owner, not an agent) joins, the session's audio input
 * becomes a RoomMixInput of both tracks, each person's level noted in a TalkerLedger.
 * stt-chain.ts labels every finished turn from it while a guest is on: `[Seth] `,
 * `[Sarah] ` or, fail closed, `[unclear] `. A system note says what the labels mean.
 * Each track gets that person's own noise cancellation, built for the mix's 16 kHz:
 * the SDK no longer cleans the session input. RoomIO sets `session.input.audio` only
 * in start(), so an owner reconnect keeps the mix (it is re-asserted anyway).
 * One guest at a time (v1). A persona handoff keeps the session and input
 * (persona-swap.ts) but drops system notes, so they go to the next persona again.
 *
 * @module agents/group-conversation/group-hearing
 */
import { voice } from '@livekit/agents';
import {
  type AudioFrame,
  AudioStream,
  ParticipantKind,
  RoomEvent,
  TrackKind,
  type RemoteParticipant,
  type RemoteTrack,
  type Room,
} from '@livekit/rtc-node';
import { ReadableStream } from 'node:stream/web';
import { flagOn } from '../../config/env-flag.js';
import { firstNameOf } from '../../utils/caller-name.js';
import { dispatchedUserName } from '../../utils/ferni-intro.js';
import { createLogger } from '../../utils/safe-logger.js';
import { addRecallNote } from '../multi-agent/recall-note.js';
import { roomInputOptions } from '../multi-agent/room-input-options.js';
import { MIX_SAMPLE_RATE, RoomMixInput } from './room-mix-input.js';
import { TalkerLedger } from './talker-ledger.js';

const log = createLogger({ module: 'GroupHearing' });

/** What the rest of the call can ask about who is on it. */
export interface GroupHearing {
  /** A guest's spoken name (any guest seen this call); undefined for anyone else. */
  guestName: (identity: string) => string | undefined;
  /** Every guest seen this call, including ones who left, in the order they joined. */
  guestNames: () => string[];
  ledger: TalkerLedger;
  /** Whether a guest is on the call now. */
  guestOn: () => boolean;
  /** `[<owner first name>] `, the label on the owner's turns. */
  ownerLabel: () => string;
}

interface Setup {
  session: voice.AgentSession;
  agent: voice.Agent;
}
type GroupHearingArgs = Setup & { room: Room; ownerIdentity: string; sessionId: string };

const hearings = new Map<string, { hearing: GroupHearing; detach: () => void }>();

/** The hearing on this call, or undefined on a solo call or with GROUP_CALL off. */
export function groupHearing(sessionId: string): GroupHearing | undefined {
  return hearings.get(sessionId)?.hearing;
}

/** First letter up, for a note that starts with a name like "the guest". */
const sentence = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** The owner's first name from the session's profile, as calls on their behalf name them. */
function ownerFirstName(userData: unknown): string {
  const user = userData as
    | {
        userName?: string;
        services?: { userProfile?: { preferredName?: string; name?: string } | null };
      }
    | undefined;
  const profile = user?.services?.userProfile;
  const name = dispatchedUserName(profile?.preferredName, profile?.name ?? user?.userName, false);
  return (name !== 'the user' && firstNameOf(name)) || 'the caller';
}

function joinNote(guest: string, owner: string): string {
  return (
    `${sentence(guest)} is on this call by phone with ${owner}. ` +
    `Lines that start with [${guest}] are hers, and lines that start with [${owner}] are ${owner}'s. ` +
    'A line marked [unclear] could be either of them: if it matters who said it, ask. ' +
    'Talk with both of them, use their names, and let them talk to each other. ' +
    `${sentence(guest)} can hear everything you say, so don't bring up ${owner}'s private things unless ${owner} does.`
  );
}

/** AudioStream extends the global ReadableStream, which is node:stream/web's at runtime. */
const isFrameStream = (s: AudioStream): s is AudioStream & ReadableStream<AudioFrame> =>
  s instanceof ReadableStream;

/** The persona on the call now: a handoff swaps the session's agent (persona-swap.ts). */
function agentNow(session: voice.AgentSession, fallback: voice.Agent): voice.Agent {
  try {
    return session.currentAgent ?? fallback;
  } catch {
    return fallback; // the session is not running
  }
}

/**
 * Listen for a guest on this call. Does nothing unless GROUP_CALL is on. Returns the
 * detach for call end: it stops listening, closes the mix and forgets the call.
 */
function attachGroupHearing(args: GroupHearingArgs): () => void {
  if (!flagOn('GROUP_CALL')) return () => undefined;
  const { session, agent, room, ownerIdentity: owner, sessionId } = args;
  hearings.get(sessionId)?.detach(); // a fresh session for the same call replaces the old one
  const ledger = new TalkerLedger(owner);
  const names = new Map<string, string>();
  const notes: Array<{ note: string; id: string }> = [];
  let mix: RoomMixInput | undefined;
  /** The track each person is mixed from, so a track seen twice is read once. */
  const mixed = new Map<string, RemoteTrack>();
  let guest: string | undefined;
  let notedAgent: voice.Agent | undefined;
  let detached = false;

  const note = (text: string): void => {
    const entry = { note: text, id: `group_call_${sessionId}_${notes.length + 1}` };
    notes.push(entry);
    notedAgent = agentNow(session, agent);
    addRecallNote(notedAgent, entry.note, undefined, entry.id);
  };
  const renote = (): void => {
    const current = agentNow(session, agent);
    if (notes.length === 0 || current === notedAgent) return;
    notedAgent = current;
    for (const n of notes) addRecallNote(current, n.note, undefined, n.id);
  };

  const readInto = async (person: RemoteParticipant, track: RemoteTrack): Promise<void> => {
    const { inputOptions } = await roomInputOptions(
      person,
      sessionId,
      process.env,
      MIX_SAMPLE_RATE
    );
    const wanted = person.identity === owner || person.identity === guest;
    if (detached || !mix || !wanted || mixed.get(person.identity) !== track) return;
    const frames = new AudioStream(track, {
      sampleRate: MIX_SAMPLE_RATE,
      numChannels: 1,
      frameSizeMs: 10,
      noiseCancellation: inputOptions?.noiseCancellation,
    });
    if (isFrameStream(frames)) mix.addTrack(person.identity, frames);
  };
  const hear = (person: RemoteParticipant, track: RemoteTrack): void => {
    if (mixed.get(person.identity) === track) return;
    mixed.set(person.identity, track);
    readInto(person, track).catch((error: unknown) => {
      if (mixed.get(person.identity) === track) mixed.delete(person.identity);
      log.warn({ sessionId, identity: person.identity, error: String(error) }, 'Track not mixed');
    });
  };
  const unhear = (identity: string): void => {
    mixed.delete(identity);
    mix?.removeTrack(identity);
  };
  const addTracks = (person: RemoteParticipant): void => {
    for (const { track } of person.trackPublications.values()) {
      if (track?.kind === TrackKind.KIND_AUDIO) hear(person, track as RemoteTrack);
    }
  };
  const keepMix = (): void => {
    if (mix && session.input.audio !== mix) session.input.audio = mix;
  };

  const onGuest = (person: RemoteParticipant): void => {
    if (guest) {
      if (guest !== person.identity) {
        log.warn({ sessionId, identity: person.identity }, 'A second guest joined; not heard');
      }
      return;
    }
    guest = person.identity;
    const name = person.name || 'the guest';
    names.set(person.identity, name);
    const first = !mix;
    mix ??= new RoomMixInput(ledger);
    keepMix();
    const ownerNow = room.remoteParticipants.get(owner);
    if (first && ownerNow) addTracks(ownerNow);
    addTracks(person);
    note(joinNote(name, ownerFirstName(session.userData)));
    log.info({ sessionId, guest: person.identity }, 'GROUP_CALL: guest is in the mix');
  };

  const isGuest = (person: RemoteParticipant): boolean =>
    person.identity !== owner && person.kind !== ParticipantKind.AGENT;

  const onConnected = (person: RemoteParticipant): void => {
    if (person.identity === owner) {
      if (!mix) return;
      keepMix();
      addTracks(person);
    } else if (isGuest(person)) onGuest(person);
  };
  const onTrack = (track: RemoteTrack, _pub: unknown, person: RemoteParticipant): void => {
    if (track.kind !== TrackKind.KIND_AUDIO || !mix) return;
    if (person.identity === owner) keepMix();
    if (person.identity === owner || person.identity === guest) hear(person, track);
  };
  const onDisconnected = (person: RemoteParticipant): void => {
    if (person.identity === owner) unhear(owner);
    if (person.identity !== guest) return;
    unhear(person.identity);
    guest = undefined;
    note(`${sentence(names.get(person.identity) ?? 'the guest')} has left the call.`);
  };

  room.on(RoomEvent.ParticipantConnected, onConnected);
  room.on(RoomEvent.TrackSubscribed, onTrack);
  room.on(RoomEvent.ParticipantDisconnected, onDisconnected);
  session.on(voice.AgentSessionEventTypes.AgentStateChanged, renote);

  const hearing: GroupHearing = {
    guestName: (identity) => names.get(identity),
    guestNames: () => [...new Set(names.values())],
    ledger,
    guestOn: () => guest !== undefined,
    ownerLabel: () => `[${ownerFirstName(session.userData)}] `,
  };
  const detach = (): void => {
    if (detached) return;
    detached = true;
    room.off(RoomEvent.ParticipantConnected, onConnected);
    room.off(RoomEvent.TrackSubscribed, onTrack);
    room.off(RoomEvent.ParticipantDisconnected, onDisconnected);
    session.off(voice.AgentSessionEventTypes.AgentStateChanged, renote);
    if (hearings.get(sessionId)?.hearing === hearing) hearings.delete(sessionId);
    void mix?.close().catch((error: unknown) => {
      log.warn({ sessionId, error: String(error) }, 'Room mix did not close');
    });
  };
  hearings.set(sessionId, { hearing, detach });

  for (const person of room.remoteParticipants.values()) {
    if (isGuest(person)) onGuest(person);
  }
  return detach;
}

/** GROUP_CALL for the persona that owns the call's session: hears after start, detaches first. */
export function hearGroupCall(
  persona: { cleanup: () => Promise<void> },
  setup: Setup,
  call: { room: Room; userParticipant: { identity: string } },
  sessionId: string
): void {
  const detach = attachGroupHearing({
    ...setup,
    room: call.room,
    ownerIdentity: call.userParticipant.identity,
    sessionId,
  });
  const cleanup = persona.cleanup;
  persona.cleanup = async () => {
    detach();
    await cleanup();
  };
}
