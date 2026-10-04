/**
 * forecastEnergy: the stated method behind Your Story's "Where You're Headed".
 */
import { describe, expect, it } from 'vitest';
import { forecastEnergy } from '../api/your-story-prediction.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 4, 12);
const daily = (scores: number[]) =>
  scores.map((energyScore, i) => ({ timestamp: NOW - (scores.length - 1 - i) * DAY, energyScore }));

describe('forecastEnergy', () => {
  it('needs 6 readings on at least 4 days', () => {
    expect(forecastEnergy(daily([50, 52, 54, 56, 58]), NOW)).toBeNull(); // 5 readings
    const sixOnThreeDays = [0, 0, 1, 1, 2, 2].map((d) => ({
      timestamp: NOW - d * DAY,
      energyScore: 50 + d,
    }));
    expect(forecastEnergy(sixOnThreeDays, NOW)).toBeNull();
  });

  it('ignores readings older than 28 days', () => {
    const old = daily([40, 42, 44, 46, 48, 50]).map((r) => ({
      ...r,
      timestamp: r.timestamp - 40 * DAY,
    }));
    expect(forecastEnergy(old, NOW)).toBeNull();
  });

  it('a falling trend forecasts lower, with the drop per week in its basis', () => {
    const f = forecastEnergy(daily([80, 77, 75, 72, 70, 67, 65]), NOW)!;
    expect(f.predictedValue).toBeLessThan(f.currentValue);
    expect(f.basis).toMatch(/falling about \d+(\.\d)? points a week/);
  });

  it('noisy readings widen the range and lower confidence compared with steady ones', () => {
    const steady = forecastEnergy(daily([50, 51, 52, 53, 54, 55, 56]), NOW)!;
    const noisy = forecastEnergy(daily([50, 70, 45, 68, 52, 75, 56]), NOW)!;
    const width = (f: typeof steady) => f.range.optimistic - f.range.conservative;
    expect(width(noisy)).toBeGreaterThan(width(steady));
    expect(noisy.confidence).toBeLessThan(steady.confidence);
  });

  it('clamps a steep trend to the 0-100 scale instead of forecasting past it', () => {
    // Unclamped, this line reaches ~170 in two weeks.
    const f = forecastEnergy(daily([70, 75, 80, 85, 90, 95, 100]), NOW)!;
    expect(f.predictedValue).toBe(100);
    expect(f.range.optimistic).toBe(100);
    const down = forecastEnergy(daily([30, 25, 20, 15, 10, 5, 0]), NOW)!;
    expect(down.predictedValue).toBe(0);
    expect(down.range.conservative).toBe(0);
  });
});
