/**
 * LATE_WRITE_RESULT_KEPT (#4253): a write tool that finishes after the caller's barge-in
 * aborted its reply still gets its result into the model's context (tools/registry/
 * write-results.ts, late-write-result.ts). The session rows run a tool built by the real
 * ToolRegistry.register() on a real SDK AgentSession, interrupt it mid-tool, and read the
 * context the model is sent on the next turn. Every name and line here is made up.
 */
import { initializeLogger, llm, voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ToolContext, ToolDefinition } from '../../../tools/registry/types.js';

vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

const { ToolRegistry, setLateWriteResultPort } = await import('../../../tools/registry/index.js');
const { keepLateWriteResults } = await import('../../../tools/registry/write-results.js');
const { installLateWriteResultPort } = await import('../late-write-result.js');
const { withPairedToolCalls } = await import('../../model-provider/cache-warm.js');
const { installLiveCallBehaviors } = await import('../live-call-behaviors.js');
const { SAFETY_TOOLS } = await import('../../personas/unverified-turn-tools.js');

initializeLogger({ pretty: false, level: 'warn' });

const saved = { ...process.env };
beforeEach(() => installLateWriteResultPort()); // as every live call does (live-call-behaviors.ts)
afterEach(() => {
  process.env = { ...saved };
  setLateWriteResultPort(undefined);
});

const ON = { LATE_WRITE_RESULT_KEPT: 'on' };
const ctx: ToolContext = { userId: 'riley-test', agentId: 'ferni', agentDisplayName: 'Ferni' };
const SAVED = 'Added to your calendar: pottery class, Thursday at 6 pm.';
const ASK = 'Put pottery class on Thursday at six';

/**
 * A write tool that saves once `release` is called or its run is aborted (a write still in
 * flight when the caller cut in), counting its runs.
 */
function slowWrite(id = 'createCalendarEvent') {
  let release!: () => void;
  const released = new Promise<void>((r) => {
    release = r;
  });
  let started!: () => void;
  const running = new Promise<void>((r) => {
    started = r;
  });
  let saved!: () => void;
  const landed = new Promise<void>((r) => {
    saved = r;
  });
  const state = { runs: 0, release, running, landed };
  const def: ToolDefinition = {
    id,
    name: id,
    description: 'Add an event to the calendar.',
    domain: 'calendar',
    create: () =>
      llm.tool({
        description: 'Add an event to the calendar.',
        parameters: z.object({ title: z.string() }),
        execute: async (_args, opts) => {
          started();
          const abort = opts?.abortSignal;
          await Promise.race([
            released,
            new Promise((r) => {
              abort?.addEventListener('abort', r);
            }),
          ]);
          await new Promise((r) => {
            setTimeout(r, 10);
          }); // the write lands after the abort
          state.runs += 1;
          saved();
          return SAVED;
        },
      }),
  };
  return { def, state };
}

/** The stored definition, or a failure naming the missing id. */
function stored(registry: InstanceType<typeof ToolRegistry>, id: string): ToolDefinition {
  const def = registry.get(id);
  if (!def) throw new Error(`${id} was not registered`);
  return def;
}

/** FakeLLM that keeps a copy of every context it is sent. */
class RecordingLLM extends voice.testing.FakeLLM {
  readonly sent: llm.ChatContext[] = [];
  chat(opts: Parameters<voice.testing.FakeLLM['chat']>[0]) {
    this.sent.push(opts.chatCtx.copy());
    return super.chat(opts);
  }
}

/** The output paired with each call in `chat`, after the provider's unpaired-call drop. */
function pairedOutputs(chat: llm.ChatContext): string[] {
  return withPairedToolCalls(chat)
    .items.filter((i) => i.type === 'function_call_output')
    .map((i) => (i as llm.FunctionCallOutput).output);
}

