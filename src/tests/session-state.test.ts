/**
 * Tests for session-state.ts
 *
 * Verifies the centralized session state manager works correctly.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  SessionStateManager,
  getCustomState,
  getSessionState,
  incrementTurnCount,
  markMemoryReferenced,
  recordKeyMoment,
  setCustomState,
  updateCognitiveLoad,
  updateEmotionalTrajectory,
  updateVoiceEmotion,
  wasMemoryReferenced,
} from '../intelligence/state/session.js';

describe('session-state', () => {
  beforeEach(() => {
    // Clear all sessions before each test
    SessionStateManager.clearAll();
  });

  describe('SessionStateManager', () => {
    it('should create new session state on first access', () => {
      const state = SessionStateManager.get('test-session-1');
      expect(state).toBeDefined();
      expect(state.sessionId).toBe('test-session-1');
    });

    it('should return same state on subsequent accesses', () => {
      const state1 = SessionStateManager.get('test-session-2');
      const state2 = SessionStateManager.get('test-session-2');
      expect(state1).toBe(state2);
    });

    it('should track session existence', () => {
      expect(SessionStateManager.has('test-session-3')).toBe(false);
      SessionStateManager.get('test-session-3');
      expect(SessionStateManager.has('test-session-3')).toBe(true);
    });

    it('should clear session state', () => {
      SessionStateManager.get('test-session-4');
      expect(SessionStateManager.has('test-session-4')).toBe(true);
      SessionStateManager.clear('test-session-4');
      expect(SessionStateManager.has('test-session-4')).toBe(false);
    });

    it('should count active sessions', () => {
      expect(SessionStateManager.getSessionCount()).toBe(0);
      SessionStateManager.get('session-a');
      SessionStateManager.get('session-b');
      expect(SessionStateManager.getSessionCount()).toBe(2);
    });

    it('should list active session IDs', () => {
      SessionStateManager.get('session-x');
      SessionStateManager.get('session-y');
      const ids = SessionStateManager.getActiveSessionIds();
      expect(ids).toContain('session-x');
      expect(ids).toContain('session-y');
    });

    it('should set user ID', () => {
      const state = SessionStateManager.get('test-session-5');
      expect(state.userId).toBeUndefined();
      SessionStateManager.setUserId('test-session-5', 'user-123');
      expect(state.userId).toBe('user-123');
    });
  });

  describe('getSessionState', () => {
    it('should be a convenience function for SessionStateManager.get', () => {
      const state = getSessionState('convenience-test');
      expect(state.sessionId).toBe('convenience-test');
    });
  });

  describe('updateVoiceEmotion', () => {
    it('should update voice emotion state', () => {
      const voiceState = updateVoiceEmotion('voice-test', 'happy', 0.3);
      expect(voiceState.currentEmotion).toBe('happy');
      expect(voiceState.emotionHistory).toContain('happy');
    });

    it('should maintain emotion history (max 10)', () => {
      for (let i = 0; i < 15; i++) {
        updateVoiceEmotion('voice-history-test', `emotion-${i}`, 0.1);
      }
      const state = getSessionState('voice-history-test');
      expect(state.voiceEmotion.emotionHistory.length).toBe(10);
    });

    it('should calculate average stress level', () => {
      updateVoiceEmotion('stress-test', 'anxious', 0.6);
      updateVoiceEmotion('stress-test', 'stressed', 0.8);
      const state = getSessionState('stress-test');
      expect(state.voiceEmotion.avgStressLevel).toBe(0.7);
    });

    it('should increment total samples', () => {
      updateVoiceEmotion('samples-test', 'happy', 0.1);
      updateVoiceEmotion('samples-test', 'calm', 0.1);
      const state = getSessionState('samples-test');
      expect(state.voiceEmotion.totalSamples).toBe(2);
    });
  });

  describe('updateEmotionalTrajectory', () => {
    it('should track emotional trajectory', () => {
      updateEmotionalTrajectory('trajectory-test', 'anxious', 0.6);
      const state = getSessionState('trajectory-test');
      expect(state.emotionalTrajectory.startEmotion).toBe('anxious');
      expect(state.emotionalTrajectory.currentEmotion).toBe('anxious');
    });

    it('should track peak distress level', () => {
      updateEmotionalTrajectory('peak-test', 'sad', 0.5);
      updateEmotionalTrajectory('peak-test', 'anxious', 0.8);
      updateEmotionalTrajectory('peak-test', 'calm', 0.3);
      const state = getSessionState('peak-test');
      expect(state.emotionalTrajectory.peakDistressLevel).toBe(0.8);
    });

    it('should calculate average distress', () => {
      updateEmotionalTrajectory('avg-test', 'sad', 0.4);
      updateEmotionalTrajectory('avg-test', 'anxious', 0.6);
      const state = getSessionState('avg-test');
      expect(state.emotionalTrajectory.avgDistressLevel).toBe(0.5);
    });

    it('should detect improving trend', () => {
      // Start high, end low
      updateEmotionalTrajectory('improving-test', 'anxious', 0.8);
      updateEmotionalTrajectory('improving-test', 'worried', 0.7);
      updateEmotionalTrajectory('improving-test', 'calm', 0.4);
      updateEmotionalTrajectory('improving-test', 'content', 0.2);
      const state = getSessionState('improving-test');
      expect(state.emotionalTrajectory.trend).toBe('improving');
    });

    it('should detect declining trend', () => {
      // Start low, end high
      updateEmotionalTrajectory('declining-test', 'content', 0.2);
      updateEmotionalTrajectory('declining-test', 'calm', 0.3);
      updateEmotionalTrajectory('declining-test', 'worried', 0.6);
      updateEmotionalTrajectory('declining-test', 'anxious', 0.8);
      const state = getSessionState('declining-test');
      expect(state.emotionalTrajectory.trend).toBe('declining');
    });
  });

  describe('updateCognitiveLoad', () => {
    it('should update cognitive load state', () => {
      updateCognitiveLoad('cognitive-test', 'hesitation', 0.6);
      const state = getSessionState('cognitive-test');
      expect(state.cognitiveLoad.observations.length).toBe(1);
      expect(state.cognitiveLoad.observations[0].indicator).toBe('hesitation');
    });

    it('should determine load level based on score', () => {
      // Start with high load - need multiple calls since it's weighted average
      // (0 * 0.7 + 0.9 * 0.3 = 0.27 on first call)
      for (let i = 0; i < 10; i++) {
        updateCognitiveLoad('level-test', 'confusion', 0.95);
      }
      let state = getSessionState('level-test');
      expect(state.cognitiveLoad.currentLevel).toBe('overloaded');

      // Now bring it down
      for (let i = 0; i < 20; i++) {
        updateCognitiveLoad('level-test', 'clarity', 0.1);
      }
      state = getSessionState('level-test');
      expect(['low', 'moderate']).toContain(state.cognitiveLoad.currentLevel);
    });

    it('should flag simplification needs for high load', () => {
      // Need multiple calls due to weighted average
      for (let i = 0; i < 10; i++) {
        updateCognitiveLoad('simplify-test', 'overload', 0.95);
      }
      const state = getSessionState('simplify-test');
      expect(state.cognitiveLoad.needsSimplification).toBe(true);
    });
  });

  describe('recordKeyMoment', () => {
    it('should record key moments', () => {
      recordKeyMoment('moment-test', 'User shared a breakthrough insight');
      const state = getSessionState('moment-test');
      expect(state.conversationFlow.keyMoments.length).toBe(1);
      expect(state.conversationFlow.keyMoments[0].summary).toBe(
        'User shared a breakthrough insight'
      );
    });

    it('should include turn number in key moment', () => {
      incrementTurnCount('moment-turn-test');
      incrementTurnCount('moment-turn-test');
      recordKeyMoment('moment-turn-test', 'Important moment');
      const state = getSessionState('moment-turn-test');
      expect(state.conversationFlow.keyMoments[0].turnNumber).toBe(2);
    });
  });

  describe('incrementTurnCount', () => {
    it('should increment turn count', () => {
      expect(incrementTurnCount('turn-test')).toBe(1);
      expect(incrementTurnCount('turn-test')).toBe(2);
      expect(incrementTurnCount('turn-test')).toBe(3);
    });
  });

  describe('custom state', () => {
    it('should set and get custom state', () => {
      setCustomState('custom-test', 'my-builder', { value: 42 });
      const retrieved = getCustomState<{ value: number }>('custom-test', 'my-builder');
      expect(retrieved?.value).toBe(42);
    });

    it('should return undefined for non-existent custom state', () => {
      const retrieved = getCustomState('custom-test-2', 'nonexistent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('memory referencing', () => {
    it('should track referenced memories', () => {
      expect(wasMemoryReferenced('memory-test', 'memory-123')).toBe(false);
      markMemoryReferenced('memory-test', 'memory-123');
      expect(wasMemoryReferenced('memory-test', 'memory-123')).toBe(true);
    });

    it('should not have false positives', () => {
      markMemoryReferenced('memory-test-2', 'memory-a');
      expect(wasMemoryReferenced('memory-test-2', 'memory-b')).toBe(false);
    });
  });

  describe('cleanupStaleSessions', () => {
    it('should cleanup sessions older than maxAge', async () => {
      // Create a session
      SessionStateManager.get('stale-test');
      expect(SessionStateManager.has('stale-test')).toBe(true);

      // Mock time passing by manipulating lastUpdated
      const state = SessionStateManager.get('stale-test');
      state.lastUpdated = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago

      // Cleanup with 1 day max age
      const cleaned = SessionStateManager.cleanupStaleSessions(24 * 60 * 60 * 1000);
      expect(cleaned).toBe(1);
      expect(SessionStateManager.has('stale-test')).toBe(false);
    });
  });
});
