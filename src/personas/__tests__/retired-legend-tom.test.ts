/**
 * Tom, the stock-picking Financial Legend (id peter-lynch), left the product on
 * 2026-11-08. Nothing can select him, route to him or list him. Stored state can
 * still name his id (a saved persona, a scheduled check-in, a past call): history
 * shows "Tom", anything live gets Ferni, and nothing throws.
 *
 * Before, with his bundle gone, a stored id reached the voice agent's stand-in
 * persona (persona-builder.ts), which names itself after the id.
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
  it('a saved persona choice starts the call with Ferni (token route)', async () => {
    expect(await personaForCaller(TOM_ID, 'u_test')).toBe('ferni');
    expect(await personaForCaller(TOM_ID, undefined)).toBe('ferni');
    expect(await personaForCaller('Peter-Lynch', 'u_test')).toBe('ferni');
  });

  it('a dispatch that names him (a scheduled check-in) is answered by Ferni', () => {
    expect(parseJobMetadata(jobWith({ persona_id: TOM_ID })).personaId).toBe('ferni');
  });

  it('a past call keeps his name in history', () => {
    expect(historyDisplayName(TOM_ID)).toBe('Tom');
    expect(historyDisplayName('john-bogle')).toBe('Henry Caldwell');
  });

  it('live resolution falls back to Ferni and never throws, retired or unknown', () => {
    expect(livePersonaId(TOM_ID)).toBe('ferni');
    expect(livePersonaId('maya-santos')).toBe('maya-santos');
    for (const id of [TOM_ID, 'not-a-persona-id']) {
      expect(() => toCanonical(id)).not.toThrow();
      expect(toCanonical(id)).toBe('ferni');
      expect(getDisplayName(id)).toBe('Ferni');
    }
  });
});
