/**
 * PERSONA_TOOL_POLICY mid-call: no tool-adding path gives a persona back a
 * tool its manifest forbids, and no policy ever removes a protected tool.
 *
 * Before: the policy applied to the call's first tool set only. A topic loaded
 * mid-call (the deferred update, a handoff's loaded domains, the post-greeting
 * expansion, all through updateAgentTools), a same-turn topic, or the static
 * core put the forbidden tools straight back.
 *
 * The call is built as agent setup builds it (first-agent-call.ts), with the
 * policy applied before the cap. A fixture persona (written under a temp
 * PERSONA_PATHS) forbids tools no real manifest does, including every
 * protected domain's tools.
 */
import { llm } from '@livekit/agents';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const policyLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...actual,
    createLogger: (bindings: Record<string, unknown>) =>
      bindings.module === 'PersonaToolPolicy' ? policyLog : actual.createLogger(bindings),
  };
});
const bundleReads = vi.hoisted(() => ({
  ids: [] as string[],
  failNext: new Set<string>(),
  hangNext: new Set<string>(),
}));
vi.mock('../../../personas/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../personas/index.js')>();
  return {
    ...actual,
    loadBundleById: (id: string, ...rest: unknown[]) => {
      bundleReads.ids.push(id);
      if (bundleReads.failNext.delete(id)) throw new Error('disk hiccup');
      if (bundleReads.hangNext.delete(id))
        return new Promise<never>(() => {
          /* never settles: a hung read */
        });
      return (actual.loadBundleById as (...a: unknown[]) => unknown)(id, ...rest);
    },
  };
});

const PROTECTED_DOMAINS = ['crisis', 'trauma-support', 'human-transfer', 'presence', 'sobriety'];
let personaPaths = '';

/** A persona bundle `id` that forbids `forbidden` (Joel's manifest, renamed). */
function writeFixture(id: string, forbidden: string[]): string {
  const src = join(process.cwd(), 'src/personas/bundles/joel-dickson/persona.manifest.json');
  const manifest = JSON.parse(readFileSync(src, 'utf-8')) as {
    identity: { id: string };
    tools: { forbidden: string[] };
  };
  manifest.identity.id = id;
  manifest.tools.forbidden = forbidden;
  mkdirSync(join(personaPaths, id), { recursive: true });
  writeFileSync(join(personaPaths, id, 'persona.manifest.json'), JSON.stringify(manifest));
  return id;
}

beforeAll(() => {
  personaPaths = mkdtempSync(join(tmpdir(), 'persona-policy-'));
});

afterEach(() => {
  vi.unstubAllEnvs();
  bundleReads.ids = [];
});

async function setFlags(flags: Record<string, string>) {
  vi.resetModules();
  vi.stubEnv('PERSONA_PATHS', personaPaths);
  for (const [name, value] of Object.entries(flags)) vi.stubEnv(name, value);
}

/** A call's first agent for `personaId`, built as agent-setup.ts builds it. */
async function startCall(personaId: string, userId: string) {
  const { capToolsToLimit } = await import('../../../config/tool-config.js');
  const { createSessionToolLoader } = await import('../../dynamic-loader/index.js');
  const { buildEssentialToolSet } =
    await import('../../../agents/multi-agent/essential-tool-set.js');
  const { withAlwaysOnTools } = await import('../../../agents/multi-agent/everyday-basics.js');
  const { DEFAULT_INITIAL_TOOL_LIMIT } =
    await import('../../../agents/multi-agent/initial-tools.js');
  const { applyPersonaToolPolicy } = await import('../persona-tool-policy.js');
  const ctx = { userId, sessionId: `s-${userId}`, agentId: personaId, agentDisplayName: personaId };
  const { tools } = await buildEssentialToolSet({ personaId, userId, services: {} });
  const withPolicy = await applyPersonaToolPolicy(
    await withAlwaysOnTools(tools, ctx, false),
    personaId
  );
  const initial = capToolsToLimit(withPolicy, DEFAULT_INITIAL_TOOL_LIMIT);
  const session = { userData: { userId, personaId, services: { sessionId: ctx.sessionId } } };
  const agent = {
    session,
    toolCtx: new llm.ToolContext(initial as never),
    async updateTools(next: Record<string, unknown>) {
      this.toolCtx = new llm.ToolContext(next as never);
    },
  };
  const loader = createSessionToolLoader({ enableAutoUnload: false });
  await loader.initialize({ ...ctx, services: undefined } as never);
  return { agent, session, loader, names: () => Object.keys(agent.toolCtx.functionTools) };
}

