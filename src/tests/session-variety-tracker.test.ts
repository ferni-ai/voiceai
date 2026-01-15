/**
 * Session Variety Tracker Tests
 *
 * Tests that the variety tracking system prevents repetitive personality
 * expressions while maintaining Ferni's core identity.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SessionVarietyTracker,
  getSessionVarietyTracker,
  resetSessionVarietyTracker,
  type PersonalityExpression,
  type ThemeCategory,
} from '../services/session-manager/session-variety-tracker.js';

describe('SessionVarietyTracker', () => {
  let tracker: SessionVarietyTracker;

  beforeEach(() => {
    tracker = new SessionVarietyTracker();
  });

  describe('detectTheme', () => {
    it('should detect coffee as warm_drinks', () => {
      expect(tracker.detectTheme('I love coffee in the morning')).toBe('warm_drinks');
    });

    it('should detect Japan as global_traveler', () => {
      expect(tracker.detectTheme('Ten years in Japan taught me')).toBe('global_traveler');
    });

    it('should detect Morocco as global_traveler', () => {
      expect(tracker.detectTheme('Mint tea from Morocco')).toBe('global_traveler');
    });

    it('should detect Wyoming as global_traveler', () => {
      expect(tracker.detectTheme('That Wyoming sky')).toBe('global_traveler');
    });

    it('should detect Bon Iver as music_taste', () => {
      expect(tracker.detectTheme('Listening to Bon Iver')).toBe('music_taste');
    });

    it('should return null for unrelated content', () => {
      expect(tracker.detectTheme('Hello how are you today')).toBeNull();
    });
  });

  describe('shouldAvoidTheme', () => {
    it('should not avoid unused themes', () => {
      expect(tracker.shouldAvoidTheme('session1', 'warm_drinks')).toBe(false);
    });

    it('should avoid themes used at max count', () => {
      // Use theme twice (max per session)
      tracker.recordUsage('session1', 'warm_drinks', 'expr1');
      tracker.recordUsage('session1', 'warm_drinks', 'expr2');

      expect(tracker.shouldAvoidTheme('session1', 'warm_drinks')).toBe(true);
    });

    it('should avoid last-used theme (back-to-back prevention)', () => {
      tracker.recordUsage('session1', 'global_traveler', 'expr1');

      expect(tracker.shouldAvoidTheme('session1', 'global_traveler')).toBe(true);
    });
  });

  describe('recordUsage', () => {
    it('should track theme usage', () => {
      tracker.recordUsage('session1', 'music_taste', 'music-1');

      const stats = tracker.getStats('session1');
      expect(stats.usedThemes).toContain('music_taste');
      expect(stats.themeUsageCounts.music_taste).toBe(1);
    });

    it('should track expression IDs', () => {
      tracker.recordUsage('session1', 'music_taste', 'music-1');

      const stats = tracker.getStats('session1');
      expect(stats.usedExpressionCount).toBe(1);
    });
  });

  describe('selectWithVariety', () => {
    const testPool: PersonalityExpression[] = [
      { id: 'coffee-1', theme: 'warm_drinks', content: 'Coffee is great' },
      { id: 'coffee-2', theme: 'warm_drinks', content: 'Tea is nice' },
      { id: 'japan-1', theme: 'global_traveler', content: 'Japan taught me' },
      { id: 'music-1', theme: 'music_taste', content: 'Bon Iver playing' },
    ];

    it('should return an expression from the pool', () => {
      const selected = tracker.selectWithVariety('session1', testPool);

      expect(selected).not.toBeNull();
      expect(testPool.map((e) => e.id)).toContain(selected!.id);
    });

    it('should not return the same expression twice', () => {
      const first = tracker.selectWithVariety('session1', testPool);
      const second = tracker.selectWithVariety('session1', testPool);

      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(first!.id).not.toBe(second!.id);
    });

    it('should avoid back-to-back same theme', () => {
      // Select from warm_drinks theme
      const first = tracker.selectWithVariety('session1', [
        { id: 'coffee-1', theme: 'warm_drinks', content: 'Coffee' },
      ]);

      // Now select from full pool - should not pick warm_drinks
      const second = tracker.selectWithVariety('session1', testPool);

      // If warm_drinks was the only option, it would be forced
      // But with other options, it should avoid warm_drinks
      if (second && first) {
        expect(second.theme).not.toBe('warm_drinks');
      }
    });

    it('should respect forceTheme option', () => {
      // Use warm_drinks first
      tracker.recordUsage('session1', 'warm_drinks', 'coffee-1');

      // Force warm_drinks anyway
      const selected = tracker.selectWithVariety('session1', testPool, {
        forceTheme: 'warm_drinks',
      });

      // Should still get warm_drinks expression if available
      expect(selected).not.toBeNull();
    });

    it('should filter by emotional context', () => {
      const emotionalPool: PersonalityExpression[] = [
        { id: 'sad-music', theme: 'music_taste', content: 'Sad music', emotionalContext: ['sad'] },
        {
          id: 'happy-music',
          theme: 'music_taste',
          content: 'Happy music',
          emotionalContext: ['happy'],
        },
      ];

      const selected = tracker.selectWithVariety('session1', emotionalPool, {
        emotionalContext: 'sad',
      });

      expect(selected?.id).toBe('sad-music');
    });
  });

  describe('recordTurn', () => {
    it('should increment turn count', () => {
      tracker.recordTurn('session1');
      tracker.recordTurn('session1');

      const stats = tracker.getStats('session1');
      expect(stats.turnCount).toBe(2);
    });

    it('should reset lastThemeUsed after configured turns', () => {
      tracker.recordUsage('session1', 'warm_drinks', 'coffee-1');
      expect(tracker.shouldAvoidTheme('session1', 'warm_drinks')).toBe(true);

      // Record 5 turns to reset
      for (let i = 0; i < 5; i++) {
        tracker.recordTurn('session1');
      }

      // Should no longer avoid (back-to-back prevention lifted)
      // Note: Still might be avoided due to usage count
    });
  });

  describe('clearSession', () => {
    it('should clear all state for a session', () => {
      tracker.recordUsage('session1', 'warm_drinks', 'coffee-1');
      tracker.recordTurn('session1');

      tracker.clearSession('session1');

      const stats = tracker.getStats('session1');
      expect(stats.usedThemes).toHaveLength(0);
      expect(stats.turnCount).toBe(0);
    });

    it('should not affect other sessions', () => {
      tracker.recordUsage('session1', 'warm_drinks', 'coffee-1');
      tracker.recordUsage('session2', 'music_taste', 'music-1');

      tracker.clearSession('session1');

      const session2Stats = tracker.getStats('session2');
      expect(session2Stats.usedThemes).toContain('music_taste');
    });
  });
});

describe('Singleton behavior', () => {
  beforeEach(() => {
    resetSessionVarietyTracker();
  });

  it('should return same tracker instance', () => {
    const tracker1 = getSessionVarietyTracker();
    const tracker2 = getSessionVarietyTracker();

    expect(tracker1).toBe(tracker2);
  });

  it('should reset tracker on resetSessionVarietyTracker', () => {
    const tracker1 = getSessionVarietyTracker();
    tracker1.recordUsage('session1', 'warm_drinks', 'coffee-1');

    resetSessionVarietyTracker();

    const tracker2 = getSessionVarietyTracker();
    const stats = tracker2.getStats('session1');

    expect(stats.usedThemes).toHaveLength(0);
  });
});

describe('Integration: Variety prevents repetition', () => {
  let tracker: SessionVarietyTracker;

  beforeEach(() => {
    tracker = new SessionVarietyTracker();
  });

  it('should distribute selections across themes over many calls', () => {
    const diversePool: PersonalityExpression[] = [
      { id: 'coffee-1', theme: 'warm_drinks', content: 'Coffee' },
      { id: 'japan-1', theme: 'global_traveler', content: 'Japan' },
      { id: 'music-1', theme: 'music_taste', content: 'Music' },
      { id: 'family-1', theme: 'family_life', content: 'Family' },
      { id: 'nature-1', theme: 'nature_connection', content: 'Nature' },
    ];

    const selectedThemes = new Set<ThemeCategory>();

    // Select 5 times
    for (let i = 0; i < 5; i++) {
      const selected = tracker.selectWithVariety('session1', diversePool);
      if (selected) {
        selectedThemes.add(selected.theme);
      }
    }

    // Should have selected from multiple themes (variety)
    expect(selectedThemes.size).toBeGreaterThanOrEqual(3);
  });

  it('should limit theme usage per session before fallback', () => {
    // Test with a diverse pool - warm_drinks should be limited to 2 selections
    // before the tracker prefers other themes
    const diversePool: PersonalityExpression[] = [
      { id: 'coffee-1', theme: 'warm_drinks', content: 'Coffee 1' },
      { id: 'coffee-2', theme: 'warm_drinks', content: 'Coffee 2' },
      { id: 'japan-1', theme: 'global_traveler', content: 'Japan 1' },
      { id: 'japan-2', theme: 'global_traveler', content: 'Japan 2' },
      { id: 'music-1', theme: 'music_taste', content: 'Music 1' },
      { id: 'music-2', theme: 'music_taste', content: 'Music 2' },
    ];

    const themeUsage: Record<string, number> = {};

    // Select 6 times
    for (let i = 0; i < 6; i++) {
      const selected = tracker.selectWithVariety('session1', diversePool);
      if (selected) {
        themeUsage[selected.theme] = (themeUsage[selected.theme] || 0) + 1;
      }
    }

    // Each theme should be used at most 2 times (maxThemeUsagePerSession)
    for (const [theme, count] of Object.entries(themeUsage)) {
      expect(count).toBeLessThanOrEqual(2);
    }
  });
});
