/**
 * Who a spoken name or alias resolves to, from the real persona bundles.
 *
 * Two personas on different teams once both declared the alias "peter" and both
 * got the handoff tool name handoffToPeter. The registry's alias map was
 * last-write-wins, so "peter", "handoffToPeter" and
 * getAgentByHandoffTool('handoffToPeter') all gave whichever bundle loaded
 * last. The handoff tools (#264) say Peter is Peter John.
 *
 * The Financial Legends are fictional characters: Henry Caldwell (john-bogle),
 * Tom Brannigan (peter-lynch) and Nate Holloway (joel-dickson). No real
 * person's name resolves to any persona.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createHandoffTools } from '../../../tools/handoff/handoff-factory.js';
import { ALIAS_TO_CANONICAL, toCanonical } from '../../persona-ids.js';
import { AgentRegistry, type Agent } from '../unified-registry.js';

/** Real people the legends were once modeled on: none may reach a persona. */
const REAL_NAMES = [
  'bogle',
  'john bogle',
  'jack bogle',
  'jack-bogle',
  'jack',
  'vanguard-founder',
  'lynch',
  'peter lynch',
  'magellan',
  'fidelity-legend',
];
/**
 * The joel-dickson bundle is renamed on its own branch; until then its manifest
 * name still reaches it, so only the static alias table is checked here.
 */
const REAL_NAMES_STATIC_ONLY = ['joel', 'dickson', 'joel dickson', 'dr-dickson', 'vanguard-mentor'];

describe('alias resolution against the real bundles', () => {
  beforeAll(async () => {
    AgentRegistry.clearCache();
    await AgentRegistry.getAllAgents();
  }, 60_000);

  it('resolves "peter" to Peter John and the legends by their fictional names', async () => {
    expect(await AgentRegistry.resolveAgentId('peter')).toBe('peter-john');
    expect(await AgentRegistry.resolveAgentId('Peter')).toBe('peter-john');
    expect((await AgentRegistry.getAgent('peter')).id).toBe('peter-john');
    expect(await AgentRegistry.resolveAgentId('peter john')).toBe('peter-john');
    expect(await AgentRegistry.resolveAgentId('tom brannigan')).toBe('peter-lynch');
    expect(await AgentRegistry.resolveAgentId('tom')).toBe('peter-lynch');
    expect(await AgentRegistry.resolveAgentId('henry caldwell')).toBe('john-bogle');
    expect(await AgentRegistry.resolveAgentId('henry')).toBe('john-bogle');
  });

  it('resolves no real person to a persona', async () => {
    for (const name of REAL_NAMES) {
      expect(await AgentRegistry.resolveAgentId(name), name).toBeNull();
      expect(ALIAS_TO_CANONICAL[name], name).toBeUndefined();
    }
    for (const name of REAL_NAMES_STATIC_ONLY) {
      expect(ALIAS_TO_CANONICAL[name], name).toBeUndefined();
    }
  });

  it("lets Ferni's team keep its own names (john: Peter John)", async () => {
    expect(await AgentRegistry.resolveAgentId('john')).toBe('peter-john');
    // Ferni's own role id, also declared as an alias by Maya.
    expect(await AgentRegistry.resolveAgentId('life-coach')).toBe('ferni');
  });

  it('resolves handoff tool names the way the handoff tools are named', async () => {
    expect(await AgentRegistry.resolveAgentId('handoffToPeter')).toBe('peter-john');
    expect(await AgentRegistry.resolveAgentId('handoffToTom')).toBe('peter-lynch');
    expect(await AgentRegistry.resolveAgentId('handoffToHenry')).toBe('john-bogle');
    expect((await AgentRegistry.getAgentByHandoffTool('handoffToPeter'))?.id).toBe('peter-john');
    expect((await AgentRegistry.getAgentByHandoffTool('handoffToTom'))?.id).toBe('peter-lynch');
    expect(await AgentRegistry.getHandoffToolName('peter-lynch')).toBe('handoffToTom');
    expect(await AgentRegistry.getHandoffToolName('john-bogle')).toBe('handoffToHenry');
  });

  it('agrees with every tool the handoff factory builds', async () => {
    const { tools } = await createHandoffTools();
    expect(tools.length).toBeGreaterThanOrEqual(9);
    for (const tool of tools) {
      expect(await AgentRegistry.resolveAgentId(tool.name), tool.name).toBe(tool.agentId);
      expect((await AgentRegistry.getAgentByHandoffTool(tool.name))?.id, tool.name).toBe(
        tool.agentId
      );
      expect(await AgentRegistry.getHandoffToolName(tool.agentId), tool.agentId).toBe(tool.name);
    }
  }, 60_000);

  it('agrees with the static alias table (toCanonical) wherever both know a name', async () => {
    const disagreements: string[] = [];
    for (const [alias, canonical] of Object.entries(ALIAS_TO_CANONICAL)) {
      const fromRegistry = await AgentRegistry.resolveAgentId(alias);
      if (fromRegistry !== null && fromRegistry !== canonical) {
        disagreements.push(`${alias}: table=${canonical} registry=${fromRegistry}`);
      }
    }
    expect(disagreements).toEqual([]);
    expect(toCanonical('tom brannigan')).toBe('peter-lynch');
    expect(toCanonical('henry caldwell')).toBe('john-bogle');
    expect(toCanonical('nate holloway')).toBe('joel-dickson');
    expect(toCanonical('peter')).toBe('peter-john');
  });
});

