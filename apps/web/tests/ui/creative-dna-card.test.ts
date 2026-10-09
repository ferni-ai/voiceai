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
  // The shape GET /api/creative/dna returns (src/tests/creative-dna-dashboard.test.ts).
  function dnaWith(learningStyle: string | null, personalityLabel: string | null = null) {
    return {
      personalityLabel,
      personalityDescription: personalityLabel ? 'You go deep on ideas.' : null,
      topTopics: [{ topic: 'gardening', score: 2 }],
      totalVideosWatched: 0,
      totalPodcastsListened: 0,
      totalInsightsSaved: 0,
      learningStyle,
    };
  }
  const styleStat = () =>
    [...(dnaCard()?.querySelectorAll('.dna-stats .stat') ?? [])].find(
      (stat) => stat.querySelector('.stat-label')?.textContent === 'Your Style'
    );

  it('leaves out Your Style when Ferni has not learned one', async () => {
    apiGet.mockResolvedValue({ ok: true, status: 200, data: { dna: dnaWith(null) } });

    await getCreativeYouDashboard('device-c').initialize();

    expect(dnaCard()?.querySelector('.interest-name')?.textContent).toBe('gardening');
    expect(styleStat()).toBeUndefined();
    expect(dnaCard()?.textContent).not.toMatch(/explorer|null/i);
  });

  it('shows Your Style when it came from real activity', async () => {
    apiGet.mockResolvedValue({ ok: true, status: 200, data: { dna: dnaWith('audio') } });

    await getCreativeYouDashboard('device-d').initialize();

    expect(styleStat()?.querySelector('.stat-value')?.textContent).toBe('audio');
  });
  it('uses neutral wording, not a made-up label, when Ferni has not learned one', async () => {
    apiGet.mockResolvedValue({ ok: true, status: 200, data: { dna: dnaWith(null) } });

    await getCreativeYouDashboard('device-e').initialize();

    expect(dnaCard()?.querySelector('.personality-label')).toBeNull();
    expect(dnaCard()?.querySelector('.share-dna-btn')).toBeNull();
    expect(dnaCard()?.querySelector('.personality-desc')?.textContent).toBe(
      "We're just getting started. This fills in as we talk."
    );
    expect(dnaCard()?.textContent).not.toMatch(/newcomer|null/i);
  });

  it('shows the personality label when real activity produced one', async () => {
    apiGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: { dna: dnaWith('audio', 'The Deep Diver') },
    });

    await getCreativeYouDashboard('device-f').initialize();

    expect(dnaCard()?.querySelector('.personality-label')?.textContent).toBe('The Deep Diver');
  });
});
