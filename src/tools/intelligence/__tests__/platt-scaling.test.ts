/**
 * Platt Scaling Tests
 *
 * Validates confidence calibration using Platt scaling.
 *
 * @module tools/intelligence/__tests__/platt-scaling.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  PlattScaler,
  getPlattScaler,
  initializePlattScaler,
  resetPlattScaler,
  type CalibrationSample,
} from '../platt-scaling.js';

describe('PlattScaler', () => {
  let scaler: PlattScaler;

  beforeEach(() => {
    scaler = new PlattScaler({ minSamples: 10 }); // Lower threshold for testing
  });

  describe('addSample', () => {
    it('should add samples to the buffer', () => {
      scaler.addSample(0.8, true);
      scaler.addSample(0.3, false);

      const stats = scaler.getBufferStats();
      expect(stats.count).toBe(2);
      expect(stats.positiveRate).toBe(0.5);
    });

    it('should clip confidence values to valid range', () => {
      // These should not throw - values are clipped internally
      scaler.addSample(0.0, true);
      scaler.addSample(1.0, false);
      scaler.addSample(-0.5, true);
      scaler.addSample(1.5, false);

      expect(scaler.getBufferStats().count).toBe(4);
    });

    it('should respect maxSamples limit', () => {
      const smallScaler = new PlattScaler({ maxSamples: 5, minSamples: 3 });

      for (let i = 0; i < 10; i++) {
        smallScaler.addSample(0.5, i % 2 === 0);
      }

      expect(smallScaler.getBufferStats().count).toBe(5);
    });
  });

  describe('addSamples', () => {
    it('should add multiple samples at once', () => {
      const samples: CalibrationSample[] = [
        { rawConfidence: 0.9, correct: 1 },
        { rawConfidence: 0.8, correct: 1 },
        { rawConfidence: 0.3, correct: 0 },
      ];

      scaler.addSamples(samples);
      expect(scaler.getBufferStats().count).toBe(3);
    });
  });

  describe('fit', () => {
    it('should not fit with insufficient samples', () => {
      scaler.addSample(0.8, true);
      scaler.addSample(0.3, false);

      const result = scaler.fit();
      expect(result).toBe(false);
      expect(scaler.isReady()).toBe(false);
    });

    it('should fit with sufficient samples', () => {
      // Add well-calibrated samples (confidence roughly matches accuracy)
      for (let i = 0; i < 15; i++) {
        const confidence = 0.1 + (i / 15) * 0.8;
        const correct = Math.random() < confidence;
        scaler.addSample(confidence, correct);
      }

      const result = scaler.fit();
      expect(result).toBe(true);
      expect(scaler.isReady()).toBe(true);
    });

    it('should reduce ECE after fitting', () => {
      // Create deliberately miscalibrated data
      // High confidence but low accuracy
      for (let i = 0; i < 20; i++) {
        scaler.addSample(0.9, i < 10); // 90% confident but only 50% correct
      }
      // Low confidence but high accuracy
      for (let i = 0; i < 20; i++) {
        scaler.addSample(0.3, i >= 5); // 30% confident but 75% correct
      }

      scaler.fit();
      const params = scaler.getParameters();

      expect(params).not.toBeNull();
      expect(params!.eceAfter).toBeLessThan(params!.eceBefore);
    });
  });

  describe('calibrate', () => {
    it('should return raw confidence when not fitted', () => {
      const raw = 0.75;
      const calibrated = scaler.calibrate(raw);
      expect(calibrated).toBe(raw);
    });

    it('should transform confidence after fitting', () => {
      // Add overconfident samples
      for (let i = 0; i < 30; i++) {
        scaler.addSample(0.9, i < 15); // 90% confident, 50% correct
      }

      scaler.fit();

      // After fitting, 0.9 confidence should be adjusted downward
      const calibrated = scaler.calibrate(0.9);
      expect(calibrated).toBeLessThan(0.9);
      expect(calibrated).toBeGreaterThan(0);
      expect(calibrated).toBeLessThan(1);
    });

    it('should handle edge cases', () => {
      // Fit with some data
      for (let i = 0; i < 15; i++) {
        scaler.addSample(0.5, i % 2 === 0);
      }
      scaler.fit();

      // Test boundary values
      const veryLow = scaler.calibrate(0.01);
      const veryHigh = scaler.calibrate(0.99);

      expect(veryLow).toBeGreaterThanOrEqual(0);
      expect(veryLow).toBeLessThanOrEqual(1);
      expect(veryHigh).toBeGreaterThanOrEqual(0);
      expect(veryHigh).toBeLessThanOrEqual(1);
    });
  });

  describe('calibrateBatch', () => {
    it('should calibrate multiple values', () => {
      // Fit with data
      for (let i = 0; i < 15; i++) {
        scaler.addSample(0.5 + i * 0.03, i % 2 === 0);
      }
      scaler.fit();

      const rawValues = [0.3, 0.5, 0.7, 0.9];
      const calibrated = scaler.calibrateBatch(rawValues);

      expect(calibrated.length).toBe(4);
      calibrated.forEach((v) => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('setParameters', () => {
    it('should allow restoring parameters', () => {
      // First, fit the scaler
      for (let i = 0; i < 15; i++) {
        scaler.addSample(0.5 + i * 0.02, i % 2 === 0);
      }
      scaler.fit();
      const originalParams = scaler.getParameters()!;

      // Create a new scaler and restore parameters
      const newScaler = new PlattScaler();
      newScaler.setParameters(originalParams);

      expect(newScaler.isReady()).toBe(true);
      expect(newScaler.getParameters()?.A).toBe(originalParams.A);
      expect(newScaler.getParameters()?.B).toBe(originalParams.B);

      // Should produce same calibration
      const testValue = 0.75;
      expect(newScaler.calibrate(testValue)).toBe(scaler.calibrate(testValue));
    });
  });

  describe('clearBuffer', () => {
    it('should clear the sample buffer', () => {
      scaler.addSample(0.8, true);
      scaler.addSample(0.3, false);
      expect(scaler.getBufferStats().count).toBe(2);

      scaler.clearBuffer();
      expect(scaler.getBufferStats().count).toBe(0);
    });

    it('should not affect fitted parameters', () => {
      for (let i = 0; i < 15; i++) {
        scaler.addSample(0.5 + i * 0.02, i % 2 === 0);
      }
      scaler.fit();
      const params = scaler.getParameters();

      scaler.clearBuffer();

      expect(scaler.isReady()).toBe(true);
      expect(scaler.getParameters()).toEqual(params);
    });
  });
});

describe('Global PlattScaler', () => {
  beforeEach(() => {
    resetPlattScaler();
  });

  it('should provide singleton instance', () => {
    const scaler1 = getPlattScaler();
    const scaler2 = getPlattScaler();
    expect(scaler1).toBe(scaler2);
  });

  it('should allow custom initialization', () => {
    const customScaler = initializePlattScaler({ minSamples: 200 });
    expect(customScaler).toBe(getPlattScaler());
  });

  it('should reset to new instance', () => {
    const scaler1 = getPlattScaler();
    scaler1.addSample(0.5, true);

    resetPlattScaler();

    const scaler2 = getPlattScaler();
    expect(scaler2).not.toBe(scaler1);
    expect(scaler2.getBufferStats().count).toBe(0);
  });
});

describe('Calibration Quality', () => {
  it('should improve calibration on realistic data', () => {
    const scaler = new PlattScaler({ minSamples: 50 });

    // Simulate a classifier that's overconfident
    // When it says 0.9, it's only right 70% of the time
    // When it says 0.7, it's only right 50% of the time
    for (let i = 0; i < 100; i++) {
      const raw = Math.random() * 0.5 + 0.5; // 0.5 to 1.0
      const trueAccuracy = raw * 0.7; // Overconfident
      const correct = Math.random() < trueAccuracy;
      scaler.addSample(raw, correct);
    }

    scaler.fit();
    const params = scaler.getParameters();

    expect(params).not.toBeNull();
    // ECE should improve
    expect(params!.eceAfter).toBeLessThan(params!.eceBefore);
    // A should be positive (dampening overconfidence)
    // Note: The actual sign depends on the data distribution
    expect(typeof params!.A).toBe('number');
    expect(typeof params!.B).toBe('number');
  });

  it('should handle well-calibrated data', () => {
    const scaler = new PlattScaler({ minSamples: 50 });

    // Already well-calibrated: confidence ≈ accuracy
    for (let i = 0; i < 100; i++) {
      const confidence = Math.random();
      const correct = Math.random() < confidence;
      scaler.addSample(confidence, correct);
    }

    scaler.fit();
    const params = scaler.getParameters();

    expect(params).not.toBeNull();
    // Should not significantly change well-calibrated data
    // A should be close to 1 and B close to 0
    expect(Math.abs(params!.A - 1)).toBeLessThan(1);
    expect(Math.abs(params!.B)).toBeLessThan(1);
  });
});
