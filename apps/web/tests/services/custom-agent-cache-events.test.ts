/**
 * Creating, editing or deleting a custom agent refreshes the agent list.
 *
 * custom-agent-wizard / custom-agent-editor dispatch custom-agent:created|updated|deleted
 * but nothing listened, and /api/agents (which includes the user's custom agents) is cached
 * for two minutes, so a new agent was missing and a deleted one lingered. The dispatches here
 * go through the same dispatchCustomAgentEvent the wizard and editor call.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('../../src/utils/api-helpers.js', () => ({ apiGet }));

const { fetchAgents, clearAgentsCache } = await import('../../src/services/agents.service.js');
const { dispatchCustomAgentEvent } = await import('../../src/services/custom-agent.service.js');

function agentsReply(ids: string[]): Response {
  const agents = ids.map((id) => ({ id, name: id, isCoordinator: false }));
  return new Response(
    JSON.stringify({ agents, count: agents.length, timestamp: new Date().toISOString() }),
    { status: 200 }
  );
}

describe('agent list cache vs custom agent changes', () => {
  beforeEach(() => {
    clearAgentsCache();
    apiGet.mockReset();
  });

  it('serves the cached list while nothing changed', async () => {
    apiGet.mockImplementation(async () => agentsReply(['ferni']));

    await fetchAgents();
    await fetchAgents();

    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it.each(['custom-agent:created', 'custom-agent:updated', 'custom-agent:deleted'] as const)(
    '%s makes the next fetch ask the server again',
    async (type) => {
      apiGet.mockImplementationOnce(async () => agentsReply(['ferni']));
      expect((await fetchAgents()).map((a) => a.id)).toEqual(['ferni']);

      dispatchCustomAgentEvent(type, { agentId: 'custom-1' });

      apiGet.mockImplementationOnce(async () => agentsReply(['ferni', 'custom-1']));
      expect((await fetchAgents()).map((a) => a.id)).toEqual(['ferni', 'custom-1']);
      expect(apiGet).toHaveBeenCalledTimes(2);
    }
  );

  it('other custom agent events (voice ready, memory added) keep the cache', async () => {
    apiGet.mockImplementation(async () => agentsReply(['ferni']));
    await fetchAgents();

    dispatchCustomAgentEvent('custom-agent:memory-added', { agentId: 'custom-1' });
    await fetchAgents();

    expect(apiGet).toHaveBeenCalledTimes(1);
  });
});
