/**
 * Tests for Time Series Forecaster
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import {
  recordObservation,
  forecast,
  findOptimalTimes,
  analyzeTrend,
} from '../time-series-forecaster.js';

describe('TimeSeriesForecaster', () => {
  const testUserId = 'test-user-timeseries';

  describe('recordObservation', () => {
    it('should record a mood observation', () => {
      recordObservation(testUserId, 'mood', 0.7, new Date());
      // No error means success
    });

    it('should clamp values to 0-1', () => {
      recordObservation(testUserId, 'energy', 1.5, new Date());
      recordObservation(testUserId, 'energy', -0.5, new Date());
      // Should not throw
    });

    it('should accept all series types', () => {
      recordObservation(testUserId, 'mood', 0.5);
      recordObservation(testUserId, 'energy', 0.5);
      recordObservation(testUserId, 'engagement', 0.5);
      recordObservation(testUserId, 'stress', 0.5);
      // No error means success
    });
  });

  describe('forecast', () => {
    it('should return insufficient_data for new users', () => {
      const fc = forecast('brand-new-user-ts', 'mood', new Date());

      expect(fc.reliability).toBe('insufficient_data');
      expect(fc.predictedValue).toBe(0.5); // Neutral default
    });

    it('should return predictions after sufficient data', () => {
      const userId = 'test-forecast-user';

      // Add enough data points (7+ required)
      for (let i = 0; i < 10; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        recordObservation(userId, 'mood', 0.6 + Math.random() * 0.2, date);
      }

      const fc = forecast(userId, 'mood', new Date());

      expect(fc.reliability).not.toBe('insufficient_data');
      expect(fc.predictedValue).toBeGreaterThan(0);
      expect(fc.predictedValue).toBeLessThan(1);
      expect(fc.confidence.lower).toBeLessThanOrEqual(fc.predictedValue);
      expect(fc.confidence.upper).toBeGreaterThanOrEqual(fc.predictedValue);
    });

    it('should include seasonal components', () => {
      const userId = 'test-seasonal-user';

      // Add data with clear weekly pattern
      for (let week = 0; week < 4; week++) {
        for (let day = 0; day < 7; day++) {
          const date = new Date();
          date.setDate(date.getDate() - (week * 7 + day));

          // Higher mood on weekends
          const isWeekend = day === 0 || day === 6;
          const mood = isWeekend ? 0.8 : 0.5;

          recordObservation(userId, 'mood', mood, date);
        }
      }

      const fc = forecast(userId, 'mood', new Date());

      expect(fc.components).toBeDefined();
      expect(fc.components.seasonality).toBeDefined();
    });
  });

  describe('findOptimalTimes', () => {
    it('should return empty for users without data', () => {
      const times = findOptimalTimes('no-data-user', 'energy', 3);
      expect(times).toHaveLength(0);
    });

    it('should return sorted optimal times', () => {
      const userId = 'test-optimal-user';

      // Add enough data
      for (let i = 0; i < 14; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        recordObservation(userId, 'energy', 0.6, date);
      }

      const times = findOptimalTimes(userId, 'energy', 3);

      // Should be sorted by forecast value (descending for energy)
      for (let i = 1; i < times.length; i++) {
        expect(times[i - 1].forecast.predictedValue).toBeGreaterThanOrEqual(
          times[i].forecast.predictedValue
        );
      }
    });
  });

  describe('analyzeTrend', () => {
    it('should return stable for insufficient data', () => {
      const trend = analyzeTrend('no-trend-user', 'mood');

      expect(trend.direction).toBe('stable');
      expect(trend.confidence).toBeLessThan(0.5);
    });

    it('should detect improving trend', () => {
      const userId = 'test-improving-user';

      // Add improving data (older low, recent high)
      for (let i = 13; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);

        // Lower values in the past, higher values recently
        const mood = 0.4 + (14 - i) * 0.03;
        recordObservation(userId, 'mood', mood, date);
      }

      const trend = analyzeTrend(userId, 'mood');

      expect(trend.direction).toBe('improving');
      expect(trend.magnitude).toBeGreaterThan(0);
    });

    it('should detect declining trend', () => {
      const userId = 'test-declining-user';

      // Add declining data
      for (let i = 13; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);

        // Higher values in the past, lower values recently
        const mood = 0.8 - (14 - i) * 0.03;
        recordObservation(userId, 'mood', mood, date);
      }

      const trend = analyzeTrend(userId, 'mood');

      expect(trend.direction).toBe('declining');
    });
  });
});
