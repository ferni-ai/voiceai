/**
 * A persona handoff and the call's STT stream (stt-handoff-reuse.ts), on a real LiveKit
 * AgentSession with real PersonaVoiceAgents, swapped by the production helper (beginSwap,
 * persona-swap.ts -> session.updateAgent).
 *
 * @livekit/agents 1.9 hands the STT pipeline to the next agent only when both run the default
 * sttNode; PersonaVoiceAgent overrides it, so each handoff opened a new STT stream (a new
 * Cartesia socket). With STT_HANDOFF_REUSE=on the first stream carries on, and what our
 * sttNode adds (the audio processor tap, the name fix) still runs on it.
 */
import { initializeLogger, stt, voice } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { ReadableStream, type ReadableStreamDefaultController } from 'node:stream/web';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { beginSwap } from '../../multi-agent/persona-swap.js';
import { PersonaVoiceAgent } from '../ferni-agent.js';
import { sttReusableAcrossHandoff } from '../stt-handoff-reuse.js';

/** The audio processor PersonaVoiceAgent.sttNode tees user audio into. */
const processor = vi.hoisted(() => ({ streams: 0, frames: 0 }));
vi.mock('../../voice-agent/audio-processor.js', () => ({
  processAudioStream: async (audio: AsyncIterable<unknown>) => {
    processor.streams += 1;
    for await (const _frame of audio) processor.frames += 1;
  },
}));

class FakeStream extends stt.SpeechStream {
  label = 'fake-stt';
  frames = 0;
  protected async run(): Promise<void> {
    for await (const frame of this.input) if (typeof frame !== 'symbol') this.frames += 1;
  }
  /** The caller says `text`, as Cartesia reports it. */
  say(text: string): void {
    const T = stt.SpeechEventType;
    const alt = { language: 'en', text, startTime: 0, endTime: 1, confidence: 1 };
    this.queue.put({ type: T.START_OF_SPEECH });
    this.queue.put({ type: T.FINAL_TRANSCRIPT, alternatives: [alt as stt.SpeechData] });
    this.queue.put({ type: T.END_OF_SPEECH });
  }
}

/** A streaming STT that keeps every stream (socket) it opened. */
class FakeSTT extends stt.STT {
  label = 'fake-stt';
  readonly streams: FakeStream[] = [];
  constructor() {
    super({ streaming: true, interimResults: false });
  }
  async _recognize(): Promise<stt.SpeechEvent> {
    throw new Error('not used');
  }
  stream(): stt.SpeechStream {
    const s = new FakeStream(this, 16000);
    this.streams.push(s);
    return s;
  }
}

/** The caller's microphone: 10 ms frames on demand. */
class Mic extends voice.AudioInput {
  private ctrl!: ReadableStreamDefaultController<AudioFrame>;
  constructor() {
    super();
    this.multiStream.addInputStream(new ReadableStream({ start: (c) => void (this.ctrl = c) }));
  }
  speak(frames: number): void {
    for (let i = 0; i < frames; i++)
      this.ctrl.enqueue(new AudioFrame(new Int16Array(160), 16000, 1, 160));
  }
}

const sleep = (ms: number) =>
  new Promise<void>((r) => {
    setTimeout(r, ms);
  });
async function until(ok: () => boolean, what: string): Promise<void> {
  for (let t = 0; t < 100 && !ok(); t++) await sleep(20);
  if (!ok()) throw new Error(`timed out waiting for ${what}`);
}

const sessions: voice.AgentSession[] = [];
const persona = (who: string) =>
  new PersonaVoiceAgent(`You are ${who}.`, { tools: {} as never, skipGreeting: true });

/** A call: Ferni hears 20 frames, hands off to Peter, then the caller speaks 30 more. */
async function handoffCall() {
  const model = new FakeSTT();
  const mic = new Mic();
  const session = new voice.AgentSession({ stt: model, vad: null, userData: {} } as never);
  sessions.push(session);
  session.on(voice.AgentSessionEventTypes.Error, () => undefined);
  session.input.audio = mic;
  const heard: string[] = [];
  session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => {
    if (ev.isFinal) heard.push(ev.transcript);
  });
  await session.start({ agent: persona('Ferni') });
  await until(() => model.streams.length === 1, 'the first STT stream');
  mic.speak(20);
  await until(() => model.streams[0]!.frames >= 20, 'frames before the handoff');
  const before = { processed: processor.frames };

  await beginSwap(session as never, persona('Peter'));
  mic.speak(30);
  const live = () => model.streams.at(-1)!;
  await until(() => live().frames >= (model.streams.length === 1 ? 50 : 30), 'frames after');
  return { model, live: live(), session, heard, before };
}

describe('the STT stream across a persona handoff (real AgentSession)', () => {
  beforeAll(() => initializeLogger({ pretty: false, level: 'silent' }));
  afterEach(async () => {
    await Promise.all(sessions.splice(0).map((s) => s.close().catch(() => undefined)));
    vi.unstubAllEnvs();
    processor.streams = 0;
    processor.frames = 0;
  });

  it('flag on: Peter keeps the stream Ferni opened, and it gets the audio after the swap', async () => {
    vi.stubEnv('STT_HANDOFF_REUSE', 'on');
    const { model, live } = await handoffCall();
    expect(model.streams).toHaveLength(1);
    expect(live).toBe(model.streams[0]);
    expect(live.frames).toBeGreaterThanOrEqual(50);
  });

  it('flag off (today): the handoff opens a second stream and the first gets nothing more', async () => {
    const { model, live } = await handoffCall();
    expect(model.streams).toHaveLength(2);
    expect(live).not.toBe(model.streams[0]);
    expect(model.streams[0]!.frames).toBeLessThan(50);
  });

  it('flag on: the reused stream still feeds the audio processor and fixes the name', async () => {
    vi.stubEnv('STT_HANDOFF_REUSE', 'on');
    vi.stubEnv('NAME_MISHEAR_NORMALIZE', 'on');
    const { live, heard, before } = await handoffCall();
    await until(() => processor.frames >= before.processed + 30, 'processor frames after');
    expect(processor.streams).toBe(1); // one tap for the whole call
    live.say('Hey Freddy.');
    await until(() => heard.length > 0, 'the transcript');
    expect(heard).toEqual(['Hey Ferni.']);
  });
});

describe('sttReusableAcrossHandoff', () => {
  class Own extends PersonaVoiceAgent {
    async sttNode(...args: Parameters<PersonaVoiceAgent['sttNode']>) {
      return super.sttNode(...args);
    }
  }
  const node = PersonaVoiceAgent.prototype.sttNode;
  const on = { STT_HANDOFF_REUSE: 'on' };
  const proto = (p: object) => Object.create(p) as object;

  it('on: a persona running the shared node is reusable; one with its own node is not', () => {
    expect(
      sttReusableAcrossHandoff(proto(PersonaVoiceAgent.prototype), node, () => false, on)
    ).toBe(true);
    expect(sttReusableAcrossHandoff(proto(Own.prototype), node, () => false, on)).toBe(false);
  });

  it("off: the SDK's own answer, whatever the node", () => {
    expect(
      sttReusableAcrossHandoff(proto(PersonaVoiceAgent.prototype), node, () => false, {})
    ).toBe(false);
    expect(sttReusableAcrossHandoff(proto(Own.prototype), node, () => true, {})).toBe(true);
  });
});
