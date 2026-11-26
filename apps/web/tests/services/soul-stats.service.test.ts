/**
 * Soul stats in the browser (#4069): counts kept in memory and sent to
 * POST /api/soul-stats in batches, counts only, for a signed-in person, and
 * never again on this page once the server says 404 (SOUL_STATS off).
 * The I/O (token, fetch, timer, page-hide events) is injected; the service is real.
 */

import { afterEach, describe, it, expect, vi } from 'vitest';

vi.mock('../../src/services/firebase-auth.service.js', () => ({
  getAuthToken: vi.fn(async () => null),
}));

import { SoulStatsService, type SoulStatsDeps } from '../../src/services/soul-stats.service.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

interface Opts {
  token?: string | null;
  getToken?: () => Promise<string | null>;
  status?: number;
  fail?: boolean;
}

function harness(opts: Opts = {}) {
  const timers: (() => void)[] = [];
  const hides: (() => void)[] = [];
  const sent: { url: string; init: RequestInit }[] = [];
  const deps: SoulStatsDeps = {
    getToken: opts.getToken ?? (async () => (opts.token === undefined ? 'id-token' : opts.token)),
    fetch: vi.fn(async (url: string, init: RequestInit) => {
      sent.push({ url, init });
      if (opts.fail) throw new TypeError('Failed to fetch');
      return new Response(null, { status: opts.status ?? 202 });
    }),
    setTimer: (send) => void timers.push(send),
    onPageHide: (send) => void hides.push(send),
  };
  const service = new SoulStatsService(deps);
  /** Fires every pending timer and waits for the sends they start. */
  const tick = async () => {
    for (const fire of timers.splice(0)) fire();
    await flush();
  };
  const bodies = () => sent.map((s) => JSON.parse(String(s.init.body)) as unknown);
  return { service, deps, timers, hides, sent, tick, bodies };
}

