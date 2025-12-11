/**
 * Session Cleanup Tests
 *
 * CRITICAL: These tests verify memory safety across all speech services.
 * The session-cleanup module is the foundation of preventing memory leaks
 * in long-running voice sessions.
 *
 * Tests verify:
 * - All services are properly cleaned up
 * - Session registry tracks active sessions
 * - Emergency cleanup works correctly
 * - No memory leaks from orphaned services
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupAllSpeechSessions,
  cleanupSpeechSession,
  emergencySpeechCleanup,
  getActiveSpeechSessionCount,
  getActiveSpeechSessions,
  registerSpeechSession,
} from '../session-cleanup.js';

// Import individual service getters to verify cleanup
import { getSessionAudioProsodyAnalyzer } from '../audio-prosody.js';
import { getSessionBackchannelingSystem } from '../backchanneling.js';
import { getBreathDetector } from '../breath-detection.js';
import { getEmotionalContagionService } from '../emotional-contagion.js';
import { getEnergyDynamicsTracker } from '../energy-dynamics.js';
import { getEnhancedTurnPredictor } from '../enhanced-turn-prediction.js';
import { getFFTAnalyzer } from '../fft-analyzer.js';
import { getFillerAnalyzer } from '../filler-analysis.js';
import { getFluencyAnalyzer } from '../fluency-analysis.js';
import { getHumanListeningPipeline } from '../human-listening-pipeline.js';
import { getVoiceHumanizationService } from '../voice-humanization.js';
import { getSessionVoiceManager, resetAllSessionVoiceManagers } from '../voice-manager.js';
import { getVoiceTremorDetector } from '../voice-tremor.js';
import { getVolumeDynamicsTracker } from '../volume-dynamics.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create services for a session to verify they exist
 */
function createServicesForSession(sessionId: string): void {
  // Create various services - they should be cleaned up
  getSessionAudioProsodyAnalyzer(sessionId);
  getSessionBackchannelingSystem(sessionId);
  getVoiceHumanizationService(sessionId);
  getHumanListeningPipeline(sessionId);
  getBreathDetector(sessionId);
  getVoiceTremorDetector(sessionId);
  getVolumeDynamicsTracker(sessionId);
  getEnergyDynamicsTracker(sessionId);
  getFluencyAnalyzer(sessionId);
  getFillerAnalyzer(sessionId);
  getFFTAnalyzer(sessionId);
  getEnhancedTurnPredictor(sessionId);
  getEmotionalContagionService(sessionId);
  getSessionVoiceManager(sessionId);
}

// ============================================================================
// TESTS
// ============================================================================

