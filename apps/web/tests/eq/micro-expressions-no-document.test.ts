/**
 * playMicroExpression survives a missing `document`.
 *
 * Flake (CI runs 39737828268, 39533060618): a tracked timer scheduled by
 * detectAndTriggerMicroExpression fired after an earlier test file's jsdom was
 * torn down, so `document.dispatchEvent` threw "document is not defined" and
 * vitest failed the run with every test green.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearMicroExpressionTimers,
  detectAndTriggerMicroExpression,
  playMicroExpression,
} from '../../src/eq/capabilities/micro-expressions.js';

afterEach(() => {
  clearMicroExpressionTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('playMicroExpression without a DOM', () => {
  it('does not throw when document is undefined', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // always passes the probability roll
    vi.stubGlobal('document', undefined);
    expect(typeof document).toBe('undefined');

    expect(() => playMicroExpression('warmth_pulse')).not.toThrow();
  });

  it('still dispatches telemetry when a document exists', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const seen: string[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent).detail.expressionType);
    document.addEventListener('ferni:telemetry', listener);
    try {
      playMicroExpression('warmth_pulse');
    } finally {
      document.removeEventListener('ferni:telemetry', listener);
    }
    expect(seen).toEqual(['warmth_pulse']);
  });
});

describe('clearMicroExpressionTimers', () => {
  it('cancels the follow-up expression scheduled by a vulnerable-share trigger', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const seen: string[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent).detail.expressionType);
    document.addEventListener('ferni:telemetry', listener);
    try {
      detectAndTriggerMicroExpression({ isVulnerable: true } as never);
      expect(seen).toEqual(['protective']);

      clearMicroExpressionTimers();
      vi.advanceTimersByTime(1_000);

      expect(seen).toEqual(['protective']); // warmth_pulse (200ms later) never fired
    } finally {
      document.removeEventListener('ferni:telemetry', listener);
    }
  });
});