/** An SDK-like agent with no tools yet; `session` absent means not attached (the SDK throws). */
function bareAgent(session?: object) {
  const agent = {
    toolCtx: new llm.ToolContext({} as never),
    async updateTools(next: Record<string, unknown>) {
      this.toolCtx = new llm.ToolContext(next as never);
    },
  };
  Object.defineProperty(agent, 'session', {
    configurable: true,
    get: () => {
      if (!session) throw new Error('Agent activity not found');
      return session;
    },
  });
  return agent;
}
const namesOf = (agent: { toolCtx: llm.ToolContext }) => Object.keys(agent.toolCtx.functionTools);

/** A topic loaded mid-call reaching the agent, as the deferred update applies it. */
async function topicMidCall(call: Awaited<ReturnType<typeof startCall>>, said: string) {
  const { updateAgentTools } = await import('../../../agents/shared/tool-updater.js');
  const loaded = await call.loader.processMessage(said);
  const offered = call.loader.getToolsForDomains(loaded);
  await updateAgentTools(call.agent as never, offered, { domains: loaded });
  return Object.keys(offered);
}

describe('a habit topic mid-call does not bring createHabit back to Ferni', () => {
  it('flag on: Ferni starts without the habit tools and the habit topic keeps it so', async () => {
    await setFlags({ PERSONA_TOOL_POLICY: 'on' });
    const call = await startCall('ferni', 'habit-on');
    expect(call.names()).not.toContain('createHabit');

    const offered = await topicMidCall(call, 'Help me build a habit of reading every night.');

    expect(offered).toContain('createHabit'); // the topic did offer it
    expect(call.names()).not.toContain('createHabit');
    expect(call.names()).not.toContain('logHabitCompletion');
    call.loader.shutdown();
  }, 120_000);

  it('flag off: the same topic gives Ferni createHabit, as before', async () => {
    await setFlags({ PERSONA_TOOL_POLICY: 'off' });
    const call = await startCall('ferni', 'habit-off');
    await topicMidCall(call, 'Help me build a habit of reading every night.');
    expect(call.names()).toContain('createHabit');
    call.loader.shutdown();
  }, 120_000);

  it('a tool already on the agent that the persona forbids goes on the next update', async () => {
    await setFlags({ PERSONA_TOOL_POLICY: 'on' });
    const { updateAgentTools } = await import('../../../agents/shared/tool-updater.js');
    const call = await startCall('ferni', 'habit-stale');
    const stale = call.loader.getToolsForDomains(['habits']);
    // An agent built before the policy read (or swapped in) still holds createHabit
    const current = Object.fromEntries(
      Object.entries(call.agent.toolCtx.functionTools).map(([n, t]) => {
        const { id: _id, name: _name, ...anonymous } = t as unknown as Record<string, unknown>;
        return [n, anonymous];
      })
    );
    await call.agent.updateTools({ ...current, createHabit: stale.createHabit });
    expect(call.names()).toContain('createHabit');

    // An update that offers nothing new still runs, because the agent holds a forbidden tool
    const [held] = Object.keys(current);
    await updateAgentTools(call.agent as never, { [held!]: current[held!] }, {});
    expect(call.names()).toContain(held);
    expect(call.names()).not.toContain('createHabit');
    call.loader.shutdown();
  }, 120_000);
});

