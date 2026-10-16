import { describe, expect, it, vi } from 'vitest';
import { FIND_TOOLS } from '../../../tools/retrieval/find-tools-tool.js';
import { staticCoreCallTools, type BuildToolsByName } from '../static-core-tools.js';

describe('staticCoreCallTools', () => {
  it('adds findTools to the call set, so a tool outside the core stays reachable', async () => {
    const tools = { getCurrentContext: { description: 'time' }, notInCore: { description: 'x' } };
    const build = vi.fn<BuildToolsByName>(async () => ({}));

    const core = await staticCoreCallTools(tools, 'user-1', 'session-1', { id: 'ferni' }, build);

    expect(Object.keys(core)).toContain(FIND_TOOLS);
    expect(Object.keys(core)).toContain('getCurrentContext');
    expect(Object.keys(core)).not.toContain('notInCore');
    // findTools comes from the helper, so it is never asked of the registry.
    const asked = build.mock.calls[0]?.[0] ?? [];
    expect(asked).not.toContain(FIND_TOOLS);
    expect(asked).not.toContain('getCurrentContext');
  });

  it('builds the session context from the caller and persona', async () => {
    const build = vi.fn<BuildToolsByName>(async () => ({}));

    await staticCoreCallTools({}, null, null, { id: 'ferni' }, build);

    expect(build.mock.calls[0]?.[1]).toEqual({
      userId: 'anonymous',
      sessionId: undefined,
      agentId: 'ferni',
      agentDisplayName: 'ferni',
    });
  });
});
