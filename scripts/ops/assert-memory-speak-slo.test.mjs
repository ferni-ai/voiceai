import { describe, expect, it } from 'vitest';

import { evaluateMemorySpeakSlo } from './assert-memory-speak-slo.mjs';

describe('assert-memory-speak-slo', () => {
  it('passes when no sessions have memory data', () => {
    const result = evaluateMemorySpeakSlo({
      memory: {
        sessionsWithMemoryData: 0,
        memoryRecallRate: 0,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
  });

  it('requires at least one recall per ten memory-backed sessions', () => {
    const result = evaluateMemorySpeakSlo({
      memory: {
        sessionsWithMemoryData: 10,
        sessionsWithMemoryRecalls: 0,
        memoryRecallRate: 0,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.minRecallRate).toBe(0.1);
  });
});
