/**
 * GROUP_CALL: while a guest is on, every finished turn reaches the model labelled
 * [unclear] (fail closed: who spoke is not known on the mix); a solo call, or the flag
 * off, is untouched.
 */
import { ReadableStream, type ReadableStreamDefaultController } from 'node:stream/web';
import { setImmediate as nextTick } from 'node:timers/promises';
import { asLanguageCode, stt } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomMixInput } from '../../group-conversation/room-mix-input.js';
import { TalkerLedger } from '../../group-conversation/talker-ledger.js';

interface Hearing {
  guestLastOnAt: () => number | undefined;
}

/** Hearings as group-hearing.ts keeps them: by the session that hears the call. */
const hearings = vi.hoisted(() => new Map<object, Hearing>());
vi.mock('../../group-conversation/group-hearing.js', () => ({
  groupHearingFor: (session: object) => hearings.get(session),
}));

const { sttChain } = await import('../stt-chain.js');

const session = { userData: { services: { sessionId: 'session-label-1' } } };
const audio = new ReadableStream<AudioFrame>();

function final(text: string): stt.SpeechEvent {
  return {
    type: stt.SpeechEventType.FINAL_TRANSCRIPT,
    alternatives: [
      { text, language: asLanguageCode('en'), startTime: 0, endTime: 1, confidence: 0.9 },
    ],
  };
}

function interim(text: string): stt.SpeechEvent {
  return { ...final(text), type: stt.SpeechEventType.INTERIM_TRANSCRIPT };
}

/** The mix clock (performance.now) reads `ms` from here on. */
let nowMs = 0;
const clockAt = (ms: number): void => {
  nowMs = ms;
};

/**
 * A hearing attached to `on`, as group-hearing.ts keeps it: the last time a guest was on,
 * "now" while she is on, and undefined if no guest has been on.
 */
function hearingOnCall(guestOn = true, on: object = session) {
  const state = { on: guestOn, lastOnAt: undefined as number | undefined };
  hearings.set(on, { guestLastOnAt: () => (state.on ? nowMs : state.lastOnAt) });
  return {
    join: () => {
      state.on = true;
    },
    leave: (atMs: number) => {
      state.on = false;
      state.lastOnAt = atMs;
    },
  };
}

/** The base STT: events go out when the test says them, as Ink sends them. */
function sttFeed() {
  let controller: ReadableStreamDefaultController<stt.SpeechEvent> | undefined;
  const stream = new ReadableStream<stt.SpeechEvent>({
    start: (c) => {
      controller = c;
    },
  });
  return {
    base: vi.fn(async () => stream),
    say: (ev: stt.SpeechEvent) => controller?.enqueue(ev),
    end: () => controller?.close(),
  };
}

function textOf(ev: stt.SpeechEvent | string | undefined): string | undefined {
  return typeof ev === 'string' ? ev : ev?.alternatives?.[0]?.text;
}

/** The chain over a feed, started at mix time 49 s. */
async function chainFor(feed: ReturnType<typeof sttFeed>, on: object = session) {
  clockAt(49_000);
  const chained = await sttChain(on, audio, feed.base);
  if (!chained) throw new Error('no STT stream');
  return chained.getReader();
}

/** Says `ev` and reads what comes out of the chain. */
async function heard(
  feed: ReturnType<typeof sttFeed>,
  reader: Awaited<ReturnType<typeof chainFor>>,
  ev: stt.SpeechEvent,
  atMs = nowMs
) {
  clockAt(atMs);
  feed.say(ev);
  const { value } = await reader.read();
  await nextTick();
  return value;
}

