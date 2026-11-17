/**
 * GROUP_CALL: Ferni hears a second caller on the owner's call and knows a guest is there.
 *
 * When a guest (identity `guest_…`, on the phone or the web) joins, the session's audio
 * input becomes a RoomMixInput of both tracks. Who spoke is not known on the mix, so
 * every finished turn must be labelled `[unclear] ` while a guest is on (fail closed, from
 * groupHearingFor and guestLastOnAt). That labelling lands separately (stt-chain.ts), and
 * GROUP_CALL stays off until it has.
 * System notes (group-call-notes.ts) say who joined or left and what the labels mean.
 * While the owner is away the guest is out of the mix.
 * Each track gets that person's own noise cancellation, built for the mix's 16 kHz:
 * the SDK no longer cleans the session input. RoomIO sets `session.input.audio` only
 * in start(), so an owner reconnect keeps the mix (it is re-asserted anyway).
 * One guest at a time (v1). A persona handoff keeps the session and input
 * (persona-swap.ts) but drops system notes, so they go to the next persona again.
 *
 * @module agents/group-conversation/group-hearing
 */
import { voice } from '@livekit/agents';
import { type AudioFrame, AudioStream, RoomEvent, type Track, TrackKind } from '@livekit/rtc-node';
import { ReadableStream } from 'node:stream/web';
import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { RecallAgent } from '../multi-agent/recall-note.js';
import { roomInputOptions } from '../multi-agent/room-input-options.js';
import {
  callNotes,
  guestLeftNote,
  joinNote,
  ownerBackNote,
  ownerFirstName,
  ownerGoneNote,
} from './group-call-notes.js';
import { isAdmittedGuest } from './guest-admission.js';
import { guestDisplayName } from './guest-display-name.js';
import { MIX_SAMPLE_RATE, mixClock, RoomMixInput } from './room-mix-input.js';
import { TalkerLedger } from './talker-ledger.js';
import type { CallParticipant, CallRoom, CallSession, CallTrack } from './call-sdk-slices.js';

const log = createLogger({ module: 'GroupHearing' });

/** What the rest of the call can ask about who is on it. */
interface GroupHearing {
  /** A guest's spoken name (any guest seen this call); undefined for anyone else. */
  guestName: (identity: string) => string | undefined;
  /** Every guest seen this call, including ones who left, in the order they joined. */
  guestNames: () => string[];
  /** Whether a guest is on the call now. */
  guestOn: () => boolean;
  /** The identity of the guest on the call now, if any. */
  guestIdentity: () => string | undefined;
  /** When a guest was last on the call (mixClock ms): now while one is on; undefined if none has been. */
  guestLastOnAt: () => number | undefined;
  /** `[<owner first name>] `, the label on the owner's turns. */
  ownerLabel: () => string;
}

interface Setup {
  session: CallSession;
  agent: RecallAgent;
}
type GroupHearingArgs = Setup & { room: CallRoom; ownerIdentity: string; sessionId: string };

const hearings = new Map<string, { hearing: GroupHearing; detach: () => void }>();
/** The same hearings by the session that hears them: the key every lookup uses. */
const sessionHearings = new WeakMap<object, GroupHearing>();

/** The hearing `session` hears the call with, or undefined on a solo call or with GROUP_CALL off. */
function groupHearingFor(session: object): GroupHearing | undefined {
  return sessionHearings.get(session);
}

/**
 * Whether a participant may be heard as the guest (guest-admission.ts, which never admits
 * the owner). Anyone else but the owner is warned about once, by kind: an identity can
 * carry a phone number.
 */
function guestCheck(owner: string, sessionId: string): (person: CallParticipant) => boolean {
  const warned = new Set<string>([owner]);
  return (person) => {
    const admitted = isAdmittedGuest(person, owner);
    if (!admitted && !warned.has(person.identity)) {
      warned.add(person.identity);
      log.warn(
        { sessionId, kind: person.kind },
        'GROUP_CALL: a participant who is not a guest joined; not heard'
      );
    }
    return admitted;
  };
}

/** AudioStream extends the global ReadableStream, which is node:stream/web's at runtime. */
const isFrameStream = (s: AudioStream): s is AudioStream & ReadableStream<AudioFrame> =>
  s instanceof ReadableStream;

/** A person's track as the mix reads it: 16 kHz mono 10 ms frames, cleaned their own way. */
function mixStream(
  track: CallTrack,
  noiseCancellation: voice.RoomInputOptions['noiseCancellation']
): AudioStream {
  return new AudioStream(track as Track, {
    sampleRate: MIX_SAMPLE_RATE,
    numChannels: 1,
    frameSizeMs: 10,
    noiseCancellation,
  });
}

/**
 * Listen for a guest on this call. Returns the detach for call end: it stops listening,
 * closes the mix and forgets the call.
 */
