/**
 * Tests for ToolComposer
 *
 * Verifies the tool composition layer that enables human-level
 * conversation through tool chaining and context sharing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ToolComposer,
  createToolComposer,
  TOOL_CHAINS,
  type ComposedResult,
} from '../../../tools/orchestration/tool-composer.js';
import { endConversation } from '../../../services/conversation-state.js';

describe('ToolComposer', () => {
  let composer: ToolComposer;
  const testSessionId = 'composer-test-session';

  beforeEach(() => {
    composer = createToolComposer(testSessionId, 'test-user', 'test-agent');
  });

  afterEach(() => {
    endConversation(testSessionId);
  });

  describe('initialization', () => {
    it('creates composer with session', () => {
      expect(composer).toBeInstanceOf(ToolComposer);
      expect(composer.getState()).toBeDefined();
      expect(composer.getState().sessionId).toBe(testSessionId);
    });

    it('creates via factory function', () => {
      const factory = createToolComposer('factory-test', 'user', 'agent');
      expect(factory).toBeInstanceOf(ToolComposer);
      endConversation('factory-test');
    });
  });

  describe('context management', () => {
    it('sets and gets context values', () => {
      composer.setContext('goalName', 'Save $1000');
      composer.setContext('targetDate', '2025-12-31');

      expect(composer.getContext<string>('goalName')).toBe('Save $1000');
      expect(composer.getContext<string>('targetDate')).toBe('2025-12-31');
    });

    it('returns undefined for missing context', () => {
      expect(composer.getContext('nonexistent')).toBeUndefined();
    });

    it('clears all context', () => {
      composer.setContext('key1', 'value1');
      composer.setContext('key2', 'value2');

      composer.clearContext();

      expect(composer.getContext('key1')).toBeUndefined();
      expect(composer.getContext('key2')).toBeUndefined();
    });

    it('overwrites existing context values', () => {
      composer.setContext('amount', 100);
      composer.setContext('amount', 200);

      expect(composer.getContext<number>('amount')).toBe(200);
    });
  });

  describe('compose', () => {
    it('composes string result', () => {
      const result = composer.compose('wrapUp', 'Great talking with you!');

      expect(result.result).toBe('Great talking with you!');
      expect(result.speech).toBe('Great talking with you!');
    });

    it('composes object result with speech property', () => {
      const result = composer.compose('setGoal', {
        speech: 'Goal created successfully!',
        goalId: 'goal-123',
        name: 'Emergency Fund',
      });

      expect(result.speech).toBe('Goal created successfully!');
    });

    it('uses JSON for object result without speech', () => {
      const result = composer.compose('analyzeSpending', {
        topCategory: 'Food',
        totalSpend: 500,
      });

      expect(result.speech).toContain('topCategory');
      expect(result.speech).toContain('Food');
    });

    it('detects emotion from tool chain', () => {
      const result = composer.compose('setGoal', { name: 'Save more' });
      expect(result.emotion).toBe('excited');
    });

    it('detects celebratory emotion from content', () => {
      const result = composer.compose('unknown', '🎉 Congratulations on your milestone!');
      expect(result.emotion).toBe('celebratory');
    });

    it('detects happy emotion from content', () => {
      const result = composer.compose('unknown', '✅ Task completed successfully!');
      expect(result.emotion).toBe('happy');
    });

    it('detects concerned emotion from content', () => {
      const result = composer.compose('unknown', '⚠️ Warning: Your spending is high');
      expect(result.emotion).toBe('concerned');
    });

    it('detects empathetic emotion from content', () => {
      const result = composer.compose('unknown', 'I understand this must be difficult');
      expect(result.emotion).toBe('empathetic');
    });

    it('respects override emotion', () => {
      const result = composer.compose('unknown', 'Some neutral text', { emotion: 'celebratory' });
      expect(result.emotion).toBe('celebratory');
    });

    it('suggests next tools from chain', () => {
      const result = composer.compose('rememberAboutUser', { fact: 'Has two kids' });
      expect(result.suggestedNext).toContain('checkIn');
      expect(result.suggestedNext).toContain('setGoal');
    });

    it('extracts facts when requested', () => {
      const result = composer.compose(
        'setGoal',
        { name: 'Save for vacation' },
        { extractFacts: true }
      );

      expect(result.factsToRemember).toBeDefined();
      expect(result.factsToRemember!.length).toBeGreaterThan(0);
      expect(result.factsToRemember![0].fact).toContain('vacation');
    });

    it('extracts habit streak facts', () => {
      const result = composer.compose(
        'logHabit',
        { habitName: 'Exercise', streak: 7 },
        { extractFacts: true }
      );

      expect(result.factsToRemember).toBeDefined();
      expect(result.factsToRemember!.some((f) => f.fact.includes('7-day streak'))).toBe(true);
    });

    it('extracts emotional state facts', () => {
      const result = composer.compose(
        'noteEmotionalState',
        { state: 'anxious', context: 'worried about bills' },
        { extractFacts: true }
      );

      expect(result.factsToRemember).toBeDefined();
      expect(result.factsToRemember!.some((f) => f.category === 'emotional')).toBe(true);
    });

    it('shares context when requested', () => {
      composer.compose(
        'setGoal',
        { goalName: 'Emergency Fund', targetAmount: 5000 },
        { shareContext: true }
      );

      expect(composer.getContext('goalName')).toBe('Emergency Fund');
      expect(composer.getContext('targetAmount')).toBe(5000);
    });

    it('updates conversation state', () => {
      composer.compose('rememberAboutUser', { fact: 'Likes coffee' });

      const toolData = composer.getState().getToolExecutionData();
      expect(toolData.lastToolCalled).toBe('rememberAboutUser');
    });
  });

  describe('conversation helpers', () => {
    it('gets suggested tools', () => {
      composer.compose('setGoal', { name: 'Test' });
      const suggestions = composer.getSuggestedTools();
      expect(Array.isArray(suggestions)).toBe(true);
    });

    it('checks wrap-up status', () => {
      const wrapUp = composer.shouldWrapUp();
      expect(wrapUp).toHaveProperty('should');
      expect(wrapUp).toHaveProperty('reasons');
    });

    it('gets emotional context', () => {
      const emotional = composer.getEmotionalContext();
      expect(emotional).toHaveProperty('sentiment');
      expect(emotional).toHaveProperty('emotions');
      expect(emotional).toHaveProperty('urgency');
    });

    it('gets conversation summary', () => {
      composer.getState().setUserName('Alice');
      const summary = composer.getConversationSummary();
      expect(summary).toContain('Alice');
    });

    it('manages circle-back topics', () => {
      composer.addCircleBack('emergency fund', 'user mentioned earlier');

      const circleBack = composer.getCircleBackTopic();
      expect(circleBack).not.toBeNull();
      expect(circleBack!.topic).toBe('emergency fund');
    });
  });
});

describe('TOOL_CHAINS', () => {
  it('has memory tool chains', () => {
    expect(TOOL_CHAINS.rememberAboutUser).toBeDefined();
    expect(TOOL_CHAINS.recallFromMemory).toBeDefined();
  });

  it('has goal tool chains', () => {
    expect(TOOL_CHAINS.setGoal).toBeDefined();
    expect(TOOL_CHAINS.checkGoalProgress).toBeDefined();
  });

  it('has habit tool chains', () => {
    expect(TOOL_CHAINS.logHabit).toBeDefined();
    expect(TOOL_CHAINS.getHabitStats).toBeDefined();
  });

  it('has financial tool chains', () => {
    expect(TOOL_CHAINS.analyzeSpending).toBeDefined();
    expect(TOOL_CHAINS.checkFinancialHealth).toBeDefined();
  });

  it('has communication tool chains', () => {
    expect(TOOL_CHAINS.draftDifficultMessage).toBeDefined();
    expect(TOOL_CHAINS.sendEmail).toBeDefined();
  });

  it('has celebration chains', () => {
    expect(TOOL_CHAINS.celebrateMilestone).toBeDefined();
    expect(TOOL_CHAINS.awardBadge).toBeDefined();
  });

  it('chains have required properties', () => {
    for (const [name, chain] of Object.entries(TOOL_CHAINS)) {
      expect(chain.primary, `${name} should have primary`).toBe(name);
      expect(chain.suggestedFollowers, `${name} should have suggestedFollowers`).toBeDefined();
      expect(chain.contextKeys, `${name} should have contextKeys`).toBeDefined();
    }
  });

  it('wrapUp chain has no followers', () => {
    expect(TOOL_CHAINS.wrapUp.suggestedFollowers).toEqual([]);
  });
});
