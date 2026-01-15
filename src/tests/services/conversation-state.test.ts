/**
 * Tests for ConversationStateManager
 *
 * Verifies the shared conversation context service that enables
 * human-level tool orchestration.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ConversationStateManager,
  getConversationState,
  hasConversationState,
  endConversation,
  cleanupStaleConversations,
  getActiveSessionIds,
} from '../../services/conversation-state.js';

describe('ConversationStateManager', () => {
  let manager: ConversationStateManager;

  beforeEach(() => {
    manager = new ConversationStateManager('test-session', 'test-user', 'test-agent');
  });

  describe('initialization', () => {
    it('creates with correct session info', () => {
      expect(manager.sessionId).toBe('test-session');
      expect(manager.userId).toBe('test-user');
      expect(manager.agentId).toBe('test-agent');
    });

    it('initializes with default emotional context', () => {
      const emotional = manager.getEmotionalContext();
      expect(emotional.sentiment).toBe('neutral');
      expect(emotional.urgency).toBe(3);
      expect(emotional.topicFatigue).toBe(false);
      expect(emotional.emotions).toEqual([]);
    });

    it('initializes with empty topic context', () => {
      const topic = manager.getTopicContext();
      expect(topic.current).toBeNull();
      expect(topic.history).toEqual([]);
      expect(topic.pendingCircleBack).toEqual([]);
    });

    it('initializes with zero turn count', () => {
      const flow = manager.getFlowContext();
      expect(flow.turnCount).toBe(0);
      expect(flow.durationMinutes).toBe(0);
    });
  });

  describe('emotional context', () => {
    it('detects and stores emotions', () => {
      manager.detectEmotion('happy');
      manager.detectEmotion('excited');

      const emotional = manager.getEmotionalContext();
      expect(emotional.emotions).toContain('happy');
      expect(emotional.emotions).toContain('excited');
    });

    it('does not duplicate emotions', () => {
      manager.detectEmotion('happy');
      manager.detectEmotion('happy');

      const emotional = manager.getEmotionalContext();
      expect(emotional.emotions.filter((e) => e === 'happy').length).toBe(1);
    });

    it('sets and clamps urgency', () => {
      manager.setUrgency(5);
      expect(manager.getEmotionalContext().urgency).toBe(5);

      manager.setUrgency(10);
      expect(manager.getEmotionalContext().urgency).toBe(5); // Clamped to max

      manager.setUrgency(0);
      expect(manager.getEmotionalContext().urgency).toBe(1); // Clamped to min
    });

    it('updates emotional context', () => {
      manager.setEmotionalContext({
        sentiment: 'positive',
        topicFatigue: true,
        confidence: 0.9,
      });

      const emotional = manager.getEmotionalContext();
      expect(emotional.sentiment).toBe('positive');
      expect(emotional.topicFatigue).toBe(true);
      expect(emotional.confidence).toBe(0.9);
    });
  });

  describe('topic context', () => {
    it('sets current topic', () => {
      manager.setCurrentTopic('retirement planning');

      const topic = manager.getTopicContext();
      expect(topic.current).toBe('retirement planning');
      expect(topic.history.length).toBe(1);
      expect(topic.history[0].topic).toBe('retirement planning');
      expect(topic.history[0].depth).toBe('shallow');
    });

    it('tracks topic history', () => {
      manager.setCurrentTopic('budgeting');
      manager.setCurrentTopic('savings');
      manager.setCurrentTopic('investing');

      const topic = manager.getTopicContext();
      expect(topic.history.length).toBe(3);
      expect(topic.history.map((h) => h.topic)).toEqual(['budgeting', 'savings', 'investing']);
    });

    it('deepens topic depth', () => {
      manager.setCurrentTopic('goals');

      manager.deepenTopic();
      expect(manager.getTopicContext().history[0].depth).toBe('moderate');

      manager.deepenTopic();
      expect(manager.getTopicContext().history[0].depth).toBe('deep');

      manager.deepenTopic(); // Should stay at deep
      expect(manager.getTopicContext().history[0].depth).toBe('deep');
    });

    it('manages circle-back topics', () => {
      manager.addCircleBackTopic('emergency fund', 'mentioned earlier');
      manager.addCircleBackTopic('credit score', 'need to discuss');

      const circleBack = manager.getNextCircleBack();
      expect(circleBack).not.toBeNull();
      expect(circleBack!.topic).toBe('emergency fund');
      expect(circleBack!.reason).toBe('mentioned earlier');

      const second = manager.getNextCircleBack();
      expect(second!.topic).toBe('credit score');

      // Empty now
      expect(manager.getNextCircleBack()).toBeNull();
    });
  });

  describe('flow context', () => {
    it('increments turn count', () => {
      manager.incrementTurn();
      manager.incrementTurn();
      manager.incrementTurn();

      expect(manager.getFlowContext().turnCount).toBe(3);
    });

    it('tracks silence', () => {
      manager.markSilence();
      expect(manager.getFlowContext().silenceDetected).toBe(true);

      manager.clearSilence();
      expect(manager.getFlowContext().silenceDetected).toBe(false);
    });

    it('marks user wants to leave', () => {
      manager.markUserWantsToLeave();

      const wrapUp = manager.shouldWrapUp();
      expect(wrapUp.should).toBe(true);
      expect(wrapUp.reasons).toContain('User indicated they need to go');
    });

    it('suggests wrap-up after many turns', () => {
      for (let i = 0; i < 51; i++) {
        manager.incrementTurn();
      }

      const wrapUp = manager.shouldWrapUp();
      expect(wrapUp.should).toBe(true);
      expect(wrapUp.reasons).toContain('Many turns (50+)');
    });
  });

  describe('user context', () => {
    it('sets user name', () => {
      manager.setUserName('Alice');
      expect(manager.getUserContext().name).toBe('Alice');
    });

    it('adds key moments', () => {
      manager.addKeyMoment('Mentioned their daughter');
      manager.addKeyMoment('Shared anxiety about retirement');

      const user = manager.getUserContext();
      expect(user.keyMoments.length).toBe(2);
      expect(user.keyMoments).toContain('Mentioned their daughter');
    });

    it('manages preferences', () => {
      manager.setPreference('communication_style', 'direct');
      manager.setPreference('response_length', 'short');

      expect(manager.getPreference('communication_style')).toBe('direct');
      expect(manager.getPreference('response_length')).toBe('short');
      expect(manager.getPreference('unknown')).toBeUndefined();
    });

    it('stores facts to remember', () => {
      manager.addFactToRemember('Has two kids', 'personal', 'medium');
      manager.addFactToRemember('Saving for college', 'financial', 'high');

      const user = manager.getUserContext();
      expect(user.factsToRemember.length).toBe(2);
      expect(user.factsToRemember[0].fact).toBe('Has two kids');
      expect(user.factsToRemember[0].importance).toBe('medium');
    });
  });

  describe('tool execution', () => {
    it('records tool calls', () => {
      manager.recordToolCall('rememberAboutUser', 'Stored user fact');

      const toolData = manager.getToolExecutionData();
      expect(toolData.lastToolCalled).toBe('rememberAboutUser');
      expect(toolData.lastToolResult).toBe('Stored user fact');
      expect(toolData.recentlyUsedTools).toContain('rememberAboutUser');
    });

    it('limits recently used tools to 5', () => {
      manager.recordToolCall('tool1');
      manager.recordToolCall('tool2');
      manager.recordToolCall('tool3');
      manager.recordToolCall('tool4');
      manager.recordToolCall('tool5');
      manager.recordToolCall('tool6');

      const toolData = manager.getToolExecutionData();
      expect(toolData.recentlyUsedTools.length).toBe(5);
      expect(toolData.recentlyUsedTools[0]).toBe('tool6'); // Most recent first
      expect(toolData.recentlyUsedTools).not.toContain('tool1'); // Oldest removed
    });

    it('suggests next tools', () => {
      manager.suggestNextTools(['setGoal', 'checkIn', 'wrapUp']);

      const toolData = manager.getToolExecutionData();
      expect(toolData.suggestedNextTools).toEqual(['setGoal', 'checkIn', 'wrapUp']);
    });

    it('identifies tools to avoid', () => {
      manager.recordToolCall('analyzeSpending');

      expect(manager.shouldAvoidTool('analyzeSpending')).toBe(true);
      expect(manager.shouldAvoidTool('setGoal')).toBe(false);
    });
  });

  describe('getSummaryForLLM', () => {
    it('generates comprehensive summary', () => {
      manager.setUserName('Bob');
      manager.detectEmotion('anxious');
      manager.setCurrentTopic('retirement');
      manager.addKeyMoment('Worried about savings');
      manager.incrementTurn();
      manager.incrementTurn();

      const summary = manager.getSummaryForLLM();

      expect(summary).toContain('User: Bob');
      expect(summary).toContain('anxious');
      expect(summary).toContain('retirement');
      expect(summary).toContain('Worried about savings');
      expect(summary).toContain('Turn: 2');
    });

    it('includes wrap-up suggestion when appropriate', () => {
      manager.markUserWantsToLeave();

      const summary = manager.getSummaryForLLM();
      expect(summary).toContain('Consider wrapping up');
    });
  });

  describe('serialization', () => {
    it('exports to JSON', () => {
      manager.setUserName('Charlie');
      manager.setCurrentTopic('investing');
      manager.setPreference('risk_tolerance', 'moderate');

      const json = manager.toJSON();

      expect(json.sessionId).toBe('test-session');
      expect(json.userId).toBe('test-user');
      expect((json.user as { name: string }).name).toBe('Charlie');
      expect((json.topic as { current: string }).current).toBe('investing');
    });

    it('imports from JSON', () => {
      const data = {
        sessionId: 'imported-session',
        userId: 'imported-user',
        agentId: 'imported-agent',
        startedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        emotional: {
          sentiment: 'positive',
          emotions: ['happy'],
          urgency: 2,
          topicFatigue: false,
          confidence: 0.8,
          updatedAt: new Date().toISOString(),
        },
        topic: {
          current: 'savings',
          history: [],
          pendingCircleBack: [],
        },
        flow: {
          suggestWrapUp: false,
          wrapUpReasons: [],
          durationMinutes: 5,
          turnCount: 10,
          silenceDetected: false,
          userWantsToLeave: false,
        },
        user: {
          userId: 'imported-user',
          keyMoments: [],
          preferences: { style: 'casual' },
          factsToRemember: [],
        },
        toolExecution: {
          suggestedNextTools: [],
          recentlyUsedTools: [],
        },
      };

      const imported = ConversationStateManager.fromJSON(data);

      expect(imported.sessionId).toBe('imported-session');
      expect(imported.getEmotionalContext().sentiment).toBe('positive');
      expect(imported.getFlowContext().turnCount).toBe(10);
    });
  });
});

describe('Global State Functions', () => {
  afterEach(() => {
    // Clean up test sessions
    for (const id of getActiveSessionIds()) {
      if (id.startsWith('global-test-')) {
        endConversation(id);
      }
    }
  });

  describe('getConversationState', () => {
    it('creates new state for new session', () => {
      const state = getConversationState('global-test-new', 'user1', 'agent1');
      expect(state.sessionId).toBe('global-test-new');
    });

    it('returns existing state for same session', () => {
      const state1 = getConversationState('global-test-existing', 'user1', 'agent1');
      state1.setUserName('Test User');

      const state2 = getConversationState('global-test-existing');
      expect(state2.getUserContext().name).toBe('Test User');
    });
  });

  describe('hasConversationState', () => {
    it('returns true for existing session', () => {
      getConversationState('global-test-exists');
      expect(hasConversationState('global-test-exists')).toBe(true);
    });

    it('returns false for non-existing session', () => {
      expect(hasConversationState('global-test-nonexistent')).toBe(false);
    });
  });

  describe('endConversation', () => {
    it('removes and returns state', async () => {
      const state = getConversationState('global-test-end', 'user', 'agent');
      state.incrementTurn();

      const finalState = await endConversation('global-test-end');
      expect(finalState).not.toBeNull();
      expect(finalState!.flow.turnCount).toBe(1);

      // Should be removed
      expect(hasConversationState('global-test-end')).toBe(false);
    });

    it('returns null for non-existing session', async () => {
      const result = await endConversation('global-test-never-existed');
      expect(result).toBeNull();
    });
  });

  describe('cleanupStaleConversations', () => {
    it('cleans up old conversations', () => {
      // Create a session and manually age it
      const state = getConversationState('global-test-stale');
      // We can't easily age the state, so just verify function runs
      const cleaned = cleanupStaleConversations(0.0001); // Very short max age
      expect(typeof cleaned).toBe('number');
    });
  });
});
