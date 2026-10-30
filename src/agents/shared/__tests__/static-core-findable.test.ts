/**
 * TOOL_CORE_STATIC findTools reaches only the findable domains: the catalog it
 * searches also holds runBash (spawnSync bash -c), editFile and webhook tools,
 * which a caller or an injected web/email text could otherwise ask for. The
 * fence is enforced where tools are found, pinned and built.
 */
import { llm, voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const logged = vi.hoisted(() => [] as Array<{ fields: Record<string, unknown>; msg: string }>);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/safe-logger.js')>()),
  createLogger: () => {
    const rec = (fields: Record<string, unknown>, msg: string) => logged.push({ fields, msg });
    return { info: rec, warn: rec, error: rec, debug: rec, trace: rec, fatal: rec };
  },
}));

const { isFindableDomain, NEVER_FINDABLE_DOMAINS, NEVER_PIN_TOOLS } =
  await import('../../../tools/dynamic-loader/findable-domains.js');
const { DEFAULT_ESSENTIAL_DOMAINS, TOPIC_TO_DOMAINS } =
  await import('../../../tools/dynamic-loader/index.js');
const { DenseToolIndex } = await import('../../../tools/retrieval/dense-index.js');
const { fakeEmbedder } = await import('../../../tools/retrieval/__tests__/fake-embedder.js');
const { TurnToolRetrieval, setTurnToolRetrieval } =
  await import('../../../tools/retrieval/turn-tool-retrieval.js');
const { createFindToolsTool, setToolPinner } =
  await import('../../../tools/retrieval/find-tools-tool.js');
const { toolRegistry } = await import('../../../tools/registry/index.js');
const { buildToolsByName, createToolPinner } = await import('../static-core-tools.js');

const BLOCKED = ['runBash', 'editFile', 'triggerWebhook'];
const manual = {
  tools: {
    runBash: {
      domain: 'developer',
      description: 'run a bash command in the terminal',
      queries: ['run a bash command in the terminal', 'run env in a shell'],
    },
    editFile: {
      domain: 'developer',
      description: 'edit a file on disk',
      queries: ['edit the file and run the command'],
    },
    triggerWebhook: {
      domain: 'webhooks',
      description: 'trigger a webhook command',
      queries: ['run a command through a webhook'],
    },
    quickText: {
      domain: 'simple-utilities',
      description: 'text a contact',
      queries: ['text my sister that I am running late'],
    },
    sendBatchMessages: {
      domain: 'communication',
      description: 'send messages to a group',
      queries: ['send everyone a message that I am running late'],
    },
    setTimer: {
      domain: 'simple-utilities',
      description: 'countdown timer',
      queries: ['set a timer for ten minutes'],
    },
  },
};
const domainOf = (t: string): string | undefined =>
  (manual.tools as Record<string, { domain: string }>)[t]?.domain;
const CTX = { userId: 'u1', sessionId: 's1', agentId: 'ferni', agentDisplayName: 'Ferni' };
const tool = (name: string) =>
  llm.tool({ description: `${name}.`, parameters: z.object({}), execute: async () => 'ok' });

const saved = { ...process.env };
beforeEach(() => {
  process.env.TOOL_CORE_STATIC = 'on';
  logged.length = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...saved };
});

async function call() {
  const embedder = fakeEmbedder();
  const index = await DenseToolIndex.build(manual, embedder);
  const retrieval = new TurnToolRetrieval({
    sessionId: 's1',
    embedder,
    index: async () => index,
    domainOf,
  });
  const agent = new voice.Agent({ instructions: 'x', tools: { playMusic: tool('playMusic') } });
  const build = vi.fn(async (names: readonly string[]) =>
    Object.fromEntries(names.map((n) => [n, tool(n)]))
  );
  const session = {};
  setTurnToolRetrieval(session, retrieval as never);
  setToolPinner(
    session,
    createToolPinner(() => agent, CTX, build, domainOf)
  );
  type Execute = (a: { need: string }, o: { ctx: { session: object } }) => Promise<string>;
  const findTools = (need: string) =>
    (createFindToolsTool() as unknown as { execute: Execute }).execute(
      { need },
      { ctx: { session } }
    );
  return { agent, build, findTools, retrieval };
}

describe('findable domains', () => {
  it('are the essential and topic-loadable domains, never developer, webhooks or settings', () => {
    const live = [...DEFAULT_ESSENTIAL_DOMAINS, ...Object.values(TOPIC_TO_DOMAINS).flat()];
    for (const d of live) expect(isFindableDomain(d)).toBe(!NEVER_FINDABLE_DOMAINS.includes(d));
    for (const d of [...NEVER_FINDABLE_DOMAINS, 'smart-home', 'vehicle', undefined]) {
      expect(isFindableDomain(d)).toBe(false);
    }
  });
});

