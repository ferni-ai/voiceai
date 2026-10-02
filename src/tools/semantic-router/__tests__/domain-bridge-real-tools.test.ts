/**
 * The semantic router hands a matched intent to a domain tool through the
 * domain bridge. On 2026-09-27, 132 of 321 intents had no mapping (crisis
 * support, safety planning and human transfer among them) and 185 mappings
 * named tools that do not exist (createReminder, getCalendarEvents, makeCall),
 * so those routes failed. Safety intents must map to real tools; the rest may
 * only get better.
 */
import { describe, expect, it } from 'vitest';
import { autoRegisterAllDomains, loadToolDomainsLazy } from '../../registry/loader.js';
import { toolRegistry } from '../../registry/index.js';
import { ALL_TOOL_DOMAINS } from '../../registry/types.js';
import { getAllMappings } from '../domain-bridge/index.js';
import { allToolDefinitions } from '../tool-definitions/index.js';

const SAFETY_INTENTS = [
  'crisis_support',
  'safety_planning',
  'quick_crisis_resources',
  'evaluate_human_transfer',
  'connect_to_human_expert',
  'grounding_exercise',
];

// Ratchet: lower these when more mappings are fixed, never raise them.
const MAX_MAPPINGS_TO_MISSING_TOOLS = 174;
const MAX_INTENTS_WITHOUT_MAPPING = 119;

describe('semantic router domain bridge', () => {
  it('maps every safety intent to a real tool, and does not regress elsewhere', async () => {
    await autoRegisterAllDomains();
    await loadToolDomainsLazy([...ALL_TOOL_DOMAINS]);
    const real = new Set(toolRegistry.getAll().map((tool) => tool.id));
    const mappings = getAllMappings();

    for (const intent of SAFETY_INTENTS) {
      expect(real.has(mappings[intent]?.domainToolId ?? ''), intent).toBe(true);
    }

    const broken = Object.entries(mappings).filter(([, m]) => !real.has(m.domainToolId));
    const unmapped = [...new Set(allToolDefinitions.map((d) => d.id))].filter((id) => !mappings[id]);
    expect(broken.length).toBeLessThanOrEqual(MAX_MAPPINGS_TO_MISSING_TOOLS);
    expect(unmapped.length).toBeLessThanOrEqual(MAX_INTENTS_WITHOUT_MAPPING);
  }, 120_000);
});
