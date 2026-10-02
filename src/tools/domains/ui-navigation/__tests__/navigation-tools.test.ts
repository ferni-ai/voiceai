/**
 * openPanel: "show me what you remember" opens the memories page.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ broadcast: vi.fn(async () => undefined) }));

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: (config: { execute: unknown }) => ({ execute: config.execute }),
  },
}));
vi.mock('../../../../services/user-events/index.js', () => ({ broadcastUserEvent: h.broadcast }));

import { navigationToolDefinitions } from '../navigation-tools.js';
import type { ToolContext } from '../../../registry/types.js';

const ctx = { userId: 'user-a', agentId: 'ferni' } as unknown as ToolContext;
const openPanel = navigationToolDefinitions
  .find((d) => d.id === 'openPanel')!
  .create(ctx) as unknown as {
  execute: (args: { panel: string }) => Promise<string>;
};

beforeEach(() => h.broadcast.mockClear());

describe('openPanel memories view', () => {
  it.each(['show me what you remember', 'what do you know about me', 'memories', 'my memories'])(
    '"%s" opens the memories view',
    async (panel) => {
      const reply = await openPanel.execute({ panel });
      expect(h.broadcast).toHaveBeenCalledWith('user-a', 'show_view', { view: 'memories' });
      expect(reply).toContain('what I remember');
    }
  );

  it('keeps memory lane reachable', async () => {
    await openPanel.execute({ panel: 'memory lane' });
    expect(h.broadcast).toHaveBeenCalledWith('user-a', 'show_view', { view: 'memory-lane' });
  });
});
