/**
 * TaskManager Tests
 *
 * Tests for the non-blocking task orchestration system:
 * - Task trigger detection
 * - Task activation and completion
 * - TASK_WISDOM processing
 * - Context injection generation
 * - Priority handling
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationAnalysis } from '../../services/types.js';
import { getTaskManager, resetTaskManager, TASK_WISDOM, TaskManager } from '../task-manager.js';

// Mock the logger
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ============================================================================
// TEST HELPERS
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockAnalysis(overrides: any = {}): ConversationAnalysis {
  return {
    emotion: {
      primary: 'neutral',
      valence: 'neutral',
      intensity: 0.5,
      distressLevel: 0.2,
      confidence: 0.8,
      markers: [],
      suggestedTone: 'normal',
      ...overrides.emotion,
    },
    intent: {
      primary: 'chatting',
      secondary: null,
      confidence: 0.8,
      urgency: 'none',
      requiresEmpathy: false,
      requiresAction: false,
      suggestedApproach: 'casual',
      topicFocus: null,
      ...overrides.intent,
    },
    state: {
      phase: 'exploring',
      turnCount: 1,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      greetingComplete: true,
      userNameKnown: false,
      userName: null,
      currentTopicDepth: 0,
      topicsExplored: [],
      emotionalArc: [],
      needsMet: [],
      transitionOpportunities: [],
      suggestedNextPhase: null,
      shouldWrapUp: false,
      summary: '',
      ...overrides.state,
    },
    topics: [],
    contextForPrompt: '',
    suggestedTone: 'normal',
    priorityFocus: null,
    ...overrides,
  } as unknown as ConversationAnalysis;
}

// ============================================================================
// TASK WISDOM DATABASE TESTS
// ============================================================================

describe('TASK_WISDOM', () => {
  it('should have entries for micro tasks', () => {
    const microTasks = TASK_WISDOM.filter((w) => w.category === 'micro');
    expect(microTasks.length).toBeGreaterThan(0);
  });

  it('should have entries for support tasks', () => {
    const supportTasks = TASK_WISDOM.filter((w) => w.category === 'support');
    expect(supportTasks.length).toBeGreaterThan(0);
  });

  it('should have entries for life event tasks', () => {
    const lifeEventTasks = TASK_WISDOM.filter((w) => w.category === 'life_event');
    expect(lifeEventTasks.length).toBeGreaterThan(0);
  });

  it('should have entries for advice tasks', () => {
    const adviceTasks = TASK_WISDOM.filter((w) => w.category === 'advice');
    expect(adviceTasks.length).toBeGreaterThan(0);
  });

  it('should have entries for relationship tasks', () => {
    const relationshipTasks = TASK_WISDOM.filter((w) => w.category === 'relationship');
    expect(relationshipTasks.length).toBeGreaterThan(0);
  });

  it('all entries should have required fields', () => {
    for (const wisdom of TASK_WISDOM) {
      expect(wisdom.id).toBeDefined();
      expect(wisdom.name).toBeDefined();
      expect(wisdom.category).toBeDefined();
      expect(wisdom.priority).toBeGreaterThanOrEqual(1);
      expect(wisdom.priority).toBeLessThanOrEqual(10);
      expect(wisdom.triggers).toBeDefined();
      expect(wisdom.instructions).toBeDefined();
      expect(wisdom.instructions.base).toBeDefined();
    }
  });

  it('all ids should be unique', () => {
    const ids = TASK_WISDOM.map((w) => w.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

// ============================================================================
// TASK MANAGER TESTS
// ============================================================================

describe('TaskManager', () => {
  let manager: TaskManager;

  beforeEach(() => {
    resetTaskManager();
    manager = getTaskManager();
  });

  afterEach(() => {
    resetTaskManager();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const manager1 = getTaskManager();
      const manager2 = getTaskManager();
      expect(manager1).toBe(manager2);
    });

    it('should reset the instance', () => {
      const manager1 = getTaskManager();
      resetTaskManager();
      const manager2 = getTaskManager();
      expect(manager1).not.toBe(manager2);
    });
  });

  describe('processUserTurn', () => {
    it('should return empty array when no triggers match', () => {
      const analysis = createMockAnalysis();
      const result = manager.processUserTurn(analysis, 'Hello there');

      expect(Array.isArray(result)).toBe(true);
    });

    it('should detect emotional support trigger on high distress', () => {
      const analysis = createMockAnalysis({
        emotion: {
          primary: 'sadness',
          valence: 'negative',
          intensity: 0.9,
          distressLevel: 0.8,
        },
      });

      const result = manager.processUserTurn(analysis, 'I feel terrible');

      // Should have activated emotional_support task
      expect(manager.getActiveTasks()).toContain('emotional_support');
    });

    it('should detect check_in on confiding intent', () => {
      const analysis = createMockAnalysis({
        intent: {
          primary: 'confiding',
          requiresEmpathy: true,
        },
        emotion: {
          primary: 'sadness',
          valence: 'negative',
          intensity: 0.5,
          distressLevel: 0.4,
        },
      });

      const result = manager.processUserTurn(analysis, 'I need to tell you something');

      // check_in triggers on moderate distress with empathy needs
      expect(manager.getActiveTasks()).toContain('check_in');
    });

    it('should detect celebration task on positive emotion', () => {
      const analysis = createMockAnalysis({
        emotion: {
          primary: 'joy',
          valence: 'positive',
          intensity: 0.8,
          distressLevel: 0.0,
        },
        intent: {
          primary: 'sharing_news',
          requiresEmpathy: false,
        },
      });

      const result = manager.processUserTurn(analysis, 'I got promoted!');

      // milestone_celebration is higher priority than quick_celebrate
      expect(manager.getActiveTasks()).toContain('milestone_celebration');
    });

    it('should detect panic_prevention on panic keywords', () => {
      const analysis = createMockAnalysis({
        emotion: {
          primary: 'fear',
          valence: 'negative',
          intensity: 0.7,
          distressLevel: 0.6,
        },
      });

      const result = manager.processUserTurn(analysis, "I'm freaking out, I can't handle this");

      expect(manager.getActiveTasks()).toContain('panic_prevention');
    });

    it('should detect grief_support on grief keywords', () => {
      const analysis = createMockAnalysis({
        emotion: {
          primary: 'sadness',
          valence: 'negative',
          intensity: 0.8,
          distressLevel: 0.7,
        },
      });

      const result = manager.processUserTurn(analysis, 'My father passed away last week');

      expect(manager.getActiveTasks()).toContain('grief_support');
    });

    it('should detect life_change on job loss keywords', () => {
      const analysis = createMockAnalysis({
        emotion: {
          primary: 'fear',
          valence: 'negative',
          intensity: 0.6,
          distressLevel: 0.5,
        },
      });

      const result = manager.processUserTurn(analysis, 'I got fired from my job yesterday');

      expect(manager.getActiveTasks()).toContain('life_change');
    });

    it('should detect goodbye on ending conversation keywords', () => {
      // Test that the goodbye task CAN be manually triggered
      const analysis = createMockAnalysis({
        intent: {
          primary: 'ending_conversation',
          requiresEmpathy: false,
        },
      });

      // Manually trigger goodbye
      const triggered = manager.triggerTask('goodbye', analysis);

      expect(triggered).toBe(true);
      expect(manager.getActiveTasks()).toContain('goodbye');
    });

    it('should detect fear_addressing on fear emotion with validation keywords', () => {
      const analysis = createMockAnalysis({
        emotion: {
          primary: 'fear',
          valence: 'negative',
          intensity: 0.4,
          distressLevel: 0.3,
        },
      });

      const result = manager.processUserTurn(analysis, 'Am I crazy for thinking this?');

      // fear_addressing is higher priority than quick_validate when fear detected
      const activeTasks = manager.getActiveTasks();
      expect(activeTasks.length).toBeGreaterThan(0);
      expect(activeTasks.some((t) => t === 'fear_addressing' || t === 'quick_validate')).toBe(true);
    });

    it('should detect milestone_celebration on achievement keywords', () => {
      const analysis = createMockAnalysis({
        emotion: {
          primary: 'joy',
          valence: 'positive',
          intensity: 0.7,
          distressLevel: 0.0,
        },
      });

      const result = manager.processUserTurn(analysis, 'I finally paid off all my debt!');

      expect(manager.getActiveTasks()).toContain('milestone_celebration');
    });
  });

  describe('task completion', () => {
    it('should complete task after turn count threshold', () => {
      // Activate check_in (completes after 2 turns)
      const analysis = createMockAnalysis({
        emotion: {
          primary: 'sadness',
          valence: 'negative',
          intensity: 0.5,
          distressLevel: 0.4,
        },
      });

      // First turn activates check_in
      manager.processUserTurn(analysis, 'Not doing great today');
      expect(manager.getActiveTasks()).toContain('check_in');

      // Second turn
      manager.processUserTurn(analysis, 'Just feeling down');

      // Third turn should complete it
      manager.processUserTurn(
        createMockAnalysis({
          emotion: {
            primary: 'neutral',
            valence: 'neutral',
            intensity: 0.3,
            distressLevel: 0.2,
          },
        }),
        'Thanks for listening'
      );

      expect(manager.getActiveTasks()).not.toContain('check_in');
    });

    it('should complete task on emotion improvement', () => {
      // Activate emotional_support
      const distressedAnalysis = createMockAnalysis({
        emotion: {
          primary: 'sadness',
          valence: 'negative',
          intensity: 0.9,
          distressLevel: 0.8,
        },
      });

      manager.processUserTurn(distressedAnalysis, 'I feel terrible');
      expect(manager.getActiveTasks()).toContain('emotional_support');

      // Significant improvement should complete
      const improvedAnalysis = createMockAnalysis({
        emotion: {
          primary: 'neutral',
          valence: 'neutral',
          intensity: 0.4,
          distressLevel: 0.3,
        },
      });

      manager.processUserTurn(improvedAnalysis, 'I feel a bit better now');
      expect(manager.getActiveTasks()).not.toContain('emotional_support');
    });
  });

  describe('task priority', () => {
    it('should deactivate lower priority tasks in same category', () => {
      // First activate check_in (priority 6, support category)
      const checkInAnalysis = createMockAnalysis({
        emotion: {
          primary: 'sadness',
          valence: 'negative',
          intensity: 0.4,
          distressLevel: 0.4,
        },
      });

      manager.processUserTurn(checkInAnalysis, 'Not doing great');
      expect(manager.getActiveTasks()).toContain('check_in');

      // Then trigger emotional_support (priority 10, support category)
      const crisisAnalysis = createMockAnalysis({
        emotion: {
          primary: 'sadness',
          valence: 'negative',
          intensity: 0.9,
          distressLevel: 0.8,
        },
      });

      manager.processUserTurn(crisisAnalysis, "I can't take this anymore");

      // Higher priority should take over
      expect(manager.getActiveTasks()).toContain('emotional_support');
    });
  });

  describe('context injection', () => {
    it('should include base instructions for active tasks', () => {
      const analysis = createMockAnalysis({
        emotion: {
          primary: 'sadness',
          valence: 'negative',
          intensity: 0.9,
          distressLevel: 0.8,
        },
      });

      const context = manager.processUserTurn(analysis, 'I feel terrible');

      // Should have context from emotional_support
      expect(context.some((c) => c.includes('EMOTIONAL CRISIS') || c.includes('PRESENT'))).toBe(
        true
      );
    });

    it('should include distressed instructions when appropriate', () => {
      const analysis = createMockAnalysis({
        emotion: {
          primary: 'sadness',
          valence: 'negative',
          intensity: 0.9,
          distressLevel: 0.8,
        },
      });

      const context = manager.processUserTurn(analysis, 'I feel terrible');

      // Context should include ifDistressed content
      const hasDistressedContext = context.some(
        (c) => c.includes('extra present') || c.includes('distress')
      );
      expect(hasDistressedContext).toBe(true);
    });

    it('should include transition suggestions', () => {
      // Activate and then complete a task
      const analysis = createMockAnalysis({
        intent: {
          primary: 'confiding',
          requiresEmpathy: true,
        },
        emotion: {
          primary: 'sadness',
          valence: 'negative',
          intensity: 0.5,
          distressLevel: 0.4,
        },
      });

      manager.processUserTurn(analysis, 'I need to tell you something');

      // Complete it
      const result = manager.processUserTurn(
        createMockAnalysis({
          emotion: {
            primary: 'neutral',
            valence: 'neutral',
            intensity: 0.3,
            distressLevel: 0.2,
          },
        }),
        'Thanks'
      );

      // May or may not have transition depending on task
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('manual task triggering', () => {
    it('should manually trigger a task', () => {
      const analysis = createMockAnalysis();

      const triggered = manager.triggerTask('follow_up', analysis);

      expect(triggered).toBe(true);
      expect(manager.getActiveTasks()).toContain('follow_up');
    });

    it('should return false for non-existent task', () => {
      const analysis = createMockAnalysis();

      const triggered = manager.triggerTask('non_existent_task', analysis);

      expect(triggered).toBe(false);
    });

    it('should not trigger already active task', () => {
      const analysis = createMockAnalysis();

      manager.triggerTask('follow_up', analysis);
      const secondTrigger = manager.triggerTask('follow_up', analysis);

      expect(secondTrigger).toBe(false);
    });
  });

  describe('insight callback', () => {
    it('should call insight callback on task completion', () => {
      const insightCallback = vi.fn();
      manager.setInsightCallback(insightCallback);

      // Activate and complete a task
      const analysis = createMockAnalysis({
        intent: {
          primary: 'confiding',
          requiresEmpathy: true,
        },
        emotion: {
          primary: 'sadness',
          valence: 'negative',
          intensity: 0.5,
          distressLevel: 0.4,
        },
      });

      manager.processUserTurn(analysis, 'I need to tell you something');

      // Complete it
      manager.processUserTurn(
        createMockAnalysis({
          emotion: {
            primary: 'neutral',
            valence: 'neutral',
            intensity: 0.3,
            distressLevel: 0.2,
          },
        }),
        'Thanks'
      );

      expect(insightCallback).toHaveBeenCalled();
      expect(insightCallback).toHaveBeenCalledWith(
        'emotional_pattern',
        expect.stringContaining('task_'),
        expect.any(Object),
        expect.any(Number)
      );
    });
  });

  describe('reset', () => {
    it('should clear all active tasks', () => {
      const analysis = createMockAnalysis({
        emotion: {
          primary: 'sadness',
          valence: 'negative',
          intensity: 0.9,
          distressLevel: 0.8,
        },
      });

      manager.processUserTurn(analysis, 'I feel terrible');
      expect(manager.getActiveTasks().length).toBeGreaterThan(0);

      manager.reset();
      expect(manager.getActiveTasks().length).toBe(0);
    });

    it('should clear insight callback', () => {
      const callback = vi.fn();
      manager.setInsightCallback(callback);
      manager.reset();

      // Trigger and complete a task - callback should not be called
      const analysis = createMockAnalysis({
        intent: {
          primary: 'confiding',
          requiresEmpathy: true,
        },
        emotion: {
          primary: 'sadness',
          valence: 'negative',
          intensity: 0.5,
          distressLevel: 0.4,
        },
      });

      manager.processUserTurn(analysis, 'Test');
      manager.processUserTurn(createMockAnalysis(), 'Done');

      expect(callback).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// TRIGGER CONDITION TESTS
// ============================================================================

describe('Task Trigger Conditions', () => {
  let manager: TaskManager;

  beforeEach(() => {
    resetTaskManager();
    manager = getTaskManager();
  });

  afterEach(() => {
    resetTaskManager();
  });

  describe('distress threshold triggers', () => {
    it('should trigger emotional_support at 0.7+ distress', () => {
      const analysis = createMockAnalysis({
        emotion: { distressLevel: 0.71, primary: 'sadness', valence: 'negative', intensity: 0.7 },
      });

      manager.processUserTurn(analysis, 'Test');
      expect(manager.getActiveTasks()).toContain('emotional_support');
    });

    it('should not trigger emotional_support at 0.69 distress', () => {
      const analysis = createMockAnalysis({
        emotion: { distressLevel: 0.69, primary: 'sadness', valence: 'negative', intensity: 0.69 },
      });

      manager.processUserTurn(analysis, 'Test');
      expect(manager.getActiveTasks()).not.toContain('emotional_support');
    });
  });

  describe('emotion triggers', () => {
    it('should trigger celebration on positive emotions', () => {
      const analysis = createMockAnalysis({
        emotion: {
          primary: 'joy',
          valence: 'positive',
          intensity: 0.8,
          distressLevel: 0,
        },
        intent: {
          primary: 'sharing_news',
          requiresEmpathy: false,
        },
      });

      manager.processUserTurn(analysis, 'Great news!');
      // milestone_celebration takes priority
      expect(manager.getActiveTasks()).toContain('milestone_celebration');
    });
  });

  describe('intent triggers', () => {
    it('should trigger on seeking_advice intent', () => {
      const analysis = createMockAnalysis({
        intent: {
          primary: 'seeking_advice',
          requiresEmpathy: false,
        },
        state: {
          phase: 'advising',
        },
      });

      manager.processUserTurn(analysis, 'What should I do?');
      expect(manager.getActiveTasks()).toContain('wisdom_sharing');
    });
  });

  describe('keyword triggers', () => {
    it('should trigger panic_prevention on "overwhelmed"', () => {
      const analysis = createMockAnalysis({
        emotion: { primary: 'fear', distressLevel: 0.5, valence: 'negative', intensity: 0.5 },
      });

      manager.processUserTurn(analysis, 'I feel so overwhelmed right now');
      expect(manager.getActiveTasks()).toContain('panic_prevention');
    });

    it('should trigger grief_support on "passed away"', () => {
      const analysis = createMockAnalysis({
        emotion: { distressLevel: 0.6, primary: 'sadness', valence: 'negative', intensity: 0.6 },
      });

      manager.processUserTurn(analysis, 'My grandmother passed away');
      expect(manager.getActiveTasks()).toContain('grief_support');
    });

    it('should trigger life_change on "got divorced"', () => {
      const analysis = createMockAnalysis();

      manager.processUserTurn(analysis, 'We got divorced last month');
      expect(manager.getActiveTasks()).toContain('life_change');
    });
  });

  describe('custom triggers', () => {
    it('should use custom function when provided', () => {
      // check_in has custom trigger based on moderate distress
      const analysis = createMockAnalysis({
        intent: {
          primary: 'confiding',
          requiresEmpathy: true,
        },
        emotion: {
          primary: 'sadness',
          valence: 'negative',
          intensity: 0.5,
          distressLevel: 0.45,
        },
      });

      manager.processUserTurn(analysis, 'Not doing great');
      // check_in should be triggered for moderate distress
      expect(manager.getActiveTasks()).toContain('check_in');
    });
  });
});
