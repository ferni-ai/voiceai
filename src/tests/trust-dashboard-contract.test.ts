/**
 * Trust dashboard, end to end across the process boundary.
 *
 * Writer: the voice agent's real per-turn recorder (recordTrustSystemsData)
 * and real session-end save (saveTrustProfiles) write to Firestore. Reader:
 * the API server's real route handler, loaded fresh (vi.resetModules) so its
 * in-memory trust Maps are empty, exactly like the separate Cloud Run process.
 * Renderer: the web dashboard's real parser and tab renderers.
 *
 * Before: the routes read the API process's own Maps, which the agent never
 * fills, so every tab was empty (and health rendered "null" as a score); life
 * events were never persisted at all.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

// ---------------------------------------------------------------------------
// In-memory Firestore: survives vi.resetModules, so it plays the shared store.
// ---------------------------------------------------------------------------

const store = new Map<string, Record<string, unknown>>();
const failReads = { on: false };

function docRef(path: string): Record<string, unknown> {
  return {
    path,
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

function collectionRef(path: string): Record<string, unknown> {
  return {
    doc: (id: string) => docRef(`${path}/${id}`),
    async add() {
      return docRef(`${path}/auto`);
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

// The caller is whoever the (mocked) verified token says - never a query param.
vi.mock('../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req: IncomingMessage) => ({
    userId: req.headers['x-test-uid'] as string,
    isAdmin: false,
  })),
  rateLimit: vi.fn(() => false),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROUTES = {
  health: '/api/trust/health',
  timeline: '/api/trust/sentiment',
  events: '/api/trust/life-events',
  journal: '/api/trust/journaling/prompts',
  media: '/api/trust/media/suggestions',
  insights: '/api/trust/insights',
} as const;

interface Captured {
  status: number;
  body: Record<string, unknown>;
}

/** Run one agent session for `userId`: a turn, then the session-end save. */
async function agentSession(userId: string, userText: string): Promise<void> {
  const { recordTrustSystemsData } =
    await import('../agents/voice-agent/trust-recording-handler.js');
  const { saveTrustProfiles } = await import('../services/trust-systems/persistence.js');
  await recordTrustSystemsData({
    userId,
    userText,
    result: { emotional: { primary: 'joy', intensity: 0.8 }, context: {} },
  });
  await saveTrustProfiles(userId);
}

/** A fresh API process: new module instances, empty trust Maps. */
async function apiGet(uid: string, path: string): Promise<Captured> {
  const { handleTrustSystemsRoutes } = await import('../api/trust-systems-routes.js');
  const out: Captured = { status: 0, body: {} };
  const req = {
    method: 'GET',
    url: path,
    headers: { host: 'localhost', 'x-test-uid': uid },
  } as unknown as IncomingMessage;
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
  const url = new URL(path, 'http://localhost');
  await handleTrustSystemsRoutes(req, res, url.pathname, url);
  return out;
}

async function webDashboard() {
  const data = await import('../../apps/web/src/ui/trust-dashboard-data.js');
  const ui = await import('../../apps/web/src/ui/trust-dashboard.ui.js');
  return { ...data, ...ui };
}

