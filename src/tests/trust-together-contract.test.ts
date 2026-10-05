/**
 * "How we're doing together" and "things I've noticed", end to end.
 *
 * Writer: the voice agent's real per-turn recorder and session-end save, run
 * at real points in time (fake clock) for a realistic month of calls. Ferni's
 * promises are seeded the way ferni-commitments.ts stores them (Firestore is
 * the only fake here). Reader: a fresh API process's real route handler.
 * Renderer: the web's real parser and tab renderers, with the real en-US
 * strings.
 *
 * Before: /api/trust/health and /api/trust/insights read docs nothing wrote, so
 * every user - even one with a month of calls - got hasData:false forever.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

const store = new Map<string, Record<string, unknown>>();
const failReads = { on: false };

function docRef(path: string): Record<string, unknown> {
  return {
    collection: (name: string) => collectionRef(`${path}/${name}`),
    async set(data: Record<string, unknown>) {
      store.set(path, { ...(store.get(path) ?? {}), ...data });
    },
    async get() {
      if (failReads.on) throw new Error('firestore unavailable');
      const data = store.get(path);
      return { exists: data !== undefined, data: () => data };
    },
  };
}

function collectionRef(path: string, desc = false, max = Infinity): Record<string, unknown> {
  return {
    doc: (id: string) => docRef(`${path}/${id}`),
    orderBy: (_field: string, dir?: string) => collectionRef(path, dir === 'desc', max),
    limit: (n: number) => collectionRef(path, desc, n),
    async get() {
      if (failReads.on) throw new Error('firestore unavailable');
      const docs = [...store.entries()]
        .filter(([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'))
        .map(([p, d]) => ({ id: p.slice(path.length + 1), data: () => d }));
      return { docs: (desc ? docs.reverse() : docs).slice(0, max) };
    },
  };
}

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: collectionRef }),
  FieldValue: { serverTimestamp: () => 'server-timestamp' },
}));
vi.mock('@livekit/agents', () => ({
  log: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req: IncomingMessage) => ({
    userId: req.headers['x-test-uid'] as string,
    isAdmin: false,
  })),
  rateLimit: vi.fn(() => false),
}));

const TZ = 'America/New_York';
const NOW = new Date('2026-10-04T16:00:00Z'); // Sunday noon in New York
type Turn = [emotion: string, intensity: number, text?: string];

/** A month of evening calls (local 8:15pm), each a few turns, then the session-end save. */
const MONTH: Array<[localDay: string, turns: Turn[]]> = [
  [
    '2026-09-06',
    [
      ['anxiety', 0.7],
      ['neutral', 0.5],
      ['trust', 0.7],
    ],
  ],
  [
    '2026-09-09',
    [
      ['neutral', 0.5],
      ['joy', 0.6],
    ],
  ],
  [
    '2026-09-13',
    [
      ['sadness', 0.6],
      ['neutral', 0.5],
    ],
  ],
  [
    '2026-09-20',
    [
      ['trust', 0.6],
      ['joy', 0.7],
    ],
  ],
  [
    '2026-09-23',
    [
      ['anxiety', 0.7],
      ['anxiety', 0.7],
    ],
  ],
  [
    '2026-09-25',
    [
      ['sadness', 0.8],
      ['sadness', 0.8],
    ],
  ],
  [
    '2026-09-27',
    [
      ['joy', 0.7],
      ['joy', 0.8],
    ],
  ],
  [
    '2026-09-29',
    [
      ['trust', 0.6],
      ['joy', 0.8],
    ],
  ],
  [
    '2026-10-01',
    [
      ['joy', 0.6],
      ['joy', 0.7],
    ],
  ],
  [
    '2026-10-03',
    [
      ['trust', 0.7],
      ['joy', 0.8, 'I have a job interview next Tuesday at Google'],
    ],
  ],
];

async function agentCalls(userId: string, days: typeof MONTH): Promise<void> {
  const { recordTrustSystemsData } =
    await import('../agents/voice-agent/trust-recording-handler.js');
  const { saveTrustProfiles } = await import('../services/trust-systems/persistence.js');
  for (const [day, turns] of days) {
    const start = new Date(`${day}T20:15:00-04:00`).getTime();
    for (const [i, [emotion, intensity, text]] of turns.entries()) {
      vi.setSystemTime(start + i * 4 * 60_000);
      await recordTrustSystemsData({
        userId,
        userText: text ?? 'Just checking in.',
        result: { emotional: { primary: emotion, intensity }, context: {} },
      });
    }
    await saveTrustProfiles(userId);
  }
}

