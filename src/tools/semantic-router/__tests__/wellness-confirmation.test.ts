/**
 * Mild distress offers a wellness tool, it never auto-runs one (#3733, fe's call).
 *
 * grounding_exercise and wellness_checkin require confirmation, so a 0.95 pattern hit
 * makes the router recommend 'confirm' (the turn gets a tool hint and the companion
 * asks), never 'execute'. Main auto-ran these lines; an explicit ask goes the same way.
 */
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('../embedding-providers.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../embedding-providers.js')>()),
  createEmbeddingProvider: () => ({
    modelName: 'test',
    dimensions: 4,
    embed: async () => [0.1, 0.2, 0.3, 0.4],
    embedBatch: async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3, 0.4]),
  }),
}));

import { SemanticRouter } from '../router.js';
import { getToolRegistry, resetToolRegistry } from '../registry.js';
import { allToolDefinitions } from '../tool-definitions/index.js';
import { DEFAULT_ROUTER_CONFIG } from '../types.js';

const ROWS: Array<[string, string]> = [
  ["I'm so stressed out", 'grounding_exercise'],
  ["I'm stressed about work", 'grounding_exercise'],
  ["I'm overwhelmed", 'grounding_exercise'],
  ["I'm feeling sad", 'wellness_checkin'],
  ["I'm feeling down", 'wellness_checkin'],
  ['Can we do a breathing exercise?', 'grounding_exercise'],
];

describe('wellness tools ask first', () => {
  const registry = getToolRegistry();
  registry.registerMany(allToolDefinitions.filter((d) => !registry.get(d.id)));
  const router = new SemanticRouter(DEFAULT_ROUTER_CONFIG, registry);

  afterAll(() => resetToolRegistry());

  it.each(ROWS)('%j: confirm %s, not execute', async (text, toolId) => {
    const result = await router.route(text);
    expect(result.matches[0]?.toolId).toBe(toolId);
    expect(result.matches[0]?.confidence).toBeGreaterThanOrEqual(
      DEFAULT_ROUTER_CONFIG.thresholds.autoExecute
    );
    expect(result.action).toMatchObject({ type: 'confirm', toolId });
  });
});
