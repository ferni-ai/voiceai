/**
 * Unit Tests for Handoff Factory
 *
 * Tests the dynamic handoff tool generation.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearHandoffToolCache,
  createHandoffTools,
  findHandoffTarget,
  getAgentNameFromToolName,
  getHandoffTool,
  getHandoffToolForAgent,
  getHandoffToolNames,
  isHandoffToolName,
} from '../../tools/handoff/handoff-factory.js';

// Mock the unified registry
vi.mock('../../personas/registry/unified-registry.js', () => ({
  AgentRegistry: {
    getAllAgents: vi.fn().mockResolvedValue([
      {
        id: 'ferni',
        name: 'Ferni',
        isCoordinator: true,
        enabled: true,
        roleDescription: 'Life coach',
        handoffTriggers: [],
        ui: { initials: 'FE' },
        manifest: {},
      },
      {
        id: 'peter-john',
        name: 'Peter John',
        isCoordinator: false,
        enabled: true,
        roleDescription: 'Stock research',
        handoffTriggers: ['stocks', 'research', 'ten-bagger'],
        ui: { initials: 'PL' },
        manifest: {},
      },
      {
        id: 'maya-santos',
        name: 'Maya Santos',
        isCoordinator: false,
        enabled: true,
        roleDescription: 'Spending and saving',
        handoffTriggers: ['budget', 'spending', 'saving'],
        ui: { initials: 'MS' },
        manifest: {},
      },
      {
        id: 'disabled-agent',
        name: 'Disabled',
        isCoordinator: false,
        enabled: false,
        roleDescription: 'Disabled agent',
        handoffTriggers: ['disabled'],
        ui: { initials: 'DA' },
        manifest: {},
      },
    ]),
    getCoordinator: vi.fn().mockResolvedValue({
      id: 'ferni',
      name: 'Ferni',
      isCoordinator: true,
      enabled: true,
      roleDescription: 'Life coach',
      handoffTriggers: [],
      ui: { initials: 'FE' },
      manifest: {},
    }),
    getAgentOrNull: vi.fn().mockImplementation(async (id) => {
      const agents = {
        ferni: { id: 'ferni', name: 'Ferni' },
        'peter-john': { id: 'peter-john', name: 'Peter John' },
        'maya-santos': { id: 'maya-santos', name: 'Maya Santos' },
      };
      return agents[id] || null;
    }),
  },
}));

describe('Handoff Factory', () => {
  beforeEach(() => {
    clearHandoffToolCache();
  });

  describe('createHandoffTools', () => {
    it('should generate tools for all enabled team members', async () => {
      const toolSet = await createHandoffTools();

      expect(toolSet.tools.length).toBeGreaterThan(0);
      expect(toolSet.toolsByName.has('handofftopeter')).toBe(true);
      expect(toolSet.toolsByName.has('handofftomaya')).toBe(true);
    });

    it('should not generate tools for disabled agents', async () => {
      const toolSet = await createHandoffTools();

      expect(toolSet.toolsByAgentId.has('disabled-agent')).toBe(false);
    });

    it('should include return-to-coordinator tool', async () => {
      const toolSet = await createHandoffTools();

      expect(toolSet.toolsByName.has('handofftoferni')).toBe(true);
    });

    it('should filter tools for current agent', async () => {
      // When coordinator, should have tools for team members
      const coordinatorTools = await createHandoffTools('ferni');
      expect(coordinatorTools.toolsByAgentId.has('ferni')).toBe(false);
      expect(coordinatorTools.toolsByAgentId.has('peter-john')).toBe(true);

      // When team member, can hand off to any other agent (peer-to-peer)
      const memberTools = await createHandoffTools('peter-john');
      expect(memberTools.toolsByAgentId.has('ferni')).toBe(true);
      // Team members can now hand off to ANY other agent (not just coordinator)
      // They should have tools for all other agents except themselves
      expect(memberTools.toolsByAgentId.has('peter-john')).toBe(false); // Not themselves
      expect(memberTools.tools.length).toBeGreaterThanOrEqual(1);
    });

    it('should cache results', async () => {
      const tools1 = await createHandoffTools();
      const tools2 = await createHandoffTools();

      expect(tools1.generatedAt).toEqual(tools2.generatedAt);
    });
  });

  describe('getHandoffTool', () => {
    it('should return tool by name', async () => {
      const tool = await getHandoffTool('handoffToPeter');

      expect(tool).not.toBeNull();
      expect(tool?.agentId).toBe('peter-john');
    });

    it('should be case insensitive', async () => {
      const tool = await getHandoffTool('HANDOFFTOPETER');

      expect(tool).not.toBeNull();
      expect(tool?.agentId).toBe('peter-john');
    });

    it('should return null for unknown tool', async () => {
      const tool = await getHandoffTool('handoffToUnknown');

      expect(tool).toBeNull();
    });
  });

  describe('getHandoffToolForAgent', () => {
    it('should return tool for agent ID', async () => {
      const tool = await getHandoffToolForAgent('peter-john');

      expect(tool).not.toBeNull();
      expect(tool?.name).toBe('handoffToPeter');
    });
  });

  describe('findHandoffTarget', () => {
    it('should find agent from trigger keywords', async () => {
      const agent = await findHandoffTarget('I need help with stocks research');

      expect(agent).not.toBeNull();
      expect(agent?.id).toBe('peter-john');
    });

    it('should return null for no match', async () => {
      const agent = await findHandoffTarget('random unrelated message');

      expect(agent).toBeNull();
    });

    it('should be case insensitive', async () => {
      const agent = await findHandoffTarget('BUDGET help please');

      expect(agent).not.toBeNull();
      expect(agent?.id).toBe('maya-santos');
    });
  });

  describe('getHandoffToolNames', () => {
    it('should return all tool names', async () => {
      const names = await getHandoffToolNames();

      expect(names).toContain('handoffToPeter');
      expect(names).toContain('handoffToMaya');
      expect(names).toContain('handoffToFerni');
    });

    it('should filter for current agent', async () => {
      const names = await getHandoffToolNames('peter-john');

      // Team members only get coordinator tool
      expect(names).toContain('handoffToFerni');
      expect(names).not.toContain('handoffToPeter');
    });
  });

  describe('isHandoffToolName', () => {
    it('should return true for handoff tools', () => {
      expect(isHandoffToolName('handoffToPeter')).toBe(true);
      expect(isHandoffToolName('HANDOFFTOFERNI')).toBe(true);
    });

    it('should return false for other tools', () => {
      expect(isHandoffToolName('getWeather')).toBe(false);
      expect(isHandoffToolName('createReminder')).toBe(false);
    });
  });

  describe('getAgentNameFromToolName', () => {
    it('should extract agent name', () => {
      expect(getAgentNameFromToolName('handoffToPeter')).toBe('Peter');
      expect(getAgentNameFromToolName('handoffToFerni')).toBe('Ferni');
    });

    it('should return null for non-handoff tools', () => {
      expect(getAgentNameFromToolName('getWeather')).toBeNull();
    });
  });

  describe('cache management', () => {
    it('should clear cache', async () => {
      await createHandoffTools();
      clearHandoffToolCache();

      // Next call should regenerate
      const tools = await createHandoffTools();
      expect(tools.tools.length).toBeGreaterThan(0);
    });
  });
});
