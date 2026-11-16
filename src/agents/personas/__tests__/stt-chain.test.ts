/**
 * GROUP_CALL: a guest's finished turns reach the model labelled with her name;
 * the owner's, and every turn on a solo call, are untouched.
 */
import { ReadableStream, type ReadableStreamDefaultController } from 'node:stream/web';
import { setImmediate as nextTick } from 'node:timers/promises';
import { stt } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TalkerLedger, VOICED_RMS } from '../../group-conversation/talker-ledger.js';

interface Hearing {
  guestName: (identity: string) => string | undefined;
  guestNames: () => string[];
  ledger: TalkerLedger;
  guestOn: () => boolean;
}

const hearings = vi.hoisted(() => new Map<string, Hearing>());
vi.mock('../../group-conversation/group-hearing.js', () => ({
  groupHearing: (sessionId: string) => hearings.get(sessionId),
}));

const { sttChain } = await import('../stt-chain.js');

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
  for (let at = nowMs - 300; at < nowMs; at += 10) ledger.note(who, at, VOICED_RMS * 2);
  for (let at = nowMs - 300; at < nowMs; at += 50) ledger.note(other, at, VOICED_RMS * 2);
}

function hearingOnCall(): TalkerLedger {
  const ledger = new TalkerLedger(OWNER);
  hearings.set(SESSION, {
    guestName: (identity) => (identity === GUEST ? 'Sarah' : undefined),
    guestNames: () => ['Sarah'],
    ledger,
    guestOn: () => true,
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

  it('leaves a final in an owner-dominant window as it was', async () => {
    voiced(hearingOnCall(), OWNER, 50_000);
    const feed = sttFeed();
    const reader = await chainAt49s(feed);
    const said = final('see you at six');
    expect(await heardAt(feed, reader, 50_000, said)).toBe(said);
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
    expect([first, second].map(textOf)).toEqual(['[Sarah] see you at six', 'sounds good']);
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

  it('no STT stream stays null', async () => {
    expect(await sttChain(session, audio, async () => null)).toBeNull();
  });
});
