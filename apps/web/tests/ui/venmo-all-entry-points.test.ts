/**
 * With the paywall on (server sends `paywall: true`), every payment entry
 * point goes to Venmo when the chip-in flag is on (#1031).
 *
 * With the paywall off (Seth, #749): no paid-subscription surface renders or
 * opens (upgrade modal, badge, trial clock, usage indicator, limit modal,
 * Join the Journey, checkout) and none of them redirects to Venmo. The Venmo
 * card stays reachable only from voluntary entry points (Ferni Fund, the
 * support/tip link) when its flag is on; with it off there is no payment or
 * tip UI at all.
 *
 * Seth clicked the "Community" badge and got the $10/$20 Stripe plans. With
 * VITE_VENMO_CHIP_IN=true and a handle, each entry point below opens the Venmo
 * card instead; with the flag off each one behaves exactly as before.
 *
 * The badge, usage indicator and manage-subscription button are driven through
 * their real modules. The ?garden=true and plant-seed handlers live inside the
 * App class, so their tests pin that the handler calls openFerniFund and then
 * drive openFerniFund itself.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  request: vi.fn((_id: string, _priority: string, show: () => void) => show()),
  fundOpen: vi.fn(() => Promise.resolve()),
  supportOpen: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../src/utils/api.js', () => ({ apiGet: mocks.apiGet, apiPost: vi.fn() }));
vi.mock('../../src/utils/billing.js', () => ({
  billingErrorMessage: vi.fn(() => ''),
  openBillingPortal: vi.fn(),
}));
vi.mock('../../src/services/modal-coordinator.service.js', () => ({
  modalCoordinator: {
    request: mocks.request,
    requestCriticalModal: vi.fn((_id: string, show: () => void) => show()),
    release: vi.fn(),
    hasMinimumConversations: vi.fn(() => true),
  },
}));
vi.mock('../../src/ui/ferni-fund.ui.js', () => ({
  ferniFundUI: { open: mocks.fundOpen, showThankYou: vi.fn() },
}));
vi.mock('../../src/ui/support-ferni.ui.js', () => ({
  supportFerniUI: { open: mocks.supportOpen },
}));

// jsdom has no Web Animations; the upgrade modal animates its card in.
Object.defineProperty(HTMLElement.prototype, 'animate', {
  configurable: true,
  value: () => ({ finished: Promise.resolve(), cancel: () => undefined }),
});

const APP_SRC = readFileSync(resolve(__dirname, '../../src/app.ts'), 'utf8');
let paywall = true;
const TRIAL = { inTrial: true, trialDurationMs: 600_000, trialEnded: false, isEligible: true };

function setFlag(on: boolean): void {
  vi.stubEnv('VITE_VENMO_CHIP_IN', on ? 'true' : 'false');
  vi.stubEnv('VITE_VENMO_HANDLE', 'ferni-test');
}

const venmoCard = (): Element | null => document.querySelector('dialog.venmo-chip-in');
const upgradeModal = (): Element | null => document.querySelector('.subscription-modal');

/** The source of one App handler, from its marker to the end of its block. */
function handlerSource(marker: string, end: string): string {
  const start = APP_SRC.indexOf(marker);
  expect(start, `app.ts handler ${marker}`).toBeGreaterThan(-1);
  return APP_SRC.slice(start, APP_SRC.indexOf(end, start));
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  document.body.innerHTML = '<div id="coach"></div>';
  mocks.apiGet.mockImplementation((url: string) =>
    Promise.resolve({
      ok: true,
      status: 200,
      data: url.startsWith('/subscription/trial')
        ? { ...TRIAL }
        : { tier: 'free', status: 'active', paywall },
    })
  );
  const { recordPaywallFlag } = await import('../../src/services/paywall.service.js');
  recordPaywallFlag({ paywall });
  const { appState } = await import('../../src/state/app.state.js');
  appState.set('deviceId', 'device-1');
});

afterEach(async () => {
  const badge = await import('../../src/ui/subscription-badge.ui.js');
  badge.stopTrialTimer();
  badge.destroySubscriptionBadge();
  vi.unstubAllEnvs();
});

async function waitForVenmo(): Promise<void> {
  await vi.waitFor(() => expect(venmoCard()).not.toBeNull());
}

