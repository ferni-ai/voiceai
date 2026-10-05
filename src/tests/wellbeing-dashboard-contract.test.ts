/**
 * Wellbeing dashboard: backend reads persisted data, says "no data" honestly,
 * and the web's real has-data check agrees with the server's real output.
 *
 * Before: the route read only the API process's in-memory profile (the voice
 * agent writes snapshots in another process, to Firestore), returned neutral
 * 0.5 for every dimension when there was nothing, and trusted ?userId= so any
 * signed-in user could read anyone's wellbeing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';
import type { WellbeingProfile, WellbeingSnapshot } from '../services/wellbeing-tracking/index.js';

const loadProfile = vi.fn();
const loadSnapshots = vi.fn();
const persistProfile = vi.fn(async () => true);
vi.mock('../services/wellbeing-tracking/persistence.js', () => ({
  loadProfile: (...a: unknown[]) => loadProfile(...a),
  loadSnapshots: (...a: unknown[]) => loadSnapshots(...a),
  persistSnapshot: vi.fn(async () => true),
  persistProfile: (...a: unknown[]) => persistProfile(...(a as [])),
}));

vi.mock('../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'signed-in-user', isAdmin: false })),
  rateLimit: vi.fn(() => false),
}));

const { handleWellbeingRoutes } = await import('../api/wellbeing.routes.js');
const { hasWellbeingData } = await import('../../apps/web/src/ui/wellbeing-api.js');

interface Captured {
  status: number;
  body: Record<string, unknown>;
}

async function get(path: string): Promise<Captured> {
  const out: Captured = { status: 0, body: {} };
  const req = { method: 'GET', url: path, headers: { host: 'localhost' } } as IncomingMessage;
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
  await handleWellbeingRoutes(req, res, url.pathname, url);
  return out;
}

function snapshot(dimensions: WellbeingSnapshot['dimensions']): WellbeingSnapshot {
  return {
    id: 'wb_1',
    userId: 'signed-in-user',
    timestamp: new Date(),
    source: 'detected',
    dimensions,
    confidence: {},
  };
}

function profileWith(current: WellbeingSnapshot): WellbeingProfile {
  return {
    userId: 'signed-in-user',
    current,
    personalBaseline: null,
    weeklyTrends: [],
    monthlyTrends: [],
    totalSnapshots: 1,
    firstSnapshot: current.timestamp,
    lastSnapshot: current.timestamp,
  };
}

describe('GET /api/wellbeing/dashboard', () => {
  beforeEach(() => {
    loadProfile.mockReset();
    loadSnapshots.mockReset();
  });

  it("returns the voice agent's persisted wellbeing, not the API process's empty memory", async () => {
    const current = snapshot({ mood: 0.9, sleepQuality: 0.2 });
    loadProfile.mockResolvedValue(profileWith(current));
    loadSnapshots.mockResolvedValue([current]);

    const { status, body } = await get('/api/wellbeing/dashboard');

    expect(status).toBe(200);
    expect(body.hasData).toBe(true);
    const state = body.currentState as Record<string, number | null>;
    expect(state.mood).toBe(0.9);
    expect(state.sleep).toBe(0.2);
    // Never measured: null, not a neutral 0.5
    expect(state.energy).toBeNull();
    expect(state.connection).toBeNull();
  });

  it('says "no data" for a user with no wellbeing, instead of neutral 0.5 scores', async () => {
    loadProfile.mockResolvedValue(null);
    loadSnapshots.mockResolvedValue([]);

    const { status, body } = await get('/api/wellbeing/dashboard');

    expect(status).toBe(200);
    expect(body.hasData).toBe(false);
    expect(body.currentState).toBeNull();
  });

  it('reads the signed-in user, ignoring a ?userId= for someone else', async () => {
    loadProfile.mockResolvedValue(null);
    loadSnapshots.mockResolvedValue([]);

    await get('/api/wellbeing/dashboard?userId=someone-else');

    expect(loadProfile).toHaveBeenCalledWith('signed-in-user');
    expect(loadProfile).not.toHaveBeenCalledWith('someone-else');
  });

  it("the web's has-data check accepts the server's real output in both cases", async () => {
    loadProfile.mockResolvedValue(null);
    loadSnapshots.mockResolvedValue([]);
    const empty = await get('/api/wellbeing/dashboard');
    expect(hasWellbeingData(empty.body as never)).toBe(false);

    const current = snapshot({ mood: 0.6 });
    loadProfile.mockResolvedValue(profileWith(current));
    loadSnapshots.mockResolvedValue([current]);
    const withData = await get('/api/wellbeing/dashboard');
    expect(hasWellbeingData(withData.body as never)).toBe(true);
  });
});

describe('GET /api/wellbeing/trends', () => {
  it('averages are null, not 0.5, when nothing was measured', async () => {
    loadProfile.mockResolvedValue(null);
    loadSnapshots.mockResolvedValue([]);

    const { body } = await get('/api/wellbeing/trends?period=week');

    expect(body.averages).toEqual({
      mood: null,
      energy: null,
      anxiety: null,
      connection: null,
      purpose: null,
      sleep: null,
    });
  });
});

describe('POST /api/wellbeing/snapshot (removed)', () => {
  it('is not served, so it can never reset the persisted profile to a single snapshot', async () => {
    // A user the voice agent has tracked for weeks.
    const current = snapshot({ mood: 0.7 });
    loadProfile.mockResolvedValue({ ...profileWith(current), totalSnapshots: 40 });
    loadSnapshots.mockResolvedValue([current]);
    persistProfile.mockClear();

    const req = Readable.from([JSON.stringify({ mood: 0.4 })]) as unknown as IncomingMessage;
    Object.assign(req, { method: 'POST', url: '/api/wellbeing/snapshot', headers: {} });
    const res = {
      headersSent: false,
      setHeader: vi.fn(),
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;
    const url = new URL('/api/wellbeing/snapshot', 'http://localhost');

    const handled = await handleWellbeingRoutes(req, res, url.pathname, url);
    await new Promise((r) => {
      setTimeout(r, 0); // let any fire-and-forget persist run
    });

    expect(handled).toBe(false); // falls through to the API server's 404
    expect(persistProfile).not.toHaveBeenCalled();
  });
});
