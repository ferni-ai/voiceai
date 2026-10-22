/**
 * A look-up whose lead-in is paused by the caller's own last words comes back,
 * and the answer still plays (PAUSE_RESUME_WATCHDOG, patches/@livekit__agents@1.9.3.patch).
 *
 * Prod canary 2026-10-21 11:39:03Z (voiceai-evidence/capability-sweep-2026-10-21/prod-canary,
 * lookups call): ink ended the turn while VAD was still in the caller's speech segment
 * ("stt end of speech received while vad is still in a speech segment, flushing vad",
 * segment 2.6 s). The preemptive reply was scheduled at once, and a VAD frame left over
 * from that segment reached interruptByAudioActivity after it: the reply was paused
 * (REPLY_RESUME paused, 689 ms before its first text existed). LiveKit resumes such a
 * pause only from an end of speech that comes after it, and the caller's had already
 * come. "One sec, let me check." never played, the answer after getNews waits for the
 * lead-in's playout, so it was never asked for: 16.9 s of silence until the caller
 * spoke again and the answer was dropped.
 *
 * Each case drives a real AgentSession through the same calls LiveKit's audio
 * recognition makes (onEndOfSpeech, onEndOfTurn, onVADInferenceDone), with the prod
 * output chain (resume buffer + drift guard over a room-like sink).
 */
import { DEFAULT_API_CONNECT_OPTIONS, initializeLogger, llm, voice } from '@livekit/agents';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { interruptionOverrides } from '../interruption-config.js';
import { installNeverSilent } from '../never-silent-install.js';
import { MS_PER_CHAR, PacedTTS, RoomLikeAudioOutput } from './fake-room-audio.js';

const QUESTION = 'Nice. Anything big in the news today?';
const LEAD_IN = 'One sec, let me check.';
const ANSWER = 'Big one today: the city council passed the new transit budget.';
const LLM_MS = 300;
const LEAD_IN_MS = LEAD_IN.length * MS_PER_CHAR;
const ANSWER_MS = ANSWER.length * MS_PER_CHAR;

