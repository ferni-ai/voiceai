/**
 * TOOL_RESULT_ERRORS (#4236): a registered tool's `{ success: false }` result reaches the model as
 * an error result with the same text, and the crisis lane's tools pass through unchanged
 * (result-errors.ts). The session rows run a tool built by the real ToolRegistry.register() on a
 * real SDK AgentSession, so they read what the model is sent. Every name and line here is made up.
 */
import { initializeLogger, llm, voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ToolContext, ToolDefinition, ToolDomain } from '../types.js';

vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

const { ToolRegistry } = await import('../index.js');
const { setToolErrorPort, withToolResultErrors } = await import('../result-errors.js');
const { installToolErrorPort } = await import('../../../agents/multi-agent/tool-error-adapter.js');
const { installLiveCallBehaviors } =
  await import('../../../agents/multi-agent/live-call-behaviors.js');
const { SAFETY_TOOLS } = await import('../../../agents/personas/unverified-turn-tools.js');
const safetyDomains = await Promise.all([
  import('../../domains/crisis/index.js'),
  import('../../domains/human-transfer/index.js'),
  import('../../domains/presence/index.js'),
  import('../../domains/trauma-support/index.js'),
]);
const referral = await import('../../domains/referral/index.js');

initializeLogger({ pretty: false, level: 'warn' });

const saved = { ...process.env };
beforeEach(() => installToolErrorPort()); // as every live call does (live-call-behaviors.ts)
afterEach(() => {
  process.env = { ...saved };
  setToolErrorPort(undefined);
});

const ON = { TOOL_RESULT_ERRORS: 'on' };
const ctx: ToolContext = { userId: 'riley-test', agentId: 'ferni', agentDisplayName: 'Ferni' };
const FAILED = { success: false, error: 'no booking found for that day' };
/** The options the SDK passes a tool it runs: its voice RunContext. */
const sdkRun = { ctx: Object.create(voice.RunContext.prototype) as unknown, toolCallId: 'c1' };

/** A made-up tool that returns `result`, in `domain`. */
function defWith(result: unknown, domain: ToolDomain = 'calendar', id = 'lookupBooking') {
  const tool = llm.tool({
    description: 'Look up a booking.',
    parameters: z.object({ day: z.string() }),
    execute: async () => result,
  });
  const def: ToolDefinition = {
    id,
    name: id,
    description: 'Look up a booking.',
    domain,
    create: (_ctx: ToolContext) => tool,
  };
  return def;
}

/** The stored definition, or a failure naming the missing id. */
function stored(registry: InstanceType<typeof ToolRegistry>, id: string): ToolDefinition {
  const def = registry.get(id);
  if (!def) throw new Error(`${id} was not registered`);
  return def;
}

/** FakeLLM keyed on a fragment of the request's last item. */
class ScriptLLM extends voice.testing.FakeLLM {
  constructor(private readonly script: voice.testing.FakeLLMResponse[]) {
    super(script);
  }
  lookup(input: string) {
    const hit = this.script.find((r) => input.includes(r.input));
    return hit ? super.lookup(hit.input) : undefined;
  }
}

/** One caller turn on a real AgentSession; the tool comes from a real registry register(). */
async function run(env: Record<string, string>, def = defWith(FAILED)) {
  Object.assign(process.env, env);
  const registry = new ToolRegistry();
  registry.register(def);
  const tool: unknown = stored(registry, def.id).create(ctx);
  const model = new ScriptLLM([
    { input: 'Is my booking on Friday', toolCalls: [{ name: def.id, args: { day: 'friday' } }] },
    { input: 'no booking found', content: "I couldn't find that one." },
  ]);
  const agent = new voice.Agent({
    instructions: 'You are Ferni.',
    tools: { [def.id]: tool } as unknown as llm.ToolContext,
  });
  const session = new voice.AgentSession({ llm: model });
  await session.start({ agent });
  const result = session.run({ userInput: 'Is my booking on Friday?' });
  await result.wait();
  await session.close();
  const out = result.events.find((e) => e.type === 'function_call_output') as
    { item: llm.FunctionCallOutput } | undefined;
  return out?.item;
}

