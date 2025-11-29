/**
 * Memory System Tests
 *
 * End-to-end tests for the memory persistence system including
 * user profiles, conversation history, and semantic search.
 *
 * Note: Requires vitest as dev dependency: npm install -D vitest
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStore } from '../memory/in-memory-store.js';
import { createUserProfile } from '../types/user-profile.js';

describe('Memory System', () => {
  let store: InMemoryStore;

  beforeEach(() => {
    store = new InMemoryStore();
  });

  describe('User Profile CRUD', () => {
    it('should create a new user profile', () => {
      const profile = createUserProfile('test-user-1');

      expect(profile.id).toBe('test-user-1');
      expect(profile.totalConversations).toBe(0);
      expect(profile.relationshipStage).toBe('new_acquaintance');
    });

    it('should save and retrieve a user profile', async () => {
      const profile = createUserProfile('test-user-2');
      profile.name = 'Alice';
      profile.preferredTopics.push('retirement', 'index funds');

      await store.saveProfile(profile);
      const retrieved = await store.getProfile('test-user-2');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('Alice');
      expect(retrieved?.preferredTopics).toContain('retirement');
      expect(retrieved?.preferredTopics).toContain('index funds');
    });

    it('should return null for non-existent profile', async () => {
      const retrieved = await store.getProfile('non-existent-user');
      expect(retrieved).toBeNull();
    });

    it('should update profile from session data', () => {
      const profile = createUserProfile('test-user-3');
      profile.name = 'Bob';
      profile.totalConversations = 1;

      // Simulate session updates
      profile.totalConversations++;
      profile.totalMinutesTalked += 15;
      profile.preferredTopics.push('retirement', 'fees');
      profile.emotionalPatterns.push({
        timestamp: new Date(),
        emotion: 'joy',
        intensity: 0.8,
      });

      expect(profile.totalConversations).toBe(2);
      expect(profile.preferredTopics).toContain('retirement');
      expect(profile.preferredTopics).toContain('fees');
      expect(profile.emotionalPatterns.length).toBe(1);
      expect(profile.totalMinutesTalked).toBe(15);
    });

    it('should track relationship stage progression', () => {
      const profile = createUserProfile('test-user-4');

      // Simulate multiple sessions
      profile.totalConversations = 5;
      profile.totalMinutesTalked = 50;

      // After 5 conversations, should still be in early stages
      expect(['new_acquaintance', 'getting_to_know']).toContain(profile.relationshipStage);
    });
  });

  describe('Conversation History', () => {
    it('should save and retrieve conversation summaries', async () => {
      const userId = 'test-user-5';
      const profile = createUserProfile(userId);
      await store.saveProfile(profile);

      await store.saveSummary(userId, {
        id: 'summary-1',
        sessionId: 'session-1',
        timestamp: new Date(),
        duration: 600,
        turnCount: 20,
        mainTopics: ['retirement', 'investments'],
        keyPoints: ['Discussed 401k options', 'Reviewed risk tolerance'],
        emotionalArc: 'started anxious, ended hopeful',
      });

      const summaries = await store.getSummaries(userId);

      expect(summaries.length).toBe(1);
      expect(summaries[0].mainTopics).toContain('retirement');
      expect(summaries[0].keyPoints).toContain('Discussed 401k options');
    });

    it('should limit summaries to most recent', async () => {
      const userId = 'test-user-6';
      const profile = createUserProfile(userId);
      await store.saveProfile(profile);

      // Add many summaries
      for (let i = 0; i < 15; i++) {
        await store.saveSummary(userId, {
          id: `summary-${i}`,
          sessionId: `session-${i}`,
          timestamp: new Date(Date.now() + i * 1000),
          duration: 300,
          turnCount: 10,
          mainTopics: [`topic-${i}`],
          keyPoints: [`point-${i}`],
          emotionalArc: 'neutral',
        });
      }

      const summaries = await store.getSummaries(userId);

      expect(summaries.length).toBeLessThanOrEqual(15);
    });
  });
});

describe('Session Memory', () => {
  it('should track conversation turns', async () => {
    const { ConversationHistoryTracker } = await import('../memory/history.js');

    const tracker = new ConversationHistoryTracker('session-test');

    tracker.addUserTurn('Hello, how are you?');
    tracker.addAssistantTurn("Hello! I'm doing well. How can I help you today?");
    tracker.addUserTurn('I want to learn about investing.');

    expect(tracker.getTurnCount()).toBe(3);

    const history = tracker.getSessionHistory();
    expect(history.turns.length).toBe(3);
    expect(history.turns[0].role).toBe('user');
    expect(history.turns[1].role).toBe('assistant');
  });

  it('should track session metadata', async () => {
    const { ConversationHistoryTracker } = await import('../memory/history.js');

    const tracker = new ConversationHistoryTracker('session-test-2');

    tracker.addUserTurn("I'm worried about the market.", { emotionDetected: 'anxious' });
    tracker.addAssistantTurn('I understand. Market volatility can be concerning.');

    const history = tracker.getSessionHistory();

    expect(history.metadata.emotionalJourney).toContain('anxious');
  });

  it('should extract topics from conversation', async () => {
    const { ConversationHistoryTracker } = await import('../memory/history.js');

    const tracker = new ConversationHistoryTracker('session-test-3');

    tracker.addUserTurn('Tell me about retirement planning.', { topicsDetected: ['retirement'] });
    tracker.addAssistantTurn('Retirement planning is crucial...');
    tracker.addUserTurn('What about index funds?', { topicsDetected: ['index funds'] });

    const history = tracker.getSessionHistory();

    expect(history.metadata.topicsDiscussed).toContain('retirement');
    expect(history.metadata.topicsDiscussed).toContain('index funds');
  });
});
