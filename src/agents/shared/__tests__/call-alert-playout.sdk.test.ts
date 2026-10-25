/**
 * When an alert counts as heard, and what the retry waits for (#2507), on a real
 * LiveKit AgentSession with the prod output chain (resume buffer over a
 * room-like sink, NEVER_SILENT=on). From the verifier's cases for #2519.
 *
 * - Heard means HEARD_AFTER_MS of playout ('speaking'), not that long since the
 *   first frame: the caller's voice pauses the reply (speaking -> listening), and
 *   their committed turn then cuts it. Cut sooner, it is said again.
 * - The retry waits for the answer to the caller, and for LiveKit's endpointing
 *   delay after they last stopped, so a second caller turn still to be committed
 *   doesn't cut it before any audio.
 * - The call ending while it waits drops it (call_ended); nothing is asked for.
 */
import { DEFAULT_API_CONNECT_OPTIONS, initializeLogger, llm, tts, voice } from '@livekit/agents';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PacedTTS, RoomLikeAudioOutput } from '../../multi-agent/__tests__/fake-room-audio.js';
import { interruptionOverrides } from '../../multi-agent/interruption-config.js';
import { installNeverSilent } from '../../multi-agent/never-silent-install.js';
import { createCallAlertSpeaker, HEARD_AFTER_MS } from '../call-alerts.js';

const TEA = 'Green tea likes cooler water, around eighty degrees, or it turns bitter.';
const SORRY = "Oh, sorry, I didn't mean to ramble on there.";
const ALERT = 'Your tea timer just went off.';
const INTERJECTION = 'Ha, you really know your tea.'; // words, not a backchannel

/** The alert's reply when its instructions are in the request, else the chat. */
class ScriptLLM extends llm.LLM {
  label(): string {
    return 'script';
  }
  chat(p: Parameters<llm.LLM['chat']>[0]): llm.LLMStream {
    const items = p.chatCtx.items.filter((i) => i.type === 'message') as llm.ChatMessage[];
    const system = items.filter((m) => m.role === 'system').map((m) => m.textContent ?? '');
    const lastUser = items.filter((m) => m.role === 'user').pop()?.textContent ?? '';
    const text = system.join('\n').includes('just went off')
      ? ALERT
      : lastUser === INTERJECTION
        ? SORRY
        : TEA;
    return new ScriptStream(this, text, {
      chatCtx: p.chatCtx,
      toolCtx: p.toolCtx,
      connOptions: { ...DEFAULT_API_CONNECT_OPTIONS, maxRetry: 0 },
    });
  }
}
class ScriptStream extends llm.LLMStream {
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
/** Polls until `ok()` or `ms` has passed. */
async function until(ok: () => boolean, ms: number): Promise<void> {
  const end = Date.now() + ms;
  // eslint-disable-next-line no-await-in-loop -- polling the live session
  while (!ok() && Date.now() < end) await sleep(50);
}

/** The parts of LiveKit's AgentActivity that its audio recognition calls. */
interface Activity {
  isInterruptionByAudioActivityEnabled: boolean;
  interruptByAudioActivity: () => void;
  onStartOfSpeech: (ev: { speechDuration: number }) => void;
  onEndOfSpeech: () => void;
  onEndOfTurn: (info: Record<string, unknown>) => Promise<boolean>;
}

const outputs: RoomLikeAudioOutput[] = [];
const sessions: voice.AgentSession[] = [];

const timer = {
  type: 'timer_complete' as const,
  userId: 'u',
  message: 'Your tea is ready!',
  priority: 'high' as const,
  context: { label: 'tea' },
};

async function call(o: { hookMs?: number; quietWaitMs?: number } = {}) {
  // The output chain of paused-lead-in.sdk.test.ts. With PLAYOUT_DRIFT_GUARD off, the answer
  // to a caller who cut a reply at launch never reports its playout here (lost-reply-drift),
  // so the session looks busy and the retry waits out QUIET_WAIT_MS.
  const env = { NEVER_SILENT: 'on', PLAYOUT_DRIFT_GUARD: 'on' };
  const session = new voice.AgentSession({
    llm: new ScriptLLM(),
    tts: new PacedTTS() as tts.TTS,
    turnHandling: { interruption: interruptionOverrides(env) },
  } as never);
  const out = new RoomLikeAudioOutput(1000); // rtc AudioSource queues 1 s
  outputs.push(out);
  sessions.push(session);
  session.output.audio = out;
  session.on(voice.AgentSessionEventTypes.Error, () => undefined);
  class SlowHook extends voice.Agent {
    async onUserTurnCompleted(): Promise<void> {
      if (o.hookMs) await sleep(o.hookMs);
    }
  }
  await session.start({ agent: new SlowHook({ instructions: 'test' }) });
  installNeverSilent(
    {
      session,
      sessionWithEvents: session as never,
      sessionEventHandlers: [],
      cleanupFunctions: [],
      sessionId: `alert-${sessions.length}`,
      userId: undefined,
    },
    env
  );
  const act = (session as unknown as { _activity: Activity })._activity;
  act.isInterruptionByAudioActivityEnabled = true;
  (session as unknown as { _aecWarmupRemaining: number })._aecWarmupRemaining = 0;
  const said: string[] = [];
  session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev) => {
    if (ev.item.type === 'message' && ev.item.role === 'assistant' && ev.item.textContent)
      said.push(ev.item.textContent);
  });
  const logs: string[] = [];
  const speak = createCallAlertSpeaker(session as never, {
    sessionId: 'alert',
    quietWaitMs: o.quietWaitMs,
    log: (msg) => logs.push(msg),
  });
  const replies: number[] = [];
  const alertReqs: number[] = [];
  const origGen = session.generateReply.bind(session);
  (session as unknown as { generateReply: unknown }).generateReply = (opts: never) => {
    replies.push(Date.now());
    if (String((opts as { instructions?: string })?.instructions ?? '').includes('just went off'))
      alertReqs.push(Date.now());
    return origGen(opts);
  };
  const states: string[] = [];
  const t0 = Date.now();
  session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) =>
    states.push(`${Date.now() - t0}:${(ev as { newState: string }).newState}`)
  );
  /** The caller makes a sound over Ferni (VAD), then stops; with words, the turn commits. */
  const callerSpeaks = async (ms: number, words?: string) => {
    act.interruptByAudioActivity();
    act.onStartOfSpeech({ speechDuration: 0 });
    await sleep(ms);
    act.onEndOfSpeech();
    if (!words) return;
    await act.onEndOfTurn({
      skipReply: false,
      newTranscript: words,
      transcriptConfidence: 1,
      transcriptionDelay: 0,
      endOfUtteranceDelay: 0,
      startedSpeakingAt: undefined,
      stoppedSpeakingAt: undefined,
    });
  };
  return { session, out, said, logs, speak, callerSpeaks, replies, alertReqs, states, act };
}

