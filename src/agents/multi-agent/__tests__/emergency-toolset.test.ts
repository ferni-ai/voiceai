/**
 * The last-resort tool set (agent-setup.ts, when every tool load has failed)
 * must name its handoffs exactly as the real handoff tools are named.
 *
 * It built names from ids: peter-john became handoffToPeterjohn (the real tool,
 * and every route that resolves tool names, knows handoffToPeter), and the
 * current-persona check compared 'maya' with 'maya-santos', so Maya was offered
 * a handoff to herself.
 */
import { describe, expect, it } from 'vitest';
import { createHandoffTools } from '../../../tools/handoff/handoff-factory.js';
import { buildEmergencyToolset } from '../emergency-toolset.js';

const TEAM = ['ferni', 'maya-santos', 'peter-john', 'jordan-taylor', 'alex-chen', 'nayan-patel'];

const handoffNames = (tools: Record<string, unknown>): string[] =>
  Object.keys(tools)
    .filter((name) => name.startsWith('handoffTo'))
    .sort();

describe('the emergency toolset', () => {
  it('names each handoff the way the real handoff builder does', async () => {
    const { toolsByAgentId } = await createHandoffTools();
    for (const current of TEAM) {
      const expected = TEAM.filter((id) => id !== current)
        .map((id) => toolsByAgentId.get(id)?.name)
        .sort();
      expect(expected.every(Boolean), current).toBe(true);
      expect(handoffNames(buildEmergencyToolset(current)), current).toEqual(expected);
    }
  }, 60_000);

  it('keeps endCall', () => {
    expect(buildEmergencyToolset('ferni')).toHaveProperty('endCall');
  });
});
