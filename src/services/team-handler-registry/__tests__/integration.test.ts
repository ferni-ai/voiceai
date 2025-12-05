/**
 * Integration Tests - Tool Registry + Team Handler Registry
 *
 * Tests the interaction between the tool system and team handler system.
 *
 * Run with: npx vitest run src/services/team-handler-registry/__tests__/integration.test.ts
 */

import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest';
import { TeamHandlerRegistry } from '../index.js';
import type { TeamHandlerDefinition, HandlerCapability } from '../types.js';
import type { AgentId } from '../../agent-bus.js';

// ============================================================================
// MOCK SETUP
// ============================================================================

// Mock the tool registry
vi.mock('../../../tools/registry/index.js', () => ({
  toolRegistry: {
    isInitialized: () => true,
    getByDomain: vi.fn().mockReturnValue([]),
    buildToolSet: vi.fn().mockReturnValue({ tools: {}, stats: { total: 0 } }),
  },
}));

// Mock life data store
vi.mock('../../life-data-store.js', () => ({
  getLifeDataStore: () => ({
    getGoals: vi.fn().mockResolvedValue([
      {
        id: 'goal-1',
        userId: 'test-user',
        title: 'Test Goal',
        category: 'personal',
        status: 'in-progress',
        progressPercent: 50,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]),
    getMilestones: vi.fn().mockResolvedValue([]),
    getMilestoneSavingsGoals: vi.fn().mockResolvedValue([]),
    getMilestoneBudgets: vi.fn().mockResolvedValue([]),
    saveGoal: vi.fn().mockResolvedValue(undefined),
    saveMilestone: vi.fn().mockResolvedValue(undefined),
    saveMilestoneSavingsGoal: vi.fn().mockResolvedValue(undefined),
    saveMilestoneBudget: vi.fn().mockResolvedValue(undefined),
    getCalendarEvents: vi.fn().mockResolvedValue([]),
    saveCalendarEvent: vi.fn().mockResolvedValue(undefined),
    getRecurringCheckIns: vi.fn().mockResolvedValue([]),
    saveRecurringCheckIn: vi.fn().mockResolvedValue(undefined),
    getRetirementPlan: vi.fn().mockResolvedValue(null),
  }),
}));

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createTestHandler(
  id: string,
  capability: HandlerCapability,
  agentId: AgentId
): TeamHandlerDefinition {
  return {
    id,
    name: `Test ${id}`,
    description: `Test handler ${id} for ${capability}`,
    capability,
    execute: vi.fn().mockResolvedValue({
      success: true,
      result: `Executed ${id}`,
      executedBy: agentId,
    }),
  };
}

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Tool + Handler Integration', () => {
  let handlerRegistry: TeamHandlerRegistry;

  beforeEach(() => {
    handlerRegistry = new TeamHandlerRegistry();
  });

  // --------------------------------------------------------------------------
  // Cross-Agent Coordination
  // --------------------------------------------------------------------------

  describe('Cross-Agent Coordination', () => {
    beforeEach(() => {
      // Set up a realistic multi-agent scenario
      // Jordan (Life Planning)
      handlerRegistry.registerHandler(
        createTestHandler('getActiveGoals', 'goals', 'jordan'),
        'jordan'
      );
      handlerRegistry.registerHandler(
        createTestHandler('getMilestoneStatus', 'milestones', 'jordan'),
        'jordan'
      );
      handlerRegistry.configureAgent({
        agentId: 'jordan',
        displayName: 'Jordan',
        capabilities: ['goals', 'milestones', 'retirement'],
        active: true,
      });

      // Maya (Financial)
      handlerRegistry.registerHandler(
        createTestHandler('createSavingsGoal', 'savings-goals', 'maya'),
        'maya'
      );
      handlerRegistry.registerHandler(createTestHandler('createBudget', 'budgets', 'maya'), 'maya');
      handlerRegistry.configureAgent({
        agentId: 'maya',
        displayName: 'Maya',
        capabilities: ['savings-goals', 'budgets', 'expense-tracking'],
        active: true,
      });

      // Alex (Communication)
      handlerRegistry.registerHandler(
        createTestHandler('scheduleEvent', 'scheduling', 'alex'),
        'alex'
      );
      handlerRegistry.configureAgent({
        agentId: 'alex',
        displayName: 'Alex',
        capabilities: ['scheduling', 'reminders', 'notifications'],
        active: true,
      });

      // Ferni (Coordinator)
      handlerRegistry.registerHandler(
        createTestHandler('getTeamStatus', 'team-status', 'ferni'),
        'ferni'
      );
      handlerRegistry.registerHandler(
        createTestHandler('shareContext', 'context-sharing', 'ferni'),
        'ferni'
      );
      handlerRegistry.configureAgent({
        agentId: 'ferni',
        displayName: 'Ferni',
        capabilities: ['team-status', 'context-sharing', 'escalation'],
        active: true,
      });
    });

    it('should route requests to correct specialist agent', async () => {
      // Jordan requests savings goal creation from Maya
      const result = await handlerRegistry.routeRequest(
        'createSavingsGoal',
        {
          toolName: 'createSavingsGoal',
          params: { name: 'Wedding Fund', targetAmount: 20000 },
          userId: 'test-user',
        },
        { fromAgent: 'jordan' }
      );

      expect(result.success).toBe(true);
      expect(result.executedBy).toBe('maya');
    });

    it('should route by capability when handler is unknown', async () => {
      const result = await handlerRegistry.routeByCapability(
        'scheduling',
        {
          toolName: 'schedule',
          params: { title: 'Meeting', date: '2025-01-15' },
          userId: 'test-user',
        },
        { fromAgent: 'jordan' }
      );

      expect(result.success).toBe(true);
      expect(result.executedBy).toBe('alex');
    });

    it('should allow Ferni to coordinate across agents', async () => {
      // Ferni gets team status
      const statusResult = await handlerRegistry.routeRequest(
        'getTeamStatus',
        { toolName: 'getTeamStatus', params: {}, userId: 'test-user' },
        { fromAgent: 'ferni' }
      );

      expect(statusResult.success).toBe(true);
      expect(statusResult.executedBy).toBe('ferni');
    });

    it('should maintain isolation between agent domains', async () => {
      // Jordan shouldn't directly handle financial requests
      const jordanHandlers = handlerRegistry.getAgentHandlers('jordan');
      const hasSavingsHandler = jordanHandlers.some((h) => h.capability === 'savings-goals');

      expect(hasSavingsHandler).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Multi-Step Workflows
  // --------------------------------------------------------------------------

  describe('Multi-Step Workflows', () => {
    beforeEach(() => {
      // Set up handlers for workflow testing
      handlerRegistry.registerHandler(
        createTestHandler('createLifeGoal', 'goals', 'jordan'),
        'jordan'
      );
      handlerRegistry.registerHandler(
        createTestHandler('linkSavingsToMilestone', 'milestones', 'jordan'),
        'jordan'
      );
      handlerRegistry.registerHandler(
        createTestHandler('createSavingsGoal', 'savings-goals', 'maya'),
        'maya'
      );
      handlerRegistry.registerHandler(
        createTestHandler('scheduleEvent', 'scheduling', 'alex'),
        'alex'
      );

      for (const agentId of ['jordan', 'maya', 'alex'] as AgentId[]) {
        handlerRegistry.configureAgent({
          agentId,
          displayName: agentId,
          capabilities: [],
          active: true,
        });
      }
    });

    it('should support sequential workflow steps', async () => {
      // Step 1: Jordan creates a goal
      const goalResult = await handlerRegistry.routeRequest(
        'createLifeGoal',
        {
          toolName: 'createLifeGoal',
          params: { title: 'Buy a House', category: 'financial' },
          userId: 'test-user',
        },
        { fromAgent: 'ferni' }
      );
      expect(goalResult.success).toBe(true);

      // Step 2: Jordan links savings to milestone
      const linkResult = await handlerRegistry.routeRequest(
        'linkSavingsToMilestone',
        {
          toolName: 'linkSavingsToMilestone',
          params: { milestoneId: 'milestone-1', targetAmount: 50000 },
          userId: 'test-user',
        },
        { fromAgent: 'ferni' }
      );
      expect(linkResult.success).toBe(true);

      // Step 3: Maya creates the linked savings goal
      const savingsResult = await handlerRegistry.routeRequest(
        'createSavingsGoal',
        {
          toolName: 'createSavingsGoal',
          params: { name: 'House Down Payment', targetAmount: 50000 },
          userId: 'test-user',
        },
        { fromAgent: 'jordan' }
      );
      expect(savingsResult.success).toBe(true);

      // Step 4: Alex schedules a check-in
      const scheduleResult = await handlerRegistry.routeRequest(
        'scheduleEvent',
        {
          toolName: 'scheduleEvent',
          params: { title: 'House Savings Check-in', date: '2025-06-01' },
          userId: 'test-user',
        },
        { fromAgent: 'jordan' }
      );
      expect(scheduleResult.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Agent Availability
  // --------------------------------------------------------------------------

  describe('Agent Availability', () => {
    beforeEach(() => {
      handlerRegistry.registerHandler(
        createTestHandler('createSavingsGoal', 'savings-goals', 'maya'),
        'maya'
      );
      handlerRegistry.configureAgent({
        agentId: 'maya',
        displayName: 'Maya',
        capabilities: ['savings-goals'],
        active: true,
      });
    });

    it('should fail gracefully when agent is deactivated', async () => {
      handlerRegistry.deactivateAgent('maya');

      const result = await handlerRegistry.routeRequest(
        'createSavingsGoal',
        { toolName: 'createSavingsGoal', params: {}, userId: 'test-user' },
        { fromAgent: 'jordan' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No active agent');
    });

    it('should route to fallback agent when preferred is unavailable', async () => {
      // Add a backup agent with same capability
      handlerRegistry.registerHandler(
        createTestHandler('createSavingsGoal', 'savings-goals', 'ferni'),
        'ferni'
      );
      handlerRegistry.configureAgent({
        agentId: 'ferni',
        displayName: 'Ferni',
        capabilities: ['savings-goals'],
        active: true,
      });

      // Deactivate primary agent
      handlerRegistry.deactivateAgent('maya');

      const result = await handlerRegistry.routeRequest(
        'createSavingsGoal',
        { toolName: 'createSavingsGoal', params: {}, userId: 'test-user' },
        { fromAgent: 'jordan', preferredAgent: 'maya' }
      );

      // Should fall back to ferni
      expect(result.success).toBe(true);
      expect(result.executedBy).toBe('ferni');
    });
  });

  // --------------------------------------------------------------------------
  // Statistics and Monitoring
  // --------------------------------------------------------------------------

  describe('Statistics and Monitoring', () => {
    beforeEach(() => {
      // Register handlers across multiple agents
      const agents: Array<{ id: AgentId; capabilities: HandlerCapability[] }> = [
        { id: 'maya', capabilities: ['savings-goals', 'budgets'] },
        { id: 'alex', capabilities: ['scheduling', 'reminders'] },
        { id: 'jordan', capabilities: ['goals', 'milestones'] },
      ];

      let handlerCounter = 1;
      for (const agent of agents) {
        for (const cap of agent.capabilities) {
          handlerRegistry.registerHandler(
            createTestHandler(`handler${handlerCounter++}`, cap, agent.id),
            agent.id
          );
        }
        handlerRegistry.configureAgent({
          agentId: agent.id,
          displayName: agent.id,
          capabilities: agent.capabilities,
          active: true,
        });
      }
    });

    it('should track handler counts by agent', () => {
      const stats = handlerRegistry.getStats();

      expect(stats.byAgent['maya']).toBe(2);
      expect(stats.byAgent['alex']).toBe(2);
      expect(stats.byAgent['jordan']).toBe(2);
      expect(stats.totalHandlers).toBe(6);
    });

    it('should track handler counts by capability', () => {
      const stats = handlerRegistry.getStats();

      expect(stats.byCapability['savings-goals']).toBe(1);
      expect(stats.byCapability['budgets']).toBe(1);
      expect(stats.byCapability['scheduling']).toBe(1);
    });

    it('should track active agent count', () => {
      const stats = handlerRegistry.getStats();
      expect(stats.activeAgents).toBe(3);

      handlerRegistry.deactivateAgent('maya');
      const updatedStats = handlerRegistry.getStats();
      expect(updatedStats.activeAgents).toBe(2);
    });
  });
});

// ============================================================================
// HANDLER REGISTRATION TESTS
// ============================================================================

describe('Handler Registration Flow', () => {
  it('should register all handlers via registerAllHandlers', async () => {
    const { registerAllHandlers, HANDLER_COUNTS } = await import('../handlers/index.js');
    const { teamHandlerRegistry } = await import('../index.js');

    // Clear any existing handlers
    teamHandlerRegistry.clear();

    const result = await registerAllHandlers();

    expect(result.registered).toBe(HANDLER_COUNTS.total);
    expect(result.agents).toHaveLength(5);
    expect(result.agents).toContain('ferni');
    expect(result.agents).toContain('maya');
    expect(result.agents).toContain('alex');
    expect(result.agents).toContain('jordan');
    expect(result.agents).toContain('peter-john');
  });
});