beforeEach(() => {
  store.clear();
  failReads.on = false;
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Trust dashboard: agent writes, API reads, web renders', () => {
  it("serves the agent's persisted timeline, events, journal and media to a fresh API process", async () => {
    await agentSession('user-a', 'I have a job interview next Tuesday at Google');
    // The agent persisted the dashboard's history under the user's uid.
    expect(store.has('bogle_users/user-a/trust_profiles/sentiment_timeline')).toBe(true);
    expect(store.has('bogle_users/user-a/trust_profiles/life_events')).toBe(true);

    vi.resetModules(); // the API is another process
    const web = await webDashboard();

    const timeline = await apiGet('user-a', ROUTES.timeline);
    expect(timeline.status).toBe(200);
    expect(timeline.body.hasData).toBe(true);
    expect(timeline.body.currentMood).toContain('joy');
    const timelineData = web.parseTrustTab('timeline', timeline.body);
    expect(timelineData).not.toBeNull();
    const timelineHtml = web.renderTimelineTab(timelineData);
    expect(timelineHtml).toContain('Current: joy');
    expect(timelineHtml).not.toContain('empty-state');

    const events = await apiGet('user-a', ROUTES.events);
    expect(events.body.hasData).toBe(true);
    const eventsData = web.parseTrustTab('events', events.body);
    const upcoming = eventsData
      ? [
          ...eventsData.today,
          ...eventsData.thisWeek,
          ...eventsData.nextWeek,
          ...eventsData.thisMonth,
        ]
      : [];
    expect(upcoming.length, JSON.stringify(events.body)).toBeGreaterThan(0);
    expect(upcoming[0].description.toLowerCase()).toContain('interview');
    const eventsHtml = web.renderEventsTab(eventsData);
    expect(eventsHtml.toLowerCase()).toContain('interview');
    expect(eventsHtml).not.toContain('undefined');

    // Journal and media are shaped by the persisted mood, not a default.
    const journal = await apiGet('user-a', ROUTES.journal);
    expect(journal.body.hasData).toBe(true);
    const journalData = web.parseTrustTab('journal', journal.body);
    expect(journalData?.prompts.length).toBeGreaterThan(0);
    expect(web.renderJournalTab(journalData)).toContain('prompt-card');

    const media = await apiGet('user-a', ROUTES.media);
    expect(media.body.mood).toBe('joy');
    const mediaData = web.parseTrustTab('media', media.body);
    expect(mediaData?.suggestions.length).toBeGreaterThan(0);
    expect(web.renderMediaTab(mediaData)).toContain('media-card');
  });

  it('a second session adds to the stored history instead of replacing it', async () => {
    await agentSession('user-a', 'I have a job interview next Tuesday at Google');
    const { loadTrustProfiles } = await import('../services/trust-systems/persistence.js');

    vi.resetModules(); // a new agent container for the next call
    const { loadTrustProfiles: loadInNewProcess } =
      await import('../services/trust-systems/persistence.js');
    expect(loadInNewProcess).not.toBe(loadTrustProfiles);
    await loadInNewProcess('user-a');
    await agentSession('user-a', 'My sister has a wedding on Saturday');

    vi.resetModules();
    const events = await apiGet('user-a', ROUTES.events);
    const all = ['today', 'thisWeek', 'nextWeek', 'thisMonth'].flatMap(
      (k) => events.body[k] as Array<{ description: string }>
    );
    const text = all.map((e) => e.description.toLowerCase()).join(' | ');
    expect(text).toContain('interview');
    expect(text).toContain('wedding');

    const timeline = await apiGet('user-a', ROUTES.timeline);
    const summaries = (timeline.body.timeline as { summaries: Array<{ snapshotCount: number }> })
      .summaries;
    expect(summaries.reduce((n, s) => n + s.snapshotCount, 0)).toBeGreaterThanOrEqual(1);
  });

  it('a user with no data gets hasData:false and nulls on all six routes, and the web shows empty states', async () => {
    const web = await webDashboard();
    for (const [tab, path] of Object.entries(ROUTES) as Array<[keyof typeof ROUTES, string]>) {
      const { status, body } = await apiGet('nobody', path);
      expect(status, path).toBe(200);
      expect(body.hasData, path).toBe(false);
      expect(web.parseTrustTab(tab, body), path).toBeNull();
    }
    const health = await apiGet('nobody', ROUTES.health);
    expect(health.body.score).toBeNull();
    expect(health.body.stage).toBeNull();
    expect(web.renderHealthTab(web.parseTrustTab('health', health.body))).toContain('empty-state');
    const media = await apiGet('nobody', ROUTES.media);
    expect(media.body.suggestions).toEqual([]);
  });

  it("user B can't read user A's data, even when asking for it by ?userId", async () => {
    await agentSession('user-a', 'I have a job interview next Tuesday at Google');
    vi.resetModules();

    for (const path of Object.values(ROUTES)) {
      const { body } = await apiGet('user-b', `${path}?userId=user-a`);
      expect(body.hasData, path).toBe(false);
    }
    // And the same API process still serves A their own data.
    const own = await apiGet('user-a', ROUTES.timeline);
    expect(own.body.hasData).toBe(true);
  });

  it('turns write nothing; the session end writes once, with a re-mentioned event kept once', async () => {
    const { recordTrustSystemsData } =
      await import('../agents/voice-agent/trust-recording-handler.js');
    const turn = {
      userId: 'user-a',
      userText: 'I have a job interview next Tuesday at Google',
      result: { emotional: { primary: 'joy', intensity: 0.8 }, context: {} },
    };
    for (let i = 0; i < 3; i++) await recordTrustSystemsData(turn);
    expect([...store.keys()].filter((k) => k.includes('trust_profiles'))).toEqual([]);

    const { saveTrustProfiles } = await import('../services/trust-systems/persistence.js');
    await saveTrustProfiles('user-a');
    const doc = store.get('bogle_users/user-a/trust_profiles/life_events');
    expect(JSON.parse(doc?.data as string)).toHaveLength(1);
  });

  it('an unreadable store is a 503, not "no data"', async () => {
    failReads.on = true;
    const { status, body } = await apiGet('user-a', ROUTES.timeline);
    expect(status).toBe(503);
    expect(body.hasData).toBeUndefined();
  });

  it('a session whose history load failed does not overwrite the stored history', async () => {
    await agentSession('user-a', 'I have a job interview next Tuesday at Google');
    const before = store.get('bogle_users/user-a/trust_profiles/life_events');

    vi.resetModules();
    failReads.on = true;
    const { loadTrustProfiles } = await import('../services/trust-systems/persistence.js');
    await loadTrustProfiles('user-a');
    failReads.on = false;
    await agentSession('user-a', 'My sister has a wedding on Saturday');

    expect(store.get('bogle_users/user-a/trust_profiles/life_events')).toEqual(before);
  });
});
