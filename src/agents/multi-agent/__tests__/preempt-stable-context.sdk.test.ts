/**
 * PREEMPT_STABLE_CONTEXT against a real LiveKit AgentSession (our patched 1.9.3).
 *
 * Prod 2026-10-15..22: 318 of 818 real preemptive replies were thrown away at the
 * commit, 205 of them because a memory recall note landed after Ink's preflight
 * started the reply (median +144 ms, on the final transcript), 10 because a
 * turn-context note was pushed in that window. Each case drives the calls
 * LiveKit's audio recognition makes (onPreemptiveGeneration, then onEndOfTurn),
 * writes the note through the production writer in between, and reads the
 * patch's own PREEMPTIVE_DECISION event.
 */
import { DEFAULT_API_CONNECT_OPTIONS, initializeLogger, llm, voice } from '@livekit/agents';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { addRecallNote, type RecallAgent } from '../recall-note.js';
import { createTurnContextPusher } from '../turn-intelligence.js';
import { PacedTTS } from './fake-room-audio.js';

const SAID = 'I went to see my sister in Tampa.';
const NOTE = 'Memory: their sister Mindy lives in Tampa.';
const sleep = (ms: number) =>
  new Promise<void>((r) => {
    setTimeout(r, ms);
  });

/** Answers "ok" after 150 ms and keeps each request's text, for what each reply saw. */
class RecordingLLM extends llm.LLM {
  requests: string[] = [];
  label(): string {
    return 'recording';
  }
  chat(p: Parameters<llm.LLM['chat']>[0]): llm.LLMStream {
    this.requests.push(
      p.chatCtx.items.map((i) => (i as { textContent?: string }).textContent ?? '').join('\n')
    );
    return new OkStream(this, {
      chatCtx: p.chatCtx,
      toolCtx: p.toolCtx,
      connOptions: { ...DEFAULT_API_CONNECT_OPTIONS, maxRetry: 0 },
    });
  }
}
class OkStream extends llm.LLMStream {
  protected async run(): Promise<void> {
    await sleep(150);
    this.queue.put({ id: 'a', delta: { role: 'assistant', content: 'ok' } });
  }
}

interface Activity {
  onPreemptiveGeneration(info: Record<string, unknown>): void;
  onEndOfTurn(info: Record<string, unknown>): Promise<boolean>;
}

const sessions: voice.AgentSession[] = [];
const saved = process.env.PREEMPT_STABLE_CONTEXT;

/** One turn: preflight starts the reply, `between` writes into the window, then the commit. */
async function turn(mode: string, between: (agent: voice.Agent) => Promise<void> | void) {
  process.env.PREEMPT_STABLE_CONTEXT = mode;
  const lm = new RecordingLLM();
  const session = new voice.AgentSession({ llm: lm, tts: new PacedTTS() } as never);
  sessions.push(session);
  session.on(voice.AgentSessionEventTypes.Error, () => undefined);
  const decisions: boolean[] = [];
  session.on(
    'ferni_preemptive_decision' as never,
    ((ev: { used: boolean }) => decisions.push(ev.used)) as never
  );
  const agent = new voice.Agent({ instructions: 'test' });
  await session.start({ agent });
  const act = (session as unknown as { _activity: Activity })._activity;
  act.onPreemptiveGeneration({
    newTranscript: SAID,
    transcriptConfidence: 1,
    startedSpeakingAt: Date.now(),
  });
  await sleep(40);
  await between(agent);
  await sleep(40);
  await act.onEndOfTurn({
    skipReply: false,
    newTranscript: SAID,
    transcriptConfidence: 1,
    transcriptionDelay: 0,
    endOfUtteranceDelay: 0,
    startedSpeakingAt: undefined,
    stoppedSpeakingAt: undefined,
  });
  await sleep(600);
  const context = agent.chatCtx.items
    .map((i) => (i as { textContent?: string }).textContent ?? '')
    .join('\n');
  return { decisions, requests: lm.requests, context };
}

const recallNote = (said: string) => (agent: voice.Agent) =>
  addRecallNote(agent as unknown as RecallAgent, NOTE, said);

describe('PREEMPT_STABLE_CONTEXT: a recall note after the preflight', () => {
  beforeAll(() => initializeLogger({ pretty: false, level: 'silent' }));
  afterEach(async () => {
    process.env.PREEMPT_STABLE_CONTEXT = saved;
    await Promise.all(sessions.splice(0).map((s) => s.close().catch(() => undefined)));
  });

  it('off (prod today): the preemptive reply is thrown away at the commit', async () => {
    const r = await turn('off', recallNote(SAID));
    expect(r.decisions).toEqual([false]);
    expect(r.requests).toHaveLength(2); // preflight, then the restart at the commit
    expect(r.requests[0]).not.toContain(NOTE);
    expect(r.requests[1]).toContain(NOTE);
  }, 10_000);

  it('on: the reply restarts at the note, the commit keeps it, and it knows the fact', async () => {
    const r = await turn('on', recallNote(SAID));
    expect(r.decisions).toEqual([true]);
    expect(r.requests).toHaveLength(2);
    expect(r.requests[1]).toContain(NOTE);
  }, 10_000);

  it('on, the note built for other words: no restart, LiveKit decides as before', async () => {
    const r = await turn('on', recallNote('and then we drove home'));
    expect(r.decisions).toEqual([false]);
  }, 10_000);

  it('defer: the first request is kept and the note waits for the next reply', async () => {
    const r = await turn('defer', recallNote(SAID));
    expect(r.decisions).toEqual([true]);
    expect(r.requests).toHaveLength(1);
    expect(r.requests[0]).not.toContain(NOTE);
    expect(r.context).toContain(NOTE); // held, never lost
  }, 10_000);
});

describe('PREEMPT_STABLE_CONTEXT: a turn-context note pushed in the window', () => {
  afterEach(async () => {
    process.env.PREEMPT_STABLE_CONTEXT = saved;
    await Promise.all(sessions.splice(0).map((s) => s.close().catch(() => undefined)));
  });

  const pushed = (text: string) => async (agent: voice.Agent) => {
    const hook = async (ctx: llm.ChatContext) => {
      ctx.addMessage({ role: 'system', content: text });
    };
    await createTurnContextPusher(hook, agent as never).onFinalTranscript(SAID);
  };

  it('off: the push lands under the preemptive reply and it is thrown away', async () => {
    const r = await turn('off', pushed('Coaching: ask how the visit went.'));
    expect(r.decisions).toEqual([false]);
  }, 10_000);

  it('on: the push waits for the decision, the reply is kept, the note still lands', async () => {
    const r = await turn('on', pushed('Coaching: ask how the visit went.'));
    expect(r.decisions).toEqual([true]);
    expect(r.requests).toHaveLength(1);
    expect(r.context).toContain('Coaching: ask how the visit went.');
  }, 10_000);

  it('on, safety guidance: pushed at once, and the reply restarts with it', async () => {
    const r = await turn('on', pushed('[CRITICAL - USER SAFETY]\nCrisis indicators detected.'));
    expect(r.decisions).toEqual([false]);
    expect(r.requests.at(-1)).toContain('[CRITICAL - USER SAFETY]');
  }, 10_000);
});
