/**
 * Subscription surfaces stay hidden unless the server says `paywall: true`:
 * the upgrade modal, the limit-reached modal, Stripe checkout, the usage
 * indicator, and the header badge's trial countdown and upgrade click.
 *
 * The flag reaches the UI the real way: the status body the module fetches.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const coordinator = vi.hoisted(() => ({
  request: vi.fn((_id: string, _priority: string, show: () => void) => show()),
  requestCriticalModal: vi.fn((_id: string, show: () => void) => show()),
  release: vi.fn(),
  hasMinimumConversations: vi.fn(() => true),
}));
vi.mock('../../src/utils/api.js', () => ({ apiGet, apiPost }));
vi.mock('../../src/services/modal-coordinator.service.js', () => ({
  modalCoordinator: coordinator,
}));
vi.mock('../../src/ui/whisper.ui.js', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

const { resetPaywallFlagForTests } = await import('../../src/services/paywall.service.js');
const sub = await import('../../src/ui/subscription.ui.js');
const badge = await import('../../src/ui/subscription-badge.ui.js');
const { appState } = await import('../../src/state/app.state.js');

const SERVER_STATES = [
  { name: 'paywall: false', extra: { paywall: false }, on: false },
  { name: 'paywall missing', extra: {}, on: false },
  { name: 'paywall: true', extra: { paywall: true }, on: true },
] as const;

const TRIAL = {
  inTrial: true,
  timeRemainingMs: 300000,
  approachingEnd: false,
  trialEnded: false,
  trialDurationMs: 600000,
  isEligible: true,
};

/** Serve GETs as the server would, with the paywall field for this state. */
function serve(extra: Record<string, unknown>, status: Record<string, unknown> = {}): void {
  apiGet.mockImplementation(async (path: string) => {
    if (path.startsWith('/subscription/trial')) return { ok: true, status: 200, data: TRIAL };
    if (path.startsWith('/subscription/config'))
      return { ok: true, status: 200, data: { tiers: [], ...extra } };
    return {
      ok: true,
      status: 200,
      data: { tier: 'free', status: 'active', usage: {}, ...status, ...extra },
    };
  });
}

const upgradeModal = () => document.querySelector('.subscription-modal[role="dialog"]');
const limitModal = () => document.querySelector('.subscription-modal[role="alertdialog"]');

beforeEach(() => {
  // jsdom has no Web Animations; the modals animate their cards in
  HTMLElement.prototype.animate = vi.fn() as unknown as HTMLElement['animate'];
  resetPaywallFlagForTests();
  vi.clearAllMocks();
  document.body.innerHTML = '<div id="coach"></div>';
  appState.set('deviceId', 'u-surface');
});

afterEach(() => {
  badge.destroySubscriptionBadge();
  badge.stopTrialTimer();
  document.querySelectorAll('.subscription-modal, .usage-indicator').forEach((el) => el.remove());
});

for (const state of SERVER_STATES) {
  const verb = state.on ? 'shows' : 'does not show';

  describe(`server says ${state.name}`, () => {
    beforeEach(async () => {
      serve(state.extra);
      await sub.loadStatus();
    });

    it(`${verb} the upgrade modal`, () => {
      sub.showUpgradeModal();
      expect(upgradeModal() !== null).toBe(state.on);
      expect(coordinator.request).toHaveBeenCalledTimes(state.on ? 1 : 0);
    });

    it(`${verb} the limit-reached modal`, () => {
      sub.showLimitReachedModal('See you soon');
      expect(limitModal() !== null).toBe(state.on);
    });

    it(`${verb} the usage indicator`, () => {
      sub.showUsageIndicator();
      expect(document.querySelector('.usage-indicator') !== null).toBe(state.on);
    });

    it(`${state.on ? 'shows' : 'hides'} the badge trial countdown, and its click ${state.on ? 'opens' : 'does not open'} the upgrade modal`, async () => {
      badge.initSubscriptionBadge();
      const el = document.querySelector<HTMLElement>('.subscription-badge');
      expect(el).not.toBeNull();
      await vi.waitFor(() => expect(el?.querySelector('.subscription-badge__text')).not.toBeNull());

      expect(el?.classList.contains('subscription-badge--trial')).toBe(state.on);
      const askedForTrial = apiGet.mock.calls.some(([p]) =>
        String(p).startsWith('/subscription/trial')
      );
      expect(askedForTrial).toBe(state.on);

      el?.click();
      expect(upgradeModal() !== null).toBe(state.on);
    });
  });
}

describe('checkout', () => {
  it('a tier button never starts a checkout once the server says there is no paywall', async () => {
    serve({ paywall: true });
    await sub.loadStatus();
    sub.showUpgradeModal();
    const friend = document.querySelector<HTMLElement>('.tier-button[data-tier="friend"]');
    expect(friend).not.toBeNull();

    serve({}); // the next status body has no paywall
    await sub.loadStatus();
    friend?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await Promise.resolve();

    expect(apiPost).not.toHaveBeenCalled();
  });

  it('with the paywall on, the tier button posts to /subscription/checkout', async () => {
    apiPost.mockResolvedValue({ ok: false, status: 500 });
    serve({ paywall: true });
    await sub.loadStatus();
    sub.showUpgradeModal();
    const friend = document.querySelector<HTMLElement>('.tier-button[data-tier="friend"]');
    friend?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    await vi.waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith(
        '/subscription/checkout',
        expect.objectContaining({ tier: 'friend' })
      )
    );
  });
});
