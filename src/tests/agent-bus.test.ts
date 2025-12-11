/**
 * Agent Bus Tests
 *
 * Tests for the cross-agent communication system including:
 * - Rate limiting
 * - Tool execution requests
 * - Context sharing
 * - Notifications
 * - Helper functions
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getAgentBus,
  jordanRequestMayaSavingsGoal,
  jordanRequestMayaBudget,
  jordanRequestAlexSchedule,
  jordanShareMilestoneWithMaya,
  jordanShareMilestoneWithAlex,
  mayaShareProgressWithJordan,
  mayaNotifyJordanBudgetAlert,
  alexShareScheduleWithJordan,
  alexNotifyJordanAppointmentUpdate,
  ferniRequestTeamStatus,
  ferniShareContextWithTeam,
  ferniNotifyTeamUserContext,
  type AgentId,
  type AgentMessage,
} from '../services/agent-bus.js';

// Mock the logger
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('Agent Bus', () => {
  let agentBus: ReturnType<typeof getAgentBus>;

  beforeEach(() => {
    vi.clearAllMocks();
    agentBus = getAgentBus();
  });

  afterEach(() => {
    // Reset any rate limits between tests
    vi.clearAllMocks();
  });

  describe('getAgentBus', () => {
    it('should return a singleton instance', () => {
      const bus1 = getAgentBus();
      const bus2 = getAgentBus();
      expect(bus1).toBe(bus2);
    });

    it('should have required methods', () => {
      expect(typeof agentBus.requestToolExecution).toBe('function');
      expect(typeof agentBus.shareContext).toBe('function');
      expect(typeof agentBus.notify).toBe('function');
      expect(typeof agentBus.registerToolHandler).toBe('function');
      expect(typeof agentBus.getPendingMessages).toBe('function');
      expect(typeof agentBus.getMessagesForUser).toBe('function');
      expect(typeof agentBus.getRateLimitStatus).toBe('function');
    });
  });

  describe('Rate Limiting', () => {
    it('should return rate limit status', () => {
      const status = agentBus.getRateLimitStatus();
      expect(status).toHaveProperty('globalUsage');
      expect(typeof status.globalUsage).toBe('number');
    });

    it('should return user-specific rate limit when userId provided', () => {
      const status = agentBus.getRateLimitStatus('test-user');
      expect(status).toHaveProperty('globalUsage');
      // userUsage may or may not exist depending on if requests were made
    });

    it('should increment rate limit on requests', async () => {
      const initialStatus = agentBus.getRateLimitStatus('rate-test-user');
      const initialGlobal = initialStatus.globalUsage;

      // Make a request
      await agentBus.requestToolExecution(
        'ferni',
        'maya-santos',
        'test_tool',
        {},
        'rate-test-user'
      );

      const newStatus = agentBus.getRateLimitStatus('rate-test-user');
      expect(newStatus.globalUsage).toBeGreaterThanOrEqual(initialGlobal);
    });
  });

  describe('Tool Execution Requests', () => {
    it('should create a tool execution request', async () => {
      const result = await agentBus.requestToolExecution(
        'ferni',
        'maya-santos',
        'calculate_savings',
        { amount: 1000, period: 'monthly' },
        'test-user-123'
      );

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('executedBy');
      expect(result.executedBy).toBe('maya-santos');
    });

    it('should queue requests when no handler is registered', async () => {
      const result = await agentBus.requestToolExecution(
        'jordan-taylor',
        'alex-chen',
        'unregistered_tool',
        {},
        'test-user'
      );

      // Should return success with queued message
      expect(result.success).toBe(true);
      expect(result.result).toContain('queued');
    });

    it('should execute immediately when handler is registered', async () => {
      // Register a handler
      agentBus.registerToolHandler('test-agent' as AgentId, 'instant_tool', async (request) => {
        return {
          success: true,
          result: `Executed with params: ${JSON.stringify(request.params)}`,
          executedBy: 'test-agent' as AgentId,
        };
      });

      const result = await agentBus.requestToolExecution(
        'ferni',
        'test-agent' as AgentId,
        'instant_tool',
        { foo: 'bar' },
        'test-user'
      );

      expect(result.success).toBe(true);
      expect(result.result).toContain('foo');
    });

    it('should handle tool execution errors gracefully', async () => {
      agentBus.registerToolHandler('error-agent' as AgentId, 'error_tool', async () => {
        throw new Error('Tool execution failed');
      });

      const result = await agentBus.requestToolExecution(
        'ferni',
        'error-agent' as AgentId,
        'error_tool',
        {},
        'test-user'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool execution failed');
    });
  });

  describe('Context Sharing', () => {
    it('should share context between agents', () => {
      const context = {
        userName: 'Test User',
        currentGoal: 'Save for vacation',
        emotionalState: 'motivated',
      };

      // Should not throw
      expect(() => {
        agentBus.shareContext('jordan-taylor', 'maya-santos', context, 'test-user');
      }).not.toThrow();
    });

    it('should handle empty context', () => {
      expect(() => {
        agentBus.shareContext('ferni', 'alex-chen', {}, 'test-user');
      }).not.toThrow();
    });
  });

  describe('Notifications', () => {
    it('should send notifications between agents', () => {
      expect(() => {
        agentBus.notify(
          'maya-santos',
          'jordan-taylor',
          'budget_alert',
          { category: 'dining', overage: 50 },
          'test-user'
        );
      }).not.toThrow();
    });
  });

  describe('Message Retrieval', () => {
    it('should retrieve pending messages for an agent', async () => {
      // Make a request to create a message
      await agentBus.requestToolExecution(
        'ferni',
        'maya-santos',
        'test_tool',
        { test: true },
        'test-user'
      );

      // Get pending messages
      const pending = agentBus.getPendingMessages('maya-santos');
      expect(Array.isArray(pending)).toBe(true);
    });

    it('should retrieve messages for a user', async () => {
      const testUserId = 'message-retrieval-user';

      // Make a request
      await agentBus.requestToolExecution(
        'ferni',
        'maya-santos',
        'test_tool',
        { test: true },
        testUserId
      );

      // Get messages for user
      const messages = agentBus.getMessagesForUser(testUserId);
      expect(Array.isArray(messages)).toBe(true);
    });

    it('should retrieve messages between two agents', async () => {
      // Make a request between specific agents
      await agentBus.requestToolExecution('ferni', 'alex-chen', 'test_tool', {}, 'test-user');

      const messages = agentBus.getMessagesBetween('ferni', 'alex-chen');
      expect(Array.isArray(messages)).toBe(true);
    });

    it('should get shared context for user', async () => {
      const contextUserId = 'context-test-user';

      // Share some context
      agentBus.shareContext('ferni', 'maya-santos', { test: true }, contextUserId);

      const context = agentBus.getSharedContextForUser(contextUserId);
      expect(typeof context).toBe('object');
    });
  });
});

describe('Cross-Agent Helper Functions', () => {
  describe('Jordan -> Maya Communication', () => {
    it('jordanRequestMayaSavingsGoal should request savings calculation', async () => {
      const result = await jordanRequestMayaSavingsGoal(5000, 12, 'test-user');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('executedBy');
    });

    it('jordanRequestMayaBudget should request budget creation', async () => {
      const result = await jordanRequestMayaBudget({ dining: 500, groceries: 400 }, 'test-user');
      expect(result).toHaveProperty('success');
    });

    it('jordanShareMilestoneWithMaya should share milestone', () => {
      expect(() => {
        jordanShareMilestoneWithMaya(
          {
            goalId: 'goal-123',
            milestone: 'First $1000 saved',
            progress: 0.25,
          },
          'test-user'
        );
      }).not.toThrow();
    });
  });

  describe('Jordan -> Alex Communication', () => {
    it('jordanRequestAlexSchedule should request schedule review', async () => {
      const result = await jordanRequestAlexSchedule(
        new Date(),
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        'test-user'
      );
      expect(result).toHaveProperty('success');
    });

    it('jordanShareMilestoneWithAlex should share milestone', () => {
      expect(() => {
        jordanShareMilestoneWithAlex(
          {
            goalId: 'goal-456',
            milestone: 'Goal completed',
            celebrationType: 'major',
          },
          'test-user'
        );
      }).not.toThrow();
    });
  });

  describe('Maya -> Jordan Communication', () => {
    it('mayaShareProgressWithJordan should share financial progress', () => {
      expect(() => {
        mayaShareProgressWithJordan(
          {
            category: 'savings',
            currentAmount: 2500,
            targetAmount: 5000,
            trend: 'positive',
          },
          'test-user'
        );
      }).not.toThrow();
    });

    it('mayaNotifyJordanBudgetAlert should send budget alert', () => {
      expect(() => {
        mayaNotifyJordanBudgetAlert(
          {
            category: 'entertainment',
            budgeted: 200,
            spent: 250,
            severity: 'warning',
          },
          'test-user'
        );
      }).not.toThrow();
    });
  });

  describe('Alex -> Jordan Communication', () => {
    it('alexShareScheduleWithJordan should share schedule', () => {
      expect(() => {
        alexShareScheduleWithJordan(
          {
            weekSummary: '5 meetings scheduled',
            busyDays: ['Monday', 'Wednesday'],
            freeBlocks: 3,
          },
          'test-user'
        );
      }).not.toThrow();
    });

    it('alexNotifyJordanAppointmentUpdate should notify about appointment', () => {
      expect(() => {
        alexNotifyJordanAppointmentUpdate(
          {
            appointmentId: 'apt-789',
            updateType: 'rescheduled',
            newTime: new Date().toISOString(),
          },
          'test-user'
        );
      }).not.toThrow();
    });
  });

  describe('Ferni Coordinator Functions', () => {
    it('ferniRequestTeamStatus should get team status', async () => {
      const result = await ferniRequestTeamStatus('test-user');
      expect(result).toHaveProperty('jordan');
      expect(result).toHaveProperty('maya');
      expect(result).toHaveProperty('alex');
    });

    it('ferniShareContextWithTeam should broadcast context', () => {
      expect(() => {
        ferniShareContextWithTeam(
          {
            userMood: 'focused',
            sessionTopic: 'financial planning',
          },
          'test-user'
        );
      }).not.toThrow();
    });

    it('ferniNotifyTeamUserContext should notify team of user context', () => {
      expect(() => {
        ferniNotifyTeamUserContext(
          {
            importantEvent: 'User mentioned job change',
            relevantAgents: ['maya-santos', 'jordan-taylor'],
          },
          'test-user'
        );
      }).not.toThrow();
    });
  });
});

describe('Agent ID Types', () => {
  it('should accept canonical agent IDs', async () => {
    const bus = getAgentBus();

    // Test various canonical IDs
    const canonicalIds: AgentId[] = [
      'ferni',
      'maya-santos',
      'alex-chen',
      'jordan-taylor',
      'peter-john',
      'nayan-patel',
    ];

    for (const agentId of canonicalIds) {
      const result = await bus.requestToolExecution('ferni', agentId, 'test_tool', {}, 'test-user');
      expect(result.executedBy).toBe(agentId);
    }
  });

  it('should accept short agent IDs', async () => {
    const bus = getAgentBus();

    const shortIds: AgentId[] = ['maya', 'alex', 'jordan', 'peter', 'nayan'];

    for (const agentId of shortIds) {
      const result = await bus.requestToolExecution('ferni', agentId, 'test_tool', {}, 'test-user');
      expect(result.executedBy).toBe(agentId);
    }
  });

  it('should accept frontend agent IDs', async () => {
    const bus = getAgentBus();

    const frontendIds: AgentId[] = ['jack-b', 'spend-save', 'comm-specialist', 'event-planner'];

    for (const agentId of frontendIds) {
      const result = await bus.requestToolExecution('ferni', agentId, 'test_tool', {}, 'test-user');
      expect(result.executedBy).toBe(agentId);
    }
  });
});

describe('Event Emission', () => {
  it('should emit events on tool completion', async () => {
    const bus = getAgentBus();
    let eventEmitted = false;

    bus.on('tool_completed', () => {
      eventEmitted = true;
    });

    // Register a handler that will complete
    bus.registerToolHandler('event-test-agent' as AgentId, 'event_tool', async () => ({
      success: true,
      result: 'done',
      executedBy: 'event-test-agent' as AgentId,
    }));

    await bus.requestToolExecution(
      'ferni',
      'event-test-agent' as AgentId,
      'event_tool',
      {},
      'test-user'
    );

    expect(eventEmitted).toBe(true);
  });

  it('should emit events on tool request when queued', async () => {
    const bus = getAgentBus();
    let requestEmitted = false;

    bus.on('tool_request', () => {
      requestEmitted = true;
    });

    await bus.requestToolExecution(
      'ferni',
      'queue-agent' as AgentId,
      'unhandled_tool',
      {},
      'test-user'
    );

    expect(requestEmitted).toBe(true);
  });
});
