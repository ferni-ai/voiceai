/**
 * CALL_TIMELINE through the production wiring: attachCallTimeline on a scripted
 * AgentSession, sounds through the real clip player (startBackchannelClips),
 * generated text through the real TTS wrapper (wrappedTtsNode), barge-ins
 * through noteBargeIn. Only the audio tracks, the TTS gateway and Firestore are
 * faked. Off: no recorder, no writes. On: the call in order, written under the
 * conversation, and never for a held, on-behalf or non-member caller.
 */
import { EventEmitter } from 'node:events';
import { ReadableStream } from 'node:stream/web';
import { llm, type voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const direct = vi.hoisted(() => ({ played: [] as string[], cancel: false }));

vi.mock('@livekit/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@livekit/agents')>();
  class FakeBackgroundAudioPlayer {
    async start(): Promise<void> {}
    play() {
      return { done: () => true, stop: () => {} };
    }
    async close(): Promise<void> {}
  }
  return {
    ...actual,
    voice: { ...actual.voice, BackgroundAudioPlayer: FakeBackgroundAudioPlayer },
  };
});
vi.mock('../../integrations/direct-clip-track.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  startDirectClips: async () => ({
    playing: false,
    play: (_pcm: ArrayBuffer, _v: number, label: string) => (direct.played.push(label), true),
    cancelIfFresh: () => direct.cancel,
    lastWireMs: 57,
    stop: () => {},
    close: async () => {},
  }),
}));
vi.mock('../../../speech/tts-gateway/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../speech/tts-gateway/index.js')>()),
  isTTSGatewayEnabled: () => true,
  createGatewayTTSNode: () => async (text: ReadableStream<string>) => {
    for await (const _ of text) {
      /* drain */
    }
    return null;
  },
}));

const { attachCallTimeline } = await import('../call-timeline-session.js');
const { timelineFor, writeTimelineDoc, CHUNK_EVENTS, soundKindOf } =
  await import('../call-timeline.js');
const { voicedHumFor } = await import('../../integrations/voiced-presence.js');
const { installLiveCallBehaviors } = await import('../../multi-agent/live-call-behaviors.js');
const { VOICED_TAKES } = await import('../reaction-clips.js');
const { noteBargeIn } = await import('../turn-receipt-session.js');
const { startBackchannelClips } = await import('../../integrations/clip-player.js');
const { wrappedTtsNode } = await import('../tts-wrapper.js');
const minorCare = await import('../../../utils/minor-care.js');
const firestoreUtils = await import('../../../utils/firestore-utils.js');

const MEMBER = 'uid_timeline_member_01';
/** A timeline doc id without its session prefix (timelineDocId). */
const docName = (id: string): string => id.slice(id.lastIndexOf('.') + 1);
const GENERATED = 'Oh, my mistake, I mixed Sean up with someone else from last week.';
const HEARD = 'Oh, my mistake,';

type Write = { uid: string; conv: string; docId: string; data: Record<string, unknown> };
const asRecord = (d: object) => d as Record<string, unknown>;

function fakeSession(sessionId: string) {
  const s = new EventEmitter() as EventEmitter & { userData: unknown };
  s.userData = { services: { sessionId }, personaId: 'ferni' };
  return s;
}

const pcm = () => new Int16Array(2400).fill(8000).buffer;

async function speak(sessionId: string, text: string): Promise<void> {
  await wrappedTtsNode(
    {} as voice.Agent,
    new ReadableStream<string>({
      start(c) {
        c.enqueue(text);
        c.close();
      },
    }),
    {} as voice.ModelSettings,
    { sessionContext: { sessionId, personaId: 'ferni', turnNumber: 2 } }
  );
}

/**
 * The scripted call: caller final, a backchannel clip, a reply generated then
 * cut by a barge-in, the caller carrying on (clip cut), the turn-opening "Mm",
 * then hang-up. Returns what was written.
 */
