/**
 * Unit Tests for Unified Registry
 *
 * Tests the AgentRegistry module for proper agent discovery and lookup.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AgentRegistry,
  getAgent,
  getAllAgents,
  hasAgent,
  resolveAgentId,
} from '../../personas/registry/unified-registry.js';

// Mock the bundle loader
vi.mock('../../personas/bundles/index.js', () => ({
  discoverAndLoadBundles: vi.fn().mockResolvedValue({
    bundles: [
      {
        manifest: {
          identity: {
            id: 'ferni',
            name: 'Ferni',
            display_name: 'Ferni',
            description: 'Life coach and team coordinator',
            aliases: ['jack-b', 'coach'],
          },
          voice: {
            provider: 'cartesia',
            voice_id: 'test-voice-id-ferni',
          },
          team: {
            coordinator: true,
            role_id: 'life-coach',
            role_description: 'Your life coach',
          },
          role: {
            id: 'life-coach',
            domains: ['life', 'coaching'],
            can_handoff: true,
          },
        },
        bundlePath: '/test/bundles/ferni',
      },
      {
        manifest: {
          identity: {
            id: 'peter-john',
            name: 'Peter John',
            display_name: 'Peter John',
            description: 'Stock research expert',
            aliases: ['peter', 'john'],
          },
          voice: {
            provider: 'cartesia',
            voice_id: 'test-voice-id-peter',
          },
          team: {
            membership: 'ferni-team',
            coordinator: false,
            role_id: 'stock-researcher',
            role_description: 'Stock research and analysis',
            handoff_triggers: ['stocks', 'research', 'ten-bagger'],
          },
          role: {
            id: 'researcher',
            domains: ['stocks', 'research'],
            can_handoff: true,
          },
        },
        bundlePath: '/test/bundles/peter-john',
      },
    ],
    searchPaths: ['/test/bundles'],
    errors: [],
  }),
  clearBundleCache: vi.fn(),
}));

describe('AgentRegistry', () => {
  beforeEach(() => {
    // Clear cache before each test
    AgentRegistry.clearCache();
  });

  describe('getAllAgents', () => {
    it('should return all discovered agents', async () => {
      const agents = await AgentRegistry.getAllAgents();
      expect(agents).toHaveLength(2);
      expect(agents.map((a) => a.id)).toContain('ferni');
      expect(agents.map((a) => a.id)).toContain('peter-john');
    });

    it('should include agent properties', async () => {
      const agents = await AgentRegistry.getAllAgents();
      const ferni = agents.find((a) => a.id === 'ferni');

      expect(ferni).toBeDefined();
      expect(ferni?.name).toBe('Ferni');
      expect(ferni?.isCoordinator).toBe(true);
      expect(ferni?.voiceId).toBe('test-voice-id-ferni');
    });
  });

  describe('getAgent', () => {
    it('should return agent by canonical ID', async () => {
      const agent = await AgentRegistry.getAgent('ferni');
      expect(agent.id).toBe('ferni');
      expect(agent.name).toBe('Ferni');
    });

    it('should return agent by alias', async () => {
      const agent = await AgentRegistry.getAgent('peter');
      expect(agent.id).toBe('peter-john');
      expect(agent.name).toBe('Peter John');
    });

    it('should be case insensitive', async () => {
      const agent = await AgentRegistry.getAgent('FERNI');
      expect(agent.id).toBe('ferni');
    });

    it('should fall back to coordinator for unknown ID', async () => {
      const agent = await AgentRegistry.getAgent('unknown-agent');
      expect(agent.isCoordinator).toBe(true);
    });
  });

  describe('getAgentOrNull', () => {
    it('should return null for unknown ID', async () => {
      const agent = await AgentRegistry.getAgentOrNull('unknown-agent');
      expect(agent).toBeNull();
    });

    it('should return agent for valid ID', async () => {
      const agent = await AgentRegistry.getAgentOrNull('ferni');
      expect(agent).not.toBeNull();
      expect(agent?.id).toBe('ferni');
    });
  });

  describe('getCoordinator', () => {
    it('should return the coordinator agent', async () => {
      const coordinator = await AgentRegistry.getCoordinator();
      expect(coordinator.id).toBe('ferni');
      expect(coordinator.isCoordinator).toBe(true);
    });
  });

  describe('getTeamMembers', () => {
    it('should return non-coordinator agents', async () => {
      const members = await AgentRegistry.getTeamMembers();
      expect(members).toHaveLength(1);
      expect(members[0].id).toBe('peter-john');
      expect(members[0].isCoordinator).toBe(false);
    });
  });

  describe('hasAgent', () => {
    it('should return true for valid agent', async () => {
      expect(await AgentRegistry.hasAgent('ferni')).toBe(true);
      expect(await AgentRegistry.hasAgent('peter')).toBe(true);
    });

    it('should return false for unknown agent', async () => {
      expect(await AgentRegistry.hasAgent('unknown')).toBe(false);
    });
  });

  describe('resolveAgentId', () => {
    it('should resolve alias to canonical ID', async () => {
      expect(await AgentRegistry.resolveAgentId('peter')).toBe('peter-john');
      expect(await AgentRegistry.resolveAgentId('john')).toBe('peter-john');
      expect(await AgentRegistry.resolveAgentId('coach')).toBe('ferni');
    });

    it('should return null for unknown alias', async () => {
      expect(await AgentRegistry.resolveAgentId('unknown')).toBeNull();
    });
  });

  describe('isSameAgent', () => {
    it('should return true for same agent with different IDs', async () => {
      expect(await AgentRegistry.isSameAgent('peter', 'peter-john')).toBe(true);
      expect(await AgentRegistry.isSameAgent('ferni', 'coach')).toBe(true);
    });

    it('should return false for different agents', async () => {
      expect(await AgentRegistry.isSameAgent('ferni', 'peter-john')).toBe(false);
    });
  });

  describe('getVoiceId', () => {
    it('should return voice ID for agent', async () => {
      expect(await AgentRegistry.getVoiceId('ferni')).toBe('test-voice-id-ferni');
      expect(await AgentRegistry.getVoiceId('peter')).toBe('test-voice-id-peter');
    });
  });

  describe('getHandoffToolName', () => {
    it('should generate handoff tool name', async () => {
      expect(await AgentRegistry.getHandoffToolName('peter-john')).toBe('handoffToPeter');
      expect(await AgentRegistry.getHandoffToolName('ferni')).toBe('handoffToFerni');
    });
  });

  describe('getHandoffTriggerMap', () => {
    it('should return triggers mapped to agent IDs', async () => {
      const triggerMap = await AgentRegistry.getHandoffTriggerMap();
      expect(triggerMap.get('peter-john')).toContain('stocks');
      expect(triggerMap.get('peter-john')).toContain('research');
    });
  });

  describe('caching', () => {
    it('should cache results', async () => {
      const stats1 = AgentRegistry.getCacheStats();
      expect(stats1.agentCount).toBe(0);

      await AgentRegistry.getAllAgents();

      const stats2 = AgentRegistry.getCacheStats();
      expect(stats2.agentCount).toBe(2);
    });

    it('should clear cache', async () => {
      await AgentRegistry.getAllAgents();
      AgentRegistry.clearCache();

      const stats = AgentRegistry.getCacheStats();
      expect(stats.agentCount).toBe(0);
    });
  });
});

// Test convenience functions
describe('Convenience Functions', () => {
  beforeEach(() => {
    AgentRegistry.clearCache();
  });

  it('getAgent should work', async () => {
    const agent = await getAgent('ferni');
    expect(agent.id).toBe('ferni');
  });

  it('getAllAgents should work', async () => {
    const agents = await getAllAgents();
    expect(agents.length).toBeGreaterThan(0);
  });

  it('hasAgent should work', async () => {
    expect(await hasAgent('ferni')).toBe(true);
    expect(await hasAgent('unknown')).toBe(false);
  });

  it('resolveAgentId should work', async () => {
    expect(await resolveAgentId('peter')).toBe('peter-john');
  });
});

