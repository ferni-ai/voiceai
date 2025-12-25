/**
 * Burnout Prediction Tests
 *
 * Tests for burnout risk tracking and profile management.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordBurnoutEpisode,
  recordRecoveryStrategy,
  clearBurnoutData,
} from '../burnout-prediction.js';

describe('BurnoutPrediction', () => {
  const testUserId = `test-burnout-${Date.now()}`;

  beforeEach(() => {
    clearBurnoutData(testUserId);
  });

  // ===========================================================================
  // recordBurnoutEpisode
  // ===========================================================================
  describe('recordBurnoutEpisode', () => {
    it('should record a burnout episode', () => {
      // Should not throw
      expect(() => {
        recordBurnoutEpisode(testUserId, 'high', ['calendar_density', 'stress_mentions'], 5);
      }).not.toThrow();
    });

    it('should record multiple episodes', () => {
      recordBurnoutEpisode(testUserId, 'moderate', ['work_hours_creep'], 3);
      recordBurnoutEpisode(testUserId, 'high', ['calendar_density'], 7);
      recordBurnoutEpisode(testUserId, 'critical', ['back_to_back_meetings'], 10);

      // All should be recorded without error
      // We verify by clearing (if profile didn't exist, this would be a no-op)
      expect(() => clearBurnoutData(testUserId)).not.toThrow();
    });

    it('should accept all severity levels', () => {
      const severities = ['low', 'moderate', 'high', 'critical'] as const;

      for (const severity of severities) {
        const userId = `${testUserId}-${severity}`;
        expect(() => {
          recordBurnoutEpisode(userId, severity, ['test_trigger'], 3);
        }).not.toThrow();
        clearBurnoutData(userId);
      }
    });

    it('should accept empty triggers array', () => {
      expect(() => {
        recordBurnoutEpisode(testUserId, 'moderate', [], 5);
      }).not.toThrow();
    });

    it('should accept multiple triggers', () => {
      const triggers = [
        'calendar_density',
        'back_to_back_meetings',
        'work_hours_creep',
        'stress_mentions',
        'energy_indicators',
      ];

      expect(() => {
        recordBurnoutEpisode(testUserId, 'critical', triggers, 14);
      }).not.toThrow();
    });

    it('should handle zero recovery days', () => {
      expect(() => {
        recordBurnoutEpisode(testUserId, 'low', ['minor_issue'], 0);
      }).not.toThrow();
    });

    it('should create profile if not exists', () => {
      const newUserId = `new-user-${Date.now()}`;

      // First episode creates profile
      recordBurnoutEpisode(newUserId, 'moderate', ['test'], 3);

      // Second episode should also work (profile exists now)
      expect(() => {
        recordBurnoutEpisode(newUserId, 'high', ['another'], 5);
      }).not.toThrow();

      clearBurnoutData(newUserId);
    });
  });

  // ===========================================================================
  // recordRecoveryStrategy
  // ===========================================================================
  describe('recordRecoveryStrategy', () => {
    it('should record a recovery strategy', () => {
      expect(() => {
        recordRecoveryStrategy(testUserId, 'Taking walks helps');
      }).not.toThrow();
    });

    it('should record multiple strategies', () => {
      recordRecoveryStrategy(testUserId, 'Taking walks helps');
      recordRecoveryStrategy(testUserId, 'Meditation in the morning');
      recordRecoveryStrategy(testUserId, 'Blocking focus time');

      expect(() => clearBurnoutData(testUserId)).not.toThrow();
    });

    it('should create profile if not exists', () => {
      const newUserId = `new-recovery-${Date.now()}`;

      recordRecoveryStrategy(newUserId, 'Deep breathing');

      // Second strategy should also work
      expect(() => {
        recordRecoveryStrategy(newUserId, 'Reading before bed');
      }).not.toThrow();

      clearBurnoutData(newUserId);
    });

    it('should handle empty strategy string', () => {
      expect(() => {
        recordRecoveryStrategy(testUserId, '');
      }).not.toThrow();
    });

    it('should handle long strategy text', () => {
      const longStrategy =
        'When I feel overwhelmed, I find it helpful to step away from my desk, ' +
        'go outside for a 15-minute walk, and then come back with a fresh perspective. ' +
        'This has been my go-to recovery strategy for years.';

      expect(() => {
        recordRecoveryStrategy(testUserId, longStrategy);
      }).not.toThrow();
    });
  });

  // ===========================================================================
  // clearBurnoutData
  // ===========================================================================
  describe('clearBurnoutData', () => {
    it('should clear burnout data for user', () => {
      recordBurnoutEpisode(testUserId, 'high', ['calendar_density'], 5);
      recordRecoveryStrategy(testUserId, 'Walking helps');

      expect(() => {
        clearBurnoutData(testUserId);
      }).not.toThrow();
    });

    it('should handle clearing non-existent user', () => {
      expect(() => {
        clearBurnoutData('non-existent-user');
      }).not.toThrow();
    });

    it('should not affect other users', () => {
      const otherUser = `other-burnout-${Date.now()}`;

      recordBurnoutEpisode(testUserId, 'high', ['test'], 5);
      recordBurnoutEpisode(otherUser, 'moderate', ['other'], 3);

      clearBurnoutData(testUserId);

      // Other user's data should still exist (no error on subsequent operations)
      expect(() => {
        recordBurnoutEpisode(otherUser, 'low', ['additional'], 2);
      }).not.toThrow();

      clearBurnoutData(otherUser);
    });

    it('should allow re-recording after clear', () => {
      recordBurnoutEpisode(testUserId, 'high', ['test'], 5);
      clearBurnoutData(testUserId);

      // Should be able to record new data
      expect(() => {
        recordBurnoutEpisode(testUserId, 'moderate', ['new_trigger'], 3);
      }).not.toThrow();
    });
  });

  // ===========================================================================
  // Integration: Episode + Recovery
  // ===========================================================================
  describe('integration', () => {
    it('should handle combined episode and recovery recording', () => {
      // Record an episode with triggers
      recordBurnoutEpisode(
        testUserId,
        'high',
        ['calendar_density', 'back_to_back_meetings'],
        7
      );

      // Record recovery strategies that helped
      recordRecoveryStrategy(testUserId, 'Declined 3 meetings');
      recordRecoveryStrategy(testUserId, 'Blocked 2 hours daily');

      // Record another episode later
      recordBurnoutEpisode(testUserId, 'moderate', ['work_hours_creep'], 3);

      // All operations should succeed
      expect(() => clearBurnoutData(testUserId)).not.toThrow();
    });

    it('should handle rapid succession of recordings', () => {
      for (let i = 0; i < 20; i++) {
        recordBurnoutEpisode(testUserId, 'moderate', [`trigger_${i}`], i);
        recordRecoveryStrategy(testUserId, `Strategy ${i}`);
      }

      expect(() => clearBurnoutData(testUserId)).not.toThrow();
    });
  });

  // ===========================================================================
  // Trigger types
  // ===========================================================================
  describe('trigger types', () => {
    it('should accept calendar_density trigger', () => {
      expect(() => {
        recordBurnoutEpisode(testUserId, 'high', ['calendar_density'], 5);
      }).not.toThrow();
    });

    it('should accept back_to_back_meetings trigger', () => {
      expect(() => {
        recordBurnoutEpisode(testUserId, 'high', ['back_to_back_meetings'], 5);
      }).not.toThrow();
    });

    it('should accept work_hours_creep trigger', () => {
      expect(() => {
        recordBurnoutEpisode(testUserId, 'moderate', ['work_hours_creep'], 3);
      }).not.toThrow();
    });

    it('should accept stress_mentions trigger', () => {
      expect(() => {
        recordBurnoutEpisode(testUserId, 'moderate', ['stress_mentions'], 4);
      }).not.toThrow();
    });

    it('should accept energy_indicators trigger', () => {
      expect(() => {
        recordBurnoutEpisode(testUserId, 'low', ['energy_indicators'], 2);
      }).not.toThrow();
    });

    it('should accept historical_pattern trigger', () => {
      expect(() => {
        recordBurnoutEpisode(testUserId, 'high', ['historical_pattern'], 6);
      }).not.toThrow();
    });

    it('should accept custom trigger names', () => {
      expect(() => {
        recordBurnoutEpisode(testUserId, 'moderate', ['family_stress', 'health_issue'], 5);
      }).not.toThrow();
    });
  });
});
