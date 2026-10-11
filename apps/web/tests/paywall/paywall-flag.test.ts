/**
 * The paywall flag: payment UI exists only when the server says `paywall: true`.
 *
 * Ferni is free for now (owner decision, 2026-10-10). The flag comes from the
 * status/config bodies the web already fetches (PR #746 adds `paywall`), and a
 * missing field must read as "no paywall" so this ships before or after #746.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('../../src/utils/api.js', () => ({ apiGet, apiPost: vi.fn() }));

const { connectGate, isPaywallOn, recordPaywallFlag, resetPaywallFlagForTests } =
  await import('../../src/services/paywall.service.js');
const { initSubscriptionUI, loadStatus } = await import('../../src/ui/subscription.ui.js');
const { getSubscriptionStatus } = await import('../../src/services/apple-iap.service.js');
const { appState } = await import('../../src/state/app.state.js');

/** The three server states this PR must handle: explicitly off, field missing, on. */
const SERVER_STATES = [
  { name: 'paywall: false', extra: { paywall: false }, on: false },
  { name: 'paywall field missing (server before #746)', extra: {}, on: false },
  { name: 'paywall: true', extra: { paywall: true }, on: true },
] as const;

const AT_LIMIT = {
  usage: { canStartConversation: false, conversationsRemaining: 0, statusMessage: 'See you soon' },
};
const NEAR_LIMIT = {
  usage: { canStartConversation: true, approachingLimit: true, conversationsRemaining: 1 },
};

beforeEach(() => {
  resetPaywallFlagForTests();
  apiGet.mockReset();
  appState.set('deviceId', 'u-flag');
});

describe('recordPaywallFlag', () => {
  it('is off before the server has said anything', () => {
    expect(isPaywallOn()).toBe(false);
  });

  it('turns on only for a literal true', () => {
    for (const body of [{ paywall: 'true' }, { paywall: 1 }, { paywall: false }, {}, null, 'x']) {
      recordPaywallFlag({ paywall: true });
      recordPaywallFlag(body);
      expect(isPaywallOn(), JSON.stringify(body)).toBe(false);
    }
    recordPaywallFlag({ paywall: true });
    expect(isPaywallOn()).toBe(true);
  });
});

describe('the flag is fed by the requests the web already makes', () => {
  for (const state of SERVER_STATES) {
    it(`GET /subscription/status with ${state.name}`, async () => {
      apiGet.mockResolvedValue({ ok: true, status: 200, data: { tier: 'free', ...state.extra } });
      await loadStatus();
      expect(apiGet).toHaveBeenCalledWith('/subscription/status?userId=u-flag');
      expect(isPaywallOn()).toBe(state.on);
    });

    it(`GET /subscription/config with ${state.name}`, async () => {
      apiGet.mockResolvedValue({
        ok: true,
        status: 200,
        data: { enabled: state.on, tiers: [], ...state.extra },
      });
      initSubscriptionUI();
      await vi.waitFor(() => expect(apiGet).toHaveBeenCalledWith('/subscription/config'));
      await Promise.resolve();
      expect(isPaywallOn()).toBe(state.on);
    });

    it(`GET /api/subscription/status (billing screen) with ${state.name}`, async () => {
      apiGet.mockResolvedValue({ ok: true, status: 200, data: { tier: 'free', ...state.extra } });
      await getSubscriptionStatus('u-flag');
      expect(isPaywallOn()).toBe(state.on);
    });
  }

  it('a later "off" from the server turns a previous "on" off', async () => {
    apiGet.mockResolvedValue({ ok: true, status: 200, data: { tier: 'free', paywall: true } });
    await loadStatus();
    expect(isPaywallOn()).toBe(true);
    apiGet.mockResolvedValue({ ok: true, status: 200, data: { tier: 'free' } });
    await loadStatus();
    expect(isPaywallOn()).toBe(false);
  });
});

describe('connectGate: checkSubscriptionBeforeConnect never blocks or upsells without a paywall', () => {
  it('at the limit with no paywall: the call is allowed and no limit modal is asked for', () => {
    expect(connectGate(AT_LIMIT, 'fallback', false)).toEqual({
      allowed: true,
      approaching: false,
      remaining: null,
    });
  });

  it('near the limit with no paywall: no countdown reminder', () => {
    expect(connectGate(NEAR_LIMIT, 'fallback', false).approaching).toBe(false);
  });

  it('reads the live flag by default (field missing means allowed)', async () => {
    apiGet.mockResolvedValue({ ok: true, status: 200, data: { tier: 'free', ...AT_LIMIT } });
    const gate = connectGate(await loadStatus(), 'fallback');
    expect(gate.allowed).toBe(true);
    expect(gate.limitMessage).toBeUndefined();
  });

  it('with the paywall on, the limit blocks and carries the server message', () => {
    expect(connectGate(AT_LIMIT, 'fallback', true)).toEqual({
      allowed: false,
      approaching: false,
      remaining: 0,
      limitMessage: 'See you soon',
    });
    expect(connectGate({ canStartConversation: false }, 'fallback', true).limitMessage).toBe(
      'fallback'
    );
  });

  it('with the paywall on, approaching the limit is reported', () => {
    expect(connectGate(NEAR_LIMIT, 'fallback', true)).toEqual({
      allowed: true,
      approaching: true,
      remaining: 1,
    });
  });

  it('no status at all is allowed either way', () => {
    expect(connectGate(null, 'fallback', true).allowed).toBe(true);
  });
});
