/**
 * The latency A/B arm (LATENCY_ARM_PERCENT) and the receipt's preemptiveCause,
 * against a real LiveKit AgentSession (our patched 1.9.3).
 *
 * Each turn drives the calls LiveKit's audio recognition makes
 * (onPreemptiveGeneration, a write in the window, then onEndOfTurn) with
 * attachTurnReceipts on the session and an agent that keeps the commit as
 * FerniAgent does (noteTurnCommit). The cause is checked against the booleans
 * the patch itself logs as PREEMPTIVE_DECISION. The arm is applied through
 * applyCallerFlags, as identifyUser does at call start.
 */
import { DEFAULT_API_CONNECT_OPTIONS, initializeLogger, llm, voice } from '@livekit/agents';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { applyCallerFlags, forgetAgentValues } from '../../../services/platform/cohort-flags.js';
import { armBucket, forgetLatencyArms } from '../../../services/platform/latency-arm.js';
import { injectTurnContext } from '../../processors/turn-processor/inject-context.js';
import { noteTurnCommit } from '../../shared/preemptive-cause.js';
import type { TurnReceipt } from '../../shared/turn-receipt.js';
import { attachTurnReceipts } from '../../shared/turn-receipt-session.js';
import { createTurnContextPusher } from '../turn-intelligence.js';
import { PacedTTS } from './fake-room-audio.js';

const SAID = 'I went to see my sister in Tampa.';
const sleep = (ms: number) =>
  new Promise<void>((r) => {
    setTimeout(r, ms);
  });

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

/** Keeps the commit's context and message, as FerniAgent.onUserTurnCompleted does. */
class CommitAgent extends voice.Agent {
  async onUserTurnCompleted(ctx: llm.ChatContext, message: llm.ChatMessage): Promise<void> {
    noteTurnCommit(this, ctx, message);
  }
}

interface Activity {
  onPreemptiveGeneration(info: Record<string, unknown>): void;
  onEndOfTurn(info: Record<string, unknown>): Promise<boolean>;
  logger: { info: (...a: unknown[]) => void };
}

const sessions: voice.AgentSession[] = [];
const saved = { ...process.env };

async function turn(
  between: (agent: voice.Agent) => Promise<void> | void,
  opts: { committed?: string; sessionId?: string } = {}
) {
  const lm = new RecordingLLM();
  const session = new voice.AgentSession({ llm: lm, tts: new PacedTTS() } as never);
  sessions.push(session);
  session.on(voice.AgentSessionEventTypes.Error, () => undefined);
  const receipts: TurnReceipt[] = [];
  const detach = attachTurnReceipts(session as never, {
    sessionId: opts.sessionId ?? 'session-RM_sdk-1',
    userId: undefined,
    persona: () => 'ferni',
    emit: (r) => receipts.push(r),
  });
  const agent = new CommitAgent({ instructions: 'test' });
  await session.start({ agent });
  const act = (session as unknown as { _activity: Activity })._activity;
  // The patch's own PREEMPTIVE_DECISION booleans, to check ours against.
  const logged: Array<Record<string, unknown>> = [];
  const info = act.logger.info.bind(act.logger);
  act.logger.info = (obj: unknown, msg?: unknown) => {
    if (msg === 'PREEMPTIVE_DECISION') logged.push(obj as Record<string, unknown>);
    info(obj, msg);
  };
  act.onPreemptiveGeneration({ newTranscript: SAID, transcriptConfidence: 1 });
  await sleep(40);
  await between(agent);
  await sleep(40);
  await act.onEndOfTurn({
    skipReply: false,
    newTranscript: opts.committed ?? SAID,
    transcriptConfidence: 1,
    transcriptionDelay: 0,
    endOfUtteranceDelay: 0,
  });
  await sleep(600);
  detach();
  return { receipt: receipts.find((r) => r.preemptive !== 'none'), logged, requests: lm.requests };
}

beforeAll(() => initializeLogger({ pretty: false, level: 'silent' }));
afterEach(async () => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
  forgetAgentValues();
  forgetLatencyArms();
  await Promise.all(sessions.splice(0).map((s) => s.close().catch(() => undefined)));
});

