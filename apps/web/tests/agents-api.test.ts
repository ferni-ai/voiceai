/**
 * Integration Tests for /api/agents Endpoint
 *
 * Tests the agents API endpoint that returns dynamic agent data.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  agentToPersonaConfig,
  clearAgentsCache,
  fetchAgents,
  getAgentById,
  getCoordinatorAgent,
  getTeamMemberAgents,
  hasCachedAgents,
  type ApiAgent,
} from '../src/services/agents.service.js';

// Mock fetch
const mockAgentsResponse = {
  agents: [
    {
      id: 'ferni',
      name: 'Ferni',
      initials: 'FE',
      subtitle: 'Life coach',
      role: 'coach',
      roleId: 'life-coach',
      isCoordinator: true,
      canHandoff: true,
      handoffToolName: 'handoffToFerni',
      entrancePhrase: 'Ferni here!',
      themeClass: 'persona-ferni',
      voiceId: 'test-voice-ferni',
      colors: {
        primary: '#4a6741',
        secondary: '#3d5a35',
      },
    },
    {
      id: 'jack-bogle',
      name: 'Jack Bogle',
      initials: 'JB',
      subtitle: 'Investment sage',
      role: 'team',
      roleId: 'sage-mentor',
      isCoordinator: false,
      canHandoff: true,
      handoffToolName: 'handoffToJack',
      entrancePhrase: 'Jack here.',
      themeClass: 'persona-jack-bogle',
      voiceId: 'test-voice-jack',
      colors: null,
      aliases: ['jack', 'sage'],
    },
  ],
  count: 2,
  timestamp: new Date().toISOString(),
};

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Agents Service', () => {
  beforeEach(() => {
    clearAgentsCache();
    mockFetch.mockClear();
  });

  describe('fetchAgents', () => {
    it('should fetch agents from API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAgentsResponse),
      });

      const agents = await fetchAgents();

      expect(agents).toHaveLength(2);
      expect(agents[0].id).toBe('ferni');
      expect(mockFetch).toHaveBeenCalledWith('/api/agents', expect.objectContaining({
        method: 'GET',
      }));
    });

    it('should cache results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAgentsResponse),
      });

      await fetchAgents();
      await fetchAgents();

      // Should only call fetch once
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(hasCachedAgents()).toBe(true);
    });

    it('should force refresh when requested', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockAgentsResponse),
      });

      await fetchAgents();
      await fetchAgents(true); // Force refresh

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should fall back to hardcoded agents on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({
            error: 'Internal error',
            fallback: ['ferni', 'jack-bogle'],
          }),
      });

      const agents = await fetchAgents();

      expect(agents.length).toBeGreaterThan(0);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const agents = await fetchAgents();

      // Should return fallback
      expect(agents.length).toBeGreaterThan(0);
    });
  });

  describe('getAgentById', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockAgentsResponse),
      });
    });

    it('should find agent by ID', async () => {
      const agent = await getAgentById('ferni');

      expect(agent).not.toBeNull();
      expect(agent?.id).toBe('ferni');
    });

    it('should find agent by alias', async () => {
      const agent = await getAgentById('jack');

      expect(agent).not.toBeNull();
      expect(agent?.id).toBe('jack-bogle');
    });

    it('should return null for unknown agent', async () => {
      const agent = await getAgentById('unknown-agent');

      expect(agent).toBeNull();
    });

    it('should be case insensitive', async () => {
      const agent = await getAgentById('FERNI');

      expect(agent).not.toBeNull();
      expect(agent?.id).toBe('ferni');
    });
  });

  describe('getCoordinatorAgent', () => {
    it('should return the coordinator', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockAgentsResponse),
      });

      const coordinator = await getCoordinatorAgent();

      expect(coordinator).not.toBeNull();
      expect(coordinator?.isCoordinator).toBe(true);
      expect(coordinator?.id).toBe('ferni');
    });
  });

  describe('getTeamMemberAgents', () => {
    it('should return non-coordinator agents', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockAgentsResponse),
      });

      const members = await getTeamMemberAgents();

      expect(members).toHaveLength(1);
      expect(members[0].id).toBe('jack-bogle');
      expect(members[0].isCoordinator).toBe(false);
    });
  });

  describe('agentToPersonaConfig', () => {
    it('should convert API agent to PersonaConfig', () => {
      const agent: ApiAgent = mockAgentsResponse.agents[0] as ApiAgent;
      const config = agentToPersonaConfig(agent);

      expect(config.id).toBe('ferni');
      expect(config.name).toBe('Ferni');
      expect(config.initials).toBe('FE');
      expect(config.colors.primary).toBe('#4a6741');
    });

    it('should generate colors if not provided', () => {
      const agent: ApiAgent = mockAgentsResponse.agents[1] as ApiAgent;
      const config = agentToPersonaConfig(agent);

      expect(config.colors).toBeDefined();
      expect(config.colors.primary).toBeDefined();
    });
  });

  describe('cache management', () => {
    it('clearAgentsCache should clear cache', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockAgentsResponse),
      });

      await fetchAgents();
      expect(hasCachedAgents()).toBe(true);

      clearAgentsCache();
      expect(hasCachedAgents()).toBe(false);
    });
  });
});
