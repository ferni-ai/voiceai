/**
 * A finished timer is announced (#2507), on a real LiveKit AgentSession with
 * the prod output chain (resume buffer over a room-like sink, NEVER_SILENT=on),
 * the real fast lane (CASCADE_FAST_LANE) and the caller-turn note that Ferni's
 * llmNode adds to a reply nobody prompted (caller-turn.ts, ferni-agent.ts).
 *
 * Dev nightly sweep, 2026-10-22: the alert's own reply went to the fast lane
 * on "(They haven't said anything since your last words.)" and the fast model
 * answered that note ("Oh, sorry, I didn't mean to ramble on there"). The
 * timer was never mentioned. The caller's next turn then cut that reply.
 *
 * The models here answer the way the real ones did: the fast model answers the
 * last caller turn and ignores the instructions; the main model follows them.
 */
import { DEFAULT_API_CONNECT_OPTIONS, initializeLogger, llm, tts, voice } from '@livekit/agents';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FastLaneLLM } from '../../model-provider/fast-lane.js';
import { PacedTTS, RoomLikeAudioOutput } from '../../multi-agent/__tests__/fake-room-audio.js';
import { interruptionOverrides } from '../../multi-agent/interruption-config.js';
import { installNeverSilent } from '../../multi-agent/never-silent-install.js';
import { NO_NEW_WORDS_NOTE, withCallerTurn } from '../../personas/caller-turn.js';
import { createCallAlertSpeaker } from '../call-alerts.js';

const TEA = 'Green tea likes cooler water, around eighty degrees, or it turns bitter.';
const NOTE_REPLY = "Oh, sorry, I didn't mean to ramble on there.";
const ALERT = 'Your tea timer just went off.';
const INTERJECTION = 'Ha, you really know your tea.'; // words, not a backchannel
const ANSWER = 'Guilty, I could talk about tea all day.';

const messages = (ctx: llm.ChatContext) =>
  ctx.items.filter((i) => i.type === 'message') as llm.ChatMessage[];
const lastUser = (ctx: llm.ChatContext) =>
  messages(ctx)
    .filter((m) => m.role === 'user')
    .pop()?.textContent ?? '';

/** Follows the instructions in the system prompt; else answers the chat. */
const mainModel = (ctx: llm.ChatContext): string =>
  messages(ctx).some((m) => m.role === 'system' && (m.textContent ?? '').includes('just went off'))
    ? ALERT
    : TEA;
/** Answers the last caller turn and nothing else (dev's fast model on the note). */
const fastModel = (ctx: llm.ChatContext): string =>
  lastUser(ctx) === NO_NEW_WORDS_NOTE ? NOTE_REPLY : lastUser(ctx) === INTERJECTION ? ANSWER : TEA;