describe('a persona registered at runtime', () => {
  it('cannot take a name a bundle persona already answers to', async () => {
    const { getPersonaRegistry, resetPersonaRegistry } =
      await import('../persona-registry-impl.js');
    await resetPersonaRegistry();
    const registry = getPersonaRegistry();
    const result = await registry.register({
      id: 'peter-parker',
      name: 'Peter Parker',
      description: 'A runtime test persona',
      voice: { voiceId: 'test-voice', provider: 'cartesia' },
      role: 'team',
      aliases: ['peter', 'spidey'],
    });
    expect(result.success).toBe(true);
    expect(await registry.resolveId('peter')).toBe('peter-john');
    expect((await registry.get('peter'))?.id).toBe('peter-john');
    // Its own names still reach it.
    expect(await registry.resolveId('spidey')).toBe('peter-parker');
    expect(await registry.resolveId('peter parker')).toBe('peter-parker');
    await resetPersonaRegistry();
  }, 60_000);
});

describe('alias collisions', () => {
  /** Just the fields buildAliasMap reads. */
  const agent = (id: string, membership: string, aliases: string[], isCoordinator = false) =>
    ({
      id,
      handoffToolName: `handoffTo${id}`,
      aliases,
      isCoordinator,
      manifest: { team: { membership } },
    }) as unknown as Agent;

  it('are reported once, naming who kept the alias', async () => {
    const { buildAliasMap } = await import('../alias-map.js');
    const agents = [
      agent('coach', 'home', ['coach'], true),
      agent('away-peter', 'away', ['peter']),
      agent('home-peter', 'home', ['peter']),
    ];
    const log = { warn: vi.fn() };
    const first = buildAliasMap(agents, log);
    buildAliasMap(agents, log);

    expect(first.get('peter')).toBe('home-peter');
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn.mock.calls[0][0]).toMatchObject({
      alias: 'peter',
      keptBy: 'home-peter',
      alsoClaimedBy: ['away-peter'],
    });
  });

  it('the real bundles share no alias except where a role id is deliberate', async () => {
    const { buildAliasMap } = await import('../alias-map.js');
    const log = { warn: vi.fn() };
    buildAliasMap(await AgentRegistry.getAllAgents(), log);
    const contested = log.warn.mock.calls.map(([fields]) => (fields as { alias: string }).alias);
    // Ferni's role id is also one of Maya's aliases, on purpose (see above).
    expect(contested).toEqual(['life-coach']);
  }, 60_000);
});
