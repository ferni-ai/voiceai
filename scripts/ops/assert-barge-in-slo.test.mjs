import { describe, expect, it } from 'vitest';

import { evaluateBargeInSlo } from './assert-barge-in-slo.mjs';

describe('assert-barge-in-slo', () => {
  it('passes and skips when no barge-in samples exist', () => {
    const result = evaluateBargeInSlo({
      bargeInRecoverSamples: 0,
      bargeInRecoverP95Ms: 0,
    });

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
  });

  it('fails when p95 exceeds the 500ms SLO', () => {
    const result = evaluateBargeInSlo({
      bargeInRecoverSamples: 3,
      bargeInRecoverP95Ms: 650,
    });

    expect(result.ok).toBe(false);
    expect(result.maxMs).toBe(500);
  });
});
