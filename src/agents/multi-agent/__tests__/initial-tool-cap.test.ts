/**
 * The first agent's tool set: capped for every provider (the essential domains
 * alone are ~340 tools), with safety, memory and handoffs always kept.
 */
import { describe, expect, it } from 'vitest';
import { capToolsToLimit } from '../../../config/tool-config.js';
import { loadEssentialDomains } from '../../../tools/dynamic-loader/index.js';
import { DEFAULT_INITIAL_TOOL_LIMIT, resolveInitialToolLimit } from '../initial-tools.js';

const MUST_KEEP = [
  'provideCrisisResources',
  'createSafetyPlan',
  'quickCrisisResources',
  'evaluateHumanTransfer',
  'groundingExercise',
  'recallFromMemory',
  'rememberAboutUser',
  'recallPreviousConversation',
  'handoffToFerni',
  'playMusic',
];

describe('initial tool cap', () => {
  it('caps every provider when TOOL_LIMIT is unset, and honors TOOL_LIMIT when set', () => {
    expect(resolveInitialToolLimit(0)).toBe(DEFAULT_INITIAL_TOOL_LIMIT);
    expect(resolveInitialToolLimit(20)).toBe(20);
  });

  it('keeps safety, memory, handoff and music tools when capping the real essential set', async () => {
    // Teammate handoffs are added by the caller for the user's unlocked team.
    const all = {
      ...(await loadEssentialDomains('test-user', undefined)),
      handoffToMaya: {},
    };
    expect(Object.keys(all).length).toBeGreaterThan(DEFAULT_INITIAL_TOOL_LIMIT);

    const capped = capToolsToLimit(all, resolveInitialToolLimit(0));
    const names = Object.keys(capped);

    for (const tool of [...MUST_KEEP, 'handoffToMaya']) expect(names).toContain(tool);
    expect(names.length).toBeLessThanOrEqual(DEFAULT_INITIAL_TOOL_LIMIT + 16);
    expect(names.length).toBeLessThan(Object.keys(all).length);
  }, 60_000);
});
