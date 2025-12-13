/**
 * Tests for types/events.ts
 *
 * Tests event factory functions and type guards.
 */

import { describe, it, expect } from 'vitest';
import {
  createBaseEvent,
  createUserEvent,
  createSessionEvent,
  isConversationEvent,
  isRelationshipEvent,
  isToolEvent,
  isSubscriptionEvent,
  isGoalEvent,
  isMemoryEvent,
  isHabitEvent,
  isWellnessEvent,
  isProductivityEvent,
  isLearningEvent,
  isUserEvent,
  isSessionEvent,
  type DomainEvent,
  type ConversationStartedEvent,
  type RelationshipStageChangedEvent,
  type ToolInvokedEvent,
  type SubscriptionChangedEvent,
  type GoalCreatedEvent,
  type MemoryCreatedEvent,
  type HabitCreatedEvent,
  type MoodCheckInEvent,
  type TaskCreatedEvent,
  type LearningSessionEvent,
  type BaseEvent,
  type UserEvent,
  type SessionEvent,
} from '../types/events.js';
import { createUserId, createSessionId, createPersonaId, createToolId } from '../types/branded.js';

// ============================================================================
// EVENT FACTORY TESTS
// ============================================================================

describe('createBaseEvent', () => {
  it('creates event with required fields', () => {
    const event = createBaseEvent('test.event', 'test-service');

    expect(event.id).toBeDefined();
    expect(event.type).toBe('test.event');
    expect(event.source).toBe('test-service');
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(event.version).toBe(1);
  });

  it('generates unique IDs', () => {
    const event1 = createBaseEvent('test.event', 'test-service');
    const event2 = createBaseEvent('test.event', 'test-service');

    expect(event1.id).not.toBe(event2.id);
  });

  it('sets timestamp to current time', () => {
    const before = new Date();
    const event = createBaseEvent('test.event', 'test-service');
    const after = new Date();

    expect(event.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(event.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('handles different event types', () => {
    const conversationEvent = createBaseEvent('conversation.started', 'voice-agent');
    expect(conversationEvent.type).toBe('conversation.started');

    const habitEvent = createBaseEvent('habit.logged', 'habit-service');
    expect(habitEvent.type).toBe('habit.logged');
  });
});

describe('createUserEvent', () => {
  it('creates event with user ID', () => {
    const userId = createUserId('user-123');
    const event = createUserEvent('goal.created', userId, 'goal-service');

    expect(event.id).toBeDefined();
    expect(event.type).toBe('goal.created');
    expect(event.userId).toBe(userId);
    expect(event.source).toBe('goal-service');
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(event.version).toBe(1);
  });

  it('includes all base event fields', () => {
    const userId = createUserId('user-456');
    const event = createUserEvent('subscription.changed', userId, 'billing-service');

    expect(event.id).toBeDefined();
    expect(event.type).toBeDefined();
    expect(event.timestamp).toBeDefined();
    expect(event.source).toBeDefined();
    expect(event.version).toBeDefined();
    expect(event.userId).toBe(userId);
  });
});

describe('createSessionEvent', () => {
  it('creates event with user and session IDs', () => {
    const userId = createUserId('user-789');
    const sessionId = createSessionId('session-abc');
    const event = createSessionEvent('conversation.started', userId, sessionId, 'voice-agent');

    expect(event.id).toBeDefined();
    expect(event.type).toBe('conversation.started');
    expect(event.userId).toBe(userId);
    expect(event.sessionId).toBe(sessionId);
    expect(event.source).toBe('voice-agent');
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(event.version).toBe(1);
  });

  it('includes all base and user event fields', () => {
    const userId = createUserId('user-test');
    const sessionId = createSessionId('session-test');
    const event = createSessionEvent('tool.invoked', userId, sessionId, 'tool-service');

    expect(event.id).toBeDefined();
    expect(event.type).toBeDefined();
    expect(event.timestamp).toBeDefined();
    expect(event.source).toBeDefined();
    expect(event.version).toBeDefined();
    expect(event.userId).toBe(userId);
    expect(event.sessionId).toBe(sessionId);
  });
});

// ============================================================================
// TYPE GUARD TESTS
// ============================================================================

describe('isConversationEvent', () => {
  it('returns true for conversation events', () => {
    const event: ConversationStartedEvent = {
      ...createSessionEvent(
        'conversation.started',
        createUserId('u1'),
        createSessionId('s1'),
        'test'
      ),
      type: 'conversation.started',
      data: {
        personaId: createPersonaId('ferni'),
        deviceType: 'web',
      },
    };

    expect(isConversationEvent(event)).toBe(true);
  });

  it('returns false for non-conversation events', () => {
    const event: HabitCreatedEvent = {
      ...createUserEvent('habit.created', createUserId('u1'), 'test'),
      type: 'habit.created',
      data: {
        habitId: 'h1',
        habitName: 'Morning Workout',
        category: 'health',
        frequency: 'daily',
      },
    };

    expect(isConversationEvent(event)).toBe(false);
  });
});

describe('isRelationshipEvent', () => {
  it('returns true for relationship events', () => {
    const event: RelationshipStageChangedEvent = {
      ...createUserEvent('relationship.stage_changed', createUserId('u1'), 'test'),
      type: 'relationship.stage_changed',
      data: {
        previousStage: 'stranger',
        newStage: 'acquaintance',
        metrics: {
          conversationCount: 5,
          totalMinutesTalked: 30,
          keyMomentsCount: 2,
        },
      },
    };

    expect(isRelationshipEvent(event)).toBe(true);
  });

  it('returns false for non-relationship events', () => {
    const event: GoalCreatedEvent = {
      ...createUserEvent('goal.created', createUserId('u1'), 'test'),
      type: 'goal.created',
      data: {
        goalId: 'g1',
        goalType: 'retirement',
        name: 'Retire at 65',
      },
    };

    expect(isRelationshipEvent(event)).toBe(false);
  });
});

describe('isToolEvent', () => {
  it('returns true for tool events', () => {
    const event: ToolInvokedEvent = {
      ...createSessionEvent('tool.invoked', createUserId('u1'), createSessionId('s1'), 'test'),
      type: 'tool.invoked',
      data: {
        toolId: createToolId('habit-log'),
        domain: 'habits',
        personaId: createPersonaId('maya'),
        parameters: {},
        durationMs: 150,
        success: true,
      },
    };

    expect(isToolEvent(event)).toBe(true);
  });

  it('returns false for non-tool events', () => {
    const event: SubscriptionChangedEvent = {
      ...createUserEvent('subscription.changed', createUserId('u1'), 'test'),
      type: 'subscription.changed',
      data: {
        newTier: 'friend',
        billingFrequency: 'monthly',
        changeType: 'upgrade',
      },
    };

    expect(isToolEvent(event)).toBe(false);
  });
});

describe('isSubscriptionEvent', () => {
  it('returns true for subscription events', () => {
    const event: SubscriptionChangedEvent = {
      ...createUserEvent('subscription.changed', createUserId('u1'), 'test'),
      type: 'subscription.changed',
      data: {
        previousTier: 'free',
        newTier: 'partner',
        billingFrequency: 'annual',
        changeType: 'upgrade',
      },
    };

    expect(isSubscriptionEvent(event)).toBe(true);
  });

  it('returns false for non-subscription events', () => {
    const event: MemoryCreatedEvent = {
      ...createSessionEvent('memory.created', createUserId('u1'), createSessionId('s1'), 'test'),
      type: 'memory.created',
      data: {
        memoryId: 'm1',
        memoryType: 'event',
        content: 'User talked about their dog',
        topics: ['pets'],
        emotionalWeight: 'light',
        personaId: createPersonaId('ferni'),
      },
    };

    expect(isSubscriptionEvent(event)).toBe(false);
  });
});

describe('isGoalEvent', () => {
  it('returns true for goal events', () => {
    const event: GoalCreatedEvent = {
      ...createUserEvent('goal.created', createUserId('u1'), 'test'),
      type: 'goal.created',
      data: {
        goalId: 'g1',
        goalType: 'education',
        name: 'Save for college',
        targetAmount: 50000,
      },
    };

    expect(isGoalEvent(event)).toBe(true);
  });

  it('returns false for non-goal events', () => {
    const event: HabitCreatedEvent = {
      ...createUserEvent('habit.created', createUserId('u1'), 'test'),
      type: 'habit.created',
      data: {
        habitId: 'h1',
        habitName: 'Read',
        category: 'learning',
        frequency: 'daily',
      },
    };

    expect(isGoalEvent(event)).toBe(false);
  });
});

describe('isMemoryEvent', () => {
  it('returns true for memory events', () => {
    const event: MemoryCreatedEvent = {
      ...createSessionEvent('memory.created', createUserId('u1'), createSessionId('s1'), 'test'),
      type: 'memory.created',
      data: {
        memoryId: 'm1',
        memoryType: 'person',
        content: 'User mentioned their sister Sarah',
        topics: ['family'],
        emotionalWeight: 'medium',
        personaId: createPersonaId('ferni'),
      },
    };

    expect(isMemoryEvent(event)).toBe(true);
  });

  it('returns false for non-memory events', () => {
    const event: TaskCreatedEvent = {
      ...createUserEvent('productivity.task_created', createUserId('u1'), 'test'),
      type: 'productivity.task_created',
      data: {
        taskId: 't1',
        title: 'Review budget',
        priority: 'high',
      },
    };

    expect(isMemoryEvent(event)).toBe(false);
  });
});

describe('isHabitEvent', () => {
  it('returns true for habit events', () => {
    const event: HabitCreatedEvent = {
      ...createUserEvent('habit.created', createUserId('u1'), 'test'),
      type: 'habit.created',
      data: {
        habitId: 'h1',
        habitName: 'Meditation',
        category: 'mindfulness',
        frequency: 'daily',
        reminderTime: '07:00',
      },
    };

    expect(isHabitEvent(event)).toBe(true);
  });

  it('returns false for non-habit events', () => {
    const event: MoodCheckInEvent = {
      ...createUserEvent('wellness.mood_checkin', createUserId('u1'), 'test'),
      type: 'wellness.mood_checkin',
      data: {
        mood: 'good',
        energyLevel: 'medium',
        stressLevel: 'low',
      },
    };

    expect(isHabitEvent(event)).toBe(false);
  });
});

describe('isWellnessEvent', () => {
  it('returns true for wellness events', () => {
    const event: MoodCheckInEvent = {
      ...createUserEvent('wellness.mood_checkin', createUserId('u1'), 'test'),
      type: 'wellness.mood_checkin',
      data: {
        mood: 'great',
        energyLevel: 'high',
        stressLevel: 'low',
        triggers: ['good sleep', 'exercise'],
      },
    };

    expect(isWellnessEvent(event)).toBe(true);
  });

  it('returns false for non-wellness events', () => {
    const event: LearningSessionEvent = {
      ...createUserEvent('learning.session', createUserId('u1'), 'test'),
      type: 'learning.session',
      data: {
        topic: 'investing basics',
        source: 'conversation',
        durationMinutes: 15,
      },
    };

    expect(isWellnessEvent(event)).toBe(false);
  });
});

describe('isProductivityEvent', () => {
  it('returns true for productivity events', () => {
    const event: TaskCreatedEvent = {
      ...createUserEvent('productivity.task_created', createUserId('u1'), 'test'),
      type: 'productivity.task_created',
      data: {
        taskId: 't1',
        title: 'Call mom',
        priority: 'medium',
        category: 'personal',
      },
    };

    expect(isProductivityEvent(event)).toBe(true);
  });

  it('returns false for non-productivity events', () => {
    const event: HabitCreatedEvent = {
      ...createUserEvent('habit.created', createUserId('u1'), 'test'),
      type: 'habit.created',
      data: {
        habitId: 'h1',
        habitName: 'Drink water',
        category: 'health',
        frequency: 'daily',
      },
    };

    expect(isProductivityEvent(event)).toBe(false);
  });
});

describe('isLearningEvent', () => {
  it('returns true for learning events', () => {
    const event: LearningSessionEvent = {
      ...createUserEvent('learning.session', createUserId('u1'), 'test'),
      type: 'learning.session',
      data: {
        topic: 'compound interest',
        source: 'conversation',
        durationMinutes: 20,
        keyTakeaways: ['Start early', 'Be consistent'],
        personaId: createPersonaId('ferni'),
      },
    };

    expect(isLearningEvent(event)).toBe(true);
  });

  it('returns false for non-learning events', () => {
    const event: GoalCreatedEvent = {
      ...createUserEvent('goal.created', createUserId('u1'), 'test'),
      type: 'goal.created',
      data: {
        goalId: 'g1',
        goalType: 'travel',
        name: 'Trip to Japan',
      },
    };

    expect(isLearningEvent(event)).toBe(false);
  });
});

describe('isUserEvent', () => {
  it('returns true for events with userId', () => {
    const event: UserEvent = {
      ...createUserEvent('goal.created', createUserId('u1'), 'test'),
      type: 'goal.created',
    };

    expect(isUserEvent(event)).toBe(true);
  });

  it('returns false for base events without userId', () => {
    const event: BaseEvent = {
      ...createBaseEvent('system.error', 'error-service'),
    };

    expect(isUserEvent(event)).toBe(false);
  });
});

describe('isSessionEvent', () => {
  it('returns true for events with userId and sessionId', () => {
    const event: SessionEvent = {
      ...createSessionEvent(
        'conversation.started',
        createUserId('u1'),
        createSessionId('s1'),
        'test'
      ),
      type: 'conversation.started',
    };

    expect(isSessionEvent(event)).toBe(true);
  });

  it('returns false for user events without sessionId', () => {
    const event: UserEvent = {
      ...createUserEvent('goal.created', createUserId('u1'), 'test'),
      type: 'goal.created',
    };

    expect(isSessionEvent(event)).toBe(false);
  });

  it('returns false for base events', () => {
    const event: BaseEvent = {
      ...createBaseEvent('system.error', 'error-service'),
    };

    expect(isSessionEvent(event)).toBe(false);
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Event type guards integration', () => {
  it('mutually exclusive type guards', () => {
    // Create various events and verify only one type guard matches
    const conversationEvent: ConversationStartedEvent = {
      ...createSessionEvent(
        'conversation.started',
        createUserId('u1'),
        createSessionId('s1'),
        'test'
      ),
      type: 'conversation.started',
      data: {
        personaId: createPersonaId('ferni'),
      },
    };

    expect(isConversationEvent(conversationEvent)).toBe(true);
    expect(isRelationshipEvent(conversationEvent)).toBe(false);
    expect(isToolEvent(conversationEvent)).toBe(false);
    expect(isSubscriptionEvent(conversationEvent)).toBe(false);
    expect(isGoalEvent(conversationEvent)).toBe(false);
    expect(isMemoryEvent(conversationEvent)).toBe(false);
    expect(isHabitEvent(conversationEvent)).toBe(false);
    expect(isWellnessEvent(conversationEvent)).toBe(false);
    expect(isProductivityEvent(conversationEvent)).toBe(false);
    expect(isLearningEvent(conversationEvent)).toBe(false);
  });

  it('session events are also user events', () => {
    const sessionEvent: SessionEvent = {
      ...createSessionEvent(
        'conversation.started',
        createUserId('u1'),
        createSessionId('s1'),
        'test'
      ),
      type: 'conversation.started',
    };

    expect(isSessionEvent(sessionEvent)).toBe(true);
    expect(isUserEvent(sessionEvent)).toBe(true);
  });

  it('can filter events by type', () => {
    const events: DomainEvent[] = [
      {
        ...createSessionEvent(
          'conversation.started',
          createUserId('u1'),
          createSessionId('s1'),
          'test'
        ),
        type: 'conversation.started',
        data: { personaId: createPersonaId('ferni') },
      } as ConversationStartedEvent,
      {
        ...createUserEvent('habit.created', createUserId('u1'), 'test'),
        type: 'habit.created',
        data: { habitId: 'h1', habitName: 'Walk', category: 'health', frequency: 'daily' },
      } as HabitCreatedEvent,
      {
        ...createUserEvent('goal.created', createUserId('u1'), 'test'),
        type: 'goal.created',
        data: { goalId: 'g1', goalType: 'retirement', name: 'Retire' },
      } as GoalCreatedEvent,
    ];

    const habitEvents = events.filter(isHabitEvent);
    expect(habitEvents.length).toBe(1);

    const conversationEvents = events.filter(isConversationEvent);
    expect(conversationEvents.length).toBe(1);

    const goalEvents = events.filter(isGoalEvent);
    expect(goalEvents.length).toBe(1);
  });
});