describe("each agent gets its own persona's policy", () => {
  it('Ferni to Maya: the handed-to agent keeps her habit tools while userData still names Ferni', async () => {
    await setFlags({ PERSONA_TOOL_POLICY: 'on' });
    const { rememberAgentPersona } = await import('../persona-tool-policy.js');
    const { updateAgentTools } = await import('../../../agents/shared/tool-updater.js');
    const ferni = await startCall('ferni', 'handoff-habits');
    rememberAgentPersona(ferni.agent, 'ferni');
    const habits = ferni.loader.getToolsForDomains(['habits']);
    expect(Object.keys(habits)).toEqual(
      expect.arrayContaining(['createHabit', 'logHabitCompletion'])
    );
    // The SDK points the session at Maya now; persona-swap sets userData.personaId later
    expect(ferni.session.userData.personaId).toBe('ferni');
    const maya = bareAgent(ferni.session);
    rememberAgentPersona(maya, 'maya-santos');

    await updateAgentTools(maya as never, habits, { domains: ['habits'] });
    await updateAgentTools(ferni.agent as never, habits, { domains: ['habits'] });

    expect(namesOf(maya)).toEqual(expect.arrayContaining(['createHabit', 'logHabitCompletion']));
    expect(ferni.names()).not.toContain('createHabit');
    expect(ferni.names()).not.toContain('logHabitCompletion');
    ferni.loader.shutdown();
  }, 120_000);

  it('an agent not attached to its session yet still gets its own policy', async () => {
    await setFlags({ PERSONA_TOOL_POLICY: 'on' });
    const { rememberAgentPersona } = await import('../persona-tool-policy.js');
    const { updateAgentTools } = await import('../../../agents/shared/tool-updater.js');
    const call = await startCall('ferni', 'unattached');
    const agent = bareAgent();
    rememberAgentPersona(agent, 'ferni');

    await updateAgentTools(agent as never, call.loader.getToolsForDomains(['habits']), {});

    expect(namesOf(agent).length).toBeGreaterThan(0);
    expect(namesOf(agent)).not.toContain('createHabit');
    call.loader.shutdown();
  }, 120_000);

  it('the first update for a persona whose policy was never read still applies it', async () => {
    await setFlags({ PERSONA_TOOL_POLICY: 'on' });
    const { autoRegisterAllDomains, loadToolDomainsLazy } =
      await import('../../registry/loader.js');
    const { createSessionToolLoader } = await import('../../dynamic-loader/index.js');
    const { updateAgentTools } = await import('../../../agents/shared/tool-updater.js');
    await autoRegisterAllDomains();
    await loadToolDomainsLazy(['habits'] as never);
    const loader = createSessionToolLoader({ enableAutoUnload: false });
    const ctx = {
      userId: 'cold',
      sessionId: 's-cold',
      agentId: 'ferni',
      agentDisplayName: 'Ferni',
    };
    await loader.initialize({ ...ctx, services: undefined } as never);
    const all = loader.getToolsForDomains(['habits']);
    const habits = { createHabit: all.createHabit, getHabits: all.getHabits };
    loader.shutdown();
    expect(habits.createHabit).toBeDefined();
    const agent = bareAgent({ userData: { personaId: 'ferni' } }); // fallback: userData

    await updateAgentTools(agent as never, habits, {});

    expect(namesOf(agent)).toEqual(['getHabits']);
  }, 120_000);

  it('flag off: no persona lookup at all (the agent session is never read)', async () => {
    await setFlags({ PERSONA_TOOL_POLICY: 'off' });
    const { updateAgentTools } = await import('../../../agents/shared/tool-updater.js');
    let reads = 0;
    const agent = bareAgent({ userData: { personaId: 'ferni' } });
    const inner = Object.getOwnPropertyDescriptor(agent, 'session')!.get!;
    Object.defineProperty(agent, 'session', {
      get: () => {
        reads++;
        return inner();
      },
    });
    const tool = llm.tool({ description: 'x', execute: async () => 'ok' });
    await updateAgentTools(agent as never, { createHabit: tool }, {});
    expect(namesOf(agent)).toContain('createHabit');
    expect(reads).toBe(0);
  });

  it('flag off: the update reaches the agent before its first await, as on main', async () => {
    await setFlags({ PERSONA_TOOL_POLICY: 'off' });
    const { updateAgentTools } = await import('../../../agents/shared/tool-updater.js');
    const agent = bareAgent({ userData: { personaId: 'ferni' } });
    const tool = llm.tool({ description: 'x', execute: async () => 'ok' });
    const pending = updateAgentTools(agent as never, { createHabit: tool }, {});
    expect(namesOf(agent)).toContain('createHabit'); // read synchronously, not awaited
    await pending;
  });
});

