/**
 * The Trust Journey panel shows no "Trust Score".
 *
 * The server's old relationshipStrength was a weighted tally of the same counts the
 * panel already lists, presented as a measure of trust. It is gone from the API, and
 * the ring that drew it is gone from the panel.
 */

import { describe, expect, it } from 'vitest';
import { renderContent } from '../../src/ui/trust-journey/render.js';
import type { TrustJourneyData } from '../../src/ui/trust-journey/types.js';

const data = {
  userId: 'u1',
  generatedAt: new Date().toISOString(),
  summary: {
    trustSignalsDetected: 2,
    boundariesSet: 1,
    growthMomentsNoticed: 1,
    sharedMomentsCount: 0,
    winsCelebrated: 1,
    proactiveOutreach: 0,
  },
  growth: { patterns: [] },
  boundaries: { totalBoundaries: 1, typeCounts: { topic: 1 }, message: "You've set 1 boundary. I'll keep to it." },
  sharedHistory: { insideJokes: [], runningGags: 0 },
  celebrations: { wins: [], intentionsTracked: 0 },
  timeline: [],
} as unknown as TrustJourneyData;

describe('Trust Journey', () => {
  it('lists real counts and no trust score', () => {
    const html = renderContent(data, {} as Parameters<typeof renderContent>[1]);
    expect(html).not.toContain('trust-strength');
    expect(html).not.toMatch(/Trust Score/i);
    expect(html).toContain("You've set 1 boundary.");
  });
});
