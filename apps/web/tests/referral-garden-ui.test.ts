/**
 * The Share panel and the garden dashboard show the SERVER-issued link and the
 * server's counts. When the server can't be reached they say so instead of
 * showing a made-up link or zeroed numbers.
 *
 * Real UI modules and real referral service; only the API is stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('../src/utils/api.js', () => ({ apiGet, apiPost: vi.fn() }));
vi.mock('../src/services/cosmetics.service.js', () => ({ addSeeds: vi.fn() }));
const toast = { success: vi.fn(), error: vi.fn() };
vi.mock('../src/ui/whisper.ui.js', () => ({ toast }));
vi.mock('../src/ui/sound.ui.js', () => ({ soundUI: { play: vi.fn() } }));

// jsdom has no Web Animations API
Element.prototype.animate = vi.fn(() => ({ finished: Promise.resolve() })) as never;

const { openGardenDashboard, closeGardenDashboard } =
  await import('../src/ui/garden-dashboard.ui.js');
const { openReferral, closeReferral } = await import('../src/ui/referral.ui.js');

const SERVER_GARDEN = {
  title: 'gardener',
  totalReferrals: 4,
  totalEarnedFromReferrals: 100,
  referralCode: 'k3j9x2-meadow',
  referralUrl: 'https://ferni.ai/grow/k3j9x2-meadow',
};

beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
  closeGardenDashboard();
  closeReferral();
  await vi.waitFor(() =>
    expect(document.querySelector('.garden-dashboard-modal,.referral-modal')).toBeNull()
  );
});

describe('garden dashboard', () => {
  it("shows the server's link and counts, and no invented activity/passive numbers", async () => {
    apiGet.mockResolvedValue({ ok: true, status: 200, data: SERVER_GARDEN });

    await openGardenDashboard();

    const modal = document.querySelector('.garden-dashboard-modal');
    expect(apiGet).toHaveBeenCalledWith('/api/seeds/garden');
    expect(modal?.querySelector('.garden-link-url')?.textContent).toBe(
      'ferni.ai/grow/k3j9x2-meadow'
    );
    const values = Array.from(modal?.querySelectorAll('.garden-stat-value') ?? []).map(
      (e) => e.textContent
    );
    expect(values).toEqual(['4']); // friends referred; nothing estimated
    expect(modal?.querySelector('.garden-earned strong')?.textContent).toBe('100');
    expect(modal?.textContent).not.toMatch(/\+\d+/); // no "+N seeds/week" promise
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('says so, and opens nothing, when the garden cannot be loaded', async () => {
    apiGet.mockResolvedValue({ ok: false, status: 503, error: 'down' });

    await openGardenDashboard();

    expect(document.querySelector('.garden-dashboard-modal')).toBeNull();
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});

describe('share panel', () => {
  it("shows the server-issued link and the server's friend count", async () => {
    apiGet.mockResolvedValue({ ok: true, status: 200, data: SERVER_GARDEN });

    await openReferral();

    const modal = document.querySelector('.referral-modal');
    expect(modal?.querySelector('.referral-link-url')?.textContent).toBe(
      'ferni.ai/grow/k3j9x2-meadow'
    );
    expect(modal?.querySelector('.referral-garden-stats')?.textContent).toMatch(/4/);
  });

  it('says so, and opens nothing, when the link cannot be loaded', async () => {
    apiGet.mockResolvedValue({ ok: false, status: 0, error: 'offline', offline: true });

    await openReferral();

    expect(document.querySelector('.referral-modal')).toBeNull();
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('shares the server link, not a locally generated one', async () => {
    apiGet.mockResolvedValue({ ok: true, status: 200, data: SERVER_GARDEN });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await openReferral();
    (document.querySelector('[data-action="copy"]') as HTMLElement).click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());

    expect(writeText.mock.calls[0][0]).toContain('https://ferni.ai/grow/k3j9x2-meadow');
  });
});
