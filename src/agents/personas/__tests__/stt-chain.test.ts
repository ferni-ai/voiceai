/**
 * GROUP_CALL: while a guest is on, every finished turn reaches the model labelled
 * [Seth], [Sarah] or [unclear] (fail closed); a solo call, or the flag off, is untouched.
 */
import { ReadableStream, type ReadableStreamDefaultController } from 'node:stream/web';
import { setImmediate as nextTick } from 'node:timers/promises';
import { stt } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TalkerLedger } from '../../group-conversation/talker-ledger.js';

interface Hearing {
  guestName: (identity: string) => string | undefined;
  guestNames: () => string[];
  ledger: TalkerLedger;
  guestOn: () => boolean;
  ownerLabel: () => string;
}

const hearings = vi.hoisted(() => new Map<string, Hearing>());
vi.mock('../../group-conversation/group-hearing.js', () => ({
  groupHearing: (sessionId: string) => hearings.get(sessionId),
}));

const { sttChain } = await import('../stt-chain.js');

/** Twice the ledger's voiced level (500, from the plan): clearly someone talking. */
const LOUD = 1000;
const SESSION = 'session-label-1';
const OWNER = 'owner_web';
const GUEST = 'sip_guest1';
const session = { userData: { services: { sessionId: SESSION } } };
const audio = new ReadableStream<AudioFrame>();

function final(text: string): stt.SpeechEvent {
  return {
    type: stt.SpeechEventType.FINAL_TRANSCRIPT,
    alternatives: [{ text, language: 'en', startTime: 0, endTime: 1, confidence: 0.9 }],
  } as unknown as stt.SpeechEvent;
}

function interim(text: string): stt.SpeechEvent {
  return { ...final(text), type: stt.SpeechEventType.INTERIM_TRANSCRIPT } as stt.SpeechEvent;
}

/** Puts `who` voiced for the 300 ms before `nowMs` (and the other person for a fifth of it). */
function voiced(ledger: TalkerLedger, who: string, nowMs: number): void {
  const other = who === OWNER ? GUEST : OWNER;
  for (let at = nowMs - 300; at < nowMs; at += 10) ledger.note(who, at, LOUD);
  for (let at = nowMs - 300; at < nowMs; at += 50) ledger.note(other, at, LOUD);
}

