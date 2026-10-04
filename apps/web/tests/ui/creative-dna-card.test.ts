/**
 * Creative You: the "What You're Into" card is per signed-in user and never
 * hangs on its loading skeleton.
 *
 * Before: the card fetched /api/creative/dna?userId=<deviceId> without auth,
 * and when that request failed it never rendered, leaving the skeleton up.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet: (...a: unknown[]) => apiGet(...a) }));

const { getCreativeYouDashboard } = await import('../../src/ui/creative-you-dashboard.ui.js');

function mockOtherEndpoints(dnaViaFetch: unknown = { dna: null }): void {
  globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes('/api/creative/dna')) {
      return new Response(JSON.stringify(dnaViaFetch), { status: 401 });
    }
    return new Response(JSON.stringify({ tracks: [], dailyPick: null }), { status: 200 });
  }) as typeof fetch;
}

const dnaCard = () => document.querySelector('.dna-card');

describe('Creative DNA card', () => {
  beforeEach(() => {
    apiGet.mockReset();
    document.body.replaceChildren();
    mockOtherEndpoints();
  });

  it('asks for the signed-in user’s DNA with auth, not a device id in the query', async () => {
    apiGet.mockResolvedValue({ ok: true, status: 200, data: { dna: null } });

    await getCreativeYouDashboard('device-123').initialize();

    expect(apiGet).toHaveBeenCalledWith('/api/creative/dna');
    const fetched = vi.mocked(globalThis.fetch).mock.calls.map(([u]) => String(u));
    expect(fetched.some((u) => u.includes('/api/creative/dna'))).toBe(false);
  });

  it('shows the empty card when there is no profile yet', async () => {
    apiGet.mockResolvedValue({ ok: true, status: 200, data: { dna: null } });

    await getCreativeYouDashboard('device-a').initialize();

    expect(dnaCard()?.getAttribute('data-loading')).toBe('false');
    expect(dnaCard()?.querySelector('.empty-dna')).not.toBeNull();
  });

  it('shows the empty card, not an endless skeleton, when the load fails', async () => {
    apiGet.mockResolvedValue({ ok: false, status: 401, error: 'Unauthorized' });

    await getCreativeYouDashboard('device-b').initialize();

    expect(dnaCard()?.getAttribute('data-loading')).toBe('false');
    expect(dnaCard()?.querySelector('.empty-dna')).not.toBeNull();
  });
});
