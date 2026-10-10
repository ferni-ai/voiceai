/**
 * Referral Service Tests
 *
 * The server issues the referral code and keeps the counts (/api/seeds/*).
 * The service must show only that: no client-generated code, no local counters,
 * and no reward the server did not confirm.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet, apiPost }));
vi.mock('../../src/services/cosmetics.service.js', () => ({ addSeeds: vi.fn() }));

const {
  checkReferralFromUrl,
  getGarden,
  getReferralUrl,
  getReferredBy,
  loadGarden,
  processPendingReferral,
  initReferralService,
  REFERRAL_NEW_USER_BONUS,
} = await import('../../src/services/referral.service.js');
const referralModule = await import('../../src/services/referral.service.js');
const { addSeeds } = await import('../../src/services/cosmetics.service.js');

const SERVER_GARDEN = {
  title: 'gardener',
  totalReferrals: 3,
  totalEarnedFromReferrals: 75,
  referralCode: 'k3j9x2-meadow',
  referralUrl: 'https://ferni.ai/grow/k3j9x2-meadow',
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('server-issued garden', () => {
  it('has no link until the server provides one (no client-side code)', async () => {
    apiGet.mockResolvedValueOnce({ ok: false, status: 503, error: 'down' });

    expect(await loadGarden()).toBeNull();

    expect(getGarden()).toBeNull();
    expect(getReferralUrl()).toBeNull();
    expect(localStorage.length).toBe(0); // nothing minted and stashed locally
  });

  it("uses the server's code, link and counts verbatim", async () => {
    apiGet.mockResolvedValueOnce({ ok: true, status: 200, data: SERVER_GARDEN });

    const garden = await loadGarden();

    expect(apiGet).toHaveBeenCalledWith('/api/seeds/garden');
    expect(garden).toEqual({
      referralCode: 'k3j9x2-meadow',
      referralUrl: 'https://ferni.ai/grow/k3j9x2-meadow',
      gardenTitle: 'gardener',
      totalReferrals: 3,
      totalEarnedFromReferrals: 75,
    });
    expect(getReferralUrl()).toBe('https://ferni.ai/grow/k3j9x2-meadow');
  });

  it('a failed refresh drops the old link instead of showing stale counts', async () => {
    apiGet.mockResolvedValueOnce({ ok: true, status: 200, data: SERVER_GARDEN });
    await loadGarden();
    apiGet.mockResolvedValueOnce({ ok: false, status: 500, error: 'boom' });

    expect(await loadGarden()).toBeNull();
    expect(getReferralUrl()).toBeNull();
  });

  it('no longer exposes locally-tracked referral counters or rewards', () => {
    for (const gone of [
      'getReferralCode',
      'recordReferralSuccess',
      'awardReferralMilestone',
      'getGardenStats',
      'getTotalReferralSeeds',
    ]) {
      expect(referralModule).not.toHaveProperty(gone);
    }
  });
});

describe('a friend arriving through a link', () => {
  it('remembers the code from /grow/<code> and cleans the URL', () => {
    window.history.replaceState({}, '', '/grow/abc123-sunrise');

    expect(checkReferralFromUrl()).toBe('abc123-sunrise');

    expect(localStorage.getItem('ferni_pending_referral')).toBe('abc123-sunrise');
    expect(window.location.pathname).toBe('/');
  });

  it('registers with the server and awards only the confirmed bonus', async () => {
    localStorage.setItem('ferni_pending_referral', 'abc123-sunrise');
    apiPost.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { success: true, newUserBonus: 25, referrerBonus: 25 },
    });

    const result = await processPendingReferral();

    expect(apiPost).toHaveBeenCalledWith('/api/seeds/referral', { referralCode: 'abc123-sunrise' });
    expect(result).toEqual({ processed: true, bonusAwarded: 25 });
    expect(addSeeds).toHaveBeenCalledWith(REFERRAL_NEW_USER_BONUS);
    expect(getReferredBy()).toBe('abc123-sunrise');
    expect(localStorage.getItem('ferni_pending_referral')).toBeNull();
  });

  it('awards nothing when the server declines (e.g. already referred)', async () => {
    localStorage.setItem('ferni_pending_referral', 'abc123-sunrise');
    apiPost.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { success: false, error: 'Already referred by someone' },
    });

    expect(await processPendingReferral()).toEqual({ processed: false });

    expect(addSeeds).not.toHaveBeenCalled();
    expect(getReferredBy()).toBeNull();
    expect(localStorage.getItem('ferni_pending_referral')).toBeNull();
  });

  it('awards nothing and keeps the code to retry when the server is unreachable', async () => {
    localStorage.setItem('ferni_pending_referral', 'abc123-sunrise');
    apiPost.mockResolvedValueOnce({ ok: false, status: 503, error: 'down' });

    expect(await processPendingReferral()).toEqual({ processed: false });

    expect(addSeeds).not.toHaveBeenCalled();
    expect(localStorage.getItem('ferni_pending_referral')).toBe('abc123-sunrise');
  });

  it('drops a code the server says is invalid', async () => {
    localStorage.setItem('ferni_pending_referral', 'nope00-sage');
    apiPost.mockResolvedValueOnce({ ok: false, status: 404, error: 'Invalid referral code' });

    expect(await processPendingReferral()).toEqual({ processed: false });

    expect(addSeeds).not.toHaveBeenCalled();
    expect(localStorage.getItem('ferni_pending_referral')).toBeNull();
  });

  it('does nothing without a pending referral', async () => {
    expect(await processPendingReferral()).toEqual({ processed: false });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('initializes without errors', () => {
    expect(() => initReferralService()).not.toThrow();
  });
});
