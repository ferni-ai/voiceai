/**
 * Team Handler Registry Tests
 *
 * Unit tests for the team handler registry system.
 *
 * Run with: npx vitest run src/services/team-handler-registry/__tests__/registry.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TeamHandlerRegistry } from '../index.js';
import type { TeamHandlerDefinition, AgentHandlerConfig } from '../types.js';
import type { ToolExecutionRequest, ToolExecutionResult, AgentId } from '../../agent-bus.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMockHandler(
  id: string,
  capability: TeamHandlerDefinition['capability'],
  result: Partial<ToolExecutionResult> = {}
): TeamHandlerDefinition {
  return {
    id,
    name: `Test ${id}`,
    description: `Test handler for ${id}`,
    capability,
    execute: vi.fn().mockResolvedValue({
      success: true,
      result: `Executed ${id}`,
      executedBy: 'test-agent',
      ...result,
    }),
  };
}

function createMockRequest(params: Record<string, unknown> = {}): ToolExecutionRequest {
  return {
    toolName: 'testTool',
    params,
    userId: 'test-user',
    sessionId: 'test-session',
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('TeamHandlerRegistry', () => {
  let registry: TeamHandlerRegistry;

  beforeEach(() => {
    registry = new TeamHandlerRegistry();
  });

  // --------------------------------------------------------------------------
  // Handler Registration
  // --------------------------------------------------------------------------

  describe('Handler Registration', () => {
    it('should register a handler', () => {
      const handler = createMockHandler('testHandler', 'savings-goals');

      registry.registerHandler(handler, 'maya');

      expect(registry.getHandler('testHandler')).toBeDefined();
      expect(registry.getHandler('testHandler')?.id).toBe('testHandler');
    });

    it('should register multiple handlers', () => {
      const handlers = [
        createMockHandler('handler1', 'savings-goals'),
        createMockHandler('handler2', 'budgets'),
        createMockHandler('handler3', 'expense-tracking'),
      ];

      registry.registerHandlers(handlers, 'maya');

      expect(registry.getHandler('handler1')).toBeDefined();
      expect(registry.getHandler('handler2')).toBeDefined();
      expect(registry.getHandler('handler3')).toBeDefined();
    });

    it('should index handler by capability', () => {
      const handler = createMockHandler('savingsHandler', 'savings-goals');

      registry.registerHandler(handler, 'maya');

      const savingsHandlers = registry.getByCapability('savings-goals');
      expect(savingsHandlers).toHaveLength(1);
      expect(savingsHandlers[0].id).toBe('savingsHandler');
    });

    it('should index handler by additional capabilities', () => {
      const handler: TeamHandlerDefinition = {
        ...createMockHandler('multiCapHandler', 'savings-goals'),
        additionalCapabilities: ['financial-status'],
      };

      registry.registerHandler(handler, 'maya');

      expect(registry.getByCapability('savings-goals')).toHaveLength(1);
      expect(registry.getByCapability('financial-status')).toHaveLength(1);
    });

    it('should unregister a handler', () => {
      const handler = createMockHandler('toRemove', 'budgets');
      registry.registerHandler(handler, 'maya');

      expect(registry.getHandler('toRemove')).toBeDefined();

      const removed = registry.unregisterHandler('toRemove', 'maya');

      expect(removed).toBe(true);
      expect(registry.getHandler('toRemove')).toBeUndefined();
    });

    it('should reject invalid handler definitions', () => {
      const invalidHandler = {
        id: '', // Invalid: empty ID
        name: 'Test',
        capability: 'savings-goals',
        execute: vi.fn(),
      } as unknown as TeamHandlerDefinition;

      expect(() => registry.registerHandler(invalidHandler, 'maya')).toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Agent Configuration
  // --------------------------------------------------------------------------

  describe('Agent Configuration', () => {
    it('should configure an agent', () => {
      const config: AgentHandlerConfig = {
        agentId: 'maya',
        displayName: 'Maya Santos',
        capabilities: ['savings-goals', 'budgets'],
        active: true,
      };

      registry.configureAgent(config);

      const retrieved = registry.getAgentConfig('maya');
      expect(retrieved).toBeDefined();
      expect(retrieved?.displayName).toBe('Maya Santos');
      expect(retrieved?.capabilities).toContain('savings-goals');
    });

    it('should activate and deactivate agents', () => {
      registry.configureAgent({
        agentId: 'alex',
        displayName: 'Alex',
        capabilities: ['scheduling'],
        active: true,
      });

      expect(registry.getAgentConfig('alex')?.active).toBe(true);

      registry.deactivateAgent('alex');
      expect(registry.getAgentConfig('alex')?.active).toBe(false);

      registry.activateAgent('alex');
      expect(registry.getAgentConfig('alex')?.active).toBe(true);
    });

    it('should list active agents', () => {
      registry.configureAgent({
        agentId: 'maya',
        displayName: 'Maya',
        capabilities: ['savings-goals'],
        active: true,
      });
      registry.configureAgent({
        agentId: 'alex',
        displayName: 'Alex',
        capabilities: ['scheduling'],
        active: false,
      });
      registry.configureAgent({
        agentId: 'jordan',
        displayName: 'Jordan',
        capabilities: ['milestones'],
        active: true,
      });

      const activeAgents = registry.getActiveAgents();
      expect(activeAgents).toHaveLength(2);
      expect(activeAgents).toContain('maya');
      expect(activeAgents).toContain('jordan');
      expect(activeAgents).not.toContain('alex');
    });
  });

  // --------------------------------------------------------------------------
  // Request Routing
  // --------------------------------------------------------------------------

  describe('Request Routing', () => {
    beforeEach(() => {
      // Set up handlers and agents
      registry.registerHandler(createMockHandler('createGoal', 'savings-goals'), 'maya');
      registry.registerHandler(createMockHandler('scheduleEvent', 'scheduling'), 'alex');

      registry.configureAgent({
        agentId: 'maya',
        displayName: 'Maya',
        capabilities: ['savings-goals'],
        active: true,
      });
      registry.configureAgent({
        agentId: 'alex',
        displayName: 'Alex',
        capabilities: ['scheduling'],
        active: true,
      });
    });

    it('should route request to correct handler', async () => {
      const request = createMockRequest({ name: 'Test Goal', amount: 1000 });

      const result = await registry.routeRequest('createGoal', request, {
        fromAgent: 'jordan',
      });

      expect(result.success).toBe(true);
      expect(result.executedBy).toBe('maya');
    });

    it('should return error for unknown handler', async () => {
      const request = createMockRequest();

      const result = await registry.routeRequest('unknownHandler', request, {
        fromAgent: 'jordan',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Handler not found');
    });

    it('should respect preferred agent', async () => {
      // Register same handler for multiple agents
      registry.registerHandler(createMockHandler('sharedHandler', 'insights'), 'peter-john');
      registry.registerHandler(createMockHandler('sharedHandler', 'insights'), 'nayan-patel');

      registry.configureAgent({
        agentId: 'peter-john',
        displayName: 'Peter',
        capabilities: ['insights'],
        active: true,
      });
      registry.configureAgent({
        agentId: 'nayan-patel',
        displayName: 'Jack',
        capabilities: ['insights'],
        active: true,
      });

      const result = await registry.routeRequest('sharedHandler', createMockRequest(), {
        fromAgent: 'ferni',
        preferredAgent: 'nayan-patel',
      });

      expect(result.executedBy).toBe('nayan-patel');
    });

    it('should skip inactive agents', async () => {
      registry.deactivateAgent('maya');

      const result = await registry.routeRequest('createGoal', createMockRequest(), {
        fromAgent: 'jordan',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No active agent');
    });

    it('should route by capability', async () => {
      const result = await registry.routeByCapability('savings-goals', createMockRequest(), {
        fromAgent: 'jordan',
      });

      expect(result.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Statistics
  // --------------------------------------------------------------------------

  describe('Statistics', () => {
    it('should track handler counts by capability', () => {
      registry.registerHandler(createMockHandler('h1', 'savings-goals'), 'maya');
      registry.registerHandler(createMockHandler('h2', 'savings-goals'), 'maya');
      registry.registerHandler(createMockHandler('h3', 'budgets'), 'maya');

      const stats = registry.getStats();

      expect(stats.totalHandlers).toBe(3);
      expect(stats.byCapability['savings-goals']).toBe(2);
      expect(stats.byCapability['budgets']).toBe(1);
    });

    it('should track handler counts by agent', () => {
      registry.registerHandler(createMockHandler('h1', 'savings-goals'), 'maya');
      registry.registerHandler(createMockHandler('h2', 'budgets'), 'maya');
      registry.registerHandler(createMockHandler('h3', 'scheduling'), 'alex');

      const stats = registry.getStats();

      expect(stats.byAgent['maya']).toBe(2);
      expect(stats.byAgent['alex']).toBe(1);
    });

    it('should track active agent count', () => {
      registry.configureAgent({
        agentId: 'maya',
        displayName: 'Maya',
        capabilities: [],
        active: true,
      });
      registry.configureAgent({
        agentId: 'alex',
        displayName: 'Alex',
        capabilities: [],
        active: false,
      });

      const stats = registry.getStats();
      expect(stats.activeAgents).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  describe('Lifecycle', () => {
    it('should track initialization status', () => {
      expect(registry.isInitialized()).toBe(false);

      registry.markInitialized();

      expect(registry.isInitialized()).toBe(true);
    });

    it('should clear registry', () => {
      registry.registerHandler(createMockHandler('h1', 'savings-goals'), 'maya');
      registry.configureAgent({
        agentId: 'maya',
        displayName: 'Maya',
        capabilities: [],
        active: true,
      });
      registry.markInitialized();

      registry.clear();

      expect(registry.getAllHandlers()).toHaveLength(0);
      expect(registry.getActiveAgents()).toHaveLength(0);
      expect(registry.isInitialized()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Events
  // --------------------------------------------------------------------------

  describe('Events', () => {
    it('should emit handler_registered event', () => {
      const listener = vi.fn();
      registry.on(listener);

      registry.registerHandler(createMockHandler('h1', 'savings-goals'), 'maya');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'handler_registered',
          agentId: 'maya',
        })
      );
    });

    it('should emit agent_activated event', () => {
      registry.configureAgent({
        agentId: 'maya',
        displayName: 'Maya',
        capabilities: [],
        active: false,
      });

      const listener = vi.fn();
      registry.on(listener);

      registry.activateAgent('maya');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agent_activated',
          agentId: 'maya',
        })
      );
    });

    it('should allow unsubscribing from events', () => {
      const listener = vi.fn();
      const unsubscribe = registry.on(listener);

      registry.registerHandler(createMockHandler('h1', 'savings-goals'), 'maya');
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      registry.registerHandler(createMockHandler('h2', 'budgets'), 'maya');
      expect(listener).toHaveBeenCalledTimes(1); // Still 1, not 2
    });
  });
});

// ============================================================================
// HANDLER DEFINITION VALIDATION TESTS
// ============================================================================

describe('Handler Definition Validation', () => {
  it('should validate required fields', async () => {
    const { validateHandlerDefinition } = await import('../types.js');

    const errors = validateHandlerDefinition({});

    expect(errors).toContain('Handler ID is required');
    expect(errors).toContain('Handler name is required');
    expect(errors).toContain('Handler capability is required');
    expect(errors).toContain('Handler execute function is required');
  });

  it('should validate ID format', async () => {
    const { validateHandlerDefinition } = await import('../types.js');

    const errors = validateHandlerDefinition({
      id: '123invalid', // Must start with letter
      name: 'Test',
      capability: 'savings-goals',
      execute: vi.fn(),
    });

    expect(errors).toContain('Handler ID must be alphanumeric and start with a letter');
  });

  it('should validate capability', async () => {
    const { validateHandlerDefinition } = await import('../types.js');

    const errors = validateHandlerDefinition({
      id: 'testHandler',
      name: 'Test',
      capability: 'invalid-capability' as any,
      execute: vi.fn(),
    });

    expect(errors.some((e: string) => e.includes('Invalid capability'))).toBe(true);
  });

  it('should pass valid definition', async () => {
    const { validateHandlerDefinition } = await import('../types.js');

    const errors = validateHandlerDefinition({
      id: 'validHandler',
      name: 'Valid Handler',
      capability: 'savings-goals',
      execute: vi.fn(),
    });

    expect(errors).toHaveLength(0);
  });
});
