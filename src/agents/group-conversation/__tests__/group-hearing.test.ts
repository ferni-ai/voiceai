import { EventEmitter } from 'node:events';
import { ReadableStream } from 'node:stream/web';
import { setImmediate as nextTick } from 'node:timers/promises';
import type { voice } from '@livekit/agents';
import { AudioFrame, ParticipantKind, RoomEvent, TrackKind, type Room } from '@livekit/rtc-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Every AudioStream the hearing opens: which track, with which options. */
const opened = vi.hoisted(() => [] as Array<{ track: unknown; options: unknown }>);

vi.mock('@livekit/rtc-node', async (importOriginal) => {
  const real = await importOriginal<typeof import('@livekit/rtc-node')>();
  const { ReadableStream: WebStream } = await import('node:stream/web');
  class FakeAudioStream extends WebStream<unknown> {
    constructor(track: unknown, options: unknown) {
      super({});
      opened.push({ track, options });
    }
  }
  return { ...real, AudioStream: FakeAudioStream };
});

/**
 * A web caller's noise cancellation is a marker, so the test can see it reach their
 * AudioStream. A phone caller goes through the real roomInputOptions and the real
 * PreSTTFrameProcessor; only the native AGC + high-pass under it is faked.
 */
vi.mock('../../multi-agent/room-input-options.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../multi-agent/room-input-options.js')>();
  type Args = Parameters<typeof real.roomInputOptions>;
  return {
    roomInputOptions: async (...[participant, sessionId, env, rate]: Args) =>
      participant?.identity?.startsWith('sip_')
        ? real.roomInputOptions(participant, sessionId, env, rate)
        : {
            inputOptions: {
              noiseCancellation: { moduleId: `nc-${participant?.identity}`, options: {} },
            },
          },
  };
});
vi.mock('../../shared/performance/pre-stt-transform.js', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('../../shared/performance/pre-stt-transform.js')>();
  class NativeAgcStandIn {
    async initialize(): Promise<void> {}
    isUsingRust(): boolean {
      return true;
    }
    processFrameI16(data: Int16Array): Float32Array {
      return new Float32Array(data.length).fill(0.25);
    }
    reset(): void {}
  }
  return { ...real, PreSTTProcessor: NativeAgcStandIn };
});

const { attachGroupHearing, groupHearing } = await import('../group-hearing.js');
const { RoomMixInput } = await import('../room-mix-input.js');

const SESSION = 'session-group-1';
const OWNER = 'owner_web';
const GUEST = 'sip_guest1';
const JOIN_NOTE =
  "Sarah is on this call by phone with Seth. Lines that start with [Sarah] are hers, and lines that start with [Seth] are Seth's. " +
  'A line marked [unclear] could be either of them: if it matters who said it, ask. ' +
  'Talk with both of them, use their names, and let them talk to each other. ' +
  "Sarah can hear everything you say, so don't bring up Seth's private things unless Seth does.";

interface FakeTrack {
  kind: TrackKind;
}

function audioTrack(): FakeTrack {
  return { kind: TrackKind.KIND_AUDIO };
}

function person(identity: string, kind: ParticipantKind, name?: string, track?: FakeTrack) {
  const trackPublications = new Map<string, { track?: FakeTrack }>();
  if (track) trackPublications.set(`TR_${identity}`, { track });
  return { identity, name, kind, attributes: {}, trackPublications };
}

function fakeCall(userData: unknown = { userName: 'Seth Ford' }) {
  const notes: string[] = [];
  const agent = {
    chatCtx: {
      copy: () => ({
        items: [],
        addMessage: (msg: { content: string }) => notes.push(msg.content),
      }),
    },
    updateChatCtx: vi.fn(async () => undefined),
  };
  const sdkInput = { stream: new ReadableStream() };
  const session = Object.assign(new EventEmitter(), {
    input: { audio: sdkInput as unknown },
    userData,
    currentAgent: agent,
  });
  const room = Object.assign(new EventEmitter(), {
    remoteParticipants: new Map<string, ReturnType<typeof person>>(),
  });
  const owner = person(OWNER, ParticipantKind.STANDARD, 'Seth', audioTrack());
  room.remoteParticipants.set(OWNER, owner);
  const join = (p: ReturnType<typeof person>) => {
    room.remoteParticipants.set(p.identity, p);
    room.emit(RoomEvent.ParticipantConnected, p);
  };
  const leave = (p: ReturnType<typeof person>) => {
    room.remoteParticipants.delete(p.identity);
    room.emit(RoomEvent.ParticipantDisconnected, p);
  };
  const detach = attachGroupHearing({
    session: session as unknown as voice.AgentSession,
    agent: agent as unknown as voice.Agent,
    room: room as unknown as Room,
    ownerIdentity: OWNER,
    sessionId: SESSION,
  });
  return { notes, agent, session, sdkInput, room, owner, join, leave, detach };
}