/** One caller turn whose write is talked over mid-tool, then the next turn. */
async function bargeInDuringWrite(env: Record<string, string>) {
  Object.assign(process.env, env);
  const { def, state } = slowWrite();
  const registry = new ToolRegistry();
  registry.register(def);
  const tool: unknown = stored(registry, def.id).create(ctx);
  const model = new RecordingLLM([
    // The stream stays open after the call, as while Ferni still speaks the lead-in
    {
      input: ASK,
      content: 'Sure, adding it.',
      toolCalls: [{ name: def.id, args: { title: 'pottery class' } }],
      duration: 400,
    },
    { input: 'Wait, is it in?', content: 'One sec.' },
  ]);
  const agent = new voice.Agent({
    instructions: 'You are Ferni.',
    tools: { [def.id]: tool } as unknown as llm.ToolContext,
  });
  const session = new voice.AgentSession({ llm: model });
  await session.start({ agent });
  const first = session.run({ userInput: ASK });
  await state.running;
  await session.interrupt(); // the caller talks over the lead-in while the write runs
  await first.wait().catch(() => undefined);
  await state.landed; // the write has landed, after the abort
  await new Promise((r) => {
    setTimeout(r, 0); // and its result has passed the registry's wrapper
  });
  await session.run({ userInput: 'Wait, is it in?' }).wait();
  await session.close();
  const next = model.sent.at(-1);
  if (!next) throw new Error('the model was never called');
  return { runs: state.runs, next };
}

describe('a write that finishes after a barge-in, on a real agent session', () => {
  it('off: the write ran, and the next turn sees no result for it (as on main)', async () => {
    const { runs, next } = await bargeInDuringWrite({});
    expect(runs).toBe(1);
    expect(next.items.some((i) => i.type === 'function_call')).toBe(true);
    expect(pairedOutputs(next)).toEqual([]);
  });

  it('on: the next turn sees the result, right after its call', async () => {
    const { runs, next } = await bargeInDuringWrite(ON);
    expect(runs).toBe(1);
    expect(pairedOutputs(next)).toEqual([JSON.stringify(SAVED)]);
    const at = next.items.findIndex((i) => i.type === 'function_call');
    expect(next.items[at + 1]).toMatchObject({ type: 'function_call_output', isError: false });
  });
});

describe('keepLateWriteResults', () => {
  const run = (aborted: boolean) => ({
    ctx: {},
    toolCallId: 'c1',
    abortSignal: { aborted },
  });

  it('on: a result that lands after the abort goes to the port once, and is returned', async () => {
    Object.assign(process.env, ON);
    const port = vi.fn();
    setLateWriteResultPort(port);
    const { def, state } = slowWrite();
    state.release();
    const opts = run(true);
    await expect(keepLateWriteResults(def).create(ctx).execute({}, opts)).resolves.toBe(SAVED);
    expect(port).toHaveBeenCalledTimes(1);
    expect(port).toHaveBeenCalledWith(opts, SAVED);
  });

  it('a result before any abort, or the flag off, never reaches the port', async () => {
    const port = vi.fn();
    setLateWriteResultPort(port);
    const { def, state } = slowWrite();
    state.release();
    await keepLateWriteResults(def).create(ctx).execute({}, run(true)); // off
    Object.assign(process.env, ON);
    await keepLateWriteResults(def).create(ctx).execute({}, run(false)); // the SDK records it
    expect(port).not.toHaveBeenCalled();
  });

  it('a tool off the list, or any crisis, support or human-transfer tool, is returned as is', () => {
    for (const id of ['getCalendarToday', ...SAFETY_TOOLS, 'sendSupportCall']) {
      const def = slowWrite(id).def;
      expect(keepLateWriteResults(def)).toBe(def);
    }
  });

  it('re-registering the stored definition adds no second layer', async () => {
    Object.assign(process.env, ON);
    const port = vi.fn();
    setLateWriteResultPort(port);
    const { def, state } = slowWrite();
    state.release();
    const registry = new ToolRegistry();
    registry.register(def);
    registry.register(stored(registry, def.id));
    await stored(registry, def.id).create(ctx).execute({}, run(true));
    expect(port).toHaveBeenCalledTimes(1);
  });
});

