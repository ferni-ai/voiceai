/**
 * Who a spoken name or alias resolves to, from the real persona bundles.
 *
 * Peter John (Ferni's team) and Peter Lynch (Financial Legends) both declare
 * the alias "peter", and both got the handoff tool name handoffToPeter. The
 * registry's alias map was last-write-wins, so "peter", "handoffToPeter" and
 * getAgentByHandoffTool('handoffToPeter') all gave whichever bundle loaded
 * last: Peter Lynch. The handoff tools (#264) say Peter is Peter John.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createHandoffTools } from '../../../tools/handoff/handoff-factory.js';
import { ALIAS_TO_CANONICAL, toCanonical } from '../../persona-ids.js';
import { AgentRegistry } from '../unified-registry.js';

describe('alias resolution against the real bundles', () => {
  beforeAll(async () => {
    AgentRegistry.clearCache();
    await AgentRegistry.getAllAgents();
  }, 60_000);

  it('resolves "peter" to Peter John and "peter lynch" to Peter Lynch', async () => {
    expect(await AgentRegistry.resolveAgentId('peter')).toBe('peter-john');
    expect(await AgentRegistry.resolveAgentId('Peter')).toBe('peter-john');
    expect((await AgentRegistry.getAgent('peter')).id).toBe('peter-john');
    expect(await AgentRegistry.resolveAgentId('peter john')).toBe('peter-john');
    expect(await AgentRegistry.resolveAgentId('peter lynch')).toBe('peter-lynch');
    expect(await AgentRegistry.resolveAgentId('lynch')).toBe('peter-lynch');
  });

  it("lets Ferni's team keep a shared alias (john: Peter John, not John Bogle)", async () => {
    expect(await AgentRegistry.resolveAgentId('john')).toBe('peter-john');
    expect(await AgentRegistry.resolveAgentId('john bogle')).toBe('john-bogle');
    // Ferni's own role id, also declared as an alias by Maya.
    expect(await AgentRegistry.resolveAgentId('life-coach')).toBe('ferni');
  });

  it('resolves handoff tool names the way the handoff tools are named', async () => {
    expect(await AgentRegistry.resolveAgentId('handoffToPeter')).toBe('peter-john');
    expect(await AgentRegistry.resolveAgentId('handoffToPeterLynch')).toBe('peter-lynch');
    expect((await AgentRegistry.getAgentByHandoffTool('handoffToPeter'))?.id).toBe('peter-john');
    expect((await AgentRegistry.getAgentByHandoffTool('handoffToPeterLynch'))?.id).toBe(
      'peter-lynch'
    );
    expect(await AgentRegistry.getHandoffToolName('peter-lynch')).toBe('handoffToPeterLynch');
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
    expect(toCanonical('peter lynch')).toBe('peter-lynch');
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
  it('are reported once, naming who kept the alias', async () => {
    const { buildAliasMap } = await import('../alias-map.js');
    const agents = await AgentRegistry.getAllAgents();
    const log = { warn: vi.fn() };
    const first = buildAliasMap(agents, log);
    buildAliasMap(agents, log);

    expect(first.get('peter')).toBe('peter-john');
    const peterReports = log.warn.mock.calls.filter(
      ([fields]) => (fields as { alias?: string }).alias === 'peter'
    );
    expect(peterReports).toHaveLength(1);
    expect(peterReports[0][0]).toMatchObject({
      alias: 'peter',
      keptBy: 'peter-john',
      alsoClaimedBy: ['peter-lynch'],
    });
  }, 60_000);
});
