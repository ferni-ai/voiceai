/**
 * A reply paused for noise, on a real LiveKit AgentSession whose audio sink
 * behaves like the room output (fake-room-audio.ts): without the resume
 * buffer the paused audio is lost (and a short reply is never resumed at all,
 * dev 2026-10-11: 10 of 73 false interruptions); with it the whole reply is
 * heard, ~1 s after the noise ends.
 */
import { DEFAULT_API_CONNECT_OPTIONS, initializeLogger, llm, voice } from '@livekit/agents';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { interruptionOverrides } from '../interruption-config.js';
import { FALLBACK_LINES } from '../never-silent.js';
import { installNeverSilent } from '../never-silent-install.js';
import { MS_PER_CHAR, PacedTTS, RoomLikeAudioOutput } from './fake-room-audio.js';

const SHORT = 'Ha, me too.'; // queued whole before the noise: LiveKit can't resume it
const LONG = 'Ha, fair enough. Takeout it is.';

class ReplyLLM extends llm.LLM {
  constructor(private readonly text: string) {
    super();
  }
  label(): string {
    return 'reply';
  }
  chat(p: Parameters<llm.LLM['chat']>[0]): llm.LLMStream {
    return new ReplyStream(this, this.text, {
      chatCtx: p.chatCtx,
      toolCtx: p.toolCtx,
      connOptions: { ...DEFAULT_API_CONNECT_OPTIONS, maxRetry: 0 },
    });
  }
}
class ReplyStream extends llm.LLMStream {
  constructor(
    model: llm.LLM,
    private readonly text: string,
    opts: ConstructorParameters<typeof llm.LLMStream>[1]
  ) {
    super(model, opts);
  }
  protected async run(): Promise<void> {
    await sleep(300);
    this.queue.put({ id: 'r', delta: { role: 'assistant', content: this.text } });
  }
}
const sleep = (ms: number) =>
  new Promise<void>((r) => {
    setTimeout(r, ms);
  });

interface Activity {
  isInterruptionByAudioActivityEnabled: boolean;
  interruptByAudioActivity(): void;
  onStartOfSpeech(ev: { speechDuration: number }): void;
  onEndOfSpeech(): void;
  cancelSpeechPause(): Promise<void>;
}

const outputs: RoomLikeAudioOutput[] = [];
const sessions: voice.AgentSession[] = [];

/** One reply, with `noise` ms of caller noise starting `at` ms after the reply's audio starts. */
async function call(
  text: string,
  neverSilent: 'on' | 'off',
  noise?: { at: number; ms: number; words?: boolean }
) {
  const env = { NEVER_SILENT: neverSilent };
  const session = new voice.AgentSession({
    llm: new ReplyLLM(text),
    tts: new PacedTTS(),
    turnHandling: { interruption: interruptionOverrides(env) },
  } as never);
  const out = new RoomLikeAudioOutput(1000); // rtc AudioSource queues 1 s
  outputs.push(out);
  sessions.push(session);
  session.output.audio = out;
  session.on(voice.AgentSessionEventTypes.Error, () => undefined);
  await session.start({ agent: new voice.Agent({ instructions: 'test' }) });
  installNeverSilent(
    {
      session,
      sessionWithEvents: session as never,
      sessionEventHandlers: [],
      cleanupFunctions: [],
      sessionId: `rb-${sessions.length}`,
      userId: undefined,
    },
    env
  );
  const t0 = Date.now();
  const events: Array<{ t: number; e: string; v?: unknown }> = [];
  session.on(voice.AgentSessionEventTypes.AgentFalseInterruption, (ev) =>
    events.push({ t: Date.now() - t0, e: 'false_interruption', v: ev.resumed })
  );
  session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) =>
    events.push({ t: Date.now() - t0, e: ev.newState })
  );
  const said: string[] = [];
  session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev) => {
    if (ev.item.type === 'message' && ev.item.role === 'assistant')
      said.push(ev.item.textContent ?? '');
  });
  session.generateReply({ userInput: 'You do not like to cook?' });
  let noiseEnd = 0;
  if (noise) {
    await sleep(300 + noise.at); // the reply's audio starts ~300 ms in
    const act = (session as unknown as { _activity: Activity })._activity;
    act.isInterruptionByAudioActivityEnabled = true;
    (session as unknown as { _aecWarmupRemaining: number })._aecWarmupRemaining = 0;
    act.interruptByAudioActivity(); // what LiveKit does for caller audio over Ferni
    act.onStartOfSpeech({ speechDuration: 0 });
    await sleep(noise.ms);
    // Real words: a final transcript makes LiveKit cancel the pause and cut the reply.
    if (noise.words) await act.cancelSpeechPause();
    act.onEndOfSpeech();
    noiseEnd = Date.now() - t0;
  }
  await sleep(5000);
  const heardBeforeNext = out.heardMs;
  // The session still answers afterwards (no playout left waiting on a pause).
  session.generateReply({ userInput: 'And then?' });
  await sleep(1500);
  // Ferni speaking again before the next caller turn (asked 5 s after the noise).
  const resumedAt = events.find(
    (e) => e.e === 'speaking' && noiseEnd && e.t > noiseEnd && e.t < noiseEnd + 4000
  )?.t;
  return {
    heardMs: heardBeforeNext,
    nextHeardMs: out.heardMs - heardBeforeNext,
    replyMs: text.length * MS_PER_CHAR,
    resumed: events.find((e) => e.e === 'false_interruption')?.v,
    resumeAfterNoiseMs: resumedAt === undefined ? null : resumedAt - noiseEnd,
    fallbacks: said.filter((s) => (FALLBACK_LINES as readonly string[]).includes(s)).length,
  };
}