/** Lets the async track reads (noise cancellation lookup) finish. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    // eslint-disable-next-line no-await-in-loop -- each turn lets one more pending step run
    await nextTick();
  }
}

describe('attachGroupHearing', () => {
  let detach: (() => void) | undefined;
  beforeEach(() => {
    opened.length = 0;
  });
  afterEach(() => {
    detach?.();
    detach = undefined;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('with GROUP_CALL off, a second caller leaves the audio input alone', async () => {
    vi.stubEnv('GROUP_CALL', 'off');
    const call = fakeCall();
    detach = call.detach;
    call.join(person(GUEST, ParticipantKind.SIP, 'Sarah', audioTrack()));
    await settle();

    expect(call.session.input.audio).toBe(call.sdkInput);
    expect(call.notes).toEqual([]);
    expect(opened).toEqual([]);
    expect(groupHearing(SESSION)).toBeUndefined();
  });

  it('with GROUP_CALL on, the first guest swaps in the room mix and gets a note', async () => {
    vi.stubEnv('GROUP_CALL', 'on');
    const addTrack = vi.spyOn(RoomMixInput.prototype, 'addTrack');
    const call = fakeCall();
    detach = call.detach;
    expect(groupHearing(SESSION)?.guestOn()).toBe(false);

    const guestTrack = audioTrack();
    call.join(person(GUEST, ParticipantKind.SIP, 'Sarah', guestTrack));
    await settle();

    expect(call.session.input.audio).toBeInstanceOf(RoomMixInput);
    expect(call.notes).toEqual([JOIN_NOTE]);
    const hearing = groupHearing(SESSION);
    expect(hearing?.guestOn()).toBe(true);
    expect(hearing?.guestName(GUEST)).toBe('Sarah');
    expect(hearing?.guestName(OWNER)).toBeUndefined();
    expect(hearing?.guestNames()).toEqual(['Sarah']);
    expect(hearing?.ledger.owner).toBe(OWNER);
    expect(hearing?.ownerLabel()).toBe('[Seth] ');
    // Both people are read at the mix format, each with their own noise cancellation:
    // the owner's too, since the SDK no longer cleans the session input.
    const format = { sampleRate: 16000, numChannels: 1, frameSizeMs: 10 };
    expect(opened[0]).toEqual({
      track: call.owner.trackPublications.get(`TR_${OWNER}`)?.track,
      options: { ...format, noiseCancellation: { moduleId: `nc-${OWNER}`, options: {} } },
    });
    expect(opened[1]?.track).toBe(guestTrack);
    expect(opened).toHaveLength(2);
    // The phone guest's AGC + high-pass is built for the rate her stream is read at, so it
    // processes her frames (a 24 kHz processor passes 16 kHz audio through untouched).
    const guestOptions = opened[1]?.options as typeof format & {
      noiseCancellation: { process: (frame: AudioFrame) => AudioFrame };
    };
    expect(guestOptions).toMatchObject(format);
    const heard = new AudioFrame(new Int16Array(160).fill(100), guestOptions.sampleRate, 1, 160);
    expect(guestOptions.noiseCancellation.process(heard)).not.toBe(heard);
    expect(addTrack.mock.calls.map(([identity]) => identity)).toEqual([OWNER, GUEST]);
  });

  it('a guest track that arrives after they join is added on TrackSubscribed', async () => {
    vi.stubEnv('GROUP_CALL', 'on');
    const addTrack = vi.spyOn(RoomMixInput.prototype, 'addTrack');
    const call = fakeCall();
    detach = call.detach;
    const guest = person(GUEST, ParticipantKind.SIP, 'Sarah');
    call.join(guest);
    await settle();
    expect(addTrack.mock.calls.map(([identity]) => identity)).toEqual([OWNER]);

    const late = audioTrack();
    call.room.emit(RoomEvent.TrackSubscribed, late, { track: late }, guest);
    await settle();
    expect(addTrack.mock.calls.map(([identity]) => identity)).toEqual([OWNER, GUEST]);
    expect(opened.at(-1)?.track).toBe(late);
  });

  it('agents and a second guest are not let in', async () => {
    vi.stubEnv('GROUP_CALL', 'on');
    const call = fakeCall();
    detach = call.detach;
    call.join(person('agent-avatar', ParticipantKind.AGENT, 'Avatar', audioTrack()));
    await settle();
    expect(call.session.input.audio).toBe(call.sdkInput);
    expect(groupHearing(SESSION)?.guestOn()).toBe(false);

    call.join(person(GUEST, ParticipantKind.SIP, 'Sarah', audioTrack()));
    call.join(person('sip_guest2', ParticipantKind.SIP, 'Dana', audioTrack()));
    await settle();
    expect(groupHearing(SESSION)?.guestNames()).toEqual(['Sarah']);
    expect(groupHearing(SESSION)?.guestName('sip_guest2')).toBeUndefined();
    expect(call.notes).toEqual([JOIN_NOTE]);
  });

  it('owner reconnect keeps the mix', async () => {
    vi.stubEnv('GROUP_CALL', 'on');
    const addTrack = vi.spyOn(RoomMixInput.prototype, 'addTrack');
    const call = fakeCall();
    detach = call.detach;
    call.join(person(GUEST, ParticipantKind.SIP, 'Sarah', audioTrack()));
    await settle();
    const mix = call.session.input.audio;
    expect(mix).toBeInstanceOf(RoomMixInput);

    call.leave(call.owner);
    // Whatever else touches the input while they are away, the mix goes back in.
    call.session.input.audio = call.sdkInput;
    const back = person(OWNER, ParticipantKind.STANDARD, 'Seth', audioTrack());
    call.join(back);
    await settle();

    expect(call.session.input.audio).toBe(mix);
    expect(addTrack.mock.calls.map(([identity]) => identity)).toEqual([OWNER, GUEST, OWNER]);
    expect(opened.at(-1)?.track).toBe(back.trackPublications.get(`TR_${OWNER}`)?.track);
    expect(call.notes).toEqual([JOIN_NOTE]);
  });

  it('guest left: their track comes out and Ferni is told', async () => {
    vi.stubEnv('GROUP_CALL', 'on');
    const removeTrack = vi.spyOn(RoomMixInput.prototype, 'removeTrack');
    const call = fakeCall();
    detach = call.detach;
    const guest = person(GUEST, ParticipantKind.SIP, 'Sarah', audioTrack());
    call.join(guest);
    await settle();
    removeTrack.mockClear();

    call.leave(guest);
    await settle();

    expect(removeTrack).toHaveBeenCalledWith(GUEST);
    expect(call.notes).toEqual([JOIN_NOTE, 'Sarah has left the call.']);
    const hearing = groupHearing(SESSION);
    expect(hearing?.guestOn()).toBe(false);
    expect(hearing?.guestNames()).toEqual(['Sarah']);
  });

  it('a persona handoff keeps the mix and tells the next persona too', async () => {
    vi.stubEnv('GROUP_CALL', 'on');
    const call = fakeCall();
    detach = call.detach;
    call.join(person(GUEST, ParticipantKind.SIP, 'Sarah', audioTrack()));
    await settle();
    const mix = call.session.input.audio;

    const nextNotes: string[] = [];
    call.session.currentAgent = {
      chatCtx: {
        copy: () => ({
          items: [],
          addMessage: (m: { content: string }) => nextNotes.push(m.content),
        }),
      },
      updateChatCtx: vi.fn(async () => undefined),
    };
    call.session.emit('agent_state_changed', { newState: 'listening' });
    call.session.emit('agent_state_changed', { newState: 'thinking' });

    expect(call.session.input.audio).toBe(mix);
    expect(nextNotes).toEqual([JOIN_NOTE]);
    expect(call.notes).toEqual([JOIN_NOTE]);
  });

  it('with no caller name the note says "the caller"', async () => {
    vi.stubEnv('GROUP_CALL', 'on');
    const call = fakeCall({});
    detach = call.detach;
    call.join(person(GUEST, ParticipantKind.SIP, 'Sarah', audioTrack()));
    await settle();
    expect(call.notes[0]).toContain('by phone with the caller.');
    expect(call.notes[0]).toContain("lines that start with [the caller] are the caller's.");
    expect(groupHearing(SESSION)?.ownerLabel()).toBe('[the caller] ');
  });

  it('detach stops listening and forgets the call', async () => {
    vi.stubEnv('GROUP_CALL', 'on');
    const call = fakeCall();
    call.detach();
    expect(groupHearing(SESSION)).toBeUndefined();
    call.join(person(GUEST, ParticipantKind.SIP, 'Sarah', audioTrack()));
    await settle();
    expect(call.session.input.audio).toBe(call.sdkInput);
    expect(call.room.listenerCount(RoomEvent.ParticipantConnected)).toBe(0);
  });
});