async function scriptedCall(sessionId: string, userId: string) {
  const writes: Write[] = [];
  const session = fakeSession(sessionId);
  let t = 1_000_000;
  const detach = attachCallTimeline(session as never, {
    sessionId,
    userId,
    conversationId: () => 'conv_1',
    persona: () => 'ferni',
    now: () => (t += 100),
    write: async (uid, conv, docId, data) =>
      void writes.push({ uid, conv, docId, data: asRecord(data) }),
  });
  const clips = (await startBackchannelClips({} as never, session as never, () => 'ferni', pcm))!;

  session.emit('user_input_transcribed', { transcript: 'Who is Sean?', isFinal: true });
  session.emit('user_input_transcribed', { transcript: 'Who is', isFinal: false });
  expect(clips.live.playClip('Mhm')).toBe(true);
  await speak(sessionId, GENERATED);
  noteBargeIn(session, 'adaptive');
  session.emit('conversation_item_added', {
    item: llm.ChatMessage.create({ role: 'assistant', content: [HEARD], interrupted: true }),
  });
  direct.cancel = true;
  expect(clips.live.cancelClip()).toBe(true);
  expect(clips.openerClip('Mm')).toBe(true);
  session.emit('close', { reason: 'participant_disconnected' });
  await timelineFor(session)?.flush();
  detach();
  await clips.close();
  return { writes, session };
}

