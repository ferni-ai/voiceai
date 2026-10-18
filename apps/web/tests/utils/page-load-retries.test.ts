/**
 * Page-load retries: identical GETs share one request, and retries spread out.
 *
 * 2026-10-18 UI audit, with the API answering 502: /spotify/status went out 4
 * times (two callers, each retrying), and every retry on the page fired within
 * a few ms of the others (all at ~1.6 s, then ~2.8 s) because the backoff only
 * added 0 to 30% jitter.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateDelay } from '../../src/utils/fetch-retry';
import { apiGet } from '../../src/utils/api';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('retry backoff jitter', () => {
  it('spreads each retry over half its step (equal jitter), capped at maxDelay', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(calculateDelay(0, 500, 3000)).toBe(250);
    expect(calculateDelay(1, 500, 3000)).toBe(500);
    vi.spyOn(Math, 'random').mockReturnValue(1);
    expect(calculateDelay(0, 500, 3000)).toBe(500);
    expect(calculateDelay(1, 500, 3000)).toBe(1000);
    expect(calculateDelay(5, 500, 3000)).toBe(3000);
  });

  it('two clients retrying the same step land far enough apart to matter', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(1);
    const spread = Math.abs(calculateDelay(1, 500, 3000) - calculateDelay(1, 500, 3000));
    expect(spread).toBeGreaterThanOrEqual(500); // the old 0-30% add-on allowed at most 300
  });
});

describe('apiGet dedupes identical requests in flight', () => {
  it('two callers asking for the same URL at once make one request', async () => {
    let release!: () => void;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(new Response(JSON.stringify({ linked: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        })
    );
    const a = apiGet<{ linked: boolean }>('/spotify/status', { device_id: 'd1' });
    const b = apiGet<{ linked: boolean }>('/spotify/status', { device_id: 'd1' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ra.ok && rb.ok).toBe(true);
    expect(rb.data).toEqual({ linked: true });
  });

  it('asks again once the first request has finished', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await apiGet('/api/rituals');
    await apiGet('/api/rituals');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('different URLs are not merged', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await Promise.all([apiGet('/api/rituals'), apiGet('/api/synced/rituals')]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