function hearingOnCall(guestOn = true): TalkerLedger {
  const ledger = new TalkerLedger(OWNER);
  hearings.set(SESSION, {
    guestName: (identity) => (identity === GUEST ? 'Sarah' : undefined),
    guestNames: () => ['Sarah'],
    ledger,
    guestOn: () => guestOn,
    ownerLabel: () => '[Seth] ',
  });
  return ledger;
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

const clock = (ms: number) => vi.spyOn(performance, 'now').mockReturnValue(ms);

function textOf(ev: stt.SpeechEvent | string | undefined): string | undefined {
  return typeof ev === 'string' ? ev : ev?.alternatives?.[0]?.text;
}

/** The chain over a feed started at mix time 49 s. */
async function chainAt49s(feed: ReturnType<typeof sttFeed>) {
  clock(49_000);
  const chained = await sttChain(session, audio, feed.base);
  if (!chained) throw new Error('no STT stream');
  return chained.getReader();
}

/** Says `ev` at mix time `atMs` and reads what comes out of the chain. */
async function heardAt(
  feed: ReturnType<typeof sttFeed>,
  reader: Awaited<ReturnType<typeof chainAt49s>>,
  atMs: number,
  ev: stt.SpeechEvent
) {
  clock(atMs);
  feed.say(ev);
  const { value } = await reader.read();
  await nextTick();
  return value;
}

describe('sttChain guest labels', () => {
  beforeEach(() => {
    vi.stubEnv('FIRST_TURN_FAST', 'off');
    vi.stubEnv('NAME_MISHEAR_NORMALIZE', 'off');
    vi.stubEnv('GROUP_CALL', 'on');
  });
  afterEach(() => {
    hearings.clear();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("labels a final in a guest-dominant window with the guest's name", async () => {
    voiced(hearingOnCall(), GUEST, 50_000);
    const feed = sttFeed();
    const reader = await chainAt49s(feed);
    expect(textOf(await heardAt(feed, reader, 50_000, final('see you at six')))).toBe(
      '[Sarah] see you at six'
    );
    expect(feed.base).toHaveBeenCalledWith(audio);
  });

  it("fails closed: a confident owner window is the owner's, a mixed one is unclear", async () => {
    const ledger = hearingOnCall();
    voiced(ledger, OWNER, 50_000); // owner 300 ms, guest 60 ms
    for (let at = 50_000; at < 50_500; at += 10) {
      ledger.note(at < 50_250 ? OWNER : GUEST, at, LOUD); // 250 ms each: overlap
    }
    const feed = sttFeed();
    const reader = await chainAt49s(feed);
    const owners = await heardAt(feed, reader, 50_000, final('see you at six'));
    const mixed = await heardAt(feed, reader, 50_500, final('who said that'));
    const silent = await heardAt(feed, reader, 51_000, final('ok'));
    expect([owners, mixed, silent].map(textOf)).toEqual([
      '[Seth] see you at six',
      '[unclear] who said that',
      '[unclear] ok',
    ]);
  });

  it('with a hearing but no guest on, a final passes through untouched', async () => {
    voiced(hearingOnCall(false), OWNER, 50_000);
    const feed = sttFeed();
    const reader = await chainAt49s(feed);
    const said = final('see you at six');
    expect(await heardAt(feed, reader, 50_000, said)).toBe(said);
  });

  it('a guest who just left still has her last words labelled', async () => {
    voiced(hearingOnCall(false), GUEST, 50_000);
    const feed = sttFeed();
    const reader = await chainAt49s(feed);
    expect(textOf(await heardAt(feed, reader, 50_000, final('bye now')))).toBe('[Sarah] bye now');
  });

  it('leaves interim transcripts alone, even mid guest turn', async () => {
    voiced(hearingOnCall(), GUEST, 50_000);
    const feed = sttFeed();
    const reader = await chainAt49s(feed);
    const partial = interim('see you');
    expect(await heardAt(feed, reader, 50_000, partial)).toBe(partial);
  });

  it('a window starts where the last final ended', async () => {
    const ledger = hearingOnCall();
    voiced(ledger, GUEST, 49_600);
    voiced(ledger, GUEST, 50_000); // a long guest turn: from 49 s it would outweigh the owner's
    voiced(ledger, OWNER, 50_500); // the owner answers after the guest's turn ended
    const feed = sttFeed();
    const reader = await chainAt49s(feed);
    const first = await heardAt(feed, reader, 50_000, final('see you at six'));
    const second = await heardAt(feed, reader, 50_500, final('sounds good'));
    expect([first, second].map(textOf)).toEqual(['[Sarah] see you at six', '[Seth] sounds good']);
  });

  it('puts the name right before the label goes on', async () => {
    vi.stubEnv('NAME_MISHEAR_NORMALIZE', 'on');
    voiced(hearingOnCall(), GUEST, 50_000);
    const feed = sttFeed();
    const reader = await chainAt49s(feed);
    expect(textOf(await heardAt(feed, reader, 50_000, final('Hey Fern how are you')))).toBe(
      '[Sarah] Hey Ferni how are you'
    );
  });

  it('with no hearing for the call, every event passes through untouched', async () => {
    const feed = sttFeed();
    const reader = await chainAt49s(feed);
    const said = final('see you at six');
    const partial = interim('see');
    expect(await heardAt(feed, reader, 50_000, said)).toBe(said);
    expect(await heardAt(feed, reader, 50_100, partial)).toBe(partial);
    feed.end();
    expect((await reader.read()).done).toBe(true);
  });

  it('with GROUP_CALL off, the chain returns the name fix stream itself', async () => {
    vi.stubEnv('GROUP_CALL', 'off');
    voiced(hearingOnCall(), GUEST, 50_000);
    const feed = sttFeed();
    const stream = await feed.base();
    feed.base.mockClear();
    clock(49_000);
    // First-turn-fast and the name fix are off, so name-fix hands back the base stream.
    expect(await sttChain(session, audio, feed.base)).toBe(stream);
  });

  it('no STT stream stays null', async () => {
    expect(await sttChain(session, audio, async () => null)).toBeNull();
  });
});
