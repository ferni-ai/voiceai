/**
 * Panels say nothing invented about the person and ask for nothing that doesn't exist.
 *
 * - Sanctuary, with no real insights, showed generic lines as if they were about
 *   the user ("Your mornings set the tone", "I remember everything") and sent the
 *   agent literal slash commands ("/gratitude") to speak aloud.
 * - Your Contribution said "Founders get unlimited time with the whole team",
 *   but Ferni is free.
 * - A supporter's locked Nayan said "become a Founding Patron" while paid plans
 *   are off: no paywall (#749), or the Venmo chip-in switch (#1031).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/api.js', () => ({
  apiGet: vi.fn(async () => ({ ok: false, data: null })),
  apiPost: vi.fn(async () => ({ ok: false, data: null })),
}));

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const stage = vi.hoisted(() => ({
  getStage: vi.fn(() => 'first-meeting'),
  getMetrics: vi.fn(() => ({
    totalConversations: 0,
    daysSinceFirstMeeting: 0,
    currentStreak: 0,
    longestStreak: 0,
  })),
  onStageChange: vi.fn(() => () => {}),
}));
vi.mock('../../src/services/relationship-stage.service.js', () => ({
  relationshipStageService: stage,
}));

import { apiGet } from '../../src/utils/api.js';
import { getSanctuaryUI } from '../../src/ui/sanctuary.ui.js';
import { manageSubscriptionUI } from '../../src/ui/manage-subscription.ui.js';
import { recordPaywallFlag, resetPaywallFlagForTests } from '../../src/services/paywall.service.js';
import {
  _resetForTesting,
  getMemberStatus,
  setSubscriptionTier,
} from '../../src/services/team-unlock.service.js';

async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

describe('honest copy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.animate = vi.fn() as unknown as Element['animate'];
  });

  afterEach(async () => {
    await settle(getSanctuaryUI().close()); // a failed assertion must not leave it open for the next test
    vi.useRealTimers();
    vi.unstubAllEnvs();
    document.body.replaceChildren();
  });

  const INVENTED = [
    'Your mornings set the tone',
    'Evening reflections help',
    'I remember everything',
    'I hold your story complete',
  ];

  function sanctuaryInsights(): string {
    return document.querySelector('.sanctuary-insight-list')?.textContent ?? '';
  }

  it('sanctuary with no insights says what will appear and how, not generic lines about the user', async () => {
    vi.mocked(apiGet).mockImplementationOnce(async () => ({
      ok: true,
      status: 200,
      data: { greeting: 'Hi', timeContext: 'morning', insights: [], practices: [] },
    }));
    const ui = getSanctuaryUI();
    await settle(ui.open());
    const insights = sanctuaryInsights();

    expect(insights).toContain('Nothing here yet.');
    expect(insights).toContain("After a few conversations, I'll start to notice things");
    expect(insights).toContain('For now, just talk.');
    for (const invented of INVENTED) expect(insights).not.toContain(invented);
    await settle(ui.close());
  });

  it('sanctuary that could not load says so, instead of claiming nothing was noticed', async () => {
    const ui = getSanctuaryUI();
    await settle(ui.open());
    const insights = sanctuaryInsights();

    expect(insights).toContain("I couldn't load what I've noticed.");
    expect(insights).toContain("That's on me, not you.");
    expect(insights).not.toContain('Nothing here yet.');
    for (const invented of INVENTED) expect(insights).not.toContain(invented);
    await settle(ui.close());
  });

  it('sanctuary practices give the agent words to speak, never a slash command', async () => {
    const ui = getSanctuaryUI();
    await settle(ui.open());
    const prompts = [...document.querySelectorAll('[data-prompt]')].map(
      (el) => el.getAttribute('data-prompt') ?? ''
    );

    expect(prompts.length).toBeGreaterThan(0);
    for (const prompt of prompts) {
      expect(prompt.trim()).not.toBe('');
      expect(prompt.startsWith('/')).toBe(false);
    }
    expect(prompts).toContain(
      "Let's pause and appreciate. What's one thing you're grateful for right now?"
    );
    await settle(ui.close());
  });

  it('your contribution says Ferni is free and makes no founders promise', async () => {
    vi.stubEnv('VITE_VENMO_CHIP_IN', 'true');
    vi.stubEnv('VITE_VENMO_HANDLE', 'ferni');
    await settle(manageSubscriptionUI.open('user-1'));
    const text = document.body.textContent ?? '';

    expect(text).toContain(
      "Ferni is free. If you'd like to help keep it going, you can chip in on Venmo."
    );
    expect(text).not.toContain('Founders get unlimited time');
    // No paywall: no Join button, even with Venmo on
    expect(document.querySelector('.manage-sub [data-action="upgrade"]')).toBeNull();
    manageSubscriptionUI.close();
    vi.unstubAllEnvs();
  });

  it('with no paywall and Venmo off, your contribution mentions no Venmo and no Join button', async () => {
    vi.stubEnv('VITE_VENMO_CHIP_IN', 'false');
    await settle(manageSubscriptionUI.open('user-1'));
    const text = document.body.textContent ?? '';

    expect(text).not.toContain('Venmo');
    expect(document.querySelector('.manage-sub [data-action="upgrade"]')).toBeNull();
    manageSubscriptionUI.close();
    vi.unstubAllEnvs();
  });

  describe("a supporter's locked Nayan", () => {
    beforeEach(() => _resetForTesting());
    afterEach(() => {
      resetPaywallFlagForTests();
      vi.unstubAllEnvs();
    });

    for (const [name, paywall, venmo] of [
      ['paywall on, Venmo on', true, 'true'],
      ['paywall off, Venmo on', false, 'true'],
      ['paywall off, Venmo off', false, 'false'],
    ] as const) {
      it(`shows the free relationship path while paid plans are off (${name})`, () => {
        recordPaywallFlag({ paywall });
        vi.stubEnv('VITE_VENMO_CHIP_IN', venmo);
        vi.stubEnv('VITE_VENMO_HANDLE', 'ferni');
        setSubscriptionTier('friend'); // recomputes the cached unlock state
        const status = getMemberStatus('nayan-patel');

        expect(status.unlocked).toBe(false);
        expect(status.unlockHint).not.toContain('Founding Patron');
        expect(status.unlockHint).toContain('60');
      });
    }

    it('names the paid path only with the paywall on and Venmo off', () => {
      recordPaywallFlag({ paywall: true });
      vi.stubEnv('VITE_VENMO_CHIP_IN', 'false');
      setSubscriptionTier('friend');
      expect(getMemberStatus('nayan-patel').unlockHint).toContain('Founding Patron');
    });
  });
});