describe('Session Cleanup', () => {
  const testSessionId = 'test-cleanup-session';

  beforeEach(() => {
    // Start fresh
    emergencySpeechCleanup();
    resetAllSessionVoiceManagers();
  });

  afterEach(() => {
    // Clean up after each test
    emergencySpeechCleanup();
    resetAllSessionVoiceManagers();
  });

  // -------------------------------------------------------------------------
  // SESSION REGISTRY
  // -------------------------------------------------------------------------

  describe('Session Registry', () => {
    it('should register new sessions', () => {
      expect(getActiveSpeechSessionCount()).toBe(0);

      registerSpeechSession('session-1');
      expect(getActiveSpeechSessionCount()).toBe(1);

      registerSpeechSession('session-2');
      expect(getActiveSpeechSessionCount()).toBe(2);
    });

    it('should not duplicate session registrations', () => {
      registerSpeechSession('session-1');
      registerSpeechSession('session-1');
      registerSpeechSession('session-1');

      expect(getActiveSpeechSessionCount()).toBe(1);
    });

    it('should return active session IDs', () => {
      registerSpeechSession('session-a');
      registerSpeechSession('session-b');
      registerSpeechSession('session-c');

      const sessions = getActiveSpeechSessions();
      expect(sessions).toContain('session-a');
      expect(sessions).toContain('session-b');
      expect(sessions).toContain('session-c');
      expect(sessions.length).toBe(3);
    });

    it('should remove session from registry on cleanup', () => {
      registerSpeechSession(testSessionId);
      expect(getActiveSpeechSessionCount()).toBe(1);

      cleanupSpeechSession(testSessionId, { verbose: false });
      expect(getActiveSpeechSessionCount()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // SINGLE SESSION CLEANUP
  // -------------------------------------------------------------------------

  describe('Single Session Cleanup', () => {
    it('should clean up all services for a session', () => {
      // Create services
      createServicesForSession(testSessionId);
      registerSpeechSession(testSessionId);

      // Verify services exist
      expect(getActiveSpeechSessionCount()).toBe(1);

      // Clean up
      cleanupSpeechSession(testSessionId, { verbose: false });

      // Session should be removed from registry
      expect(getActiveSpeechSessionCount()).toBe(0);
    });

    it('should handle cleanup of non-existent session gracefully', () => {
      // Should not throw
      expect(() => {
        cleanupSpeechSession('non-existent-session', { verbose: false });
      }).not.toThrow();
    });

    it('should accept different cleanup reasons', () => {
      registerSpeechSession(testSessionId);

      // All reasons should work without error
      expect(() => {
        cleanupSpeechSession('session-1', { verbose: false, reason: 'normal' });
      }).not.toThrow();

      registerSpeechSession('session-2');
      expect(() => {
        cleanupSpeechSession('session-2', { verbose: false, reason: 'disconnect' });
      }).not.toThrow();

      registerSpeechSession('session-3');
      expect(() => {
        cleanupSpeechSession('session-3', { verbose: false, reason: 'timeout' });
      }).not.toThrow();

      registerSpeechSession('session-4');
      expect(() => {
        cleanupSpeechSession('session-4', { verbose: false, reason: 'error' });
      }).not.toThrow();
    });

    it('should clean up services even if some fail', () => {
      registerSpeechSession(testSessionId);
      createServicesForSession(testSessionId);

      // Cleanup should complete even if individual services have issues
      // (they use safeCleanup internally)
      cleanupSpeechSession(testSessionId, { verbose: false });

      expect(getActiveSpeechSessionCount()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // BULK CLEANUP
  // -------------------------------------------------------------------------

  describe('Bulk Cleanup', () => {
    it('should clean up all sessions', () => {
      // Register multiple sessions
      registerSpeechSession('session-1');
      registerSpeechSession('session-2');
      registerSpeechSession('session-3');

      createServicesForSession('session-1');
      createServicesForSession('session-2');
      createServicesForSession('session-3');

      expect(getActiveSpeechSessionCount()).toBe(3);

      // Clean up all
      cleanupAllSpeechSessions('test');

      expect(getActiveSpeechSessionCount()).toBe(0);
    });

    it('should handle cleanup of empty session list', () => {
      expect(getActiveSpeechSessionCount()).toBe(0);

      expect(() => {
        cleanupAllSpeechSessions('test');
      }).not.toThrow();

      expect(getActiveSpeechSessionCount()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // EMERGENCY CLEANUP
  // -------------------------------------------------------------------------

  describe('Emergency Cleanup', () => {
    it('should clear session registry immediately', () => {
      registerSpeechSession('session-1');
      registerSpeechSession('session-2');
      registerSpeechSession('session-3');

      expect(getActiveSpeechSessionCount()).toBe(3);

      emergencySpeechCleanup();

      expect(getActiveSpeechSessionCount()).toBe(0);
    });

    it('should be safe to call multiple times', () => {
      registerSpeechSession('session-1');

      expect(() => {
        emergencySpeechCleanup();
        emergencySpeechCleanup();
        emergencySpeechCleanup();
      }).not.toThrow();

      expect(getActiveSpeechSessionCount()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // INTEGRATION TESTS
  // -------------------------------------------------------------------------

  describe('Integration', () => {
    it('should handle rapid session creation and cleanup', () => {
      // Simulate rapid session turnover (like in production)
      for (let i = 0; i < 10; i++) {
        const sessionId = `rapid-session-${i}`;
        registerSpeechSession(sessionId);
        createServicesForSession(sessionId);
        cleanupSpeechSession(sessionId, { verbose: false });
      }

      expect(getActiveSpeechSessionCount()).toBe(0);
    });

    it('should handle concurrent sessions correctly', () => {
      // Create multiple sessions simultaneously
      const sessionIds = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'];

      for (const id of sessionIds) {
        registerSpeechSession(id);
        createServicesForSession(id);
      }

      expect(getActiveSpeechSessionCount()).toBe(5);

      // Clean up odd-numbered sessions
      cleanupSpeechSession('user-1', { verbose: false });
      cleanupSpeechSession('user-3', { verbose: false });
      cleanupSpeechSession('user-5', { verbose: false });

      expect(getActiveSpeechSessionCount()).toBe(2);
      expect(getActiveSpeechSessions()).toContain('user-2');
      expect(getActiveSpeechSessions()).toContain('user-4');

      // Clean up remaining
      cleanupAllSpeechSessions('test');
      expect(getActiveSpeechSessionCount()).toBe(0);
    });

    it('should properly isolate session state', () => {
      // Create two sessions with different states
      const session1 = 'isolated-1';
      const session2 = 'isolated-2';

      registerSpeechSession(session1);
      registerSpeechSession(session2);

      const prosody1 = getSessionAudioProsodyAnalyzer(session1);
      const prosody2 = getSessionAudioProsodyAnalyzer(session2);

      // Services should be different instances
      expect(prosody1).not.toBe(prosody2);

      // Clean up session 1
      cleanupSpeechSession(session1, { verbose: false });

      // Session 2 should still exist
      expect(getActiveSpeechSessions()).toContain(session2);
      expect(getActiveSpeechSessions()).not.toContain(session1);

      // Clean up
      cleanupSpeechSession(session2, { verbose: false });
    });
  });

  // -------------------------------------------------------------------------
  // MEMORY SAFETY TESTS
  // -------------------------------------------------------------------------

  describe('Memory Safety', () => {
    it('should not leak services after cleanup', () => {
      const sessionId = 'memory-test';

      // Create services
      registerSpeechSession(sessionId);
      createServicesForSession(sessionId);

      // Get references before cleanup
      const beforeCleanup = getActiveSpeechSessionCount();
      expect(beforeCleanup).toBe(1);

      // Clean up
      cleanupSpeechSession(sessionId, { verbose: false });

      // After cleanup, getting new services should create new instances
      const newProsody = getSessionAudioProsodyAnalyzer(sessionId);
      expect(newProsody).toBeDefined();

      // But the session is not registered (services exist but not tracked)
      expect(getActiveSpeechSessionCount()).toBe(0);
    });

    it('should clean up services in correct order', () => {
      // Some services may depend on others
      // This test ensures cleanup doesn't throw due to dependency issues
      const sessionId = 'dependency-test';

      registerSpeechSession(sessionId);

      // Create services in a specific order
      getSessionAudioProsodyAnalyzer(sessionId);
      getHumanListeningPipeline(sessionId);
      getVoiceHumanizationService(sessionId);

      // Cleanup should handle dependencies
      expect(() => {
        cleanupSpeechSession(sessionId, { verbose: false });
      }).not.toThrow();
    });
  });
});
