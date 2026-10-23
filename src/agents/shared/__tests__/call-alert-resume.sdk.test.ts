/**
 * A finished timer is announced even when the caller talks or a paused reply
 * resumes around it (#2507), on a real LiveKit AgentSession with the prod
 * output chain (resume buffer over a room-like sink, NEVER_SILENT=on).
 *
 * Dev nightly sweep, 2026-10-22: CALL_ALERT_SPOKEN at 0 ms, REPLY_RESUME at
 * 132 ms, and the next TTS (789 ms) was Ferni answering the caller ("Oh,
 * sorry, I didn't mean to ramble on there"); no TTS ever carried the timer.
 * The alert's reply had been asked for at a pause; the caller then spoke, the
 * SDK paused that reply before its first audio (REPLY_RESUME paused), and
 * the committed caller turn cut it (agent_activity.js: interruptQueuedSpeeches
 * and cancelSpeechPause on a user turn). Nothing asked for it again.
 */
import { DEFAULT_API_CONNECT_OPTIONS, initializeLogger, llm, tts, voice } from '@livekit/agents';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PacedTTS, RoomLikeAudioOutput } from '../../multi-agent/__tests__/fake-room-audio.js';
import { interruptionOverrides } from '../../multi-agent/interruption-config.js';
import { installNeverSilent } from '../../multi-agent/never-silent-install.js';
import { createCallAlertSpeaker } from '../call-alerts.js';

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

async function call() {
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
  await session.start({ agent: new voice.Agent({ instructions: 'test' }) });
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
  return { session, out, said, logs, speak, callerSpeaks };
}

describe('a call alert around the caller and a resumed reply (real AgentSession)', () => {
  beforeAll(() => initializeLogger({ pretty: false, level: 'silent' }));
  afterEach(async () => {
    outputs.splice(0).forEach((o) => o.close());
    await Promise.all(sessions.splice(0).map((s) => s.close().catch(() => undefined)));
  });

  it('the dev sequence: the caller speaks just after the alert is asked for; it is still said', async () => {
    const c = await call();
    c.session.generateReply({ userInput: 'How hot should the water be?' });
    await sleep(300 + TEA.length * 70 + 1500); // the tea reply plays out
    const alert = c.speak(timer); // quiet: asked for at once
    await sleep(130);
    await c.callerSpeaks(400, INTERJECTION); // pauses the alert's reply, then cuts it
    await alert;
    await until(() => c.said.includes(ALERT), 20_000);
    expect(c.said).toContain(SORRY); // the caller is answered first
    expect(c.said).toContain(ALERT);
    expect(c.said.indexOf(ALERT)).toBeGreaterThan(c.said.indexOf(SORRY));
    expect(c.logs).toEqual(['CALL_ALERT_RETRY', 'CALL_ALERT_SPOKEN']);
  }, 30_000);

  it('an alert asked for while a reply is paused for noise is said, and the reply resumes whole', async () => {
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