describe('same-turn topic tools and the static core follow the policy', () => {
  it('TOOLS_SAME_TURN: a forbidden topic tool is not added to the turn', async () => {
    const FIXTURE = writeFixture('fixture-same-turn', ['searchLocalBusinesses', 'dayTrade']);
    await setFlags({ PERSONA_TOOL_POLICY: 'on', TOOLS_SAME_TURN: 'on' });
    const { wireCallToolLoader } =
      await import('../../../agents/voice-agent/deferred-tool-update.js');
    const { preloadTopicDomains, withSameTurnTools } =
      await import('../../../agents/personas/same-turn-tools.js');
    const call = await startCall(FIXTURE, 'same-turn-policy');
    const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
    const session = { ...call.session, on: vi.fn(), off: vi.fn() };
    wireCallToolLoader(session as never, call.agent as never, call.loader, log as never);
    await preloadTopicDomains();

    const chatCtx = llm.ChatContext.empty();
    chatCtx.addMessage({ role: 'user', content: 'Find me a coffee shop nearby.' });
    const replyTools = new llm.ToolContext(call.agent.toolCtx.tools as never);
    const added = withSameTurnTools(session, chatCtx, replyTools);

    expect(added).toContain('findRestaurants'); // the topic was picked
    expect(added).not.toContain('searchLocalBusinesses');
    expect(Object.keys(replyTools.functionTools)).not.toContain('searchLocalBusinesses');
    call.loader.shutdown();
  }, 120_000);

  it.each([
    ['the agent forbids it, userData names Ferni', 'agent', false],
    ['userData names the persona that forbids it, the agent is Ferni', 'userData', true],
  ])(
    'TOOLS_SAME_TURN keys the policy by the reply agent: %s',
    async (_, forbids, expected) => {
      const FIXTURE = writeFixture('fixture-same-turn-key', ['searchLocalBusinesses', 'dayTrade']);
      await setFlags({ PERSONA_TOOL_POLICY: 'on', TOOLS_SAME_TURN: 'on' });
      const { personaToolPolicy, rememberAgentPersona } = await import('../persona-tool-policy.js');
      const { wireCallToolLoader } =
        await import('../../../agents/voice-agent/deferred-tool-update.js');
      const { preloadTopicDomains, withSameTurnTools } =
        await import('../../../agents/personas/same-turn-tools.js');
      const [sessionPersona, agentPersona] =
        forbids === 'agent' ? ['ferni', FIXTURE] : [FIXTURE, 'ferni'];
      const call = await startCall(sessionPersona, `same-turn-key-${forbids}`);
      rememberAgentPersona(call.agent, agentPersona);
      await personaToolPolicy(FIXTURE);
      await personaToolPolicy('ferni');
      const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
      const session = { ...call.session, on: vi.fn(), off: vi.fn() };
      wireCallToolLoader(session as never, call.agent as never, call.loader, log as never);
      await preloadTopicDomains();

      const chatCtx = llm.ChatContext.empty();
      chatCtx.addMessage({ role: 'user', content: 'Find me a coffee shop nearby.' });
      const replyTools = new llm.ToolContext(call.agent.toolCtx.tools as never);
      const added = withSameTurnTools(session, chatCtx, replyTools, call.agent);

      expect(added).toContain('findRestaurants'); // the topic was picked
      expect(added.includes('searchLocalBusinesses')).toBe(expected);
      call.loader.shutdown();
    },
    120_000
  );

  it('TOOL_CORE_STATIC: the static core leaves out a core tool the persona forbids', async () => {
    const FIXTURE = writeFixture('fixture-static-core', ['tellJoke', 'dayTrade']);
    await setFlags({ PERSONA_TOOL_POLICY: 'on' });
    const { personaToolPolicy } = await import('../persona-tool-policy.js');
    const { staticCoreTools } = await import('../../../agents/shared/static-core-tools.js');
    await personaToolPolicy(FIXTURE); // call setup reads it first
    const ctx = { userId: 'u1', agentId: FIXTURE, agentDisplayName: 'Fixture' };
    const have = { tellJoke: {}, getFunFact: {}, handoffToMaya: {} };

    const core = Object.keys(await staticCoreTools(have, ctx, async () => ({})));

    expect(core).toEqual(expect.arrayContaining(['getFunFact', 'handoffToMaya']));
    expect(core).not.toContain('tellJoke');
  });
});