describe('a { success: false } result on a real agent session', () => {
  it('on: the model reads the same text, marked as an error', async () => {
    const out = await run(ON);
    expect(out?.isError).toBe(true);
    expect(out?.output).toBe(JSON.stringify(FAILED));
  });

  it('off: the model reads it as a success, as on main', async () => {
    const out = await run({});
    expect(out?.isError).toBe(false);
    expect(out?.output).toBe(JSON.stringify(FAILED));
  });

  it('on: a crisis-domain tool returning { success: false } still reads as a success', async () => {
    const out = await run(ON, defWith(FAILED, 'crisis', 'quickCrisisResources'));
    expect(out?.isError).toBe(false);
    expect(out?.output).toBe(JSON.stringify(FAILED));
  });
});

describe('withToolResultErrors', () => {
  it('off: create() returns the very tool it built before', () => {
    const def = defWith(FAILED);
    expect(withToolResultErrors(def, {}).create(ctx)).toBe(def.create(ctx));
    expect(withToolResultErrors(def, ON).create(ctx)).not.toBe(def.create(ctx));
  });

  it('on: any other result comes back as the same value', async () => {
    const values = [{ success: true, id: 'b1' }, { found: 0 }, 'saved', ['a'], null, 0];
    const outs = await Promise.all(
      values.map((v) => withToolResultErrors(defWith(v), ON).create(ctx).execute({}, sdkRun))
    );
    outs.forEach((out, i) => expect(out).toBe(values[i]));
  });

  it('on: the SDK call gets a returned ToolError carrying the JSON text, never a throw', async () => {
    const tool = withToolResultErrors(defWith(FAILED), ON).create(ctx);
    const out = await tool.execute({ day: 'friday' }, sdkRun);
    expect(out).toBeInstanceOf(llm.ToolError);
    expect((out as Error).message).toBe(JSON.stringify(FAILED));
  });

  it('on, with no live call (the SDK port not installed): the result is unchanged', async () => {
    setToolErrorPort(undefined);
    const tool = withToolResultErrors(defWith(FAILED), ON).create(ctx);
    await expect(tool.execute({ day: 'friday' }, sdkRun)).resolves.toBe(FAILED);
  });

  it('every live call installs the SDK port (live-call-behaviors.ts)', async () => {
    setToolErrorPort(undefined);
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
    const tool = withToolResultErrors(defWith(FAILED), ON).create(ctx);
    await expect(tool.execute({ day: 'friday' }, sdkRun)).resolves.toBeInstanceOf(llm.ToolError);
  });

  it('on: code that runs the tool itself (no RunContext) gets the result as before', async () => {
    const tool = withToolResultErrors(defWith(FAILED), ON).create(ctx);
    const runs = [undefined, {}, { ctx: {} }, { toolCallId: 'x-handoff', ctx: {} }];
    const outs = await Promise.all(runs.map((opts) => tool.execute({ day: 'friday' }, opts)));
    outs.forEach((out) => expect(out).toBe(FAILED));
  });

  it('on: every crisis, human-transfer, presence and trauma-support tool is returned unchanged', () => {
    const defs = safetyDomains.flatMap((m) => m.definitions);
    expect(defs.length).toBeGreaterThanOrEqual(20);
    for (const def of defs) expect(withToolResultErrors(def, ON)).toBe(def);
    // The unverified turn's safety tools are all among them.
    const ids = new Set(defs.map((d) => d.id));
    expect([...SAFETY_TOOLS].filter((name) => !ids.has(name))).toEqual([]);
  });

  it('on: sendSupportCall, and a tool with a safety additional domain, are unchanged', () => {
    const support = referral.definitions.find((d) => d.id === 'sendSupportCall');
    if (!support) throw new Error('sendSupportCall is not in the referral domain');
    expect(withToolResultErrors(support, ON)).toBe(support);
    const shared: ToolDefinition = { ...defWith(FAILED), additionalDomains: ['crisis'] };
    expect(withToolResultErrors(shared, ON)).toBe(shared);
  });

  it('on: re-registering the stored definition adds no layer and still sends one ToolError', async () => {
    const registry = new ToolRegistry();
    registry.register(defWith(FAILED));
    const once = stored(registry, 'lookupBooking').create;
    registry.register(stored(registry, 'lookupBooking'));
    expect(stored(registry, 'lookupBooking').create).toBe(once); // no second layer
    Object.assign(process.env, ON);
    const out: unknown = await stored(registry, 'lookupBooking')
      .create(ctx)
      .execute({ day: 'friday' }, sdkRun);
    expect(out).toBeInstanceOf(llm.ToolError);
    expect((out as Error).message).toBe(JSON.stringify(FAILED));
  });
});