/** Promises as ferni-commitments.ts saves them; read back, dates are Timestamps. */
function seedPromise(userId: string, id: string, madeAt: string, fulfilledAt?: string): void {
  const ts = (iso: string) => ({ toDate: () => new Date(iso) });
  store.set(`bogle_users/${userId}/ferni_commitments/${id}`, {
    id,
    userId,
    type: 'check_in',
    commitment: "I'll check in about that",
    madeAt: ts(madeAt),
    fulfilled: fulfilledAt !== undefined,
    ...(fulfilledAt ? { fulfilledAt: ts(fulfilledAt) } : {}),
  });
}

async function apiGet(
  uid: string,
  path: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { handleTrustSystemsRoutes } = await import('../api/trust-systems-routes.js');
  const out = { status: 0, body: {} as Record<string, unknown> };
  const res = {
    headersSent: false,
    setHeader: vi.fn(),
    writeHead(status: number) {
      out.status = status;
      return this;
    },
    end(chunk?: string) {
      if (chunk) out.body = JSON.parse(chunk);
    },
  } as unknown as ServerResponse;
  const req = { method: 'GET', url: path, headers: { host: 'localhost', 'x-test-uid': uid } };
  const url = new URL(path, 'http://localhost');
  await handleTrustSystemsRoutes(req as unknown as IncomingMessage, res, url.pathname, url);
  return out;
}

/** The web dashboard with its real en-US strings loaded. */
async function web() {
  // setLocale touches document.documentElement; node has no DOM.
  const el = { lang: '', dir: '', classList: { add: vi.fn(), remove: vi.fn() } };
  vi.stubGlobal('document', { documentElement: el });
  const i18n = await import('../../apps/web/src/i18n/index.js');
  await i18n.setLocale('en-US', { reload: false });
  const data = await import('../../apps/web/src/ui/trust-dashboard-data.js');
  const ui = await import('../../apps/web/src/ui/trust-dashboard.ui.js');
  return { ...data, ...ui };
}

/** Every id the user's stored records carry: snapshots, life events, promises. */
function storedIds(userId: string): Set<string> {
  const prefix = `bogle_users/${userId}/`;
  const ids = new Set<string>();
  const timeline = store.get(`${prefix}trust_profiles/sentiment_timeline`);
  for (const s of JSON.parse(timeline?.data as string).snapshots) ids.add(s.id);
  const events = store.get(`${prefix}trust_profiles/life_events`);
  for (const e of JSON.parse((events?.data as string) ?? '[]')) ids.add(e.id);
  for (const p of store.keys())
    if (p.startsWith(`${prefix}ferni_commitments/`)) ids.add(p.split('/').pop() as string);
  return ids;
}

/** What the user reads: tags dropped, the renderer's escapes undone. */
const text = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