describe('paywall on', () => {
  beforeAll(() => {
    paywall = true;
  });

  describe('showUpgradeModal, the single gate', () => {
    it('opens the Venmo card and not the upgrade plans when the flag is on', async () => {
      setFlag(true);
      const { showUpgradeModal } = await import('../../src/ui/subscription.ui.js');
      showUpgradeModal();
      await waitForVenmo();
      expect(mocks.request).not.toHaveBeenCalled();
      expect(upgradeModal()).toBeNull();
    });

    it('opens the upgrade plans when the flag is off', async () => {
      setFlag(false);
      const { showUpgradeModal } = await import('../../src/ui/subscription.ui.js');
      showUpgradeModal();
      expect(mocks.request).toHaveBeenCalledWith(
        'subscription-upgrade',
        'medium',
        expect.any(Function)
      );
      expect(upgradeModal()).not.toBeNull();
      expect(venmoCard()).toBeNull();
    });
  });

  describe('subscription badge', () => {
    async function badge(): Promise<HTMLElement> {
      const { initSubscriptionBadge, forceRefresh } =
        await import('../../src/ui/subscription-badge.ui.js');
      initSubscriptionBadge();
      await forceRefresh();
      const el = document.querySelector<HTMLElement>('.subscription-badge');
      if (!el) throw new Error('badge did not render');
      return el;
    }

    it('a click opens the Venmo card, not the plans, when the flag is on', async () => {
      setFlag(true);
      (await badge()).click();
      await waitForVenmo();
      expect(upgradeModal()).toBeNull();
    });

    it('a click opens the upgrade plans when the flag is off', async () => {
      setFlag(false);
      (await badge()).click();
      expect(upgradeModal()).not.toBeNull();
      expect(venmoCard()).toBeNull();
    });

    it('hides the trial countdown when the flag is on', async () => {
      setFlag(true);
      const el = await badge();
      expect(el.classList.contains('subscription-badge--trial')).toBe(false);
      expect(el.textContent).not.toMatch(/timeLeft|left/);
      expect(mocks.apiGet).not.toHaveBeenCalledWith(
        expect.stringMatching(/^\/subscription\/trial/)
      );
    });

    it('shows the trial countdown when the flag is off', async () => {
      setFlag(false);
      const el = await badge();
      expect(el.classList.contains('subscription-badge--trial')).toBe(true);
      expect(el.textContent).toMatch(/timeLeft|left/);
    });
  });

  describe('usage indicator', () => {
    async function indicator(): Promise<HTMLElement> {
      const { loadStatus, showUsageIndicator } = await import('../../src/ui/subscription.ui.js');
      await loadStatus();
      showUsageIndicator();
      const el = document.querySelector<HTMLElement>('.usage-indicator');
      if (!el) throw new Error('usage indicator did not render');
      return el;
    }

    it('a click opens the Venmo card, not the plans, when the flag is on', async () => {
      setFlag(true);
      (await indicator()).click();
      await waitForVenmo();
      expect(upgradeModal()).toBeNull();
    });

    it('a click opens the upgrade plans when the flag is off', async () => {
      setFlag(false);
      (await indicator()).click();
      expect(upgradeModal()).not.toBeNull();
    });
  });

  describe('Settings > Your Contribution > Join the Journey', () => {
    it('app.ts hands the manage-subscription modal showUpgradeModal as onUpgrade', () => {
      expect(APP_SRC).toMatch(/onUpgrade: \(\) => showUpgradeModal\(\)/);
      expect(APP_SRC).toMatch(/showUpgradeModal,\n[^']*\} from '\.\/ui\/subscription\.ui\.js'/);
    });

    async function joinTheJourney(): Promise<void> {
      const { manageSubscriptionUI } = await import('../../src/ui/manage-subscription.ui.js');
      const { showUpgradeModal } = await import('../../src/ui/subscription.ui.js');
      await manageSubscriptionUI.open('device-1', { onUpgrade: () => showUpgradeModal() });
      const join = document.querySelector<HTMLElement>('.manage-sub [data-action="upgrade"]');
      if (!join) throw new Error('Join the Journey button missing');
      join.click();
    }

    it('opens the Venmo card, not the plans, when the flag is on', async () => {
      setFlag(true);
      await joinTheJourney();
      await waitForVenmo();
      expect(upgradeModal()).toBeNull();
    });

    it('opens the upgrade plans when the flag is off', async () => {
      setFlag(false);
      await joinTheJourney();
      await vi.waitFor(() => expect(upgradeModal()).not.toBeNull());
      expect(venmoCard()).toBeNull();
    });
  });

  describe("Ferni's Garden openers", () => {
    const garden = (): string =>
      handlerSource("urlParams.get('garden') === 'true'", 'history.replaceState');
    const plantSeed = (): string => handlerSource("'ferni:open-plant-seed'", 'as EventListener');

    it('both handlers open the Garden through openFerniFund from lazy-screens', () => {
      expect(garden()).toContain('openFerniFund(userId)');
      expect(plantSeed()).toContain('openFerniFund(userId)');
      expect(APP_SRC).toMatch(/openFerniFund,\n[^']*\} from '\.\/ui\/lazy-screens\.js'/);
    });

    async function openGarden(): Promise<void> {
      const { openFerniFund } = await import('../../src/ui/lazy-screens.js');
      await openFerniFund('device-1');
    }

    it('?garden=true opens the Venmo card, not the Garden, when the flag is on', async () => {
      expect(garden()).toContain('openFerniFund(');
      setFlag(true);
      await openGarden();
      expect(venmoCard()).not.toBeNull();
      expect(mocks.fundOpen).not.toHaveBeenCalled();
    });

    it('?garden=true opens the Garden when the flag is off', async () => {
      setFlag(false);
      await openGarden();
      expect(mocks.fundOpen).toHaveBeenCalledWith('device-1');
      expect(venmoCard()).toBeNull();
    });

    it('ferni:open-plant-seed opens the Venmo card, not the Garden, when the flag is on', async () => {
      expect(plantSeed()).toContain('openFerniFund(');
      setFlag(true);
      await openGarden();
      expect(venmoCard()).not.toBeNull();
      expect(mocks.fundOpen).not.toHaveBeenCalled();
      expect(mocks.supportOpen).not.toHaveBeenCalled();
    });

    it('ferni:open-plant-seed opens the Garden when the flag is off', async () => {
      setFlag(false);
      await openGarden();
      expect(mocks.fundOpen).toHaveBeenCalledWith('device-1');
    });
  });
});

describe('paywall off', () => {
  beforeAll(() => {
    paywall = false;
  });

  const tick = () => new Promise((r) => setTimeout(r, 20));

  async function badgeEl(): Promise<HTMLElement | null> {
    const { initSubscriptionBadge, forceRefresh } =
      await import('../../src/ui/subscription-badge.ui.js');
    initSubscriptionBadge();
    await forceRefresh();
    return document.querySelector<HTMLElement>('.subscription-badge');
  }

  for (const venmo of [true, false]) {
    describe(`Venmo chip-in ${venmo ? 'on' : 'off'}`, () => {
      beforeEach(() => setFlag(venmo));

      it('showUpgradeModal is a no-op: no plans, no Venmo card', async () => {
        const { showUpgradeModal } = await import('../../src/ui/subscription.ui.js');
        showUpgradeModal();
        await tick();
        expect(mocks.request).not.toHaveBeenCalled();
        expect(upgradeModal()).toBeNull();
        expect(venmoCard()).toBeNull();
      });

      it('the badge is hidden, never fetches the trial clock, and a click opens nothing', async () => {
        const el = await badgeEl();
        expect(el === null || el.classList.contains('subscription-badge--hidden')).toBe(true);
        expect(el?.classList.contains('subscription-badge--trial') ?? false).toBe(false);
        expect(mocks.apiGet).not.toHaveBeenCalledWith(
          expect.stringMatching(/^\/subscription\/trial/)
        );
        el?.click();
        await tick();
        expect(upgradeModal()).toBeNull();
        expect(venmoCard()).toBeNull();
      });

      it('no usage indicator, no limit modal, and no Venmo card in response to a limit', async () => {
        const { loadStatus, showUsageIndicator, showLimitReachedModal } =
          await import('../../src/ui/subscription.ui.js');
        await loadStatus();
        showUsageIndicator();
        showLimitReachedModal('You have reached your limit');
        await tick();
        expect(document.querySelector('.usage-indicator')).toBeNull();
        expect(document.querySelector('.subscription-modal, .subscription-card--limit')).toBeNull();
        expect(venmoCard()).toBeNull();
      });

      it('manage subscription offers no Join the Journey button', async () => {
        const { manageSubscriptionUI } = await import('../../src/ui/manage-subscription.ui.js');
        await manageSubscriptionUI.open('device-1', { onUpgrade: vi.fn() });
        expect(document.querySelector('.manage-sub [data-action="upgrade"]')).toBeNull();
      });

      it(`Ferni Fund (?garden=true, plant-seed) ${venmo ? 'opens the Venmo card' : 'opens nothing'}`, async () => {
        const { openFerniFund } = await import('../../src/ui/lazy-screens.js');
        await openFerniFund('device-1');
        expect(venmoCard() !== null).toBe(venmo);
        expect(mocks.fundOpen).not.toHaveBeenCalled();
        expect(mocks.supportOpen).not.toHaveBeenCalled();
      });

      it(`the support/tip link ${venmo ? 'opens the Venmo card' : 'opens nothing'}`, async () => {
        const { openSupportFerni } = await import('../../src/ui/lazy-screens.js');
        const { openSupport, canOpenSupport } =
          await import('../../src/ui/support/open-support.js');
        expect(canOpenSupport()).toBe(venmo);
        await openSupportFerni();
        expect(venmoCard() !== null).toBe(venmo);
        document.querySelector('dialog.venmo-chip-in')?.remove();
        await openSupport();
        expect(venmoCard() !== null).toBe(venmo);
        expect(mocks.supportOpen).not.toHaveBeenCalled();
      });
    });
  }
});
