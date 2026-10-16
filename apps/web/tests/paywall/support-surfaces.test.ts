/**
 * Asking for money stays hidden unless the server says `paywall: true`: the
 * tip card after every hang-up, Support Ferni (upgrade tiers and card tips),
 * the founders journey's "Support Ferni" button, the Ferni Fund (garden),
 * and a pinned "Support Ferni" row in the settings menu.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('../../src/utils/api.js', () => ({ apiGet, apiPost: vi.fn() }));
vi.mock('../../src/ui/whisper.ui.js', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() },
  toastInfo: vi.fn(),
}));
vi.mock('../../src/services/founders.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/founders.service.js')>()),
  fetchFounderStats: vi.fn(async () => null),
  fetchFoundersWall: vi.fn(async () => ({ founders: [], totalCount: 0 })),
  fetchFounderStories: vi.fn(async () => []),
  fetchCommunityMilestones: vi.fn(async () => []),
  fetchPersonalImpact: vi.fn(async () => null),
}));

const SERVER_STATES = [
  { name: 'paywall: false', extra: { paywall: false }, on: false },
  { name: 'paywall missing', extra: {}, on: false },
  { name: 'paywall: true', extra: { paywall: true }, on: true },
] as const;

const COST = {
  sessionId: 's-1',
  totalCost: 0.06,
  formattedCost: '$0.06',
  durationMinutes: 10,
  breakdown: { llm: 0.03, tts: 0.02, stt: 0.005, livekit: 0.003, infrastructure: 0.002 },
  suggestedTips: { small: 1, medium: 5, large: 10 },
  message: 'Thanks for chatting!',
};

/** GET bodies as the server sends them, with this state's paywall field on the status. */
function serve(extra: Record<string, unknown>): void {
  apiGet.mockImplementation(async (path: string) => {
    if (path === '/api/conversation/cost') return { ok: true, status: 200, data: COST };
    return { ok: true, status: 200, data: { tier: 'free', status: 'active', usage: {}, ...extra } };
  });
}

/** Fresh modules so the module-level flag and singletons start clean. */
async function fresh() {
  vi.resetModules();
  const paywall = await import('../../src/services/paywall.service.js');
  const { appState } = await import('../../src/state/app.state.js');
  appState.set('deviceId', 'u-support');
  return paywall;
}

/** Long enough for requestAnimationFrame, which marks the fund modal open. */
const settle = () => new Promise((r) => setTimeout(r, 40));

beforeEach(() => {
  vi.clearAllMocks();
  HTMLElement.prototype.animate = vi.fn() as unknown as HTMLElement['animate'];
  globalThis.fetch = vi.fn(async () => new Response('{}', { status: 404 })) as typeof fetch;
});

afterEach(() => {
  document.body.replaceChildren();
});

for (const state of SERVER_STATES) {
  const verb = state.on ? 'shows' : 'does not show';

  describe(`server says ${state.name}`, () => {
    beforeEach(() => serve(state.extra));

    it(`${verb} the tip card after a hang-up`, async () => {
      const { recordPaywallFlag } = await fresh();
      recordPaywallFlag({ tier: 'free', ...state.extra }); // the status body loaded at connect
      const { showConversationCost } = await import('../../src/ui/conversation-cost.ui.js');

      await showConversationCost();

      expect(document.querySelector('.ferni-cost-card') !== null).toBe(state.on);
      expect(apiGet.mock.calls.some(([p]) => p === '/api/conversation/cost')).toBe(state.on);
    });

    it(`${state.on ? 'opens' : 'does not open'} Support Ferni (upgrade tiers, card tips)`, async () => {
      await fresh();
      const { openSupportFerni } = await import('../../src/ui/support-ferni.ui.js');

      await openSupportFerni(); // loads the status itself, which carries the flag

      const overlay = document.querySelector('.support-ferni-overlay');
      expect(overlay !== null).toBe(state.on);
      expect(document.querySelector('[data-upgrade-tier]') !== null).toBe(state.on);
      expect(document.querySelector('[data-action="plant-seed"]') !== null).toBe(state.on);
    });

    it(`${verb} the founders journey's "Support Ferni" button`, async () => {
      const { recordPaywallFlag } = await fresh();
      recordPaywallFlag({ tier: 'free', ...state.extra });
      const { openFoundersJourney } = await import('../../src/ui/founders-journey.ui.js');
      const opened = vi.fn();
      document.addEventListener('ferni:open-support', opened);

      await openFoundersJourney();
      const join = document.querySelector<HTMLElement>('[data-action="join"]');
      join?.click();
      document.removeEventListener('ferni:open-support', opened);

      expect(document.querySelector('.founders-journey-content')).not.toBeNull();
      expect(join !== null).toBe(state.on);
      expect(opened).toHaveBeenCalledTimes(state.on ? 1 : 0);
    });

    it(`${state.on ? 'opens' : 'does not open'} the Ferni Fund (?garden=true, plant-seed)`, async () => {
      const { recordPaywallFlag } = await fresh();
      recordPaywallFlag({ tier: 'free', ...state.extra });
      const { open, isModalOpen } = await import('../../src/ui/ferni-fund.ui.js');

      await open('u-support');
      await settle();

      expect(document.querySelector('.ferni-fund-overlay') !== null).toBe(state.on);
      expect(isModalOpen()).toBe(state.on);
    });

    it(`${verb} a pinned "Support Ferni" row in the settings menu`, async () => {
      const { recordPaywallFlag } = await fresh();
      recordPaywallFlag({ tier: 'free', ...state.extra });
      localStorage.setItem('ferni_menu_pinned', JSON.stringify(['support-ferni']));
      const { getSettingsMenuUI, initSettingsMenuUI } =
        await import('../../src/ui/settings-menu.ui.js');

      initSettingsMenuUI({ onSupportFerniClick: vi.fn() });
      getSettingsMenuUI().show();
      const row = document.querySelector(
        '.settings-menu__item--pinned[data-action="support-ferni"]'
      );
      getSettingsMenuUI().destroy();

      expect(row !== null).toBe(state.on);
    });
  });
}
