/**
 * Team Handler Registry Integration Tests
 *
 * Tests for the team handler system that enables cross-persona coordination:
 * - Handler registration and discovery
 * - Cross-team request routing
 * - Team coordination flows (Jordan → Maya → Alex)
 *
 * Run with: npx vitest run src/tests/team-handler-registry.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TeamHandlerRegistry,
  type TeamHandlerDefinition,
} from '../tools/index.js';

// ============================================================================
// TEST SETUP
// ============================================================================

describe('Team Handler Registry', () => {
  // Create a fresh registry for each test
  let registry: TeamHandlerRegistry;

  beforeEach(() => {
    registry = new TeamHandlerRegistry();
  });

  // --------------------------------------------------------------------------
  // REGISTRATION TESTS
  // --------------------------------------------------------------------------

  describe('Handler Registration', () => {
    it('should register a team handler', () => {
      const handler: TeamHandlerDefinition = {
        id: 'testHandler',
        name: 'Test Handler',
        description: 'A test handler',
        capability: 'savings-goals',
        execute: async () => ({
          success: true,
          result: { goalId: '123' },
        }),
      };

      registry.registerHandler(handler, 'maya-santos');

      const retrieved = registry.getHandler('testHandler');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('testHandler');
    });

    it('should register multiple handlers for same agent', () => {
      const handler1: TeamHandlerDefinition = {
        id: 'handler1',
        name: 'Handler 1',
        description: 'First handler',
        capability: 'savings-goals',
        execute: async () => ({ success: true }),
      };

      const handler2: TeamHandlerDefinition = {
        id: 'handler2',
        name: 'Handler 2',
        description: 'Second handler',
        capability: 'budgets',
        execute: async () => ({ success: true }),
      };

      registry.registerHandler(handler1, 'maya-santos');
      registry.registerHandler(handler2, 'maya-santos');

      const mayaHandlers = registry.getAgentHandlers('maya-santos');
      expect(mayaHandlers.length).toBe(2);
    });

    it('should register handlers for different agents', () => {
      registry.registerHandler({
        id: 'mayaHandler',
        name: 'Maya Handler',
        description: 'Maya saves',
        capability: 'savings-goals',
        execute: async () => ({ success: true }),
      }, 'maya-santos');

      registry.registerHandler({
        id: 'alexHandler',
        name: 'Alex Handler',
        description: 'Alex schedules',
        capability: 'scheduling',
        execute: async () => ({ success: true }),
      }, 'alex-chen');

      expect(registry.getHandler('mayaHandler')).toBeDefined();
      expect(registry.getHandler('alexHandler')).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // DISCOVERY TESTS
  // --------------------------------------------------------------------------

  describe('Handler Discovery', () => {
    beforeEach(() => {
      // Register some test handlers
      registry.registerHandler({
        id: 'mayaSavings',
        name: 'Maya Savings Handler',
        description: 'Handles savings goals',
        capability: 'savings-goals',
        execute: async () => ({ success: true }),
      }, 'maya-santos');

      registry.registerHandler({
        id: 'alexSchedule',
        name: 'Alex Schedule Handler',
        description: 'Handles scheduling',
        capability: 'scheduling',
        execute: async () => ({ success: true }),
      }, 'alex-chen');

      registry.registerHandler({
        id: 'mayaBudget',
        name: 'Maya Budget Handler',
        description: 'Handles budgets',
        capability: 'budgets',
        execute: async () => ({ success: true }),
      }, 'maya-santos');
    });

    it('should get handler by ID', () => {
      const handler = registry.getHandler('mayaSavings');
      
      expect(handler).toBeDefined();
      expect(handler?.name).toBe('Maya Savings Handler');
    });

    it('should return undefined for non-existent handler', () => {
      const handler = registry.getHandler('nonExistent');
      
      expect(handler).toBeUndefined();
    });

    it('should get all handlers for an agent', () => {
      const mayaHandlers = registry.getAgentHandlers('maya-santos');
      
      expect(mayaHandlers.length).toBe(2);
      expect(mayaHandlers.map(h => h.id)).toContain('mayaSavings');
      expect(mayaHandlers.map(h => h.id)).toContain('mayaBudget');
    });

    it('should get handlers by capability', () => {
      const savingsHandlers = registry.getByCapability('savings-goals');
      
      expect(savingsHandlers.length).toBe(1);
      expect(savingsHandlers[0].id).toBe('mayaSavings');
    });

    it('should get all handlers', () => {
      const allHandlers = registry.getAllHandlers();
      
      expect(allHandlers.length).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // HANDLER EXECUTION TESTS
  // --------------------------------------------------------------------------

  describe('Handler Execution', () => {
    it('should execute a registered handler', async () => {
      const mockResult = { goalId: 'goal123', amount: 1000 };

      registry.registerHandler({
        id: 'executableHandler',
        name: 'Executable Handler',
        description: 'Can be executed',
        capability: 'savings-goals',
        execute: async () => ({
          success: true,
          result: mockResult,
        }),
      }, 'maya-santos');

      const result = await registry.routeRequest(
        'executableHandler',
        {
          toolName: 'createSavingsGoal',
          params: { goalName: 'Vacation', targetAmount: 1000 },
        },
        { fromAgent: 'jordan-taylor' }
      );

      expect(result.success).toBe(true);
      expect(result.result).toEqual(mockResult);
    });

    it('should handle async operations', async () => {
      registry.registerHandler({
        id: 'asyncHandler',
        name: 'Async Handler',
        description: 'Does async work',
        capability: 'scheduling',
        execute: async () => {
          // Simulate async operation
          await new Promise(resolve => setTimeout(resolve, 10));
          return {
            success: true,
            result: { scheduled: true },
          };
        },
      }, 'alex-chen');

      const result = await registry.routeRequest(
        'asyncHandler',
        { toolName: 'schedule', params: { event: 'Meeting' } },
        { fromAgent: 'jordan-taylor' }
      );

      expect(result.success).toBe(true);
      expect(result.result?.scheduled).toBe(true);
    });

    it('should handle execution errors gracefully', async () => {
      registry.registerHandler({
        id: 'failingHandler',
        name: 'Failing Handler',
        description: 'Always fails',
        capability: 'savings-goals',
        execute: async () => ({
          success: false,
          error: 'Something went wrong',
        }),
      }, 'maya-santos');

      const result = await registry.routeRequest(
        'failingHandler',
        { toolName: 'fail', params: {} },
        { fromAgent: 'ferni' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Something went wrong');
    });
  });

  // --------------------------------------------------------------------------
  // REGISTRY STATE TESTS
  // --------------------------------------------------------------------------

  describe('Registry State', () => {
    it('should track initialization state', () => {
      // New registry starts uninitialized
      expect(registry.isInitialized()).toBe(false);
    });

    it('should list agents with registered handlers', () => {
      registry.registerHandler({
        id: 'testHandler',
        name: 'Test',
        description: 'Test handler',
        capability: 'savings-goals',
        execute: async () => ({ success: true }),
      }, 'maya-santos');

      // Check handlers by agent
      const mayaHandlers = registry.getAgentHandlers('maya-santos');
      const alexHandlers = registry.getAgentHandlers('alex-chen');
      
      expect(mayaHandlers.length).toBe(1);
      expect(alexHandlers.length).toBe(0);
    });

    it('should provide registry stats', () => {
      registry.registerHandler({
        id: 'testHandler1',
        name: 'Test 1',
        description: 'Test handler 1',
        capability: 'savings-goals',
        execute: async () => ({ success: true }),
      }, 'maya-santos');

      registry.registerHandler({
        id: 'testHandler2',
        name: 'Test 2',
        description: 'Test handler 2',
        capability: 'scheduling',
        execute: async () => ({ success: true }),
      }, 'alex-chen');

      const stats = registry.getStats();
      expect(stats.totalHandlers).toBe(2);
      expect(stats.byAgent['maya-santos']).toBe(1);
      expect(stats.byAgent['alex-chen']).toBe(1);
    });
  });
});

// ============================================================================
// TEAM COORDINATION FLOW TESTS
// ============================================================================

describe('Team Coordination Flows', () => {
  let registry: TeamHandlerRegistry;

  beforeEach(() => {
    registry = new TeamHandlerRegistry();
  });

  it('should support Jordan to Maya savings flow', async () => {
    // Register Maya's savings handler
    registry.registerHandler({
      id: 'createSavingsGoal',
      name: 'Create Savings Goal',
      description: 'Creates a savings goal for the user',
      capability: 'savings-goals',
      execute: async (request) => {
        const { goalName, targetAmount, deadline } = request.params;
        
        return {
          success: true,
          result: {
            goalId: `goal${Date.now()}`,
            goalName,
            targetAmount,
            deadline,
            monthlyContribution: targetAmount / 12,
          },
        };
      },
    }, 'maya-santos');

    const result = await registry.routeRequest(
      'createSavingsGoal',
      {
        toolName: 'createSavingsGoal',
        params: {
          goalName: 'Wedding Fund',
          targetAmount: 20000,
          deadline: '2025-06-01',
        },
      },
      { fromAgent: 'jordan-taylor' }
    );

    expect(result.success).toBe(true);
    expect(result.result?.goalName).toBe('Wedding Fund');
    expect(result.result?.monthlyContribution).toBeCloseTo(1666.67, 0);
  });

  it('should support Jordan to Alex scheduling flow', async () => {
    // Register Alex's scheduling handler
    registry.registerHandler({
      id: 'scheduleEvent',
      name: 'Schedule Event',
      description: 'Schedules an event for the user',
      capability: 'scheduling',
      execute: async (request) => {
        const { eventName, date, reminders } = request.params;
        
        return {
          success: true,
          result: {
            eventId: `event${Date.now()}`,
            eventName,
            scheduledDate: date,
            remindersSent: reminders?.length || 0,
          },
        };
      },
    }, 'alex-chen');

    const result = await registry.routeRequest(
      'scheduleEvent',
      {
        toolName: 'scheduleEvent',
        params: {
          eventName: 'Wedding Planning Meeting',
          date: '2025-03-15',
          reminders: ['1 week before', '1 day before'],
        },
      },
      { fromAgent: 'jordan-taylor' }
    );

    expect(result.success).toBe(true);
    expect(result.result?.eventName).toBe('Wedding Planning Meeting');
    expect(result.result?.remindersSent).toBe(2);
  });

  it('should support full milestone coordination', async () => {
    const coordinationLog: string[] = [];

    // Register Maya's milestone budget handler
    registry.registerHandler({
      id: 'createMilestoneBudget',
      name: 'Create Milestone Budget',
      description: 'Creates budget for a milestone',
      capability: 'budgets',
      execute: async (request) => {
        coordinationLog.push(`Maya: Budget for ${request.params.milestoneName}`);
        return {
          success: true,
          result: { budgetId: 'budget123', allocated: request.params.budget },
        };
      },
    }, 'maya-santos');

    // Register Alex's milestone reminder handler
    registry.registerHandler({
      id: 'createMilestoneReminders',
      name: 'Create Milestone Reminders',
      description: 'Creates reminders for a milestone',
      capability: 'scheduling',
      execute: async (request) => {
        coordinationLog.push(`Alex: Reminders for ${request.params.milestoneName}`);
        return {
          success: true,
          result: { remindersCreated: 3 },
        };
      },
    }, 'alex-chen');

    const milestoneData = {
      milestoneName: 'Buy a House',
      budget: 50000,
      deadline: '2026-01-01',
    };

    // Step 1: Jordan → Maya (budget)
    const mayaResult = await registry.routeRequest(
      'createMilestoneBudget',
      { toolName: 'createBudget', params: milestoneData },
      { fromAgent: 'jordan-taylor' }
    );

    // Step 2: Jordan → Alex (reminders)
    const alexResult = await registry.routeRequest(
      'createMilestoneReminders',
      { toolName: 'createReminders', params: milestoneData },
      { fromAgent: 'jordan-taylor' }
    );

    // Verify coordination
    expect(mayaResult.success).toBe(true);
    expect(alexResult.success).toBe(true);
    expect(coordinationLog).toContain('Maya: Budget for Buy a House');
    expect(coordinationLog).toContain('Alex: Reminders for Buy a House');
  });
});
