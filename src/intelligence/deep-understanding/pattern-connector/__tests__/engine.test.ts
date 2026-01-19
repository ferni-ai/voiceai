/**
 * Pattern Connector Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createPatternConnector,
  clearUserData,
  type IPatternConnector,
} from '../index.js';

describe('PatternConnector', () => {
  let connector: IPatternConnector;
  const userId = 'test-user-123';

  beforeEach(async () => {
    connector = createPatternConnector();
    await clearUserData(userId);
  });

  // ============================================================================
  // OBSERVATION RECORDING
  // ============================================================================

  describe('recordObservation()', () => {
    it('records observation without error', async () => {
      await expect(
        connector.recordObservation(userId, {
          topics: ['work', 'stress'],
          emotion: 'anxious',
          valence: -0.4,
          sessionId: 'session-1',
        })
      ).resolves.not.toThrow();
    });

    it('creates emotional pattern from observations', async () => {
      await connector.recordObservation(userId, {
        topics: ['work'],
        emotion: 'stressed',
        valence: -0.5,
        sessionId: 'session-1',
      });

      const pattern = await connector.getEmotionalPattern(userId, 'work');
      expect(pattern).not.toBeNull();
      expect(pattern?.typicalValence).toBe(-0.5);
    });

    it('updates emotional pattern over time', async () => {
      await connector.recordObservation(userId, {
        topics: ['hobby'],
        emotion: 'happy',
        valence: 0.8,
        sessionId: 'session-1',
      });
      await connector.recordObservation(userId, {
        topics: ['hobby'],
        emotion: 'happy',
        valence: 0.6,
        sessionId: 'session-2',
      });

      const pattern = await connector.getEmotionalPattern(userId, 'hobby');
      expect(pattern?.sampleSize).toBe(2);
      expect(pattern?.typicalValence).toBe(0.7); // Average of 0.8 and 0.6
    });
  });

  // ============================================================================
  // EMOTIONAL PATTERNS
  // ============================================================================

  describe('getEmotionalPattern()', () => {
    it('returns null for unknown subject', async () => {
      const pattern = await connector.getEmotionalPattern(userId, 'unknown');
      expect(pattern).toBeNull();
    });

    it('detects trend after multiple observations', async () => {
      // Start very negative, then get very positive - clear improvement
      // The trend calculation looks at recent (last 5) vs overall average
      await connector.recordObservation(userId, {
        topics: ['therapy'],
        emotion: 'anxious',
        valence: -0.8,
        sessionId: 's1',
      });
      await connector.recordObservation(userId, {
        topics: ['therapy'],
        emotion: 'anxious',
        valence: -0.7,
        sessionId: 's2',
      });
      await connector.recordObservation(userId, {
        topics: ['therapy'],
        emotion: 'hopeful',
        valence: -0.5,
        sessionId: 's3',
      });
      // Now recent observations are much more positive
      await connector.recordObservation(userId, {
        topics: ['therapy'],
        emotion: 'positive',
        valence: 0.3,
        sessionId: 's4',
      });
      await connector.recordObservation(userId, {
        topics: ['therapy'],
        emotion: 'positive',
        valence: 0.5,
        sessionId: 's5',
      });
      await connector.recordObservation(userId, {
        topics: ['therapy'],
        emotion: 'positive',
        valence: 0.6,
        sessionId: 's6',
      });

      const pattern = await connector.getEmotionalPattern(userId, 'therapy');
      // The recent average (0.3, 0.5, 0.6 = ~0.47) should be > overall avg + 0.1
      expect(pattern?.trend).toBe('improving');
    });
  });

  // ============================================================================
  // CO-OCCURRENCES
  // ============================================================================

  describe('getCoOccurrences()', () => {
    it('returns empty for new user', async () => {
      const coOccs = await connector.getCoOccurrences(userId, 'test');
      expect(coOccs).toEqual([]);
    });

    it('tracks topic co-occurrences', async () => {
      await connector.recordObservation(userId, {
        topics: ['work', 'stress'],
        emotion: 'anxious',
        valence: -0.4,
        sessionId: 'session-1',
      });
      await connector.recordObservation(userId, {
        topics: ['work', 'stress'],
        emotion: 'anxious',
        valence: -0.3,
        sessionId: 'session-2',
      });

      const coOccs = await connector.getCoOccurrences(userId, 'work');
      expect(coOccs.length).toBeGreaterThan(0);
      
      const workStress = coOccs.find(
        (c) => c.topic1 === 'work' || c.topic2 === 'work'
      );
      expect(workStress?.count).toBe(2);
    });

    it('sorts co-occurrences by count', async () => {
      // Record work+stress 3 times
      for (let i = 0; i < 3; i++) {
        await connector.recordObservation(userId, {
          topics: ['work', 'stress'],
          emotion: 'anxious',
          valence: -0.4,
          sessionId: `session-${i}`,
        });
      }
      // Record work+money 1 time
      await connector.recordObservation(userId, {
        topics: ['work', 'money'],
        emotion: 'worried',
        valence: -0.2,
        sessionId: 'session-x',
      });

      const coOccs = await connector.getCoOccurrences(userId, 'work');
      expect(coOccs[0].count).toBeGreaterThan(coOccs[1].count);
    });
  });

  // ============================================================================
  // INSIGHTS
  // ============================================================================

  describe('generateInsights()', () => {
    it('generates emotional association insights', async () => {
      // Create strong negative pattern
      for (let i = 0; i < 6; i++) {
        await connector.recordObservation(userId, {
          topics: ['ex-partner'],
          emotion: 'sad',
          valence: -0.5,
          sessionId: `session-${i}`,
        });
      }

      const insights = await connector.generateInsights(userId);
      const emotionalInsights = insights.filter(
        (i) => i.type === 'emotional-association'
      );

      expect(emotionalInsights.length).toBeGreaterThan(0);
      expect(emotionalInsights[0].insight).toContain('ex-partner');
    });

    it('generates co-occurrence insights', async () => {
      // Create strong co-occurrence across sessions
      for (let i = 0; i < 6; i++) {
        await connector.recordObservation(userId, {
          topics: ['deadlines', 'anxiety'],
          emotion: 'stressed',
          valence: -0.3,
          sessionId: `session-${i}`,
        });
      }

      const insights = await connector.generateInsights(userId);
      const coOccInsights = insights.filter((i) => i.type === 'co-occurrence');

      expect(coOccInsights.length).toBeGreaterThan(0);
    });

    it('generates positive association insights', async () => {
      for (let i = 0; i < 6; i++) {
        await connector.recordObservation(userId, {
          topics: ['hiking'],
          emotion: 'happy',
          valence: 0.7,
          sessionId: `session-${i}`,
        });
      }

      const insights = await connector.generateInsights(userId);
      const positiveInsights = insights.filter(
        (i) => i.type === 'emotional-association' && i.insight.includes('lift')
      );

      expect(positiveInsights.length).toBeGreaterThan(0);
    });
  });

  describe('getUnsurfacedInsights()', () => {
    it('returns only unsurfaced insights', async () => {
      for (let i = 0; i < 6; i++) {
        await connector.recordObservation(userId, {
          topics: ['test'],
          emotion: 'sad',
          valence: -0.5,
          sessionId: `session-${i}`,
        });
      }

      await connector.generateInsights(userId);
      const unsurfaced = await connector.getUnsurfacedInsights(userId);
      
      expect(unsurfaced.length).toBeGreaterThan(0);
      expect(unsurfaced.every((i) => !i.surfaced)).toBe(true);
    });
  });

  describe('surfaceInsight()', () => {
    it('marks insight as surfaced', async () => {
      for (let i = 0; i < 6; i++) {
        await connector.recordObservation(userId, {
          topics: ['test'],
          emotion: 'sad',
          valence: -0.5,
          sessionId: `session-${i}`,
        });
      }

      const insights = await connector.generateInsights(userId);
      const insight = insights[0];

      await connector.surfaceInsight(userId, insight.id, 'helpful');

      const unsurfaced = await connector.getUnsurfacedInsights(userId);
      expect(unsurfaced.find((i) => i.id === insight.id)).toBeUndefined();
    });
  });

  // ============================================================================
  // CONTEXT INJECTION
  // ============================================================================

  describe('buildContextInjection()', () => {
    it('returns empty for new user', async () => {
      const context = await connector.buildContextInjection(userId, ['test']);
      expect(context).toBe('');
    });

    it('includes pattern info for known topics', async () => {
      for (let i = 0; i < 4; i++) {
        await connector.recordObservation(userId, {
          topics: ['family'],
          emotion: 'warm',
          valence: 0.6,
          sessionId: `session-${i}`,
        });
      }

      const context = await connector.buildContextInjection(userId, ['family']);
      expect(context).toContain('family');
    });

    it('flags difficult topics', async () => {
      for (let i = 0; i < 4; i++) {
        await connector.recordObservation(userId, {
          topics: ['conflict'],
          emotion: 'anxious',
          valence: -0.4,
          sessionId: `session-${i}`,
        });
      }

      const context = await connector.buildContextInjection(userId, ['conflict']);
      expect(context.toLowerCase()).toContain('difficult');
    });
  });

  // ============================================================================
  // RESET
  // ============================================================================

  describe('reset()', () => {
    it('resets without error', () => {
      expect(() => connector.reset()).not.toThrow();
    });
  });
});