describe('CALL_TIMELINE', () => {
  beforeEach(() => {
    direct.played = [];
    direct.cancel = false;
    vi.stubEnv('REACTION_SIDETRACK', 'direct');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    minorCare.resetMinorCare();
  });

  it('off (default): no recorder on the session and nothing written', async () => {
    const { writes, session } = await scriptedCall('tl-off', MEMBER);
    expect(timelineFor(session)).toBeUndefined();
    expect(timelineFor('tl-off')).toBeUndefined();
    expect(writes).toEqual([]);
    // the call itself still ran: both clips played
    expect(direct.played).toEqual(['Mhm', 'Mm']);
  });

  it('on: the call in order, with the cut reply heard vs generated and every sound', async () => {
    vi.stubEnv('CALL_TIMELINE', 'on');
    const { writes } = await scriptedCall('tl-on', MEMBER);

    expect(writes.map((w) => docName(w.docId))).toEqual(['chunk-000', 'meta']);
    expect(writes.every((w) => w.uid === MEMBER && w.conv === 'conv_1')).toBe(true);
    const events = writes[0]!.data.events as Array<Record<string, unknown>>;
    expect(events.map((e) => e.kind)).toEqual([
      'caller_final',
      'backchannel',
      'barge_in',
      'ferni_reply',
      'clip_cut',
      'opener_sound',
      'call_end',
    ]);
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const tMs = events.map((e) => e.tMs as number);
    expect(tMs).toEqual([...tMs].sort((a, b) => a - b));
    expect(events[0]).toMatchObject({ speaker: 'caller', text: 'Who is Sean?' });
    // the clip text the gate got (sound_played's label), what it is, and when it started
    expect(events[1]).toMatchObject({
      speaker: 'ferni',
      text: 'Mhm',
      startMs: events[1]!.tMs,
      f: { sound: 'mm-hmm', source: 'backchannel' },
    });
    expect(events[2]).toMatchObject({ speaker: 'caller', f: { by: 'adaptive' } });
    expect(events[3]).toMatchObject({
      speaker: 'ferni',
      heardText: HEARD,
      generatedText: GENERATED,
      cut: true,
    });
    expect(events[4]).toMatchObject({ f: { by: 'pause_ended' } });
    expect(events[5]).toMatchObject({
      text: 'Mm',
      startMs: events[5]!.tMs,
      f: { sound: 'opener', source: 'opener' },
    });
    expect(events[6]).toMatchObject({ speaker: 'system', text: 'participant_disconnected' });

    const meta = writes[1]!.data;
    expect(meta).toMatchObject({
      v: 1,
      sessionId: 'tl-on',
      conversationId: 'conv_1',
      endReason: 'participant_disconnected',
      personas: ['ferni'],
      counts: { events: 7, dropped: 0 },
    });
  });

  it('on: a reply generated but never heard is kept as cut with nothing heard', async () => {
    vi.stubEnv('CALL_TIMELINE', 'on');
    const writes: Write[] = [];
    const session = fakeSession('tl-unheard');
    attachCallTimeline(session as never, {
      sessionId: 'tl-unheard',
      userId: MEMBER,
      conversationId: () => 'conv_1',
      persona: () => 'maya',
      write: async (uid, conv, docId, data) =>
        void writes.push({ uid, conv, docId, data: asRecord(data) }),
    });
    await speak('tl-unheard', 'First thought that got cut.');
    await speak('tl-unheard', 'Second thought.');
    session.emit('conversation_item_added', {
      item: llm.ChatMessage.create({ role: 'assistant', content: ['Second thought.'] }),
    });
    session.emit('close', { reason: 'user_initiated' });
    await timelineFor(session)?.flush();
    const replies = (writes[0]!.data.events as Array<Record<string, unknown>>).filter(
      (e) => e.kind === 'ferni_reply'
    );
    expect(replies).toEqual([
      expect.objectContaining({
        speaker: 'maya',
        heardText: '',
        generatedText: 'First thought that got cut.',
        cut: true,
      }),
      expect.objectContaining({ heardText: 'Second thought.' }),
    ]);
    expect(replies[1]).not.toHaveProperty('generatedText'); // same as heard
    expect(replies[1]).not.toHaveProperty('cut');
  });

  it('on: memory held (minor care, not the verified owner) writes nothing', async () => {
    vi.stubEnv('CALL_TIMELINE', 'on');
    vi.stubEnv('MINOR_CARE', 'on');
    minorCare.setVerifiedOwnerCheck(() => false);
    minorCare.noteCallerWords('tl-held', "I'm 14 years old");
    expect(minorCare.memoryHeld('tl-held')).toBe(true);
    const { writes } = await scriptedCall('tl-held', MEMBER);
    expect(writes).toEqual([]);
  });

  it('on: a hold that lifts mid-call (verified as the owner later) still writes nothing', async () => {
    vi.stubEnv('MINOR_CARE', 'on');
    const { CallTimeline } = await import('../call-timeline.js');
    const written: string[] = [];
    let owner = false;
    minorCare.setVerifiedOwnerCheck(() => owner);
    const tl = new CallTimeline({
      sessionId: 'tl-lifts',
      userId: MEMBER,
      conversationId: () => 'conv-lifts',
      persona: () => 'ferni',
      write: async (_uid, _conv, docId) => void written.push(docId),
    });
    tl.add({ kind: 'caller_final', speaker: 'caller', text: 'hey Ferni' });
    minorCare.noteCallerWords('tl-lifts', "I'm 14 years old");
    expect(minorCare.memoryHeld('tl-lifts')).toBe(true);
    tl.add({ kind: 'caller_final', speaker: 'caller', text: 'my best friend and I had a fight' });
    tl.generated('Oh man, a fight with your best friend.');
    owner = true; // phone verification lands after the age statement: the hold lifts
    expect(minorCare.memoryHeld('tl-lifts')).toBe(false);
    tl.heard('Oh man, a fight with your best friend.', false);
    tl.add({ kind: 'caller_final', speaker: 'caller', text: 'yeah it was about school' });
    tl.end('user_initiated');
    await tl.flush();
    expect(written).toEqual([]);
    expect(tl.events).toEqual([]);
  });

  it('on: an on-behalf call (the third party is not our user) writes nothing', async () => {
    vi.stubEnv('CALL_TIMELINE', 'on');
    const { writes } = await scriptedCall('tl-onbehalf', 'onbehalf:call_123');
    expect(writes).toEqual([]);
  });

  it('on: two sessions in one conversation (a handoff) never overwrite each other', async () => {
    vi.stubEnv('CALL_TIMELINE', 'on');
    // A handoff keeps the call's sessionId and attaches a second recorder
    const first = (await scriptedCall('tl-handoff', MEMBER)).writes.map((w) => w.docId);
    const second = (await scriptedCall('tl-handoff', MEMBER)).writes.map((w) => w.docId);
    expect(first.length).toBeGreaterThan(0);
    expect(second.filter((id) => first.includes(id))).toEqual([]);
  });

  it('on: nothing written while another session of this user is held (MINOR_CARE)', async () => {
    vi.stubEnv('CALL_TIMELINE', 'on');
    vi.stubEnv('MINOR_CARE', 'on');
    const { bindSessionUser, heldAfter, resetMinorCare } =
      await import('../../../utils/minor-care.js');
    try {
      bindSessionUser('tl-other-call', MEMBER);
      expect(heldAfter('tl-other-call', "I'm only 14.", { userId: MEMBER })).toBe(true);
      expect((await scriptedCall('tl-held-user', MEMBER)).writes).toEqual([]);
    } finally {
      resetMinorCare();
    }
  });

  it('on: a non-member caller (anonymous) writes nothing', async () => {
    vi.stubEnv('CALL_TIMELINE', 'on');
    expect((await scriptedCall('tl-anon', 'anon:abc123')).writes).toEqual([]);
    expect((await scriptedCall('tl-anon2', 'anonymous')).writes).toEqual([]);
  });

  it('on: writes every 60 s during the call, then only what changed', async () => {
    vi.useFakeTimers();
    try {
      vi.stubEnv('CALL_TIMELINE', 'on');
      const writes: Write[] = [];
      const session = fakeSession('tl-periodic');
      const detach = attachCallTimeline(session as never, {
        sessionId: 'tl-periodic',
        userId: MEMBER,
        conversationId: () => 'conv_1',
        persona: () => 'ferni',
        write: async (uid, conv, docId, data) =>
          void writes.push({ uid, conv, docId, data: asRecord(data) }),
      });
      for (let i = 0; i < CHUNK_EVENTS + 5; i++)
        session.emit('user_state_changed', { newState: i % 2 ? 'speaking' : 'listening' });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(writes.map((w) => docName(w.docId))).toEqual(['chunk-000', 'chunk-001', 'meta']);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(writes).toHaveLength(3); // nothing new
      session.emit('user_input_transcribed', { transcript: 'still here', isFinal: true });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(writes.slice(3).map((w) => docName(w.docId))).toEqual(['chunk-001', 'meta']);
      detach();
    } finally {
      vi.useRealTimers();
    }
  });

  it('names each sound as a judge hears it: by its take first, then by the gate', () => {
    const t = VOICED_TAKES;
    expect(soundKindOf('presence', t['morning-yawn'][0])).toBe('breath');
    expect(soundKindOf('presence', t['content-sigh'][0])).toBe('sigh');
    expect(soundKindOf('presence', t['thinking-hum'][0])).toBe('hum');
    expect(soundKindOf('backchannel', t.mmhm[1])).toBe('mm-hmm');
    expect(soundKindOf('backchannel', t.surprised[0])).toBe('laugh');
    expect(soundKindOf('laugh', '[laughter]')).toBe('laugh');
    expect(soundKindOf('presence', 'recorded-whistle:sunday')).toBe('whistle');
    expect(soundKindOf('presence', 'whistle')).toBe('whistle');
    expect(soundKindOf('presence', 'snore')).toBe('breath');
    expect(soundKindOf('presence', 'hum')).toBe('hum');
    expect(soundKindOf('tool_hum', 'hum')).toBe('hum');
    expect(soundKindOf('opener', 'Yeah')).toBe('opener');
    expect(soundKindOf('slow_turn', 'Hmm')).toBe('opener');
  });

  it('on: a voiced take (the tool hum) is recorded with its take and category', async () => {
    vi.stubEnv('CALL_TIMELINE', 'on');
    vi.stubEnv('VOICED_PRESENCE', 'on');
    const session = fakeSession('tl-voiced');
    const writes: Write[] = [];
    attachCallTimeline(session as never, {
      sessionId: 'tl-voiced',
      userId: MEMBER,
      conversationId: () => 'conv_1',
      persona: () => 'ferni',
      write: async (uid, conv, docId, data) =>
        void writes.push({ uid, conv, docId, data: asRecord(data) }),
    });
    const clips = (await startBackchannelClips({} as never, session as never, () => 'ferni', pcm))!;
    const hum = voicedHumFor(session)!;
    const take = hum.next()!;
    expect(hum.play(take, 0.35)).toBe(true);
    const ev = timelineFor(session)!.events.at(-1)!;
    expect(ev).toMatchObject({ kind: 'sound', startMs: ev.tMs });
    expect(ev.f).toEqual({ sound: 'hum', source: 'tool_hum', take: 'thinking-hum' });
    expect(VOICED_TAKES['thinking-hum']).toContain(ev.text);
    await clips.close();
  });

  it('production wiring: installLiveCallBehaviors attaches it; conversation and persona come from userData', async () => {
    const live = async (sessionId: string) => {
      const session = Object.assign(fakeSession(sessionId), { interrupt: () => undefined });
      session.userData = {
        services: { sessionId, realtimeConversationId: 'conv_ud' },
        personaId: 'maya-santos',
      };
      const cleanupFunctions: Array<() => void> = [];
      installLiveCallBehaviors({
        session: session as never,
        sessionWithEvents: session as never,
        sessionEventHandlers: [],
        cleanupFunctions,
        sessionId,
        userId: MEMBER,
      });
      return { session, cleanupFunctions };
    };
    expect(timelineFor((await live('tl-live-off')).session)).toBeUndefined();

    vi.stubEnv('CALL_TIMELINE', 'on');
    const paths: string[] = [];
    const writes: Array<Record<string, unknown>> = [];
    const ref = (path: string): Record<string, unknown> => ({
      collection: (name: string) => ref(`${path}/${name}`),
      doc: (id: string) => ref(`${path}/${id}`),
      set: async (data: Record<string, unknown>) => void (paths.push(path), writes.push(data)),
    });
    const db = ref('') as unknown as ReturnType<typeof firestoreUtils.getFirestoreDb>;
    vi.mocked(firestoreUtils.getFirestoreDb).mockReturnValueOnce(db).mockReturnValueOnce(db);
    const { session } = await live('tl-live-on');
    session.emit('function_tools_executed', { functionCalls: [{ name: 'getWeather' }] });
    session.emit('close', { reason: 'user_initiated' });
    await timelineFor(session)!.flush();
    const base = `/bogle_users/${MEMBER}/conversations/conv_ud/timeline`;
    expect(paths.map((p) => p.replace(/tl-live-on\.\d+\./, 'tl-live-on.N.'))).toEqual([
      `${base}/tl-live-on.N.chunk-000`,
      `${base}/tl-live-on.N.meta`,
    ]);
    const events = writes[0]!.events as Array<Record<string, unknown>>;
    expect(events.find((e) => e.kind === 'tool_call')).toMatchObject({
      speaker: 'maya-santos',
      text: 'getWeather',
    });
  });

  it('writes under bogle_users/{uid}/conversations/{conv}/timeline', async () => {
    const paths: string[] = [];
    const ref = (path: string): Record<string, unknown> => ({
      collection: (name: string) => ref(`${path}/${name}`),
      doc: (id: string) => ref(`${path}/${id}`),
      set: async () => void paths.push(path),
    });
    vi.mocked(firestoreUtils.getFirestoreDb).mockReturnValueOnce(
      ref('') as unknown as ReturnType<typeof firestoreUtils.getFirestoreDb>
    );
    await writeTimelineDoc(MEMBER, 'conv_1', 'meta', { v: 1 });
    expect(paths).toEqual([`/bogle_users/${MEMBER}/conversations/conv_1/timeline/meta`]);
  });
});
