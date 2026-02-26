/**
 * Tests for Predictive Cache Warming
 *
 * Validates:
 * - Time signal detection
 * - Query prediction logic
 * - Confidence scoring
 * - Handoff-based predictions
 * - Cache warming integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectTimeSignals,
  predictQueries,
  warmCacheForSession,
  warmCacheForHandoff,
  configurePredictiveWarming,
  configureMemoryRetrieval,
  type SessionSignals,
} from '../predictive-cache-warming.js';

// Mock dependencies
vi.mock('../embeddings.js', () => ({
  embed: vi.fn().mockResolvedValue(Array(1536).fill(0.1)),
}));

vi.mock('../semantic-memory-cache.js', () => ({
  storeInSemanticCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../utils/safe-logger.js', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return {
    createLogger: () => mockLogger,
    getLogger: () => mockLogger,
  };
});

describe('Predictive Cache Warming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default config
    configurePredictiveWarming({
      confidenceThreshold: 0.5,
      maxQueriesPerSession: 5,
      parallelWarming: true,
      debug: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('detectTimeSignals', () => {
    it('detects morning time correctly', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-12-24T08:30:00'));

      const signals = detectTimeSignals();

      expect(signals.timeOfDay).toBe('morning');
      expect(signals.dayOfWeek).toBe('tuesday');
    });

    it('detects afternoon time correctly', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-12-24T14:00:00'));

      const signals = detectTimeSignals();

      expect(signals.timeOfDay).toBe('afternoon');
    });

    it('detects evening time correctly', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-12-24T19:00:00'));

      const signals = detectTimeSignals();

      expect(signals.timeOfDay).toBe('evening');
    });

    it('detects night time correctly', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-12-24T23:00:00'));

      const signals = detectTimeSignals();

      expect(signals.timeOfDay).toBe('night');
    });

    it('detects Monday correctly', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-12-23T09:00:00')); // Monday

      const signals = detectTimeSignals();

      expect(signals.dayOfWeek).toBe('monday');
    });

    it('detects Sunday correctly', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-12-22T19:00:00')); // Sunday

      const signals = detectTimeSignals();

      expect(signals.dayOfWeek).toBe('sunday');
    });
  });

  describe('predictQueries', () => {
    it('predicts morning queries correctly', () => {
      const signals: SessionSignals = {
        timeOfDay: 'morning',
        dayOfWeek: 'tuesday',
        currentPersona: 'ferni',
      };

      const predictions = predictQueries(signals);

      expect(predictions.length).toBeGreaterThan(0);
      expect(predictions.some((p) => p.query.includes('sleep'))).toBe(true);
      expect(predictions.some((p) => p.query.includes('calendar'))).toBe(true);
    });

    it('predicts Monday morning queries with high confidence', () => {
      const signals: SessionSignals = {
        timeOfDay: 'morning',
        dayOfWeek: 'monday',
        currentPersona: 'ferni',
      };

      const predictions = predictQueries(signals);

      // Should have the "What's my week look like?" query with boosted confidence
      const weekQuery = predictions.find((p) => p.query.includes('week look like'));
      expect(weekQuery).toBeDefined();
      expect(weekQuery!.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('predicts handoff-specific queries when switching personas', () => {
      const signals: SessionSignals = {
        timeOfDay: 'afternoon',
        dayOfWeek: 'wednesday',
        currentPersona: 'peter-john',
        previousPersona: 'ferni',
      };

      const predictions = predictQueries(signals);

      // Should include Peter's financial queries
      expect(predictions.some((p) => p.query.includes('stocks'))).toBe(true);
      expect(predictions.some((p) => p.query.includes('portfolio'))).toBe(true);
    });

    it('does not include handoff predictions without persona change', () => {
      const signals: SessionSignals = {
        timeOfDay: 'afternoon',
        dayOfWeek: 'wednesday',
        currentPersona: 'peter-john',
        // No previousPersona
      };

      const predictions = predictQueries(signals);

      // Should NOT include Peter's specific queries since it's not a handoff
      // (No previousPersona means not a handoff scenario)
      const hasHighConfidenceFinance = predictions.some(
        (p) => p.category === 'finance' && p.confidence >= 0.8
      );
      expect(hasHighConfidenceFinance).toBe(false);
    });

    it('boosts confidence for returning users', () => {
      const newUserSignals: SessionSignals = {
        timeOfDay: 'morning',
        dayOfWeek: 'tuesday',
        currentPersona: 'ferni',
        isReturningUser: false,
      };

      const returningUserSignals: SessionSignals = {
        ...newUserSignals,
        isReturningUser: true,
      };

      const newUserPredictions = predictQueries(newUserSignals);
      const returningUserPredictions = predictQueries(returningUserSignals);

      // Returning user predictions should have higher or equal confidence
      const newMax = Math.max(...newUserPredictions.map((p) => p.confidence));
      const returningMax = Math.max(...returningUserPredictions.map((p) => p.confidence));

      expect(returningMax).toBeGreaterThanOrEqual(newMax);
    });

    it('respects confidence threshold', () => {
      configurePredictiveWarming({ confidenceThreshold: 0.9 });

      const signals: SessionSignals = {
        timeOfDay: 'morning',
        dayOfWeek: 'tuesday',
        currentPersona: 'ferni',
      };

      const predictions = predictQueries(signals);

      // All predictions should meet the threshold
      predictions.forEach((p) => {
        expect(p.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });

    it('respects max queries per session limit', () => {
      configurePredictiveWarming({ maxQueriesPerSession: 2 });

      const signals: SessionSignals = {
        timeOfDay: 'morning',
        dayOfWeek: 'monday',
        currentPersona: 'ferni',
        isReturningUser: true,
      };

      const predictions = predictQueries(signals);

      expect(predictions.length).toBeLessThanOrEqual(2);
    });

    it('deduplicates identical queries', () => {
      const signals: SessionSignals = {
        timeOfDay: 'morning',
        dayOfWeek: 'monday',
        currentPersona: 'alex-chen',
        previousPersona: 'ferni',
      };

      const predictions = predictQueries(signals);

      // Calendar queries appear in both time and persona predictions
      // Should be deduplicated
      const calendarQueries = predictions.filter((p) => p.query.toLowerCase().includes('calendar'));
      const uniqueCalendarQueries = new Set(calendarQueries.map((p) => p.query));

      expect(calendarQueries.length).toBe(uniqueCalendarQueries.size);
    });

    it('sorts predictions by confidence descending', () => {
      const signals: SessionSignals = {
        timeOfDay: 'morning',
        dayOfWeek: 'monday',
        currentPersona: 'ferni',
        isReturningUser: true,
      };

      const predictions = predictQueries(signals);

      for (let i = 1; i < predictions.length; i++) {
        expect(predictions[i - 1].confidence).toBeGreaterThanOrEqual(predictions[i].confidence);
      }
    });
  });

  describe('warmCacheForSession', () => {
    it('returns empty result when memory fetch not configured', async () => {
      const signals: SessionSignals = {
        timeOfDay: 'morning',
        dayOfWeek: 'monday',
        currentPersona: 'ferni',
      };

      // Don't configure memory fetch function
      const result = await warmCacheForSession('user123', signals);

      expect(result.warmedCount).toBe(0);
      expect(result.queries).toHaveLength(0);
    });

    it('warms cache when memory fetch is configured', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ data: 'test' });
      configureMemoryRetrieval(mockFetch);

      const signals: SessionSignals = {
        timeOfDay: 'morning',
        dayOfWeek: 'monday',
        currentPersona: 'ferni',
        isReturningUser: true,
      };

      const result = await warmCacheForSession('user123', signals);

      expect(result.warmedCount).toBeGreaterThan(0);
      expect(result.queries.length).toBeGreaterThan(0);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('handles empty fetch results gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue(null);
      configureMemoryRetrieval(mockFetch);

      const signals: SessionSignals = {
        timeOfDay: 'morning',
        dayOfWeek: 'monday',
        currentPersona: 'ferni',
      };

      const result = await warmCacheForSession('user123', signals);

      // Should complete without error but with no warmed queries
      expect(result.warmedCount).toBe(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('handles fetch errors gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('DB error'));
      configureMemoryRetrieval(mockFetch);

      const signals: SessionSignals = {
        timeOfDay: 'morning',
        dayOfWeek: 'monday',
        currentPersona: 'ferni',
      };

      const result = await warmCacheForSession('user123', signals);

      // Should complete without throwing
      expect(result.warmedCount).toBe(0);
    });

    it('returns timing information', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ data: 'test' });
      configureMemoryRetrieval(mockFetch);

      const signals: SessionSignals = {
        timeOfDay: 'morning',
        dayOfWeek: 'monday',
        currentPersona: 'ferni',
      };

      const result = await warmCacheForSession('user123', signals);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('warmCacheForHandoff', () => {
    it('warms cache with handoff-specific predictions', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-12-24T14:00:00'));

      const mockFetch = vi.fn().mockResolvedValue({ portfolio: 'data' });
      configureMemoryRetrieval(mockFetch);

      const result = await warmCacheForHandoff('user123', 'ferni', 'peter-john');

      // Should have called fetch with financial queries
      const calledQueries = mockFetch.mock.calls.map((call) => call[1]);
      expect(
        calledQueries.some((q: string) => q.includes('stocks') || q.includes('portfolio'))
      ).toBe(true);
      expect(result.warmedCount).toBeGreaterThan(0);
    });

    it('includes time-based predictions along with handoff predictions', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-12-23T09:00:00')); // Monday morning

      const mockFetch = vi.fn().mockResolvedValue({ data: 'test' });
      configureMemoryRetrieval(mockFetch);

      const result = await warmCacheForHandoff('user123', 'ferni', 'alex-chen');

      // Should include both Monday/morning and Alex-specific queries
      expect(result.warmedCount).toBeGreaterThan(0);
    });
  });

  describe('Maya Santos predictions', () => {
    it('predicts habit-related queries after handoff to Maya', () => {
      const signals: SessionSignals = {
        timeOfDay: 'morning',
        dayOfWeek: 'tuesday',
        currentPersona: 'maya-santos',
        previousPersona: 'ferni',
      };

      const predictions = predictQueries(signals);

      expect(predictions.some((p) => p.query.includes('habits'))).toBe(true);
    });
  });

  describe('Jordan Taylor predictions', () => {
    it('predicts milestone queries after handoff to Jordan', () => {
      const signals: SessionSignals = {
        timeOfDay: 'afternoon',
        dayOfWeek: 'wednesday',
        currentPersona: 'jordan-taylor',
        previousPersona: 'ferni',
      };

      const predictions = predictQueries(signals);

      expect(predictions.some((p) => p.query.includes('milestone'))).toBe(true);
    });
  });

  describe('Nayan Patel predictions', () => {
    it('predicts reflection queries after handoff to Nayan', () => {
      const signals: SessionSignals = {
        timeOfDay: 'evening',
        dayOfWeek: 'friday',
        currentPersona: 'nayan-patel',
        previousPersona: 'ferni',
      };

      const predictions = predictQueries(signals);

      expect(predictions.some((p) => p.query.includes('reflect'))).toBe(true);
    });
  });

  describe('Sunday evening planning', () => {
    it('predicts weekly planning queries with boosted confidence', () => {
      const signals: SessionSignals = {
        timeOfDay: 'evening',
        dayOfWeek: 'sunday',
        currentPersona: 'ferni',
      };

      const predictions = predictQueries(signals);

      const weekQuery = predictions.find((p) => p.query.includes('coming up this week'));
      expect(weekQuery).toBeDefined();
      expect(weekQuery!.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe('Friday reflection', () => {
    it('predicts week reflection queries on Friday', () => {
      const signals: SessionSignals = {
        timeOfDay: 'evening',
        dayOfWeek: 'friday',
        currentPersona: 'ferni',
      };

      const predictions = predictQueries(signals);

      expect(predictions.some((p) => p.query.includes('week'))).toBe(true);
    });
  });
});