function attachGroupHearing(args: GroupHearingArgs): () => void {
  const { session, agent, room, ownerIdentity: owner, sessionId } = args;
  hearings.get(sessionId)?.detach(); // a fresh session for the same call replaces the old one
  const ledger = new TalkerLedger(owner);
  const names = new Map<string, string>();
  let mix: RoomMixInput | undefined;
  /** The track each person is mixed from, so a track seen twice is read once. */
  const mixed = new Map<string, CallTrack>();
  let guest: string | undefined;
  /** When the last guest left (mixClock ms); STT labelling covers her late words. */
  let guestLeftAt: number | undefined;
  /** The owner left while a guest was on: the guest is out of the mix until the owner is back. */
  let ownerAway = false;
  let detached = false;

  const { note, renote } = callNotes(session, agent, sessionId);

  const readInto = async (person: CallParticipant, track: CallTrack): Promise<void> => {
    const { inputOptions } = await roomInputOptions(
      person,
      sessionId,
      process.env,
      MIX_SAMPLE_RATE
    );
    if (mixed.get(person.identity) !== track) return; // a newer track took over
    const wanted = person.identity === owner || (person.identity === guest && !ownerAway);
    if (detached || !mix || !wanted) {
      mixed.delete(person.identity); // not read, so the owner coming back can add it
      return;
    }
    const frames = mixStream(track, inputOptions?.noiseCancellation);
    if (isFrameStream(frames)) mix.addTrack(person.identity, frames);
  };
  const hear = (person: CallParticipant, track: CallTrack): void => {
    if (mixed.get(person.identity) === track) return;
    mixed.set(person.identity, track);
    readInto(person, track).catch((error: unknown) => {
      if (mixed.get(person.identity) === track) mixed.delete(person.identity);
      const role = person.identity === owner ? 'owner' : 'guest'; // an identity can be a uid
      log.warn({ sessionId, role, error: String(error) }, 'Track not mixed');
    });
  };
  const unhear = (identity: string): void => {
    mixed.delete(identity);
    mix?.removeTrack(identity);
  };
  const addTracks = (person: CallParticipant): void => {
    for (const { track } of person.trackPublications.values()) {
      if (track?.kind === TrackKind.KIND_AUDIO) hear(person, track);
    }
  };
  const keepMix = (): void => {
    if (mix && session.input.audio !== mix) session.input.audio = mix;
  };

  const onGuest = (person: CallParticipant): void => {
    if (guest) {
      if (guest !== person.identity) {
        log.warn({ sessionId, role: 'guest' }, 'A second guest joined; not heard');
      }
      return;
    }
    guest = person.identity;
    const name = guestDisplayName(person.name, ownerFirstName(session.userData));
    names.set(person.identity, name);
    const first = !mix;
    mix ??= new RoomMixInput(ledger);
    keepMix();
    const ownerNow = room.remoteParticipants.get(owner);
    if (first && ownerNow) addTracks(ownerNow);
    addTracks(person);
    note(joinNote(name, ownerFirstName(session.userData)));
    log.info({ sessionId, role: 'guest' }, 'GROUP_CALL: guest is in the mix');
  };

  const isGuest = guestCheck(owner, sessionId);

  const ownerBack = (): void => {
    ownerAway = false;
    const guestNow = guest ? room.remoteParticipants.get(guest) : undefined;
    if (guestNow) addTracks(guestNow);
    note(ownerBackNote(ownerFirstName(session.userData)));
  };
  const onConnected = (person: CallParticipant): void => {
    if (person.identity === owner) {
      if (!mix) return;
      keepMix();
      addTracks(person);
      if (ownerAway) ownerBack();
    } else if (isGuest(person)) onGuest(person);
  };
  const onTrack = (track: CallTrack, _pub: unknown, person: CallParticipant): void => {
    if (track.kind !== TrackKind.KIND_AUDIO || !mix) return;
    if (person.identity === owner) keepMix();
    const heard = person.identity === owner || (person.identity === guest && !ownerAway);
    if (heard) hear(person, track);
  };
  const onDisconnected = (person: CallParticipant): void => {
    if (person.identity === owner) {
      unhear(owner);
      if (!guest) return;
      ownerAway = true; // the guest is not heard alone with Ferni
      unhear(guest);
      note(ownerGoneNote(ownerFirstName(session.userData), names.get(guest) ?? 'the guest'));
      return;
    }
    if (person.identity !== guest) return;
    unhear(person.identity);
    guest = undefined;
    guestLeftAt = mixClock();
    note(guestLeftNote(names.get(person.identity) ?? 'the guest'));
  };

  room.on(RoomEvent.ParticipantConnected, onConnected);
  room.on(RoomEvent.TrackSubscribed, onTrack);
  room.on(RoomEvent.ParticipantDisconnected, onDisconnected);
  session.on(voice.AgentSessionEventTypes.AgentStateChanged, renote);

  const hearing: GroupHearing = {
    guestName: (identity) => names.get(identity),
    guestNames: () => [...new Set(names.values())],
    guestOn: () => guest !== undefined,
    guestIdentity: () => guest,
    guestLastOnAt: () => (guest !== undefined ? mixClock() : guestLeftAt),
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
    if (sessionHearings.get(session) === hearing) sessionHearings.delete(session);
    void mix?.close().catch((error: unknown) => {
      log.warn({ sessionId, error: String(error) }, 'Room mix did not close');
    });
  };
  hearings.set(sessionId, { hearing, detach });
  sessionHearings.set(session, hearing);

  for (const person of room.remoteParticipants.values()) {
    if (isGuest(person)) onGuest(person);
  }
  return detach;
}

/**
 * GROUP_CALL for the persona that owns the call's session: hears after start, detaches
 * first. With the flag off it does nothing, and the persona is left as it was.
 */
export function hearGroupCall(
  persona: { cleanup: () => Promise<void> },
  setup: Setup,
  call: { room: CallRoom; userParticipant: { identity: string } },
  sessionId: string
): void {
  if (!flagOn('GROUP_CALL')) return;
  const detach = attachGroupHearing({
    ...setup,
    room: call.room,
    ownerIdentity: call.userParticipant.identity,
    sessionId,
  });
  const { cleanup } = persona;
  persona.cleanup = async () => {
    detach();
    await cleanup();
  };
}
