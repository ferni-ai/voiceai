/**
 * The annual-pattern templates, filled with no user-specific season or reason
 * (the usual case), produced "this time is complex for you historically..." in
 * lower case and "...for you. . How are you preparing?". Each template is picked
 * here in turn, two weeks before an annual pattern.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../seasonal-awareness.js', () => ({
  buildSeasonalContext: vi.fn(async () => null),
}));

import { anticipatoryGenerator } from '../anticipatory.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('anticipatory annual-pattern messages', () => {
  // 11 November: Thanksgiving (an annual pattern) is 4 days out.
  it.each([0, 0.4, 0.8])('read as a sentence (template pick %s)', async (pick) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 11, 12));
    vi.spyOn(Math, 'random').mockReturnValue(pick);

    const insights = await anticipatoryGenerator.generate('user-anticipatory-test', {});
    const annual = insights.filter((i) => i.message.includes('complex'));

    expect(annual).toHaveLength(1);
    const message = annual[0]!.message;
    expect(message[0]).toBe(message[0]!.toUpperCase());
    expect(message).not.toMatch(/\.\s+\./);
  });
});