describe('a reply paused for noise (real AgentSession)', () => {
  beforeAll(() => initializeLogger({ pretty: false, level: 'silent' }));
  afterEach(async () => {
    outputs.splice(0).forEach((o) => o.close());
    await Promise.all(sessions.splice(0).map((s) => s.close().catch(() => undefined)));
  });

  it('without it: a short reply is never resumed and most of it is never heard', async () => {
    const r = await call(SHORT, 'off', { at: 200, ms: 300 });
    expect(r.resumed).toBe(false);
    expect(r.heardMs).toBeLessThan(r.replyMs / 2);
  }, 20_000);

  it('without it: a longer reply resumes 2 s later, missing what was queued', async () => {
    const r = await call(LONG, 'off', { at: 400, ms: 300 });
    expect(r.resumed).toBe(true);
    expect(r.resumeAfterNoiseMs).toBeGreaterThanOrEqual(1900);
    expect(r.heardMs).toBeLessThan(r.replyMs - 500);
  }, 20_000);

  it.each([
    ['short', SHORT, 200],
    ['longer', LONG, 400],
  ])(
    'NEVER_SILENT=on: a %s reply resumes ~1 s after the noise and is heard whole',
    async (_n, text, at) => {
      const r = await call(text, 'on', { at, ms: 300 });
      expect(r.resumed).toBe(true);
      expect(r.resumeAfterNoiseMs).toBeGreaterThanOrEqual(900);
      expect(r.resumeAfterNoiseMs).toBeLessThan(1300);
      expect(r.heardMs).toBeGreaterThanOrEqual(r.replyMs);
      expect(r.fallbacks).toBe(0); // a resumed reply is not followed by "sorry, I lost my train"
    },
    20_000
  );

  it('NEVER_SILENT=on: a real barge-in still cuts the reply, nothing replays, the next turn plays', async () => {
    const r = await call(LONG, 'on', { at: 400, ms: 300, words: true });
    expect(r.resumeAfterNoiseMs).toBeNull();
    expect(r.heardMs).toBeLessThan(r.replyMs / 2);
    expect(r.nextHeardMs).toBeGreaterThan(500);
    expect(r.fallbacks).toBe(0);
  }, 20_000);

  it('NEVER_SILENT=on: a turn with no noise plays as before', async () => {
    const r = await call(LONG, 'on');
    expect(r.heardMs).toBeGreaterThanOrEqual(r.replyMs);
    expect(r.resumed).toBeUndefined();
    expect(r.fallbacks).toBe(0);
  }, 20_000);
});