const INTERJECTION2 = 'Wait, one more thing about the tea.';

async function primed(o: { hookMs?: number } = {}) {
  const c = await call(o);
  c.session.generateReply({ userInput: 'How hot should the water be?' });
  await sleep(300 + TEA.length * 70 + 1500);
  return c;
}
/** Alert starts; once it is speaking, wait cutAt ms of playout, then the caller talks. */
async function cutAfter(cutAt: number, talkMs = 400) {
  const c = await primed();
  const alert = c.speak(timer);
  await until(() => c.session.agentState === 'speaking', 3000);
  const h0 = c.out.heardMs;
  await sleep(cutAt);
  const heardAtCut = c.out.heardMs - h0;
  await c.callerSpeaks(talkMs, INTERJECTION);
  await alert;
  await sleep(4000);
  return { c, heardAtCut };
}

describe('when a call alert counts as heard, and what its retry waits for (real AgentSession)', () => {
  beforeAll(() => initializeLogger({ pretty: false, level: 'silent' }));
  afterEach(async () => {
    outputs.splice(0).forEach((o) => o.close());
    await Promise.all(sessions.splice(0).map((s) => s.close().catch(() => undefined)));
  });

  it('cut after 700 ms of playout: heard, never repeated', async () => {
    const { c } = await cutAfter(700);
    expect(c.alertReqs.length).toBe(1);
    expect(c.logs).toEqual(['CALL_ALERT_SPOKEN']);
  }, 30_000);

  it('cut after ~460 ms of playout, the caller talking 400 ms: said again, once', async () => {
    const { c, heardAtCut } = await cutAfter(460);
    expect(heardAtCut).toBeLessThan(HEARD_AFTER_MS);
    expect(c.alertReqs.length).toBe(2);
    expect(c.logs).toEqual(['CALL_ALERT_RETRY', 'CALL_ALERT_SPOKEN']);
    expect(c.said.at(-1)).toBe(ALERT);
  }, 30_000);

  it('the caller starts 100 ms in and talks 900 ms: not counted as heard, said again', async () => {
    const { c } = await cutAfter(100, 900);
    expect(c.alertReqs.length).toBe(2);
    expect(c.logs).toEqual(['CALL_ALERT_RETRY', 'CALL_ALERT_SPOKEN']);
    expect(c.said.at(-1)).toBe(ALERT);
  }, 30_000);

  it('the same 900 ms of noise with no words: the paused alert resumes, said once', async () => {
    const c = await primed();
    const alert = c.speak(timer);
    await until(() => c.session.agentState === 'speaking', 3000);
    await sleep(100);
    await c.callerSpeaks(900);
    await alert;
    await sleep(2000);
    expect(c.alertReqs.length).toBe(1);
    expect(c.logs).toEqual(['CALL_ALERT_SPOKEN']);
  }, 30_000);

  it('the caller talks again during the retry wait: the retry waits for that turn too', async () => {
    const c = await primed({ hookMs: 1400 });
    const alert = c.speak(timer);
    await sleep(130);
    await c.callerSpeaks(400, INTERJECTION);
    await until(() => c.session.agentState === 'speaking', 6000); // the answer starts
    await sleep(300);
    await c.callerSpeaks(600, INTERJECTION2); // pauses the answer, then commits
    await alert;
    await until(() => c.said.at(-1) === ALERT, 10_000);
    expect(c.logs).toEqual(['CALL_ALERT_RETRY', 'CALL_ALERT_SPOKEN']);
    expect(c.alertReqs.length).toBe(2);
    expect(c.said.at(-1)).toBe(ALERT);
  }, 45_000);

  it('the call ends while the alert waits: dropped as call_ended, nothing asked for', async () => {
    const c = await call();
    c.session.generateReply({ userInput: 'How hot should the water be?' });
    await until(() => c.session.agentState === 'speaking', 3000);
    const alert = c.speak(timer); // Ferni is talking: it waits for quiet
    await sleep(300);
    const closedAt = Date.now();
    await c.session.close();
    const settled = await Promise.race([
      alert.then(() => 'settled'),
      sleep(5000).then(() => 'hung'),
    ]);
    expect(settled).toBe('settled');
    expect(c.logs).toEqual(['CALL_ALERT_DROPPED']);
    expect(c.alertReqs.filter((t) => t >= closedAt)).toEqual([]);
  }, 30_000);
});
