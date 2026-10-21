/**
 * A share card's SVG is public at GET /api/share/cards/:id/svg and, opened
 * directly, is a document on the app's origin. Its text comes from the
 * caller's request body, unchecked. So every value must be XML-escaped, and
 * the response must be inert (no script, sandboxed, no sniffing) even if one
 * slipped through. Drives the real route over a real HTTP server behind the
 * real identity layer; only the Firebase verifier and storage are mocked.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token === 'tok-A' ? { uid: 'user-A', claims: {} } : null
  ),
}));
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const doc = () => ({ set: async () => undefined, get: async () => ({ exists: false }) });
  return { ...real, getFirestoreDb: () => ({ collection: () => ({ doc }) }) };
});

const { bindVerifiedIdentity } = await import('../../../servers/api/request-identity.js');
const { handleShareRoutes } = await import('../share-routes.js');
const { generateCardSVG } = await import('../../../services/sharing/card-generator.js');

const HOSTILE = '</text><script>alert(1)</script><text x="0" onload="alert(2)">\'&';

let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    void (async () => {
      await bindVerifiedIdentity(req, { NODE_ENV: 'production' });
      const url = new URL(req.url || '/', 'http://local');
      if (!(await handleShareRoutes(req, res, url.pathname))) res.writeHead(404).end();
    })();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

/** No raw markup from the hostile value survives, and its text is still there, escaped. */
function expectInert(svg: string): void {
  expect(svg).not.toContain('<script');
  expect(svg).not.toContain('onload="');
  expect(svg).not.toContain('</text><');
  expect(svg).toContain('&lt;script&gt;');
  expect(svg).toContain('&quot;');
  expect(svg).toContain('&apos;');
  expect(svg).toContain('&amp;');
}

const cards: Array<[string, Record<string, unknown>]> = [
  [
    'musical-dna',
    {
      personalityLabel: HOSTILE,
      personalityDescription: HOSTILE,
      topGenres: [{ name: HOSTILE, score: HOSTILE }],
      totalGames: HOSTILE,
      currentStreak: HOSTILE,
    },
  ],
  [
    'desert-island',
    { picks: [{ rank: HOSTILE, trackName: HOSTILE, artistName: HOSTILE }], curatedDate: '' },
  ],
  [
    'game-victory',
    {
      gameDisplayName: HOSTILE,
      score: HOSTILE,
      trackName: HOSTILE,
      artistName: HOSTILE,
      isPersonalBest: true,
    },
  ],
  [
    'weekly-recap',
    {
      weekOf: new Date(2026, 9, 7),
      gamesPlayed: HOSTILE,
      totalMinutes: HOSTILE,
      bestMoment: HOSTILE,
      topGenreThisWeek: HOSTILE,
      streakDays: HOSTILE,
    },
  ],
  [
    'creative-profile',
    {
      personalityLabel: HOSTILE,
      personalityDescription: HOSTILE,
      topTopics: [{ name: HOSTILE, score: 50 }],
      totalContent: HOSTILE,
      insightsSaved: HOSTILE,
      learningStyle: HOSTILE,
    },
  ],
];

describe('share card SVG escaping', () => {
  it.each(cards)('%s escapes every caller-supplied field', (type, data) => {
    const svg = generateCardSVG(type as never, data as never);
    expectInert(svg);
  });
});

describe('GET /api/share/cards/:id/svg', () => {
  it('serves a hostile card escaped, with an inert-document policy and nosniff', async () => {
    const created = await fetch(`${base}/api/share/cards/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-A' },
      body: JSON.stringify({ type: 'musical-dna', data: cards[0][1] }),
    });
    expect(created.status).toBe(200);
    const { card } = (await created.json()) as { card: { id: string } };

    const res = await fetch(`${base}/api/share/cards/${card.id}/svg`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    expect(res.headers.get('content-security-policy')).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; sandbox"
    );
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expectInert(await res.text());
  });
});
