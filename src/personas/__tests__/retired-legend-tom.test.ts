/**
 * Tom, the stock-picking Financial Legend (id peter-lynch), left the product on
 * 2026-11-08. Nothing can select him, route to him or list him. Stored state can
 * still name his id (a saved persona, a scheduled check-in, a past call): history
 * shows "Tom", anything live gets Ferni, and nothing throws.
 *
 * Before, with his bundle gone, a stored id or one of his old names reached the
 * voice agent's stand-in persona (persona-builder.ts), which names itself after
 * the id. Now any id that is neither a built-in persona nor a custom agent
 * starts the call with Ferni (livePersonaId), so no call starts on a stand-in.
 *
 * @module personas/__tests__/retired-legend-tom.test
 */
import type { JobContext } from '@livekit/agents';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseJobMetadata } from '../../agents/voice-agent-entry/metadata-parser.js';
import { personaForCaller } from '../../services/custom-agent/custom-agent-owner.js';
import { createHandoffTools } from '../../tools/handoff/handoff-factory.js';
import { discoverBundles } from '../bundles/index.js';
import {
  ALL_CANONICAL_IDS,
  ALIAS_TO_CANONICAL,
  FINANCIAL_LEGENDS,
  getDisplayName,
  historyDisplayName,
  livePersonaId,
  toCanonical,
} from '../persona-ids.js';
import { getPersonaAsync, initializeFromBundles } from '../index.js';
import { AgentRegistry } from '../registry/unified-registry.js';

const TOM_ID = 'peter-lynch';
const TOM_NAMES = ['tom', 'tom brannigan', 'tom-brannigan', 'brannigan', 'stock-picker'];

const jobWith = (metadata: Record<string, unknown>): JobContext =>
  ({ job: { metadata: JSON.stringify(metadata) } }) as unknown as JobContext;

describe('Tom is off the roster', () => {
  beforeAll(async () => {
    AgentRegistry.clearCache();
    await AgentRegistry.getAllAgents();
  }, 60_000);

  it('has no bundle, no canonical id and no legend slot', async () => {
    expect(await discoverBundles()).not.toContain(TOM_ID);
    expect(ALL_CANONICAL_IDS).not.toContain(TOM_ID);
    expect(FINANCIAL_LEGENDS).not.toContain(TOM_ID);
    expect((await AgentRegistry.getAllAgents()).map((a) => a.id)).not.toContain(TOM_ID);
  });

  it('no name or alias resolves to him', async () => {
    const names = [TOM_ID, ...TOM_NAMES];
    const resolved = await Promise.all(names.map((name) => AgentRegistry.resolveAgentId(name)));
    names.forEach((name, i) => {
      expect(Object.hasOwn(ALIAS_TO_CANONICAL, name), name).toBe(false);
      expect(resolved[i], name).not.toBe(TOM_ID);
    });
  });
});

describe('Tom cannot be handed off to', () => {
  it('the handoff factory builds no tool for him', async () => {
    const { tools } = await createHandoffTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.map((t) => t.agentId)).not.toContain(TOM_ID);
    expect(tools.map((t) => t.name)).not.toContain('handoffToTom');
    expect(await AgentRegistry.getAgentByHandoffTool('handoffToTom')).toBeNull();
  }, 60_000);
});

describe('stored state that still names Tom', () => {
  // His id, every name that used to reach him, and his id in another case.
  const STORED = [TOM_ID, ...TOM_NAMES, 'Peter-Lynch', 'TOM'];

  it.each(STORED)(
    'a saved persona choice of %s starts the call with Ferni (token route)',
    async (id) => {
      expect(await personaForCaller(id, 'u_test')).toBe('ferni');
      expect(await personaForCaller(id, undefined)).toBe('ferni');
    }
  );

  it.each(STORED)('a dispatch that names %s (a scheduled check-in) is answered by Ferni', (id) => {
    expect(parseJobMetadata(jobWith({ persona_id: id })).personaId).toBe('ferni');
  });

  it('a past call keeps his name in history', () => {
    expect(historyDisplayName(TOM_ID)).toBe('Tom');
    expect(historyDisplayName('john-bogle')).toBe('Henry Caldwell');
  });
});

describe('no call starts on a stand-in named after the id', () => {
  beforeAll(async () => {
    await initializeFromBundles();
  }, 60_000);

  it.each(['not-a-persona-id', 'Not-A-Persona-ID', '', '   ', '__proto__', 'constructor'])(
    'unknown id %j goes to Ferni on the token route and at dispatch, without throwing',
    async (id) => {
      expect(livePersonaId(id)).toBe('ferni');
      expect(await personaForCaller(id, 'u_test')).toBe('ferni');
      expect(parseJobMetadata(jobWith({ persona_id: id })).personaId).toBe('ferni');
      expect(() => toCanonical(id)).not.toThrow();
      expect(getDisplayName(id)).toBe('Ferni');
    }
  );

  it('a built-in id or alias starts on its canonical persona, in any case', async () => {
    expect(livePersonaId('maya-santos')).toBe('maya-santos');
    expect(livePersonaId('Maya')).toBe('maya-santos');
    expect(await personaForCaller(' HENRY ', 'u_test')).toBe('john-bogle');
    expect(parseJobMetadata(jobWith({ persona_id: 'Alex' })).personaId).toBe('alex-chen');
  });

  it('a custom agent id is kept for its owner check', () => {
    expect(livePersonaId('agent_1_mine')).toBe('agent_1_mine');
    expect(parseJobMetadata(jobWith({ persona_id: 'agent_1_mine' })).personaId).toBe(
      'agent_1_mine'
    );
  });

  it('every persona livePersonaId can return loads from its bundle', async () => {
    const live = new Set(Object.keys(ALIAS_TO_CANONICAL).map(livePersonaId));
    live.add(livePersonaId('not-a-persona-id'));
    const loaded = await Promise.all(
      [...live].map(async (id) => [id, (await getPersonaAsync(id))?.id])
    );
    expect(loaded.filter(([id, got]) => got !== id)).toEqual([]);
  });

  it('every name the persona loader can load keeps its persona (no id loses its bundle)', async () => {
    const names = new Set(
      (await AgentRegistry.getAllAgents()).flatMap((a) => [a.id, ...a.aliases])
    );
    const loadable = await Promise.all(
      [...names].map(async (name) => [name, (await getPersonaAsync(name))?.id] as const)
    );
    const lost = loadable
      .filter(([, got]) => got !== undefined)
      .filter(([name, got]) => livePersonaId(name) !== got)
      .map(([name, got]) => `${name}: loads ${got}, live ${livePersonaId(name)}`);
    expect(loadable.filter(([, got]) => got !== undefined).length).toBeGreaterThan(30);
    expect(lost).toEqual([]);
  }, 60_000);
});
