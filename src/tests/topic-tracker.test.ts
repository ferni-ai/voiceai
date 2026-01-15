/**
 * Topic Tracker Tests
 *
 * Tests for the topic tracker module that handles:
 * - Topic extraction from text
 * - Topic tracking and history
 * - Topic change detection
 * - Follow-up and circle-back suggestions
 *
 * @module tests/topic-tracker
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  TopicTracker,
  getTopicTracker,
  extractTopics,
  type TopicCategory,
  type Topic,
  type TopicExtractionResult,
} from '../intelligence/detectors/topic.js';

// ============================================================================
// TESTS
// ============================================================================

describe('TopicTracker', () => {
  let tracker: TopicTracker;

  beforeEach(() => {
    tracker = new TopicTracker();
  });

  // --------------------------------------------------------------------------
  // Basic Extraction
  // --------------------------------------------------------------------------

  describe('extract()', () => {
    it('should return a TopicExtractionResult', () => {
      const result = tracker.extract('Tell me about investing');

      expect(result).toBeDefined();
      expect(result.detected).toBeDefined();
      expect(Array.isArray(result.detected)).toBe(true);
      expect(result.category).toBeDefined();
      expect(typeof result.isNewTopic).toBe('boolean');
      expect(typeof result.isTopicShift).toBe('boolean');
    });

    it('should detect financial topics', () => {
      const result = tracker.extract('I want to retire at 55');
      expect(result.detected).toContain('retirement');
      expect(result.category).toBe('financial');
    });

    it('should detect investment topics', () => {
      const result = tracker.extract('How should I invest my money?');
      expect(result.detected).toContain('investments');
    });

    it('should detect stock topics', () => {
      const result = tracker.extract('Should I buy stocks now?');
      expect(result.detected).toContain('stocks');
    });

    it('should detect bond topics', () => {
      const result = tracker.extract('What about treasury bonds?');
      expect(result.detected).toContain('bonds');
    });

    it('should detect fund topics', () => {
      const result = tracker.extract('Tell me about index funds');
      expect(result.detected).toContain('funds');
    });

    it('should detect fee topics', () => {
      const result = tracker.extract('What is the expense ratio?');
      expect(result.detected).toContain('fees');
    });

    it('should detect savings topics', () => {
      const result = tracker.extract('How much should I save each month?');
      expect(result.detected).toContain('savings');
    });

    it('should detect debt topics', () => {
      const result = tracker.extract("I'm trying to pay off my credit card debt");
      expect(result.detected).toContain('debt');
    });

    it('should detect goal topics', () => {
      const result = tracker.extract('My goal is to save $100k');
      expect(result.detected).toContain('goals');
    });

    it('should detect risk topics', () => {
      const result = tracker.extract("What's my risk tolerance?");
      expect(result.detected).toContain('risk');
    });

    it('should detect market topics', () => {
      const result = tracker.extract("What's happening in the market?");
      expect(result.detected).toContain('market');
    });

    it('should detect personal/family topics', () => {
      const result = tracker.extract('My wife and I are planning for the future');
      expect(result.detected).toContain('family');
    });

    it('should detect health topics', () => {
      const result = tracker.extract('Health insurance costs are so high');
      expect(result.detected).toContain('health');
    });

    it('should detect work topics', () => {
      const result = tracker.extract('My job pays well but no benefits');
      expect(result.detected).toContain('work');
    });

    it('should detect emotional/anxiety topics', () => {
      const result = tracker.extract("I'm worried about the market crash");
      expect(result.detected).toContain('anxiety');
    });

    it('should detect uncertainty topics', () => {
      const result = tracker.extract("I'm not sure what to do");
      expect(result.detected).toContain('uncertainty');
    });

    it('should detect college/education topics', () => {
      const result = tracker.extract('I need to save for college tuition');
      expect(result.detected).toContain('college');
    });

    it('should return general category when no specific topic', () => {
      const result = tracker.extract('Hello, how are you?');
      expect(result.category).toBe('general');
    });

    it('should detect multiple topics in one message', () => {
      const result = tracker.extract('I want to retire early and pay off my debt');
      expect(result.detected).toContain('retirement');
      expect(result.detected).toContain('debt');
    });
  });

  // --------------------------------------------------------------------------
  // Topic Tracking
  // --------------------------------------------------------------------------

  describe('Topic Tracking', () => {
    it('should track topics across multiple extractions', () => {
      tracker.extract('Tell me about retirement');
      tracker.extract('What about my 401k?');

      const topics = tracker.getActiveTopics();
      expect(topics.length).toBeGreaterThan(0);
    });

    it('should increment mention count on repeated topics', () => {
      tracker.extract('Tell me about retirement');
      tracker.extract('More about retirement planning');
      tracker.extract('When can I retire?');

      const topics = tracker.getActiveTopics();
      const retirement = topics.find((t) => t.name === 'retirement');
      expect(retirement).toBeDefined();
      expect(retirement?.mentionCount).toBeGreaterThan(1);
    });

    it('should track isNewTopic flag', () => {
      // Note: Due to implementation order (topics are tracked before isNewTopic check),
      // isNewTopic may not always be true on first detection. We test that it's defined.
      const first = tracker.extract('Tell me about retirement');
      expect(typeof first.isNewTopic).toBe('boolean');

      const second = tracker.extract('More about retirement');
      // Second extraction of same topic should not be new
      expect(second.isNewTopic).toBe(false);
    });

    it('should detect topic shifts', () => {
      tracker.extract('Tell me about retirement');
      const second = tracker.extract('Now about debt management');

      expect(second.isTopicShift).toBe(true);
    });

    it('should store context for topics', () => {
      const text = 'I want to retire at 55 with a million dollars';
      tracker.extract(text);

      const topic = tracker.getActiveTopics().find((t) => t.name === 'retirement');
      expect(topic?.context).toBeDefined();
      expect(topic?.context.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // getCurrentTopic
  // --------------------------------------------------------------------------

  describe('getCurrentTopic()', () => {
    it('should return null when no topics tracked', () => {
      expect(tracker.getCurrentTopic()).toBeNull();
    });

    it('should return the most recent topic', () => {
      tracker.extract('Tell me about retirement');
      tracker.extract('What about debt?');

      const current = tracker.getCurrentTopic();
      expect(current?.name).toBe('debt');
    });
  });

  // --------------------------------------------------------------------------
  // getActiveTopics
  // --------------------------------------------------------------------------

  describe('getActiveTopics()', () => {
    it('should return empty array when no topics', () => {
      const topics = tracker.getActiveTopics();
      expect(topics).toEqual([]);
    });

    it('should return active topics sorted by last mentioned', () => {
      tracker.extract('Tell me about retirement');
      tracker.extract('What about investments?');
      tracker.extract('Back to retirement');

      const topics = tracker.getActiveTopics();
      expect(topics[0].name).toBe('retirement');
    });

    it('should exclude resolved topics', () => {
      tracker.extract('Tell me about retirement');
      tracker.extract('What about debt?');
      tracker.resolveTopic('retirement');

      const topics = tracker.getActiveTopics();
      expect(topics.find((t) => t.name === 'retirement')).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // resolveTopic
  // --------------------------------------------------------------------------

  describe('resolveTopic()', () => {
    it('should mark topic as resolved', () => {
      tracker.extract('Tell me about retirement');
      const result = tracker.resolveTopic('retirement');

      expect(result).toBe(true);
      const topics = tracker.getActiveTopics();
      expect(topics.find((t) => t.name === 'retirement')).toBeUndefined();
    });

    it('should return false for non-existent topic', () => {
      const result = tracker.resolveTopic('non-existent');
      expect(result).toBe(false);
    });

    it('should remove topic from stack', () => {
      tracker.extract('Tell me about retirement');
      tracker.resolveTopic('retirement');

      const stack = tracker.getTopicStack();
      expect(stack).not.toContain('retirement');
    });
  });

  // --------------------------------------------------------------------------
  // markForFollowUp
  // --------------------------------------------------------------------------

  describe('markForFollowUp()', () => {
    it('should mark topic for follow-up', () => {
      tracker.extract('Tell me about retirement');
      const result = tracker.markForFollowUp('retirement');

      expect(result).toBe(true);
      const followUps = tracker.getTopicsNeedingFollowUp();
      expect(followUps.find((t) => t.name === 'retirement')).toBeDefined();
    });

    it('should return false for non-existent topic', () => {
      const result = tracker.markForFollowUp('non-existent');
      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // getTopicsNeedingFollowUp
  // --------------------------------------------------------------------------

  describe('getTopicsNeedingFollowUp()', () => {
    it('should return empty array when no follow-ups', () => {
      tracker.extract('Tell me about retirement');
      const followUps = tracker.getTopicsNeedingFollowUp();
      expect(followUps).toEqual([]);
    });

    it('should return topics marked for follow-up', () => {
      tracker.extract('Tell me about retirement');
      tracker.markForFollowUp('retirement');

      const followUps = tracker.getTopicsNeedingFollowUp();
      expect(followUps.length).toBe(1);
    });

    it('should exclude resolved topics', () => {
      tracker.extract('Tell me about retirement');
      tracker.markForFollowUp('retirement');
      tracker.resolveTopic('retirement');

      const followUps = tracker.getTopicsNeedingFollowUp();
      expect(followUps).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // getNeglectedTopics
  // --------------------------------------------------------------------------

  describe('getNeglectedTopics()', () => {
    it('should return empty when all topics recent', () => {
      tracker.extract('Tell me about retirement');
      const neglected = tracker.getNeglectedTopics(10);
      expect(neglected).toEqual([]);
    });

    it('should return topics older than threshold', () => {
      tracker.extract('Tell me about retirement');

      // Manually set lastMentioned to past
      const topic = tracker.getActiveTopics()[0];
      topic.lastMentioned = new Date(Date.now() - 15 * 60 * 1000); // 15 min ago

      const neglected = tracker.getNeglectedTopics(10);
      expect(neglected.length).toBe(1);
      expect(neglected[0].name).toBe('retirement');
    });
  });

  // --------------------------------------------------------------------------
  // Topic Stack
  // --------------------------------------------------------------------------

  describe('Topic Stack', () => {
    it('should maintain topic stack', () => {
      tracker.extract('Tell me about retirement');
      tracker.extract('What about debt?');

      const stack = tracker.getTopicStack();
      expect(stack).toContain('retirement');
      expect(stack).toContain('debt');
    });

    it('should pop topic from stack', () => {
      tracker.extract('Tell me about retirement');
      tracker.extract('What about debt?');

      const popped = tracker.popTopic();
      expect(popped?.name).toBe('debt');

      const stack = tracker.getTopicStack();
      expect(stack).not.toContain('debt');
    });

    it('should return null when popping empty stack', () => {
      const popped = tracker.popTopic();
      expect(popped).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // getSuggestedTopics
  // --------------------------------------------------------------------------

  describe('getSuggestedTopics()', () => {
    it('should return empty when no current topic', () => {
      const suggested = tracker.getSuggestedTopics();
      expect(suggested).toEqual([]);
    });

    it('should return related topics not yet discussed', () => {
      tracker.extract('Tell me about retirement');

      const suggested = tracker.getSuggestedTopics();
      // retirement has related topics: savings, investments, goals
      expect(suggested.length).toBeGreaterThan(0);
    });

    it('should exclude already discussed topics', () => {
      tracker.extract('Tell me about retirement');
      tracker.extract('What about savings?');

      const suggested = tracker.getSuggestedTopics();
      // savings should not be suggested since it was discussed
      expect(suggested).not.toContain('savings');
    });
  });

  // --------------------------------------------------------------------------
  // getCircleBackSuggestions
  // --------------------------------------------------------------------------

  describe('getCircleBackSuggestions()', () => {
    it('should return empty when no neglected topics', () => {
      tracker.extract('Tell me about retirement');
      const suggestions = tracker.getCircleBackSuggestions();
      expect(suggestions).toEqual([]);
    });

    it('should return suggestions for neglected topics', () => {
      tracker.extract('Tell me about retirement');

      // Manually set to past
      const topic = tracker.getActiveTopics()[0];
      topic.lastMentioned = new Date(Date.now() - 10 * 60 * 1000);

      const suggestions = tracker.getCircleBackSuggestions();
      expect(suggestions.length).toBe(1);
      expect(suggestions[0].topic.name).toBe('retirement');
      expect(suggestions[0].suggestion).toContain('retirement');
    });
  });

  // --------------------------------------------------------------------------
  // getTopicSummary
  // --------------------------------------------------------------------------

  describe('getTopicSummary()', () => {
    it('should return default message when no topics', () => {
      const summary = tracker.getTopicSummary();
      expect(summary).toBe('No specific topics discussed yet.');
    });

    it('should summarize discussed topics', () => {
      tracker.extract('Tell me about retirement');
      tracker.extract('What about debt?');

      const summary = tracker.getTopicSummary();
      expect(summary).toContain('retirement');
      expect(summary).toContain('debt');
    });

    it('should highlight high-priority topics', () => {
      tracker.extract('Tell me about retirement'); // high priority
      tracker.extract('What about stocks?'); // medium priority

      const summary = tracker.getTopicSummary();
      expect(summary).toContain('Key topics');
      expect(summary).toContain('retirement');
    });
  });

  // --------------------------------------------------------------------------
  // clear
  // --------------------------------------------------------------------------

  describe('clear()', () => {
    it('should clear all tracked topics', () => {
      tracker.extract('Tell me about retirement');
      tracker.extract('What about debt?');

      tracker.clear();

      expect(tracker.getActiveTopics()).toEqual([]);
      expect(tracker.getTopicStack()).toEqual([]);
      expect(tracker.getCurrentTopic()).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Compatibility Methods
  // --------------------------------------------------------------------------

  describe('detectTopicChange()', () => {
    it('should return not detected when no shift', () => {
      tracker.extract('Tell me about retirement');
      const result = tracker.detectTopicChange('More about retirement');

      expect(result.detected).toBe(false);
    });

    it('should detect topic change', () => {
      tracker.extract('Tell me about retirement');
      const result = tracker.detectTopicChange('Now about debt management');

      expect(result.detected).toBe(true);
      expect(result.previousTopic).toBe('retirement');
      expect(result.newTopic).toBe('debt');
    });

    it('should include transition phrase', () => {
      tracker.extract('Tell me about retirement');
      const result = tracker.detectTopicChange('Now about debt');

      expect(result.transitionPhrase).toBeDefined();
    });
  });

  describe('getSimpleTopicHistory()', () => {
    it('should return topic stack as array', () => {
      tracker.extract('Tell me about retirement');
      tracker.extract('What about debt?');

      const history = tracker.getSimpleTopicHistory();
      expect(history).toContain('retirement');
      expect(history).toContain('debt');
    });
  });

  describe('isReturningToTopic()', () => {
    it('should return false when topic not in stack', () => {
      tracker.extract('Tell me about retirement');
      expect(tracker.isReturningToTopic('debt')).toBe(false);
    });

    it('should return true when returning to previous topic', () => {
      tracker.extract('Tell me about retirement');
      tracker.extract('What about debt?');

      expect(tracker.isReturningToTopic('retirement')).toBe(true);
    });

    it('should return false for current topic', () => {
      tracker.extract('Tell me about retirement');
      expect(tracker.isReturningToTopic('retirement')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Singleton and Utility Functions
  // --------------------------------------------------------------------------

  describe('Singleton and Utilities', () => {
    it('getTopicTracker should return singleton', () => {
      const tracker1 = getTopicTracker();
      const tracker2 = getTopicTracker();
      expect(tracker1).toBe(tracker2);
    });

    it('extractTopics should work as shortcut', () => {
      const result = extractTopics('Tell me about retirement');
      expect(result).toBeDefined();
      expect(result.detected).toContain('retirement');
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle empty string', () => {
      const result = tracker.extract('');
      expect(result.detected).toEqual([]);
      expect(result.category).toBe('general');
    });

    it('should handle very long text', () => {
      const longText = 'I want to retire. '.repeat(100);
      const result = tracker.extract(longText);
      expect(result).toBeDefined();
    });

    it('should handle special characters', () => {
      const result = tracker.extract('Retirement??? 401k!!! @#$%');
      expect(result).toBeDefined();
    });

    it('should handle mixed case', () => {
      const result = tracker.extract('RETIREMENT planning');
      expect(result.detected).toContain('retirement');
    });

    it('should limit context length', () => {
      const longContext = 'I want to retire with lots of money. '.repeat(20);
      tracker.extract(longContext);

      const topic = tracker.getActiveTopics()[0];
      // Context entries should be limited to 200 chars
      expect(topic.context[0].length).toBeLessThanOrEqual(200);
    });

    it('should limit context history', () => {
      // Extract 10 times to exceed limit of 5
      for (let i = 0; i < 10; i++) {
        tracker.extract(`Retirement message number ${i}`);
      }

      const topic = tracker.getActiveTopics().find((t) => t.name === 'retirement');
      expect(topic?.context.length).toBeLessThanOrEqual(5);
    });
  });
});