describe('sttChain group call labels', () => {
  beforeEach(() => {
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
    vi.stubEnv('FIRST_TURN_FAST', 'off');
    vi.stubEnv('NAME_MISHEAR_NORMALIZE', 'off');
    vi.stubEnv('GROUP_CALL', 'on');
  });
  afterEach(() => {
    hearings.clear();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('fails closed: while a guest is on, every final is labelled unclear', async () => {
    hearingOnCall();
    const feed = sttFeed();
    const reader = await chainFor(feed);
    const first = await heard(feed, reader, final('see you at six'));
    const second = await heard(feed, reader, final('sounds good'));
    expect([first, second].map(textOf)).toEqual([
      '[unclear] see you at six',
      '[unclear] sounds good',
    ]);
    expect(feed.base).toHaveBeenCalledWith(audio);
  });

  it('passes an empty or blank final through unlabelled, so the SDK still drops it', async () => {
    hearingOnCall();
    const feed = sttFeed();
    const reader = await chainFor(feed);
    const empty = final('');
    const blank = final('  ');
    expect(await heard(feed, reader, empty)).toBe(empty);
    expect(await heard(feed, reader, blank)).toBe(blank);
  });

  it('leaves interim transcripts alone, even with a guest on', async () => {
    hearingOnCall();
    const feed = sttFeed();
    const reader = await chainFor(feed);
    const partial = interim('see you');
    expect(await heard(feed, reader, partial)).toBe(partial);
  });

  it("labels by the session it hears, whatever id the session's services carry", async () => {
    const elsewhere = { userData: { services: { sessionId: 'session-label-other' } } };
    hearingOnCall(true, elsewhere);
    const feed = sttFeed();
    const reader = await chainFor(feed, elsewhere);
    expect(textOf(await heard(feed, reader, final('see you at six')))).toBe(
      '[unclear] see you at six'
    );
  });

  it('fails closed: the room mix with no hearing found labels every final unclear', async () => {
    const mix = new RoomMixInput(new TalkerLedger('owner_web'));
    const mixed = { userData: session.userData, input: { audio: mix } };
    const feed = sttFeed();
    const reader = await chainFor(feed, mixed);
    const said = await heard(feed, reader, final('see you at six'));
    const partial = interim('see');
    expect(textOf(said)).toBe('[unclear] see you at six');
    expect(await heard(feed, reader, partial)).toBe(partial);
    await mix.close();
  });

  it('a guest who joins and leaves between two finals has the second one labelled', async () => {
    const guest = hearingOnCall(false);
    const feed = sttFeed();
    const reader = await chainFor(feed);
    const before = final('so anyway');
    expect(await heard(feed, reader, before, 50_000)).toBe(before);
    clockAt(50_200);
    guest.join();
    guest.leave(50_400); // a short hello, all inside the next turn
    expect(textOf(await heard(feed, reader, final('who was that'), 51_000))).toBe(
      '[unclear] who was that'
    );
  });

  it('a final that comes back 1.5 s after she left is still labelled (STT lag)', async () => {
    const guest = hearingOnCall();
    const feed = sttFeed();
    const reader = await chainFor(feed);
    guest.leave(50_000);
    const first = await heard(feed, reader, final('bye now'), 50_500);
    const late = await heard(feed, reader, final('see you'), 51_500);
    expect([first, late].map(textOf)).toEqual(['[unclear] bye now', '[unclear] see you']);
  });

  it('a final whose turn starts over 2 s after she left is not labelled', async () => {
    const guest = hearingOnCall();
    const feed = sttFeed();
    const reader = await chainFor(feed);
    guest.leave(50_000);
    expect(textOf(await heard(feed, reader, final('bye now'), 52_100))).toBe('[unclear] bye now');
    const after = final('so anyway');
    expect(await heard(feed, reader, after, 53_000)).toBe(after);
  });

  it('a guest who joins mid-turn gets that turn labelled', async () => {
    const guest = hearingOnCall(false);
    const feed = sttFeed();
    const reader = await chainFor(feed);
    guest.join();
    expect(textOf(await heard(feed, reader, final('hi Sarah'), 50_000))).toBe('[unclear] hi Sarah');
  });

  it('puts the name right before the label goes on', async () => {
    vi.stubEnv('NAME_MISHEAR_NORMALIZE', 'on');
    hearingOnCall();
    const feed = sttFeed();
    const reader = await chainFor(feed);
    expect(textOf(await heard(feed, reader, final('Hey Fern how are you')))).toBe(
      '[unclear] Hey Ferni how are you'
    );
  });

  it('solo: a hearing that never had a guest leaves every event untouched', async () => {
    hearingOnCall(false);
    const feed = sttFeed();
    const reader = await chainFor(feed);
    const said = final('see you at six');
    expect(await heard(feed, reader, said)).toBe(said);
  });

  it('solo: with no hearing and the usual input, every event passes through untouched', async () => {
    const feed = sttFeed();
    const reader = await chainFor(feed);
    const said = final('see you at six');
    const partial = interim('see');
    expect(await heard(feed, reader, said)).toBe(said);
    expect(await heard(feed, reader, partial)).toBe(partial);
    feed.end();
    expect((await reader.read()).done).toBe(true);
  });

  it('with GROUP_CALL off, the chain returns the name fix stream itself', async () => {
    vi.stubEnv('GROUP_CALL', 'off');
    hearingOnCall();
    const feed = sttFeed();
    const stream = await feed.base();
    feed.base.mockClear();
    // First-turn-fast and the name fix are off, so name-fix hands back the base stream.
    expect(await sttChain(session, audio, feed.base)).toBe(stream);
  });

  it('no STT stream stays null', async () => {
    expect(await sttChain(session, audio, async () => null)).toBeNull();
  });
});
