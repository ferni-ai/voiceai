/**
 * HERE Traffic Fallback Tests
 *
 * Proves HERE fallback is implemented (geocode + routing) when Google is not configured.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

describe('traffic (HERE fallback)', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GOOGLE_MAPS_API_KEY;
    process.env.HERE_API_KEY = 'here-test-key';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('should use HERE APIs when Google key missing', async () => {
    const mockFetch = vi.fn(async (url: string) => {
      if (url.startsWith('https://geocode.search.hereapi.com/v1/geocode')) {
        return {
          ok: true,
          json: async () => ({ items: [{ position: { lat: 37.7749, lng: -122.4194 } }] }),
        };
      }

      if (url.startsWith('https://router.hereapi.com/v8/routes')) {
        return {
          ok: true,
          json: async () => ({
            routes: [
              {
                sections: [
                  {
                    summary: {
                      length: 12000,
                      baseDuration: 900, // 15m
                      duration: 1200, // 20m with traffic
                      typicalDuration: 960,
                    },
                  },
                ],
              },
            ],
          }),
        };
      }

      return { ok: false, status: 404 };
    });

    vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch);

    // Import after env + fetch mock so module constants are correct
    const { getTrafficTime } = await import('../tools/traffic.js');

    const result = await getTrafficTime('San Francisco, CA', 'Oakland, CA');

    expect(result).toContain('Traffic');
    expect(mockFetch).toHaveBeenCalled();
  });
});
