/**
 * A reply paused at playout launch comes back on its own (PLAYOUT_LAUNCH_RESUME,
 * patches/@livekit__agents@1.8.1.patch).
 *
 * Dev, 2026-10-13, on @livekit/agents 1.6.4: three replies sat paused before their
 * first audio for 16.3 s, 16.4 s and 46.2 s while the caller said nothing. Since
 * 1.6.3 (#2263) a reply is paused at launch when the last VAD frame still counted
 * the caller as speaking, and only a VAD end of speech releases it; a turn
 * decision that is cancelled drops even that resume (#2204). Our turns end on
 * ink-2's end of turn, often inside VAD's hangover, so the reply waited for the
 * caller's next words. The patch resumes it after falseInterruptionTimeout unless
 * the caller is really speaking.
 */
import { DEFAULT_API_CONNECT_OPTIONS, initializeLogger, llm, voice } from '@livekit/agents';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { interruptionOverrides } from '../interruption-config.js';
import { MS_PER_CHAR, PacedTTS, RoomLikeAudioOutput } from './fake-room-audio.js';

const TEXT = 'Alright, so you start with breakfast at her place.';
const LLM_MS = 300;

class ReplyLLM extends llm.LLM {
  label(): string {
    return 'reply';
  }
  chat(p: Parameters<llm.LLM['chat']>[0]): llm.LLMStream {
    return new ReplyStream(this, {
      chatCtx: p.chatCtx,
      toolCtx: p.toolCtx,
      connOptions: { ...DEFAULT_API_CONNECT_OPTIONS, maxRetry: 0 },
    });
  }
}
class ReplyStream extends llm.LLMStream {
  protected async run(): Promise<void> {
    await sleep(LLM_MS);
    this.queue.put({ id: 'r', delta: { role: 'assistant', content: TEXT } });
  }
}
const sleep = (ms: number) =>
  new Promise<void>((r) => {
    setTimeout(r, ms);
  });

interface VadFrame {
  speaking: boolean;
  rawAccumulatedSilence: number;
  speechDuration: number;
  inferenceDuration: number;
}
interface FakeTurnTask {
  done: boolean;
  cancelled: boolean;
  addDoneCallback: (cb: (t: FakeTurnTask) => void) => void;
}
interface Activity {
  onVADInferenceDone: (ev: VadFrame) => void;
  onStartOfSpeech: (ev: { speechDuration: number; inferenceDuration: number }) => void;
  onEndOfSpeech: (ev?: { silenceDuration: number; inferenceDuration: number }) => void;
  audioRecognition?: { bounceEOUTask?: FakeTurnTask };
}

const outputs: RoomLikeAudioOutput[] = [];
const sessions: voice.AgentSession[] = [];
const saved = process.env.PLAYOUT_LAUNCH_RESUME;

/** A turn decision that is still running, then ends cancelled after `ms`. */
function cancelledTurnDecision(ms: number): FakeTurnTask {
  const cbs: Array<(t: FakeTurnTask) => void> = [];
  const task: FakeTurnTask = {
    done: false,
    cancelled: false,
    addDoneCallback: (cb) => cbs.push(cb),
  };
  setTimeout(() => {
    task.done = true;
    task.cancelled = true;
    cbs.forEach((cb) => cb(task));
  }, ms);
  return task;
}

/**
 * One reply whose launch lands inside VAD's hangover: a frame from the caller's
 * last word clears the silence gate after the reply was authorized, so the first
 * audio frame finds it shut. `after` runs once the reply is paused.
 */
async function call(patch: 'on' | 'off', after: (act: Activity, t0: number) => Promise<void>) {
  process.env.PLAYOUT_LAUNCH_RESUME = patch;
  const session = new voice.AgentSession({
    llm: new ReplyLLM(),
    tts: new PacedTTS(),
    turnHandling: { interruption: interruptionOverrides({}) }, // prod: NEVER_SILENT off
  } as never);
  const out = new RoomLikeAudioOutput(1000);
  outputs.push(out);
  sessions.push(session);
  session.output.audio = out;
  session.on(voice.AgentSessionEventTypes.Error, () => undefined);
  await session.start({ agent: new voice.Agent({ instructions: 'test' }) });
  const act = (session as unknown as { _activity: Activity })._activity;
  const t0 = Date.now();
  let firstAudioAt = null as number | null;
  session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
    if (ev.newState === 'speaking' && firstAudioAt === null) firstAudioAt = Date.now() - t0;
  });
  const resumes: boolean[] = [];
  session.on(voice.AgentSessionEventTypes.AgentFalseInterruption, (ev) => resumes.push(ev.resumed));
  session.generateReply({ userInput: 'So tell me again, step by step.' });
  await sleep(LLM_MS / 2);
  // The caller's last word, still inside VAD's hangover: speaking, no silence yet.
  act.onVADInferenceDone({
    speaking: true,
    rawAccumulatedSilence: 0,
    speechDuration: 0,
    inferenceDuration: 0,
  });
  await sleep(LLM_MS);
  // Silent frames afterwards set the gate again but do not release a pause.
  act.onVADInferenceDone({
    speaking: false,
    rawAccumulatedSilence: 400,
    speechDuration: 0,
    inferenceDuration: 0,
  });
  await after(act, t0);
  return { firstAudioAt, heardMs: out.heardMs, replyMs: TEXT.length * MS_PER_CHAR, resumes };
}