/** A listed write returning `result` after its run was aborted, through the installed port. */
async function lateWrite(opts: object, result: unknown = 'Alarm set.') {
  Object.assign(process.env, ON);
  const def: ToolDefinition = {
    id: 'setAlarm',
    name: 'setAlarm',
    description: 'Set an alarm.',
    domain: 'calendar',
    create: () =>
      llm.tool({
        description: 'Set an alarm.',
        parameters: z.object({}),
        execute: async () => result,
      }),
  };
  const aborted = { ...opts, abortSignal: { aborted: true } };
  return keepLateWriteResults(def).create(ctx).execute({}, aborted);
}

describe('the live call port (late-write-result.ts)', () => {
  /** A real RunContext on a fake session whose agent holds `items`. */
  function liveRun(items: llm.ChatItem[]) {
    let chat = new llm.ChatContext(items);
    const agent = {
      get chatCtx() {
        return chat;
      },
      updateChatCtx: async (next: llm.ChatContext) => void (chat = next),
    };
    const call = items.find((i) => i.type === 'function_call') as llm.FunctionCall | undefined;
    const fc = call ?? llm.FunctionCall.create({ callId: 'gone', name: 'setAlarm', args: '{}' });
    const session = { currentAgent: agent } as unknown as voice.AgentSession;
    const handle = { numSteps: 1 } as unknown as voice.SpeechHandle;
    const opts = { ctx: new voice.RunContext(session, handle, fc) };
    return { opts, chat: () => chat };
  }
  const call = () =>
    llm.FunctionCall.create({ callId: 'c9', name: 'setAlarm', args: '{}', createdAt: 1000 });
  const later = () =>
    llm.ChatMessage.create({ role: 'user', content: ['Never mind'], createdAt: 2000 });

  it('an answered call, a call that is gone, or nothing to record adds nothing', async () => {
    const done = llm.FunctionCallOutput.create({ callId: 'c9', output: '"set"', isError: false });
    const answered = liveRun([call(), done]);
    await lateWrite(answered.opts);
    const gone = liveRun([later()]);
    await lateWrite(gone.opts);
    const open = liveRun([call(), later()]);
    await lateWrite(open.opts, new Error('x'));
    await lateWrite(open.opts, null);
    await expect(lateWrite({ ctx: {} })).resolves.toBe('Alarm set.'); // not a live run
    expect(answered.chat().items).toHaveLength(2);
    expect(gone.chat().items).toHaveLength(1);
    expect(open.chat().items).toHaveLength(2);
  });

  it('every live call installs the port (live-call-behaviors.ts)', async () => {
    setLateWriteResultPort(undefined);
    for (const flag of ['INTERRUPT_TRACE', 'BARGE_IN_FASTPATH', 'TURN_KEEPER'])
      process.env[flag] = 'off';
    const session = { on: () => undefined, interrupt: () => undefined };
    installLiveCallBehaviors({
      session: session as never,
      sessionWithEvents: session,
      sessionEventHandlers: [],
      cleanupFunctions: [],
      sessionId: 's1',
      userId: 'riley-test',
    });
    Object.assign(process.env, ON);
    const open = liveRun([call(), later()]);
    const { def, state } = slowWrite('setAlarm');
    state.release();
    const opts = { ...open.opts, abortSignal: { aborted: true } };
    await keepLateWriteResults(def).create(ctx).execute({}, opts);
    expect(open.chat().items.map((i) => i.type)).toContain('function_call_output');
  });

  it("goes in right after its call, even ahead of a reply from the call's millisecond", async () => {
    const reply = llm.ChatMessage.create({
      role: 'assistant',
      content: ['Sure, setting'],
      interrupted: true,
      createdAt: 1000, // the same millisecond as the call
    });
    const open = liveRun([call(), reply, later()]);
    await lateWrite(open.opts, 'Alarm set for 7.');
    expect(open.chat().items.map((i) => i.type)).toEqual([
      'function_call',
      'function_call_output',
      'message',
      'message',
    ]);
  });
});
