/**
 * The Trust Journey shows only counts of real things.
 *
 * Before: "Wins celebrated" was counted from the UNcelebrated list, so it was
 * always 0; "Boundaries honored" counted boundaries the user had SET; and a
 * "Trust Score" ring showed a weighted tally of those same counts as if it were
 * a measure of trust. This runs the real route over the real small-wins store.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

const boundaries: Array<{ type: string }> = [];
vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireAuth: vi.fn(async () => ({ userId: 'trust-user', isAdmin: false })),
  rateLimit: vi.fn(() => false),
}));
vi.mock('../../services/trust-systems/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadTrustProfiles: vi.fn(async () => undefined),
  getActiveBoundaries: vi.fn(() => boundaries),
}));

const { handleTrustJourneyRoutes } = await import('../trust-journey-routes.js');
const { importSmallWinsProfile } = await import('../../services/trust-systems/small-wins.js');

async function getJourney() {
  const out = { status: 0, body: {} as Record<string, any> };
  const res = {
    writeHead: vi.fn((s: number) => {
      out.status = s;
    }),
    setHeader: vi.fn(),
    end: vi.fn((chunk?: string) => {
      out.body = chunk ? JSON.parse(chunk) : {};
    }),
  } as unknown as ServerResponse;
  const req = { method: 'GET', headers: {}, url: '/api/trust-journey' } as IncomingMessage;
  await handleTrustJourneyRoutes(req, res, '/api/trust-journey', new URL('http://x/api/trust-journey'));
  return out;
}

function seedWins(celebrated: number, uncelebrated: number) {
  const win = (i: number, isCelebrated: boolean) => ({
    id: `w${i}`,
    type: 'follow_through',
    description: 'Went for the run',
    timestamp: new Date(),
    celebrated: isCelebrated,
  });
  importSmallWinsProfile({
    userId: 'trust-user',
    wins: [
      ...Array.from({ length: celebrated }, (_, i) => win(i, true)),
      ...Array.from({ length: uncelebrated }, (_, i) => win(100 + i, false)),
    ],
    pendingIntentions: [],
    knownDifficulties: [],
    celebrationPreference: 'enthusiastic',
  } as unknown as Parameters<typeof importSmallWinsProfile>[0]);
}

beforeEach(() => {
  boundaries.length = 0;
});

describe('GET /api/trust-journey summary', () => {
  it.each([
    { celebrated: 0, uncelebrated: 2 },
    { celebrated: 1, uncelebrated: 2 },
    { celebrated: 3, uncelebrated: 0 },
  ])('$celebrated celebrated wins are counted as $celebrated', async ({ celebrated, uncelebrated }) => {
    seedWins(celebrated, uncelebrated);
    const { status, body } = await getJourney();
    expect(status).toBe(200);
    expect(body.summary.winsCelebrated).toBe(celebrated);
  });

  it('never sends a "trust score"', async () => {
    seedWins(3, 3);
    const { body } = await getJourney();
    expect(body.summary).not.toHaveProperty('relationshipStrength');
  });

  it.each([
    { n: 0, message: "No boundaries set yet. I'll always respect your space." },
    { n: 1, message: "You've set 1 boundary. I'll keep to it." },
    { n: 3, message: "You've set 3 boundaries. I'll keep to them." },
  ])('$n boundaries: counted as set, not as honored', async ({ n, message }) => {
    seedWins(0, 0);
    for (let i = 0; i < n; i++) boundaries.push({ type: 'topic' });
    const { body } = await getJourney();
    expect(body.summary.boundariesSet).toBe(n);
    expect(body.summary).not.toHaveProperty('boundariesRespected');
    expect(body.boundaries.message).toBe(message);
    expect(body.boundaries.message).not.toMatch(/honou?red/);
  });
});