describe('a reply paused at playout launch (patched)', () => {
  beforeAll(() => initializeLogger({ pretty: false, level: 'silent' }));
  afterEach(async () => {
    process.env.PLAYOUT_LAUNCH_RESUME = saved;
    outputs.splice(0).forEach((o) => o.close());
    await Promise.all(sessions.splice(0).map((s) => s.close().catch(() => undefined)));
  });

  it('PLAYOUT_LAUNCH_RESUME=off: stays silent until the caller speaks again (the dev stall)', async () => {
    let silentFor = 0;
    const r = await call('off', async (act, t0) => {
      await sleep(6000);
      silentFor = Date.now() - t0;
      expect(outsHeard()).toBe(0); // 6 s and not a frame played
      act.onStartOfSpeech({ speechDuration: 0, inferenceDuration: 0 }); // "Uh-huh."
      await sleep(300);
      act.onEndOfSpeech({ silenceDuration: 0, inferenceDuration: 0 });
      await sleep(TEXT.length * MS_PER_CHAR + 1000);
    });
    expect(silentFor).toBeGreaterThanOrEqual(6000);
    expect(r.firstAudioAt).toBeGreaterThanOrEqual(6000); // only the next utterance freed it
    expect(r.heardMs).toBeGreaterThanOrEqual(r.replyMs);
  }, 20_000);

  it('on: resumes after the false-interruption timeout with the caller silent', async () => {
    const r = await call('on', async () => {
      await sleep(2000 + TEXT.length * MS_PER_CHAR + 1000);
    });
    expect(r.firstAudioAt).not.toBeNull();
    expect(r.firstAudioAt as number).toBeLessThan(LLM_MS * 2 + 2000 + 700);
    expect(r.heardMs).toBeGreaterThanOrEqual(r.replyMs);
    expect(r.resumes).toEqual([true]);
  }, 20_000);

  /** An end of speech arrives, but the turn decision it waits on ends cancelled (#2204). */
  const endThenCancelledDecision = (waitMs: number) => async (act: Activity) => {
    expect(act.audioRecognition).toBeDefined();
    (act.audioRecognition as { bounceEOUTask?: FakeTurnTask }).bounceEOUTask =
      cancelledTurnDecision(800);
    act.onEndOfSpeech({ silenceDuration: 0, inferenceDuration: 0 });
    await sleep(waitMs);
  };

  it('PLAYOUT_LAUNCH_RESUME=off: an end of speech whose turn decision is cancelled frees nothing', async () => {
    const r = await call('off', endThenCancelledDecision(6000));
    expect(r.firstAudioAt).toBeNull();
    expect(r.heardMs).toBe(0);
  }, 20_000);

  it('on: resumes when the end of speech came but its turn decision was cancelled', async () => {
    const r = await call(
      'on',
      endThenCancelledDecision(2000 + 2000 + TEXT.length * MS_PER_CHAR + 1000)
    );
    expect(r.firstAudioAt).not.toBeNull();
    expect(r.heardMs).toBeGreaterThanOrEqual(r.replyMs);
  }, 20_000);

  it('on: keeps holding while the caller is really speaking, then resumes when they stop', async () => {
    let heardWhileSpeaking = -1;
    const r = await call('on', async (act) => {
      act.onStartOfSpeech({ speechDuration: 0, inferenceDuration: 0 });
      await sleep(3000); // past the 2 s timeout, caller still talking
      heardWhileSpeaking = outsHeard();
      act.onEndOfSpeech({ silenceDuration: 0, inferenceDuration: 0 });
      await sleep(2000 + TEXT.length * MS_PER_CHAR + 1000);
    });
    expect(heardWhileSpeaking).toBe(0);
    expect(r.heardMs).toBeGreaterThanOrEqual(r.replyMs);
  }, 20_000);
});

function outsHeard(): number {
  return outputs[outputs.length - 1]?.heardMs ?? -1;
}