describe('SoulStatsService', () => {
  it('batches every count recorded within the minute into one send', async () => {
    const h = harness();
    h.service.recordMicroExpression();
    h.service.recordMicroExpression();
    h.service.recordProtectiveMode();
    h.service.recordComfortPulse();
    h.service.recordComfortPulse();
    h.service.recordComfortPulse();
    h.service.recordMemorySpark();
    expect(h.timers).toHaveLength(1); // one 60 s timer, not one per count
    expect(h.sent).toHaveLength(0); // nothing leaves before it fires
    await h.tick();
    expect(h.bodies()).toEqual([
      { counts: { micro_expression: 2, protective_mode: 1, comfort_pulse: 3, memory_spark: 1 } },
    ]);
  });

  it('sends only the four counts, as JSON with the bearer token and keepalive', async () => {
    const h = harness({ token: 'tok-123' });
    h.service.recordMicroExpression();
    await h.tick();
    const [{ url, init }] = h.sent;
    expect(url).toBe('/api/soul-stats');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok-123',
    });
    const body = JSON.parse(String(init.body)) as { counts: Record<string, number> };
    expect(Object.keys(body)).toEqual(['counts']);
    expect(Object.keys(body.counts).sort()).toEqual([
      'comfort_pulse',
      'memory_spark',
      'micro_expression',
      'protective_mode',
    ]);
  });

  it('never sends when every count is 0, on the timer or when the page is hidden', async () => {
    const h = harness();
    h.service.recordMemorySpark();
    await h.tick(); // sends the 1
    expect(h.sent).toHaveLength(1);
    h.hides[0](); // the page is hidden with nothing new
    await h.service.send();
    await h.tick();
    expect(h.sent).toHaveLength(1);
  });

  it('sends what is pending as soon as the page is hidden, without waiting for the minute', async () => {
    const h = harness();
    h.service.recordProtectiveMode();
    expect(h.hides).toHaveLength(1);
    h.hides[0]();
    await flush();
    expect(h.bodies()).toEqual([
      { counts: { micro_expression: 0, protective_mode: 1, comfort_pulse: 0, memory_spark: 0 } },
    ]);
  });

  it.each([
    [404, 'SOUL_STATS off'],
    [400, 'a body the server refuses'],
    [413, 'a body over the cap'],
  ])('stops for the rest of the page after a %i (%s)', async (status) => {
    const h = harness({ status });
    h.service.recordMicroExpression();
    await h.tick();
    expect(h.sent).toHaveLength(1);
    h.service.recordMicroExpression();
    h.service.recordMemorySpark();
    h.hides[0]();
    await h.service.send();
    await h.tick();
    expect(h.sent).toHaveLength(1);
    expect(h.timers).toHaveLength(0);
  });

  it.each([401, 429, 500])('keeps counts and retries after a %i', async (status) => {
    const h = harness({ status });
    h.service.recordComfortPulse();
    await h.tick();
    await h.tick(); // the retry timer the failure set
    const counts = h.bodies().map((b) => (b as { counts: { comfort_pulse: number } }).counts);
    expect(counts.map((c) => c.comfort_pulse)).toEqual([1, 1]);
  });

  it('a timer send and a page-hide send waiting on the token never carry the same counts', async () => {
    let release: (t: string) => void = () => {};
    const token = new Promise<string>((r) => (release = r));
    const h = harness({ getToken: () => token });
    h.service.recordMicroExpression();
    h.service.recordMicroExpression();
    void h.tick(); // the timer send, now waiting on the token
    h.hides[0](); // the page is hidden before the token arrives
    release('tok');
    await flush();
    expect(h.bodies()).toEqual([
      { counts: { micro_expression: 2, protective_mode: 0, comfort_pulse: 0, memory_spark: 0 } },
    ]);
  });

  it('holds counts while signed out and sends them once signed in', async () => {
    let token: string | null = null;
    const h = harness({ getToken: async () => token });
    h.service.recordMemorySpark();
    await h.tick();
    expect(h.sent).toHaveLength(0);
    token = 'tok';
    h.hides[0]();
    await flush();
    expect(h.bodies()).toEqual([
      { counts: { micro_expression: 0, protective_mode: 0, comfort_pulse: 0, memory_spark: 1 } },
    ]);
  });

  it('sends nothing for a signed-out visitor', async () => {
    const h = harness({ token: null });
    h.service.recordComfortPulse();
    await h.tick();
    expect(h.deps.fetch).not.toHaveBeenCalled();
  });

  it('keeps counts that were not stored and sends them with the next batch', async () => {
    const h = harness({ status: 503 });
    h.service.recordMicroExpression();
    await h.tick();
    h.service.recordMicroExpression();
    await h.tick();
    const counts = h.bodies().map((b) => (b as { counts: { micro_expression: number } }).counts);
    expect(counts.map((c) => c.micro_expression)).toEqual([1, 2]);
  });

  it('keeps counts through a network error too', async () => {
    const h = harness({ fail: true });
    h.service.recordMemorySpark();
    await h.tick();
    await h.tick(); // the retry timer the failure set
    const counts = h.bodies().map((b) => (b as { counts: { memory_spark: number } }).counts);
    expect(counts.map((c) => c.memory_spark)).toEqual([1, 1]);
  });

  it('caps each count at 500, the most the server takes', async () => {
    const h = harness();
    for (let i = 0; i < 520; i++) h.service.recordMicroExpression();
    await h.tick();
    const [body] = h.bodies() as { counts: { micro_expression: number } }[];
    expect(body.counts.micro_expression).toBe(500);
  });
});

describe('SoulStatsService in the admin avatar lab', () => {
  // The lab plays the real avatar for an admin: none of it is a person's avatar life.
  const recordEach = (service: SoulStatsService) => {
    service.recordMicroExpression();
    service.recordProtectiveMode();
    service.recordComfortPulse();
    service.recordMemorySpark();
  };

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it.each(['/avatar-lab', '/avatar-lab/'])(
    'at %s, the record calls leave nothing pending and send nothing',
    async (path) => {
      window.history.replaceState(null, '', path);
      const h = harness();
      recordEach(h.service);
      expect(h.timers).toHaveLength(0); // no send scheduled
      expect(h.hides).toHaveLength(0); // no page-hide send either
      await h.service.send(); // a send now finds nothing pending
      await h.tick();
      expect(h.sent).toHaveLength(0);
    }
  );

  it('at /, the same calls still count and send', async () => {
    window.history.replaceState(null, '', '/');
    const h = harness();
    recordEach(h.service);
    expect(h.timers).toHaveLength(1);
    await h.tick();
    expect(h.bodies()).toEqual([
      { counts: { micro_expression: 1, protective_mode: 1, comfort_pulse: 1, memory_spark: 1 } },
    ]);
  });
});