beforeEach(() => {
  store.clear();
  failReads.on = false;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.resetModules();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Trust dashboard: how we are doing together', () => {
  it('a user with a month of calls gets a real health read and a noticed note, rendered by the web', async () => {
    await agentCalls('sam', MONTH);
    seedPromise('sam', 'commit_a', '2026-09-10T00:30:00Z', '2026-09-17T00:20:00Z');
    seedPromise('sam', 'commit_b', '2026-09-21T00:30:00Z', '2026-09-28T00:20:00Z');
    seedPromise('sam', 'commit_c', '2026-09-30T00:30:00Z'); // still open: not counted

    vi.setSystemTime(NOW);
    vi.resetModules(); // the API server is another process
    const health = await apiGet('sam', `/api/trust/health?tz=${encodeURIComponent(TZ)}`);
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({ hasData: true, state: 'ready', daysTalked: 10 });
    const factors = health.body.factors as Array<{
      name: string;
      tone: string;
      detail: Record<string, number>;
    }>;
    expect(factors.map((f) => f.name)).toEqual(['rhythm', 'promises', 'lift', 'mood']);
    expect(factors.find((f) => f.name === 'rhythm')?.detail).toEqual({ days: 10 });
    expect(factors.find((f) => f.name === 'promises')?.detail).toEqual({ kept: 2, total: 2 });
    expect(factors.find((f) => f.name === 'mood')?.tone).toBe('up');
    // Persisted to the doc the route reads.
    expect(store.has('bogle_users/sam/trust_profiles/relationship_health')).toBe(true);

    const w = await web();
    const healthHtml = text(w.renderHealthTab(w.parseTrustTab('health', health.body)));
    for (const line of [
      'We talk often',
      '10 days in the last month',
      'I follow through',
      'Kept 2 of 2',
      "You've seemed lighter lately",
    ]) {
      expect(healthHtml).toContain(line);
    }
    expect(healthHtml).not.toMatch(/trustDashboard\.|undefined|NaN|empty-state/);

    const month = await apiGet('sam', `/api/trust/insights?tz=${encodeURIComponent(TZ)}`);
    expect(month.body).toMatchObject({ hasData: true, period: 'month' });
    const monthHtml = text(w.renderInsightsTab(w.parseTrustTab('insights', month.body)));
    expect(monthHtml).toContain('Things I noticed this month');
    expect(monthHtml).toContain('September 25 was a hard day, and you felt better within 2 days.');
    expect(monthHtml).toContain('We mostly talk in the evenings.');
    expect(monthHtml).toContain('Sunday seems to be our day.');

    const week = await apiGet(
      'sam',
      `/api/trust/insights?period=week&tz=${encodeURIComponent(TZ)}`
    );
    const weekHtml = text(w.renderInsightsTab(w.parseTrustTab('insights', week.body)));
    expect(weekHtml).toContain("You've seemed lighter than last week.");
    expect(weekHtml.toLowerCase()).toContain('you told me about something coming up');
    expect(weekHtml.toLowerCase()).toContain('interview');
    expect(weekHtml).toContain('I kept every promise I made you.');
    expect(weekHtml).not.toMatch(/trustDashboard\.|undefined|NaN/);
  });

  it("every surfaced insight and factor cites records that exist in the user's stored data", async () => {
    await agentCalls('sam', MONTH);
    seedPromise('sam', 'commit_b', '2026-09-21T00:30:00Z', '2026-09-28T00:20:00Z');
    vi.setSystemTime(NOW);
    vi.resetModules();
    await apiGet('sam', `/api/trust/insights?tz=${encodeURIComponent(TZ)}`);

    const ids = storedIds('sam');
    const notes = JSON.parse(
      store.get('bogle_users/sam/trust_profiles/insights_reports')?.data as string
    );
    const health = JSON.parse(
      store.get('bogle_users/sam/trust_profiles/relationship_health')?.data as string
    );
    const insights = notes.value.notes.flatMap((n: { insights: unknown[] }) => n.insights);
    expect(insights.length).toBeGreaterThan(4);
    for (const cited of [...insights, ...health.value.factors] as Array<{ evidence: string[] }>) {
      expect(cited.evidence.length, JSON.stringify(cited)).toBeGreaterThan(0);
      for (const id of cited.evidence)
        expect(ids.has(id), `${id} in ${JSON.stringify(cited)}`).toBe(true);
    }
  });

  it("a user with one call so far is 'just getting started': no score, no factors", async () => {
    await agentCalls('new-user', [MONTH[MONTH.length - 1]]);
    vi.setSystemTime(NOW);
    vi.resetModules();
    const { body } = await apiGet('new-user', `/api/trust/health?tz=${encodeURIComponent(TZ)}`);
    expect(body).toMatchObject({
      hasData: true,
      state: 'getting-started',
      score: null,
      stage: null,
      factors: [],
    });

    const w = await web();
    const html = w.renderHealthTab(w.parseTrustTab('health', body));
    expect(text(html)).toContain("We're just getting started");
    expect(html).not.toContain('score-number');
  });

  it('a user with no history gets hasData:false and the empty state', async () => {
    vi.setSystemTime(NOW);
    const { body } = await apiGet('nobody', '/api/trust/health');
    expect(body).toMatchObject({ hasData: false, state: 'none', score: null });
    const w = await web();
    expect(text(w.renderHealthTab(w.parseTrustTab('health', body)))).toContain(
      "Once we've talked a few times, I'll tell you how we're doing."
    );
  });

  it('an unreadable promise store is a 503, not a read without promises', async () => {
    await agentCalls('sam', MONTH);
    vi.setSystemTime(NOW);
    vi.resetModules();
    failReads.on = true;
    const { status } = await apiGet('sam', '/api/trust/health');
    expect(status).toBe(503);
  });
});
