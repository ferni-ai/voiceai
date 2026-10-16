import { describe, expect, it } from 'vitest';
import { FIND_TOOLS } from '../../../tools/retrieval/find-tools-tool.js';
import { staticCoreCallTools } from '../static-core-tools.js';

describe('staticCoreCallTools', () => {
  it('adds findTools to the call set, so a tool outside the core stays reachable', async () => {
    const tools = { getCurrentContext: { description: 'time' }, notInCore: { description: 'x' } };

    const core = await staticCoreCallTools(tools, 'user-1', 'session-1', { id: 'ferni' });

    expect(Object.keys(core)).toContain(FIND_TOOLS);
    expect(Object.keys(core)).toContain('getCurrentContext');
    expect(Object.keys(core)).not.toContain('notInCore');
  });
});