describe('protected tools are never removed', () => {
  it('every tool in the crisis, trauma-support, human-transfer, presence and sobriety domains, and softTeamIntro', async () => {
    await setFlags({ PERSONA_TOOL_POLICY: 'on' });
    const { autoRegisterAllDomains, loadToolDomainsLazy } =
      await import('../../registry/loader.js');
    const { toolRegistry } = await import('../../registry/index.js');
    await autoRegisterAllDomains();
    await loadToolDomainsLazy(PROTECTED_DOMAINS as never);
    // Protection follows a tool's primary domain (ToolDefinition.domain)
    const domainTools = PROTECTED_DOMAINS.flatMap((d) =>
      toolRegistry
        .getByDomain(d as never)
        .filter((t) => t.domain === d)
        .map((t) => t.id)
    );
    for (const d of PROTECTED_DOMAINS) {
      expect(domainTools.some((id) => toolRegistry.get(id)?.domain === d)).toBe(true);
    }
    const everyProtected = [...domainTools, 'softTeamIntro', 'handoffToMaya', 'meetTheTeam'];
    const FIXTURE = writeFixture('fixture-protected', [...everyProtected, 'dayTrade']);
    const { applyPersonaToolPolicy, personaToolPolicy } = await import('../persona-tool-policy.js');

    const kept = await applyPersonaToolPolicy(
      Object.fromEntries([...everyProtected, 'dayTrade'].map((n) => [n, {}])),
      FIXTURE
    );

    expect(Object.keys(kept)).toEqual(everyProtected);
    expect((await personaToolPolicy(FIXTURE))?.forbidden).toEqual(['dayTrade']);
  });

  it('reads each manifest once per process and warns about it once', async () => {
    const FIXTURE = writeFixture('fixture-warn-once', [
      'handoffToFerni',
      'meetTheTeam',
      'dayTrade',
    ]);
    await setFlags({ PERSONA_TOOL_POLICY: 'on' });
    const { personaToolPolicy, forbiddenToolsNow } = await import('../persona-tool-policy.js');

    for (let i = 0; i < 3; i++)
      expect((await personaToolPolicy(FIXTURE))?.forbidden).toEqual(['dayTrade']);
    expect(forbiddenToolsNow(FIXTURE)).toEqual(['dayTrade']);

    expect(bundleReads.ids.filter((id) => id === FIXTURE)).toHaveLength(1);
    const warned = policyLog.warn.mock.calls.filter(
      ([fields]) => (fields as { personaId?: string }).personaId === FIXTURE
    );
    expect(warned).toHaveLength(1);
    expect(warned[0]?.[0]).toMatchObject({ refused: ['handoffToFerni', 'meetTheTeam'] });
  });

  it('forgetMemory and updateMemory are never stripped, even when a manifest forbids them', async () => {
    const FIXTURE = writeFixture('fixture-privacy', ['forgetMemory', 'updateMemory', 'dayTrade']);
    await setFlags({ PERSONA_TOOL_POLICY: 'on' });
    const { applyPersonaToolPolicy, personaToolPolicy, withoutForbiddenTools } =
      await import('../persona-tool-policy.js');
    const tools = { forgetMemory: {}, updateMemory: {}, dayTrade: {}, playMusic: {} };

    expect((await personaToolPolicy(FIXTURE))?.forbidden).toEqual(['dayTrade']);
    expect(Object.keys(await applyPersonaToolPolicy(tools, FIXTURE))).toEqual([
      'forgetMemory',
      'updateMemory',
      'playMusic',
    ]);
    // Even a caller's own explicit list can't remove them
    const explicit = withoutForbiddenTools(tools, ['forgetMemory', 'updateMemory']);
    expect(Object.keys(explicit)).toEqual(Object.keys(tools));
  });

  it('a hung manifest read times out: no forbids, not cached, and the update still runs', async () => {
    const FIXTURE = writeFixture('fixture-hung', ['tellJoke']);
    await setFlags({ PERSONA_TOOL_POLICY: 'on' });
    const policy = await import('../persona-tool-policy.js');
    const { updateAgentTools } = await import('../../../agents/shared/tool-updater.js');
    const agent = bareAgent();
    const tellJoke = llm.tool({ description: 'joke', execute: async () => 'ok' });
    bundleReads.hangNext.add(FIXTURE);
    vi.useFakeTimers();
    try {
      policy.rememberAgentPersona(agent, FIXTURE); // agent setup starts the read; it hangs
      const update = updateAgentTools(agent as never, { tellJoke }, {});
      await vi.advanceTimersByTimeAsync(policy.MANIFEST_READ_TIMEOUT_MS);
      expect(await update).toBe(true);
    } finally {
      vi.useRealTimers();
    }
    expect(namesOf(agent)).toEqual(['tellJoke']); // failed open: no forbids
    expect(policy.forbiddenToolsNow(FIXTURE)).toEqual([]); // and nothing remembered

    expect((await policy.personaToolPolicy(FIXTURE))?.forbidden).toEqual(['tellJoke']);
    expect(bundleReads.ids.filter((id) => id === FIXTURE)).toHaveLength(2);
  }, 20_000);

  it('a failed manifest read is not cached: the next call reads it again', async () => {
    const FIXTURE = writeFixture('fixture-retry', ['tellJoke']);
    await setFlags({ PERSONA_TOOL_POLICY: 'on' });
    bundleReads.failNext.add(FIXTURE);
    const { personaToolPolicy, forbiddenToolsNow } = await import('../persona-tool-policy.js');

    expect((await personaToolPolicy(FIXTURE))?.forbidden).toEqual([]);
    expect(forbiddenToolsNow(FIXTURE)).toEqual([]);
    expect((await personaToolPolicy(FIXTURE))?.forbidden).toEqual(['tellJoke']);
    expect(forbiddenToolsNow(FIXTURE)).toEqual(['tellJoke']);
    expect(bundleReads.ids.filter((id) => id === FIXTURE)).toHaveLength(2);
  });

  it('joel-dickson no longer forbids a teammate, so nothing is refused', async () => {
    await setFlags({ PERSONA_TOOL_POLICY: 'on' });
    const { personaToolPolicy } = await import('../persona-tool-policy.js');
    expect((await personaToolPolicy('joel-dickson'))?.forbidden).toEqual(['dayTrade']);
    expect(policyLog.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({ personaId: 'joel-dickson' }),
      expect.any(String)
    );
  });
});
