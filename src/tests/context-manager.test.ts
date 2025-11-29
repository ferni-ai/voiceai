/**
 * Context Manager Tests
 *
 * Tests for conversation context management, prompt injection,
 * and context-aware response generation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getContextManager, removeContextManager, type ContextManager } from '../context/index.js';
import { createUserProfile } from '../types/user-profile.js';

describe('Context Manager', () => {
  let contextManager: ContextManager;
  const sessionId = 'test-context-session';

  beforeEach(() => {
    // Clear any existing context manager
    removeContextManager(sessionId);

    // Create fresh context manager
    const profile = createUserProfile('test-user', 'Alice');
    contextManager = getContextManager(sessionId, profile);
  });

  describe('Initialization', () => {
    it('should create context manager with user profile', () => {
      expect(contextManager).toBeDefined();
    });

    it('should return same instance for same session ID', () => {
      const manager1 = getContextManager(sessionId);
      const manager2 = getContextManager(sessionId);

      expect(manager1).toBe(manager2);
    });

    it('should create context manager without user profile', () => {
      const anonymousManager = getContextManager('anonymous-session');

      expect(anonymousManager).toBeDefined();
    });
  });

  describe('Turn Management', () => {
    it('should add user turn to context', () => {
      contextManager.addTurn({
        role: 'user',
        content: 'Hello, I need help with retirement planning',
        timestamp: new Date(),
      });

      // Turn count should increase
      const turns = contextManager['turns'] || [];
      expect(turns.length).toBe(1);
      expect(turns[0].role).toBe('user');
    });

    it('should add assistant turn to context', () => {
      contextManager.addTurn({
        role: 'assistant',
        content: "Hello! I'd be happy to help you with retirement planning.",
        timestamp: new Date(),
      });

      const turns = contextManager['turns'] || [];
      expect(turns.length).toBe(1);
      expect(turns[0].role).toBe('assistant');
    });

    it('should maintain turn order', () => {
      contextManager.addTurn({
        role: 'user',
        content: 'What is a 401k?',
        timestamp: new Date(),
      });
      contextManager.addTurn({
        role: 'assistant',
        content: 'A 401k is a retirement savings plan...',
        timestamp: new Date(),
      });
      contextManager.addTurn({
        role: 'user',
        content: 'How much should I contribute?',
        timestamp: new Date(),
      });

      const turns = contextManager['turns'] || [];
      expect(turns.length).toBe(3);
      expect(turns[0].role).toBe('user');
      expect(turns[1].role).toBe('assistant');
      expect(turns[2].role).toBe('user');
    });
  });

  describe('Session Cleanup', () => {
    it('should remove context manager when session ends', () => {
      const testSessionId = 'cleanup-test-session';
      const manager1 = getContextManager(testSessionId);

      expect(manager1).toBeDefined();

      removeContextManager(testSessionId);

      const manager2 = getContextManager(testSessionId);
      // After removal, should get a new instance
      expect(manager2).toBeDefined();
      expect(manager2).not.toBe(manager1);
    });
  });

  describe('Multi-Session Isolation', () => {
    it('should keep sessions isolated', () => {
      const session1 = 'isolated-session-1';
      const session2 = 'isolated-session-2';

      const manager1 = getContextManager(session1);
      const manager2 = getContextManager(session2);

      manager1.addTurn({
        role: 'user',
        content: 'Message in session 1',
        timestamp: new Date(),
      });

      manager2.addTurn({
        role: 'user',
        content: 'Message in session 2',
        timestamp: new Date(),
      });

      const turns1 = manager1['turns'] || [];
      const turns2 = manager2['turns'] || [];

      expect(turns1.length).toBe(1);
      expect(turns2.length).toBe(1);
      expect(turns1[0].content).not.toBe(turns2[0].content);
    });
  });
});