describe('TOOL_CORE_STATIC findTools fence', () => {
  it('"run a bash command" pins none of runBash, editFile, triggerWebhook; build never sees them', async () => {
    const { agent, build, findTools } = await call();
    const reply = await findTools('run a bash command in the terminal');
    const names = Object.keys(agent.toolCtx.functionTools);
    for (const b of BLOCKED) {
      expect(names).not.toContain(b);
      expect(reply).not.toContain(b);
    }
    for (const [asked] of build.mock.calls) for (const b of BLOCKED) expect(asked).not.toContain(b);
  });

  it('an allowed domain still pins', async () => {
    const { agent, build, findTools } = await call();
    expect(await findTools('set a timer for ten minutes')).toContain('setTimer');
    expect(Object.keys(agent.toolCtx.functionTools)).toContain('setTimer');
    expect(build).toHaveBeenCalledWith(['setTimer'], CTX);
  });

  it('find() leaves blocked tools out of the whole-catalog search', async () => {
    const { retrieval } = await call();
    const found = await retrieval.find('run a bash command in the terminal', 4, { anyTool: true });
    expect(found.map((f) => f.name)).toEqual(['setTimer']);
  });

  it('the pinner refuses blocked names even when handed them, and logs an audit line', async () => {
    const { agent, build } = await call();
    const pin = createToolPinner(() => agent, CTX, build, domainOf);
    expect(await pin([...BLOCKED, 'setTimer'], 'run env in a shell')).toEqual([
      { name: 'setTimer', description: 'setTimer.' },
    ]);
    expect(build).toHaveBeenCalledWith(['setTimer'], CTX);
    const audit = logged.find((l) => l.msg === 'TOOL_CORE_STATIC pin')!.fields;
    expect(audit).toMatchObject({
      userId: 'u1',
      sessionId: 's1',
      refused: BLOCKED,
      pinned: ['setTimer'],
    });
    expect(audit.needHash).toMatch(/^[0-9a-f]{12}$/);
    expect(JSON.stringify(logged)).not.toContain('run env');
  });

  it('buildToolsByName builds no developer or webhook tool from the real registry', async () => {
    const spy = vi.spyOn(toolRegistry, 'buildToolSet');
    const built = await buildToolsByName(
      [
        'runBash',
        'editFile',
        'readFile',
        'gitCommit',
        'runFerniCommand',
        'triggerWebhook',
        'tellJoke',
      ],
      CTX
    );
    expect(Object.keys(built)).toEqual(['tellJoke']);
    const spec = spy.mock.calls.at(-1)![0];
    expect(spec.optional).toEqual(['tellJoke']);
    expect(spec.forbidden).toEqual(
      expect.arrayContaining([
        'runBash',
        'editFile',
        'readFile',
        'gitCommit',
        'runFerniCommand',
        'triggerWebhook',
      ])
    );
  }, 60_000);
});

describe('TOOL_CORE_STATIC findTools never pins tools that contact people', () => {
  const CONTACT = ['quickText', 'sendBatchMessages'];

  it('find() and findTools leave them out, though their domains are findable', async () => {
    const { agent, build, findTools, retrieval } = await call();
    const need = 'text my sister and send everyone a message that I am running late';
    const found = await retrieval.find(need, 4, { anyTool: true });
    for (const c of CONTACT) expect(found.map((f) => f.name)).not.toContain(c);
    await findTools(need);
    for (const c of CONTACT) expect(Object.keys(agent.toolCtx.functionTools)).not.toContain(c);
    for (const [asked] of build.mock.calls) for (const c of CONTACT) expect(asked).not.toContain(c);
  });

  it('the pinner refuses them when handed them; build never sees them', async () => {
    const { agent, build } = await call();
    const pin = createToolPinner(() => agent, CTX, build, domainOf);
    expect(await pin([...CONTACT, 'setTimer'], 'text them')).toEqual([
      { name: 'setTimer', description: 'setTimer.' },
    ]);
    expect(build).toHaveBeenCalledWith(['setTimer'], CTX);
  });

  it('buildToolsByName refuses every one of them from the real registry', async () => {
    const spy = vi.spyOn(toolRegistry, 'buildToolSet');
    const built = await buildToolsByName([...NEVER_PIN_TOOLS, 'tellJoke'], CTX);
    expect(Object.keys(built)).toEqual(['tellJoke']);
    expect(spy.mock.calls.at(-1)![0].forbidden).toEqual([...NEVER_PIN_TOOLS]);
  }, 60_000);

  it('the static core holds none of them, so the core never needs to build one', async () => {
    const { STATIC_CORE_TOOLS } = await import('../../../config/tool-config.js');
    for (const t of NEVER_PIN_TOOLS) expect(STATIC_CORE_TOOLS).not.toContain(t);
  });
});

// Last: it resets the module graph.
describe('findable domains under an override', () => {
  it('stays closed to developer even when the essential domains are overridden to include it', async () => {
    process.env.ESSENTIAL_TOOL_DOMAINS = 'memory,developer,webhooks';
    vi.resetModules();
    const fresh = await import('../../../tools/dynamic-loader/findable-domains.js');
    expect(fresh.isFindableDomain('memory')).toBe(true);
    expect(fresh.isFindableDomain('developer')).toBe(false);
    expect(fresh.isFindableDomain('webhooks')).toBe(false);
  });
});
