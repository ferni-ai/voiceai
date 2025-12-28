/**
 * Future Insights UI Tests
 *
 * Basic tests for the "What I'll Know About You" modal.
 * These tests verify the module exports and basic functionality.
 *
 * Run with: npx vitest run apps/web/tests/ui/future-insights.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Simple mock setup - mock only what we need
vi.mock('../../src/config/animation-constants.js', () => ({
  DURATION: { FAST: 100, NORMAL: 200, SLOW: 300, MODERATE: 400, DELIBERATE: 500 },
  EASING: { STANDARD: 'ease-out', SPRING: 'ease-out', GENTLE: 'ease-out' },
  prefersReducedMotion: () => false,
}));

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../src/utils/tracked-timeout.js', () => ({
  createTimeoutTracker: () => ({
    trackedTimeout: (fn: () => void, delay: number) => setTimeout(fn, delay),
    clearAll: vi.fn(),
  }),
}));

vi.mock('../../src/i18n/index.js', () => ({
  t: (key: string) => key,
}));

describe('Future Insights UI', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.querySelectorAll('.future-insights-modal').forEach((el) => el.remove());
    vi.clearAllMocks();
  });

  describe('Module Exports', () => {
    it('should export futureInsightsUI object', async () => {
      const module = await import('../../src/ui/future-insights.ui.js');
      expect(module.futureInsightsUI).toBeDefined();
    });

    it('should have open method', async () => {
      const module = await import('../../src/ui/future-insights.ui.js');
      expect(typeof module.futureInsightsUI.open).toBe('function');
    });
  });

  describe('Constants', () => {
    it('should export required methods', async () => {
      const module = await import('../../src/ui/future-insights.ui.js');
      // The module should have core methods
      expect(module.futureInsightsUI).toBeDefined();
      expect(typeof module.futureInsightsUI.open).toBe('function');
      expect(typeof module.futureInsightsUI.close).toBe('function');
      expect(typeof module.futureInsightsUI.toggle).toBe('function');
    });
  });
});

describe('Future Insights Integration', () => {
  it('should be importable without errors', async () => {
    const importPromise = import('../../src/ui/future-insights.ui.js');
    await expect(importPromise).resolves.toBeDefined();
  });
});
