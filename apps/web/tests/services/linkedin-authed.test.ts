/**
 * The LinkedIn settings calls reach the server as the signed-in user.
 *
 * Before: status/disconnect/sync used bare fetch with cookies ("routes NOT
 * mounted, re-enable when available"). The routes are mounted
 * (src/servers/api/index.ts → src/api/linkedin-routes.ts) and every one
 * calls requireAuth, which reads the Bearer token bare fetch never sent: so
 * status always looked "not connected", disconnect always failed and sync
 * failed silently.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet, apiPost }));

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast }));

const { getLinkedInStatus, disconnectLinkedIn, syncLinkedIn } =
  await import('../../src/services/linkedin.service.js');

/** GET /api/linkedin/status body as src/api/linkedin-routes.ts sends it. */
const connectedStatus = {
  connected: true,
  profile: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    headline: 'Engineer',
    profilePicture: undefined,
  },
  upcomingMilestones: [
    {
      type: 'work_anniversary',
      title: '3 years at Analytical Engines',
      description: 'Your work anniversary is coming up',
      date: '2026-10-20T00:00:00.000Z',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  // What the server answers a request with no Bearer token (requireAuth).
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{"error":"Authentication required"}', { status: 401 }))
  );
});

describe('LinkedIn service', () => {
  it('reads the real connection status through the authenticated helper', async () => {
    apiGet.mockResolvedValueOnce({ ok: true, status: 200, data: connectedStatus });

    expect(await getLinkedInStatus()).toEqual(connectedStatus);
    expect(apiGet).toHaveBeenCalledWith('/api/linkedin/status');
  });

  it('disconnects through the authenticated helper', async () => {
    apiPost.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { success: true, message: 'LinkedIn disconnected' },
    });

    expect(await disconnectLinkedIn()).toBe(true);
    expect(apiPost).toHaveBeenCalledWith('/api/linkedin/disconnect', {}, { maxRetries: 0 });
  });

  it('says so when a sync fails instead of failing silently', async () => {
    apiPost.mockResolvedValueOnce({ ok: false, status: 400, error: 'LinkedIn not connected' });

    expect(await syncLinkedIn()).toBe(false);
    expect(apiPost).toHaveBeenCalledWith('/api/linkedin/sync', {}, { maxRetries: 0 });
    expect(toast.error).toHaveBeenCalledWith("Couldn't sync LinkedIn. Try again?");
  });
});