describe('TURN_RECEIPT preemptiveCause: why LiveKit kept or dropped the reply', () => {
  const addNote = async (agent: voice.Agent) => {
    const ctx = agent.chatCtx.copy();
    ctx.addMessage({ role: 'system', content: 'Coaching: ask how the visit went.' });
    await agent.updateChatCtx(ctx);
  };
  const addTool = async (agent: voice.Agent) => {
    const extra = llm.tool({ description: 'Says hi.', execute: async () => 'hi' });
    await agent.updateTools({ sayHi: extra }); // the agent had none
  };

  it.each([
    ['nothing changed', () => undefined, undefined, [true, true, true], 'reused'],
    ['a note in the window', addNote, undefined, [true, false, true], 'dropped'],
    ['a tool added in the window (the context changes with it)', addTool, undefined, [true, false, false], 'dropped'],
    ['the caller’s words changed', () => undefined, 'and then we drove home', [false, true, true], 'dropped'],
  ] as const)('%s', async (_name, between, committed, [words, ctx, tools], want) => {
    const r = await turn(between, { committed });
    expect(r.receipt?.preemptive).toBe(want);
    expect(r.receipt?.preemptiveCause).toMatchObject({
      sameTranscript: words,
      sameChatCtx: ctx,
      sameTools: tools,
    });
    expect(r.receipt?.preemptiveCause?.leadMs).toBeGreaterThanOrEqual(70);
    // The same answers LiveKit's own checks gave (the patch's log line).
    expect(r.logged).toHaveLength(1);
    expect(r.logged[0]).toMatchObject({ sameTranscript: words, sameChatCtx: ctx, sameTools: tools });
    expect(JSON.stringify(r.receipt?.preemptiveCause)).not.toContain('Tampa'); // no words
  }, 10_000); // prettier-ignore
});

describe('LATENCY_ARM_PERCENT treatment arm on a real session', () => {
  /** A session id the hash puts in treatment (true) or control (false) at 50%. */
  const sessionIn = (treatment: boolean) => {
    for (let i = 0; ; i++) {
      const id = `session-RM_arm_${i}-1`;
      if (armBucket(id) < 50 === treatment) return id;
    }
  };
  const injected = (category: string, content: string) => async (agent: voice.Agent) => {
    const hook = async (ctx: llm.ChatContext) =>
      injectTurnContext(ctx, {
        context: { injections: [{ category, content, priority: 98 }] },
      } as never);
    await createTurnContextPusher(hook, agent as never).onFinalTranscript(SAID);
  };
  const ordinary = injected('memory', '[CRITICAL] they hate mornings');
  const crisis = '[CRISIS SUPPORT]\nValidate first: "that sounds so heavy"';

  async function armedCall(treatment: boolean) {
    delete process.env.COHORT_FLAGS;
    delete process.env.PREEMPT_STABLE_CONTEXT;
    delete process.env.AGENT_MAX_JOBS_PER_WORKER;
    process.env.LATENCY_ARM_PERCENT = '50';
    const sessionId = sessionIn(treatment);
    await applyCallerFlags('phone:+15550100', { sessionId }); // a caller who is not a member
    return sessionId;
  }

  it('treatment: an ordinary note waits, and the preemptive reply is kept', async () => {
    const sessionId = await armedCall(true);
    expect(process.env.PREEMPT_STABLE_CONTEXT).toBe('on');
    const r = await turn(ordinary, { sessionId });
    expect(r.receipt?.preemptive).toBe('reused');
    expect(r.receipt?.latencyArm).toBe('treatment');
    expect(r.receipt?.flags.PREEMPT_STABLE_CONTEXT).toBe('on');
  }, 10_000);

  it('control: the same note lands under the reply, which is thrown away as before', async () => {
    const sessionId = await armedCall(false);
    expect(process.env.PREEMPT_STABLE_CONTEXT).toBeUndefined();
    const r = await turn(ordinary, { sessionId });
    expect(r.receipt?.preemptive).toBe('dropped');
    expect(r.receipt?.latencyArm).toBe('control');
  }, 10_000);

  it('treatment: a crisis note still goes in at once, and the reply restarts with it', async () => {
    const sessionId = await armedCall(true);
    const r = await turn(injected('crisis_response', crisis), { sessionId });
    expect(r.receipt?.preemptive).toBe('dropped');
    expect(r.receipt?.preemptiveCause?.sameChatCtx).toBe(false);
    expect(r.requests.at(-1)).toContain('[CRISIS SUPPORT]');
  }, 10_000);
});