/** First call: the lead-in, then getNews. Second call (after the tool result): the answer. */
class LookupLLM extends llm.LLM {
  calls = 0;
  label(): string {
    return 'lookup';
  }
  chat(p: Parameters<llm.LLM['chat']>[0]): llm.LLMStream {
    this.calls += 1;
    return new LookupStream(this, this.calls === 1, {
      chatCtx: p.chatCtx,
      toolCtx: p.toolCtx,
      connOptions: { ...DEFAULT_API_CONNECT_OPTIONS, maxRetry: 0 },
    });
  }
}
class LookupStream extends llm.LLMStream {
  constructor(
    model: llm.LLM,
    private readonly first: boolean,
    opts: ConstructorParameters<typeof llm.LLMStream>[1]
  ) {
    super(model, opts);
  }
  protected async run(): Promise<void> {
    await sleep(LLM_MS);
    if (!this.first) {
      this.queue.put({ id: 'b', delta: { role: 'assistant', content: ANSWER } });
      return;
    }
    this.queue.put({ id: 'a', delta: { role: 'assistant', content: LEAD_IN } });
    this.queue.put({
      id: 'a',
      delta: {
        role: 'assistant',
        toolCalls: [llm.FunctionCall.create({ callId: 'c1', name: 'getNews', args: '{}' })],
      },
    });
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
/** The parts of LiveKit's AgentActivity that its audio recognition calls. */
interface Activity {
  isInterruptionByAudioActivityEnabled: boolean;
  pausedSpeech?: unknown;
  _currentSpeech?: unknown;
  audioRecognition?: { bounceEOUTask?: FakeTurnTask };
  onStartOfSpeech: (ev: { speechDuration: number; inferenceDuration: number }) => void;
  onEndOfSpeech: (ev?: { silenceDuration: number; inferenceDuration: number }) => void;
  onVADInferenceDone: (ev: VadFrame) => void;
  onPreemptiveGeneration: (info: {
    newTranscript: string;
    transcriptConfidence: number;
    startedSpeakingAt?: number;
  }) => void;
  onEndOfTurn: (info: Record<string, unknown>) => Promise<boolean>;
  cancelSpeechPause: () => Promise<void>;
}

const outputs: RoomLikeAudioOutput[] = [];
const sessions: voice.AgentSession[] = [];
const savedLaunchResume = process.env.PLAYOUT_LAUNCH_RESUME;

interface Options {
  neverSilent?: 'on' | 'off';
  launchResume?: 'on' | 'off';
  /** Runs once the reply is paused; `act` is the live activity. */
  after?: (act: Activity) => Promise<void>;
  waitMs: number;
}

/**
 * The prod sequence: the caller asks, a preemptive reply starts, ink ends the turn
 * (end of speech, then the commit uses the preemptive reply), and then a VAD frame
 * still inside the caller's 2.6 s segment arrives.
 */
async function lookupTurn(opts: Options) {
  process.env.PLAYOUT_LAUNCH_RESUME = opts.launchResume ?? 'on';
  const env = { NEVER_SILENT: opts.neverSilent ?? 'on', PLAYOUT_DRIFT_GUARD: 'on' };
  const lm = new LookupLLM();
  const session = new voice.AgentSession({
    llm: lm,
    tts: new PacedTTS(),
    turnHandling: { interruption: interruptionOverrides(env) },
  } as never);
  const out = new RoomLikeAudioOutput(1000); // rtc AudioSource queues 1 s
  outputs.push(out);
  sessions.push(session);
  session.output.audio = out;
  session.on(voice.AgentSessionEventTypes.Error, () => undefined);
  let toolRan = false;
  const getNews = llm.tool({
    description: 'Top news',
    parameters: z.object({}),
    execute: async () => {
      toolRan = true;
      return 'Transit budget passed.';
    },
  });
  await session.start({ agent: new voice.Agent({ instructions: 'test', tools: { getNews } }) });
  installNeverSilent(
    {
      session,
      sessionWithEvents: session as never,
      sessionEventHandlers: [],
      cleanupFunctions: [],
      sessionId: `pli-${sessions.length}`,
      userId: undefined,
    },
    env
  );
  const act = (session as unknown as { _activity: Activity })._activity;
  // Barge-in by voice activity is live between replies, as on a call after the greeting.
  act.isInterruptionByAudioActivityEnabled = true;
  (session as unknown as { _aecWarmupRemaining: number })._aecWarmupRemaining = 0;

  act.onStartOfSpeech({ speechDuration: 0, inferenceDuration: 0 });
  act.onPreemptiveGeneration({
    newTranscript: QUESTION,
    transcriptConfidence: 1,
    startedSpeakingAt: Date.now(),
  });
  await sleep(100);
  // ink's end of speech: the caller is "listening" from here on.
  act.onEndOfSpeech({ silenceDuration: 0, inferenceDuration: 0 });
  await act.onEndOfTurn({
    skipReply: false,
    newTranscript: QUESTION,
    transcriptConfidence: 1,
    transcriptionDelay: 0,
    endOfUtteranceDelay: 0,
    startedSpeakingAt: undefined,
    stoppedSpeakingAt: undefined,
  });
  // The commit schedules the preemptive reply (prod: 21 ms before the pause).
  // eslint-disable-next-line no-await-in-loop -- polling the live activity
  for (let i = 0; i < 100 && !act._currentSpeech; i++) await sleep(2);
  // The leftover VAD frame: still in the caller's segment, 2.6 s of speech so far.
  act.onVADInferenceDone({
    speaking: true,
    rawAccumulatedSilence: 0,
    speechDuration: 2600,
    inferenceDuration: 0,
  });
  const pausedAt = Date.now();
  const pausedNow = Boolean(act.pausedSpeech);
  act.onVADInferenceDone({
    speaking: false,
    rawAccumulatedSilence: 400,
    speechDuration: 0,
    inferenceDuration: 0,
  });
  // When the caller first hears the answer (the lead-in is heard first).
  let answerHeardAt: number | null = null;
  // eslint-disable-next-line no-restricted-globals -- cleared below; a test-local probe
  const probe = setInterval(() => {
    if (answerHeardAt === null && out.heardMs > LEAD_IN_MS + 200) answerHeardAt = Date.now();
  }, 20);
  await opts.after?.(act);
  await sleep(opts.waitMs);
  clearInterval(probe);
  return {
    pausedNow,
    heardMs: out.heardMs,
    llmCalls: lm.calls,
    toolRan,
    answerAfterPauseMs: answerHeardAt === null ? null : (answerHeardAt as number) - pausedAt,
  };
}

/** A ~1 s resume, the lead-in, the answer's LLM call, its first audio, and slack for load. */
const BUDGET_MS = 1000 + LEAD_IN_MS + LLM_MS + 1500;

describe('a look-up lead-in paused by a VAD frame left over from the caller', () => {
  beforeAll(() => initializeLogger({ pretty: false, level: 'silent' }));
  afterEach(async () => {
    process.env.PLAYOUT_LAUNCH_RESUME = savedLaunchResume;
    outputs.splice(0).forEach((o) => o.close());
    await Promise.all(sessions.splice(0).map((s) => s.close().catch(() => undefined)));
  });

  it('kill switch off (the prod bug): silent, the answer is never asked for', async () => {
    const r = await lookupTurn({ launchResume: 'off', waitMs: 8000 });
    expect(r.pausedNow).toBe(true);
    expect(r.toolRan).toBe(true);
    expect(r.heardMs).toBe(0); // 8 s and not a frame: the lead-in stayed paused
    expect(r.llmCalls).toBe(1); // the answer after getNews was never requested
    expect(r.answerAfterPauseMs).toBeNull();
  }, 20_000);

  it('NEVER_SILENT=on: the lead-in resumes ~1 s on and the answer plays whole', async () => {
    const r = await lookupTurn({ waitMs: BUDGET_MS + ANSWER_MS + 1000 });
    expect(r.pausedNow).toBe(true);
    expect(r.llmCalls).toBe(2);
    expect(r.answerAfterPauseMs).not.toBeNull();
    expect(r.answerAfterPauseMs as number).toBeLessThan(BUDGET_MS);
    expect(r.heardMs).toBeGreaterThanOrEqual(LEAD_IN_MS + ANSWER_MS - 200);
  }, 30_000);

  it('NEVER_SILENT=off (dev): resumed after LiveKit’s 2 s timeout instead', async () => {
    const r = await lookupTurn({ neverSilent: 'off', waitMs: BUDGET_MS + ANSWER_MS + 2000 });
    expect(r.pausedNow).toBe(true);
    expect(r.llmCalls).toBe(2);
    expect(r.answerAfterPauseMs as number).toBeGreaterThanOrEqual(2000);
    expect(r.answerAfterPauseMs as number).toBeLessThan(BUDGET_MS + 1000);
    expect(r.heardMs).toBeGreaterThanOrEqual(LEAD_IN_MS + ANSWER_MS - 200);
  }, 30_000);

  it('holds while the caller is really speaking, then resumes once they stop', async () => {
    let heardWhileSpeaking = -1;
    const r = await lookupTurn({
      after: async (act) => {
        act.onStartOfSpeech({ speechDuration: 0, inferenceDuration: 0 });
        await sleep(3000); // well past the 1 s timeout
        heardWhileSpeaking = outputs[outputs.length - 1].heardMs;
        act.onEndOfSpeech({ silenceDuration: 0, inferenceDuration: 0 });
      },
      waitMs: BUDGET_MS + ANSWER_MS + 1000,
    });
    expect(heardWhileSpeaking).toBe(0);
    expect(r.llmCalls).toBe(2);
    expect(r.heardMs).toBeGreaterThanOrEqual(LEAD_IN_MS + ANSWER_MS - 200);
  }, 30_000);

  it('real words still cut it: nothing plays and the pause is not resumed', async () => {
    const r = await lookupTurn({
      after: async (act) => {
        await act.cancelSpeechPause(); // what LiveKit does on a final transcript
      },
      waitMs: 3000,
    });
    expect(r.heardMs).toBe(0);
    expect(r.answerAfterPauseMs).toBeNull();
  }, 20_000);

  it('is bounded: a turn decision that never settles holds it ~4 s, not forever', async () => {
    const r = await lookupTurn({
      after: async (act) => {
        expect(act.audioRecognition).toBeDefined();
        (act.audioRecognition as { bounceEOUTask?: FakeTurnTask }).bounceEOUTask = {
          done: false,
          cancelled: false,
          addDoneCallback: () => undefined,
        };
      },
      waitMs: 4000 + BUDGET_MS + ANSWER_MS,
    });
    expect(r.llmCalls).toBe(2);
    expect(r.answerAfterPauseMs as number).toBeGreaterThanOrEqual(4000);
    expect(r.answerAfterPauseMs as number).toBeLessThan(4000 + BUDGET_MS);
    expect(r.heardMs).toBeGreaterThanOrEqual(LEAD_IN_MS + ANSWER_MS - 200);
  }, 30_000);
});
