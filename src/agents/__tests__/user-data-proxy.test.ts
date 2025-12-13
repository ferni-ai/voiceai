/**
 * UserData Proxy Tests
 *
 * Tests for the Proxy-based UserData implementation that delegates
 * to SessionStateManager as the single source of truth.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createUserDataProxy,
  isUserDataProxy,
  getStateManager,
  type UserData,
} from '../session/user-data-proxy.js';
import { createSessionStateManager, type SessionStateManager } from '../session/session-state.js';

describe('UserData Proxy', () => {
  let stateManager: SessionStateManager;
  let userData: UserData;

  beforeEach(() => {
    stateManager = createSessionStateManager('test-session', 'ferni', {
      userId: 'user-123',
      userName: 'Test User',
      isReturningUser: false,
      identificationSource: 'metadata',
    });
    userData = createUserDataProxy(stateManager, {
      services: {} as never,
      isTrialUser: false,
      isFirstConversation: true,
    });
  });

  describe('Proxy Detection', () => {
    it('should detect proxy via isUserDataProxy', () => {
      expect(isUserDataProxy(userData)).toBe(true);
    });

    it('should not detect plain object as proxy', () => {
      const plainObject = { name: 'test' } as UserData;
      expect(isUserDataProxy(plainObject)).toBe(false);
    });

    it('should retrieve state manager via getStateManager', () => {
      const manager = getStateManager(userData);
      expect(manager).toBe(stateManager);
    });

    it('should expose state manager via __stateManager', () => {
      expect(userData.__stateManager).toBe(stateManager);
    });
  });

  describe('Identity Fields (delegated to SessionStateManager)', () => {
    it('should read name from state manager', () => {
      expect(userData.name).toBe('Test User');
    });

    it('should write name to state manager', () => {
      userData.name = 'New Name';
      expect(stateManager.getUserName()).toBe('New Name');
    });

    it('should read userId from state manager', () => {
      expect(userData.userId).toBe('user-123');
    });

    it('should read isReturningUser from state manager', () => {
      expect(userData.isReturningUser).toBe(false);
    });

    it('should write isReturningUser to state manager', () => {
      userData.isReturningUser = true;
      expect(stateManager.isReturningUser()).toBe(true);
    });
  });

  describe('Conversation Tracking (delegated to SessionStateManager)', () => {
    it('should read turnCount from state manager', () => {
      expect(userData.turnCount).toBe(0);
    });

    it('should increment turnCount in state manager', () => {
      stateManager.incrementTurn();
      stateManager.incrementTurn();
      expect(userData.turnCount).toBe(2);
    });

    it('should read/write lastTopic via state manager', () => {
      userData.lastTopic = 'career';
      expect(stateManager.getState().conversation.lastTopic).toBe('career');
      expect(userData.lastTopic).toBe('career');
    });

    it('should track recentTopics', () => {
      stateManager.setTopic('career');
      stateManager.setTopic('family');
      expect(userData.recentTopics).toContain('career');
      expect(userData.recentTopics).toContain('family');
    });

    it('should read/write lastUserMessage', () => {
      userData.lastUserMessage = 'Hello there';
      expect(stateManager.getState().conversation.lastUserMessage).toBe('Hello there');
    });

    it('should read/write lastAgentResponse', () => {
      userData.lastAgentResponse = 'Hi! How can I help?';
      expect(stateManager.getState().conversation.lastAgentResponse).toBe('Hi! How can I help?');
    });
  });

  describe('Memory Tracking (delegated to SessionStateManager)', () => {
    it('should track referenced memories', () => {
      stateManager.recordMemoryReferenced('memory-1');
      stateManager.recordMemoryReferenced('memory-2');
      const memories = userData.referencedMemories;
      expect(memories).toContain('memory-1');
      expect(memories).toContain('memory-2');
    });

    it('should track hasReferencedLastConversation', () => {
      expect(userData.hasReferencedLastConversation).toBe(false);
      stateManager.markLastConversationReferenced();
      expect(userData.hasReferencedLastConversation).toBe(true);
    });

    it('should track mentioned personal themes', () => {
      stateManager.recordThemesMentioned('I love my wife');
      const themes = userData.mentionedPersonalThemes;
      expect(themes?.has('family')).toBe(true);
    });
  });

  describe('Emotional State (delegated to SessionStateManager)', () => {
    it('should read/write lastEmotionAnalysis', () => {
      userData.lastEmotionAnalysis = {
        primary: 'joy',
        intensity: 0.8,
        distressLevel: 0.1,
      };
      expect(stateManager.getState().emotional.lastEmotionAnalysis).toEqual({
        primary: 'joy',
        intensity: 0.8,
        distressLevel: 0.1,
      });
    });

    it('should read/write lastMood', () => {
      userData.lastMood = 'reflective';
      expect(stateManager.getState().emotional.lastMood).toBe('reflective');
    });
  });

  describe('Response Tracking (delegated to SessionStateManager)', () => {
    it('should track lastResponseHadHumor', () => {
      expect(userData.lastResponseHadHumor).toBe(false);
      userData.lastResponseHadHumor = true;
      expect(stateManager.getState().responseTracking.lastResponseHadHumor).toBe(true);
    });

    it('should track lastResponseHadStory', () => {
      expect(userData.lastResponseHadStory).toBe(false);
      userData.lastResponseHadStory = true;
      expect(stateManager.getState().responseTracking.lastResponseHadStory).toBe(true);
    });

    it('should track usedShareTags', () => {
      userData.usedShareTags = ['tag1', 'tag2'];
      expect(stateManager.getState().responseTracking.usedShareTags).toContain('tag1');
      expect(stateManager.getState().responseTracking.usedShareTags).toContain('tag2');
    });

    it('should track spontaneousShareCount', () => {
      stateManager.incrementSpontaneousShares();
      stateManager.incrementSpontaneousShares();
      expect(userData.spontaneousShareCount).toBe(2);
    });
  });

  describe('Bundle State (delegated to SessionStateManager)', () => {
    it('should read bundleRuntimeState', () => {
      stateManager.updateBundleState({
        relationshipTurns: 10,
        currentMode: 'active',
        storiesToldThisSession: ['story1'],
      });
      const bundle = userData.bundleRuntimeState;
      expect(bundle?.relationshipTurns).toBe(10);
      expect(bundle?.currentMode).toBe('active');
      expect(bundle?.storiesToldThisSession).toContain('story1');
    });

    it('should write bundleRuntimeState', () => {
      userData.bundleRuntimeState = {
        relationshipTurns: 20,
        currentMode: 'listening',
        storiesToldThisSession: ['story2'],
      };
      expect(stateManager.getState().bundle.relationshipTurns).toBe(20);
      expect(stateManager.getState().bundle.currentMode).toBe('listening');
    });
  });

  describe('Direct Fields (stored on proxy, not in SessionStateManager)', () => {
    it('should store services directly', () => {
      const services = { sessionId: 'test' } as never;
      userData.services = services;
      expect(userData.services).toBe(services);
      // Services are NOT in state manager
    });

    it('should store trial state directly', () => {
      expect(userData.isTrialUser).toBe(false);
      expect(userData.isFirstConversation).toBe(true);
    });

    it('should store voice humanization state directly', () => {
      userData.isInBreathPause = true;
      userData.currentSpeechDurationMs = 1500;
      userData.lastLiveBackchannelAt = Date.now();
      expect(userData.isInBreathPause).toBe(true);
      expect(userData.currentSpeechDurationMs).toBe(1500);
    });

    it('should store ambient awareness state directly', () => {
      userData.ambientEnvironment = 'coffee_shop';
      userData.ambientNoiseLevel = 0.6;
      userData.hasOfferedToPause = true;
      expect(userData.ambientEnvironment).toBe('coffee_shop');
      expect(userData.ambientNoiseLevel).toBe(0.6);
      expect(userData.hasOfferedToPause).toBe(true);
    });

    it('should store voice insight state directly', () => {
      userData.pendingVoiceInsight = {
        text: 'You sound tired',
        ssml: '<emotion name="concerned">You sound tired</emotion>',
        emotion: 'concerned',
        confidence: 0.85,
      };
      expect(userData.pendingVoiceInsight?.text).toBe('You sound tired');
    });
  });

  describe('Proxy Behavior', () => {
    it('should return undefined for unknown properties', () => {
      // @ts-expect-error Testing undefined property access
      expect(userData.nonExistentProperty).toBeUndefined();
    });

    it('should allow setting arbitrary properties on direct storage', () => {
      // @ts-expect-error Testing arbitrary property
      userData.customField = 'custom value';
      // @ts-expect-error Testing arbitrary property
      expect(userData.customField).toBe('custom value');
    });

    it('should properly implement has trap', () => {
      expect('name' in userData).toBe(true);
      expect('turnCount' in userData).toBe(true);
      expect('services' in userData).toBe(true);
    });

    it('should properly implement ownKeys trap', () => {
      const keys = Object.keys(userData);
      expect(keys.length).toBeGreaterThan(0);
      // Should include both mapped and direct fields
      expect(keys).toContain('name');
      expect(keys).toContain('services');
    });
  });

  describe('Bidirectional Sync', () => {
    it('should reflect state manager changes in proxy reads', () => {
      // Change via state manager
      stateManager.incrementTurn();
      stateManager.setTopic('work');
      stateManager.setLastUserMessage('Test message');

      // Read via proxy
      expect(userData.turnCount).toBe(1);
      expect(userData.lastTopic).toBe('work');
      expect(userData.lastUserMessage).toBe('Test message');
    });

    it('should reflect proxy writes in state manager', () => {
      // Change via proxy
      userData.lastTopic = 'health';
      userData.lastUserMessage = 'Feeling great today';

      // Read via state manager
      expect(stateManager.getState().conversation.lastTopic).toBe('health');
      expect(stateManager.getState().conversation.lastUserMessage).toBe('Feeling great today');
    });
  });
});

