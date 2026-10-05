import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBuilderBudget } from '../builder-budget.js';

describe('createBuilderBudget', () => {
  afterEach(() => vi.useRealTimers());

  it('returns a builder that finishes in time and records nothing', async () => {
    const budget = createBuilderBudget();
    await expect(budget.withTimeout(Promise.resolve('real'), 50, 'fallback', 'fast')).resolves.toBe('real');
    expect(budget.missed).toEqual([]);
  });

  it('falls back and records a builder that misses its budget', async () => {
    vi.useFakeTimers();
    const budget = createBuilderBudget();
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 500));
    const result = budget.withTimeout(slow, 50, 'fallback', 'live-superhuman');
    await vi.advanceTimersByTimeAsync(50);
    await expect(result).resolves.toBe('fallback');
    expect(budget.missed).toEqual(['live-superhuman']);
  });

  it('falls back and records a builder that throws', async () => {
    const budget = createBuilderBudget();
    const failing = Promise.reject(new Error('firestore down'));
    await expect(budget.withTimeout(failing, 50, 'fallback', 'boundary-check')).resolves.toBe('fallback');
    expect(budget.missed).toEqual(['boundary-check']);
  });

  it('clears its timer once the builder settles', async () => {
    vi.useFakeTimers();
    const budget = createBuilderBudget();
    await budget.withTimeout(Promise.resolve('real'), 50, 'fallback', 'fast');
    expect(vi.getTimerCount()).toBe(0);
  });
});
