/**
 * Services Bootstrap Tests
 *
 * Tests for service initialization, session management, and cross-service integration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initializeServices,
  getGlobalServices,
  createSessionServices,
  getSessionServices,
  getActiveSessionIds,
  type SessionServices,
  type GlobalServices,
} from '../services/index.js';

describe('Services Bootstrap', () => {
  afterEach(async () => {
    // Cleanup after each test
    vi.clearAllMocks();
  });

  describe('Global Services Initialization', () => {
    it('should initialize global services successfully', async () => {
      const services = await initializeServices(false); // Skip persona indexing for speed

      expect(services).toBeDefined();
      expect(services.store).toBeDefined();
      expect(services.vectorStore).toBeDefined();
      expect(services.initialized).toBe(true);
    }, 60000); // Extended timeout for services that may attempt cloud connections

    it('should return same instance on subsequent initializations', async () => {
      const services1 = await initializeServices(false);
      const services2 = await getGlobalServices();

      expect(services1).toBe(services2);
    });

    it('should have a memory store', async () => {
      const services = await getGlobalServices();

      expect(services.store).toBeDefined();
      expect(typeof services.store.getProfile).toBe('function');
      expect(typeof services.store.saveProfile).toBe('function');
    });

    it('should have a vector store', async () => {
      const services = await getGlobalServices();

      expect(services.vectorStore).toBeDefined();
      expect(typeof services.vectorStore.addDocument).toBe('function');
      expect(typeof services.vectorStore.search).toBe('function');
    });
  });

  describe('Session Services Creation', () => {
    it('should create session services for new session', async () => {
      const sessionId = 'test-session-1';
      const services = await createSessionServices(sessionId);

      expect(services).toBeDefined();
      expect(services.sessionId).toBe(sessionId);
      expect(services.historyTracker).toBeDefined();
      expect(services.contextManager).toBeDefined();
    });

    it('should create session with user ID', async () => {
      const sessionId = 'test-session-2';
      const userId = 'test-user-1';

      const services = await createSessionServices(sessionId, userId);

      expect(services.userId).toBe(userId);
      expect(services.userProfile).toBeDefined();
    });

    it('should load existing user profile if user ID provided', async () => {
      const userId = 'existing-user';
      const sessionId = 'test-session-3';

      // Create user profile first
      const { createUserProfile } = await import('../types/user-profile.js');
      const profile = createUserProfile(userId, 'Test User');
      const globalServices = await getGlobalServices();
      await globalServices.store.saveProfile(profile);

      // Create session
      const services = await createSessionServices(sessionId, userId);

      expect(services.userProfile).not.toBeNull();
      expect(services.userProfile?.id).toBe(userId);
      expect(services.userProfile?.name).toBe('Test User');
    });

    it('should register session in active sessions', async () => {
      const sessionId = 'test-session-4';
      await createSessionServices(sessionId);

      const activeIds = getActiveSessionIds();
      expect(activeIds).toContain(sessionId);
    });

    it('should retrieve session services by ID', async () => {
      const sessionId = 'test-session-5';
      const created = await createSessionServices(sessionId);

      const retrieved = getSessionServices(sessionId);

      expect(retrieved).toBe(created);
    });
  });

  describe('Session Services Methods', () => {
    let services: SessionServices;

    beforeEach(async () => {
      services = await createSessionServices('method-test-session');
    });

    it('should analyze messages', () => {
      const analysis = services.analyze("I'm worried about my retirement savings");

      expect(analysis).toBeDefined();
      expect(analysis.emotion).toBeDefined();
      expect(analysis.intent).toBeDefined();
      expect(analysis.topics).toBeDefined();
    });

    it('should add conversation turns', () => {
      services.addTurn('user', 'Hello!');
      services.addTurn('assistant', 'Hi there! How can I help you today?');

      const history = services.historyTracker.getSessionHistory();
      expect(history.turns.length).toBeGreaterThanOrEqual(2);
    });

    it('should track user WPM when duration provided', () => {
      // Say 10 words in 5 seconds = 120 WPM
      services.addTurn('user', 'This is a message with about ten words here', 5000);

      // Get speech context to check WPM
      const context = services.getSpeechContext();
      expect(context.userWPM).toBeGreaterThan(0);
    });

    it('should build prompt context', () => {
      const promptContext = services.getPromptContext();

      expect(promptContext).toBeDefined();
      expect(promptContext.phase).toBeDefined();
      expect(promptContext.formattedForPrompt).toBeDefined();
    });

    it('should build speech context', () => {
      const speechContext = services.getSpeechContext('Hello there!');

      expect(speechContext).toBeDefined();
      expect(speechContext.userEmotion).toBeDefined();
    });

    it('should tag text with adaptive SSML', () => {
      const text = 'Hello! How are you today?';
      const tagged = services.tagWithSsml(text);

      expect(tagged).toBeTruthy();
      expect(tagged.length).toBeGreaterThan(text.length); // Should have tags added
    });

    it('should save user profile', async () => {
      const userId = 'profile-save-user';
      const services = await createSessionServices('profile-save-session', userId);

      // Add some interaction
      services.addTurn('user', 'I want to learn about index funds');
      services.addTurn('assistant', 'Great choice! Index funds are...');

      // Save profile
      await services.saveProfile();

      // Verify profile was updated
      const globalServices = await getGlobalServices();
      const profile = await globalServices.store.getProfile(userId);

      expect(profile).not.toBeNull();
      expect(profile?.totalConversations).toBeGreaterThan(0);
    });

    it('should end session and cleanup', async () => {
      const sessionId = 'end-session-test';
      const services = await createSessionServices(sessionId);

      await services.endSession();

      // Verify session was removed from active sessions
      const retrieved = getSessionServices(sessionId);
      expect(retrieved).toBeUndefined();

      const activeIds = getActiveSessionIds();
      expect(activeIds).not.toContain(sessionId);
    });

    it('should search knowledge base', async () => {
      const result = await services.searchKnowledge('index funds');

      // May or may not return results depending on vector store state
      // Just verify method works without throwing
      expect(result !== undefined).toBe(true);
    });
  });

  describe('Session Integration', () => {
    it('should handle multiple concurrent sessions', async () => {
      const session1 = await createSessionServices('concurrent-1');
      const session2 = await createSessionServices('concurrent-2');
      const session3 = await createSessionServices('concurrent-3');

      expect(session1.sessionId).toBe('concurrent-1');
      expect(session2.sessionId).toBe('concurrent-2');
      expect(session3.sessionId).toBe('concurrent-3');

      const activeIds = getActiveSessionIds();
      expect(activeIds.length).toBeGreaterThanOrEqual(3);
    });

    it('should maintain session independence', async () => {
      const session1 = await createSessionServices('independent-1');
      const session2 = await createSessionServices('independent-2');

      session1.addTurn('user', 'Message in session 1');
      session2.addTurn('user', 'Message in session 2');

      const history1 = session1.historyTracker.getSessionHistory();
      const history2 = session2.historyTracker.getSessionHistory();

      expect(history1.sessionId).not.toBe(history2.sessionId);
    });
  });

  describe('Returning User Detection', () => {
    it('should detect returning users', async () => {
      const userId = 'returning-user-test';

      // Create profile with conversation history
      const { createUserProfile } = await import('../types/user-profile.js');
      const profile = createUserProfile(userId, 'Returning User');
      profile.totalConversations = 5;
      profile.lastConversationSummary = 'Discussed retirement planning';

      const globalServices = await getGlobalServices();
      await globalServices.store.saveProfile(profile);

      // Create new session
      const services = await createSessionServices('returning-session', userId, true);

      expect(services.userProfile?.totalConversations).toBe(5);
    });

    it('should handle new users correctly', async () => {
      const userId = 'brand-new-user';
      const services = await createSessionServices('new-user-session', userId, false);

      expect(services.userProfile).not.toBeNull();
      expect(services.userProfile?.totalConversations).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing user gracefully', async () => {
      const services = await createSessionServices('no-user-session');

      expect(services.userProfile).toBeNull();
      expect(services.userId).toBeUndefined();
    });

    it('should not throw when saving profile without user ID', async () => {
      const services = await createSessionServices('anonymous-session');

      await expect(services.saveProfile()).resolves.not.toThrow();
    });

    it('should handle session end without user ID', async () => {
      const services = await createSessionServices('anonymous-end-session');

      await expect(services.endSession()).resolves.not.toThrow();
    });
  });
});