class ScriptLLM extends llm.LLM {
  constructor(
    private readonly name: string,
    private readonly answer: (ctx: llm.ChatContext) => string
  ) {
    super();
  }
  label(): string {
    return this.name;
  }
  chat(p: Parameters<llm.LLM['chat']>[0]): llm.LLMStream {
    return new ScriptStream(this, this.answer(p.chatCtx), {
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

/** Ferni's llmNode as far as this needs: the note on an unprompted reply, a slow turn hook. */
class FerniLike extends voice.Agent {
  async onUserTurnCompleted(): Promise<void> {
    await sleep(1400); // dev: the caller's answer exists ~1.4 s after the commit
  }
  async llmNode(...[ctx, ...rest]: Parameters<voice.Agent['llmNode']>) {
    return super.llmNode(withCallerTurn(ctx, { CALLER_TURN_NOTE: 'on' }), ...rest);
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

async function call() {
  // The output chain of paused-lead-in.sdk.test.ts. With PLAYOUT_DRIFT_GUARD off, the answer
  // to a caller who cut a reply at launch never reports its playout here (lost-reply-drift),
  // so the session looks busy and the retry waits out QUIET_WAIT_MS.
  const env = { NEVER_SILENT: 'on', PLAYOUT_DRIFT_GUARD: 'on' };
  const session = new voice.AgentSession({
    llm: new FastLaneLLM(new ScriptLLM('fast', fastModel), new ScriptLLM('main', mainModel)),
    tts: new PacedTTS() as tts.TTS,
    turnHandling: { interruption: interruptionOverrides(env) },
  } as never);
  const out = new RoomLikeAudioOutput(1000); // rtc AudioSource queues 1 s
  outputs.push(out);
  sessions.push(session);
  session.output.audio = out;
  session.on(voice.AgentSessionEventTypes.Error, () => undefined);
  await session.start({ agent: new FerniLike({ instructions: 'test' }) });
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
    log: (msg) => logs.push(msg),
  });
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
  /** A first turn: the caller asks, Ferni answers on the main model, the answer plays out. */
  const teaTurn = async () => {
    session.generateReply({ userInput: 'How hot should the water be?' });
    await until(() => said.includes(TEA) && session.agentState === 'listening', 10_000);
  };
  return { session, out, said, logs, speak, callerSpeaks, teaTurn };
}

describe('a call alert on a live call (real AgentSession, fast lane on)', () => {
  beforeAll(() => initializeLogger({ pretty: false, level: 'silent' }));
  afterEach(async () => {
    outputs.splice(0).forEach((o) => o.close());
    await Promise.all(sessions.splice(0).map((s) => s.close().catch(() => undefined)));
  });

  it('the chat ends on Ferni: the alert reply is about the timer, not the turn note', async () => {
    const c = await call();
    await c.teaTurn();
    await c.speak(timer);
    await until(() => c.said.length >= 2, 5000);
    expect(c.said).toEqual([TEA, ALERT]);
    expect(c.logs).toEqual(['CALL_ALERT_SPOKEN']);
  }, 30_000);

  it('cut by the caller before it is heard: said again after Ferni answers them', async () => {
    const c = await call();
    await c.teaTurn();
    const alert = c.speak(timer);
    await sleep(130);
    await c.callerSpeaks(400, INTERJECTION); // pauses the alert's reply, then cuts it
    await alert;
    await until(() => c.said.includes(ALERT), 10_000);
    expect(c.said).toEqual([TEA, ANSWER, ALERT]);
    expect(c.logs).toEqual(['CALL_ALERT_RETRY', 'CALL_ALERT_SPOKEN']);
  }, 30_000);

  it('cut just after its first audio: not counted as heard, said again', async () => {
    const c = await call();
    await c.teaTurn();
    const alert = c.speak(timer);
    await until(() => c.session.agentState === 'speaking', 3000);
    await sleep(40);
    await c.callerSpeaks(400, INTERJECTION);
    await alert;
    // The cut reply is recorded with its text, though about 40 ms of it played.
    await until(() => c.said.length >= 4, 10_000);
    expect(c.said.slice(-2)).toEqual([ANSWER, ALERT]);
    expect(c.logs).toEqual(['CALL_ALERT_RETRY', 'CALL_ALERT_SPOKEN']);
  }, 30_000);

  it('asked for while a reply is paused for noise: said, and the reply resumes whole', async () => {
    const c = await call();
    c.session.generateReply({ userInput: 'How hot should the water be?' });
    await sleep(300 + 800);
    const pausing = c.callerSpeaks(300); // noise, no words: the reply resumes ~1 s on
    const alert = c.speak(timer);
    await pausing;
    await alert;
    await until(() => c.said.includes(ALERT), 15_000);
    expect(c.said).toEqual([TEA, ALERT]);
    expect(c.out.heardMs).toBeGreaterThanOrEqual((TEA.length + ALERT.length) * 70);
    expect(c.logs).toEqual(['CALL_ALERT_SPOKEN']);
  }, 30_000);

  it('with no alert pending, a reply paused for noise still resumes whole', async () => {
    const c = await call();
    c.session.generateReply({ userInput: 'How hot should the water be?' });
    await sleep(300 + 800);
    await c.callerSpeaks(300);
    await sleep(1000 + TEA.length * 70 + 1000);
    expect(c.said).toEqual([TEA]);
    expect(c.out.heardMs).toBeGreaterThanOrEqual(TEA.length * 70);
  }, 30_000);
});
