/**
 * GET /api/sanctuary greets and suggests by the person's time of day, from the zone the
 * app sends, not by the server's clock (UTC on Cloud Run).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

const { buildSuperhumanContext } = vi.hoisted(() => ({
  buildSuperhumanContext: vi.fn(async () => ({})),
}));
vi.mock('../services/superhuman/index.js', () => ({ buildSuperhumanContext }));
vi.mock('../services/superhuman/semantic-intelligence/insight-broker.js', () => ({
  getInsightsToSurface: vi.fn(async () => []),
}));
vi.mock('../services/superhuman/predictive-coaching.js', () => ({
  loadUserPatterns: vi.fn(async () => null),
}));
vi.mock('../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => null),
  cleanForFirestore: (x: unknown) => x,
}));

import { handleSanctuaryRoutes } from '../api/sanctuary-routes.js';

async function sanctuary(
  query: string,
  // The caller as the request-identity layer binds it from their token
  headers: Record<string, string> = { 'x-firebase-uid': 'u1' }
): Promise<{ timeContext: string; greeting: string }> {
  const req = {
    method: 'GET',
    url: `/api/sanctuary?${query}`,
    headers: { host: 'local', ...headers },
  } as unknown as IncomingMessage;
  let body = '';
  const res = {
    writeHead: vi.fn(),
    setHeader: vi.fn(),
    end: vi.fn((data?: string) => {
      body = data ?? '';
    }),
  } as unknown as ServerResponse;
  await handleSanctuaryRoutes(req, res, '/api/sanctuary');
  return JSON.parse(body);
}

describe('GET /api/sanctuary', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T08:31:00Z')); // Saturday, 08:31 UTC
  });
  afterEach(() => vi.useRealTimers());

  it('is morning in London and night in Los Angeles at the same moment', async () => {
    expect((await sanctuary('userId=u1&tz=Europe/London')).timeContext).toBe('morning');
    expect((await sanctuary('userId=u1&tz=America/Los_Angeles')).timeContext).toBe('night');
  });

  it("greets with the person's weekday", async () => {
    vi.setSystemTime(new Date('2026-10-10T14:00:00Z')); // Saturday in UTC, Sunday 3am in Auckland
    expect((await sanctuary('userId=u1&tz=Pacific/Auckland')).greeting).toMatch(/SUNDAY/i);
  });

  it('builds the context for the verified caller, not a userId naming someone else', async () => {
    buildSuperhumanContext.mockClear();
    await sanctuary('userId=someone-else&tz=Europe/London', { 'x-firebase-uid': 'u1' });
    const users = buildSuperhumanContext.mock.calls.map((c) => c[0]);
    expect(users.length).toBeGreaterThan(0);
    expect(new Set(users)).toEqual(new Set(['u1']));
  });
});
