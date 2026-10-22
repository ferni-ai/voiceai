/**
 * VITE_NO_STREAKS: the brand doesn't count streaks ("Growth Through
 * Gentleness"). With the flag on, a 7-day streak shows no count, fires no
 * milestone notice or confetti, and pays no streak seeds, while the day's
 * conversation still earns its seeds. With the flag off, all of it works as
 * before. Each test loads fresh modules so singletons and stored state start
 * clean.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const addSeeds = vi.fn();
vi.mock('@/services/cosmetics.service.js', () => ({
  addSeeds: (n: number) => addSeeds(n),
  getSeedBalance: () => 40,
}));
vi.mock('@/services/seeds-ledger.service.js', () => ({
  serverSeeds: () => null,
  claimDailyOnServer: vi.fn(),
  noteServerBalance: vi.fn(),
  refreshServerSeeds: vi.fn(),
}));

const day = (offset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Six days in a row, last talked yesterday: today's conversation makes it seven. */
function storeSixDayStreak(): void {
  localStorage.setItem(
    'ferni_seeds_state',
    JSON.stringify({
      lastDailyClaimDate: day(-1),
      currentStreak: 6,
      lastConversationDate: day(-1),
      totalEarned: 0,
      awardedMilestones: [],
      referralCodesUsed: [],
    })
  );
}

function setFlag(on: boolean): void {
  vi.stubEnv('VITE_NO_STREAKS', on ? 'true' : 'false');
  vi.resetModules();
}

beforeEach(() => {
  addSeeds.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// The old per-surface toasts: the kill-switch path of src/ui/overlay/toast-flag.ts.
beforeEach(() => vi.stubEnv('VITE_TOAST_REGION', 'off'));
afterEach(() => vi.unstubAllEnvs());

describe.each([
  { on: true, label: 'flag on' },
  { on: false, label: 'flag off (unchanged)' },
])('VITE_NO_STREAKS, $label', ({ on }) => {
  beforeEach(() => setFlag(on));

  it('is read from the build env', async () => {
    const { isNoStreaksOn, shownStreak } = await import('@/config/no-streaks.js');
    expect(isNoStreaksOn()).toBe(on);
    expect(shownStreak(7)).toBe(on ? 0 : 7);
  });

  it('a seventh day in a row pays the daily seeds, and streak seeds only when off', async () => {
    storeSixDayStreak();
    // A streak award is announced once, as a seeds-earned of type 'streak'.
    const streakAwards: number[] = [];
    const onEarned = (e: Event): void => {
      const detail = (e as CustomEvent<{ amount: number; type: string }>).detail;
      if (detail.type === 'streak') streakAwards.push(detail.amount);
    };
    document.addEventListener('ferni:seeds-earned', onEarned);
    const seeds = await import('@/services/seeds-economy.service.js');

    seeds.recordConversation();
    document.removeEventListener('ferni:seeds-earned', onEarned);

    // Daily conversation seeds (5) are a genuine action: paid either way.
    expect(addSeeds.mock.calls.map(([n]) => n)).toEqual(on ? [5] : [5, 25]);
    expect(streakAwards).toEqual(on ? [] : [25]);
    // The streak is still recorded, so turning the flag off restores it.
    expect(seeds.getCurrentStreak()).toBe(7);
  });

  it('the seeds display shows the flame streak badge only when off', async () => {
    storeSixDayStreak();
    const seeds = await import('@/services/seeds-economy.service.js');
    seeds.recordConversation();
    const { renderCompactSeedsDisplay, renderSeedsSettingsCard } =
      await import('@/ui/seeds-display.ui.js');

    const compact = renderCompactSeedsDisplay();
    expect(compact).toContain('data-seeds-amount>40<');
    expect(compact.includes('seeds-streak-count">7<')).toBe(!on);
    expect(compact.includes('seeds-streak-icon')).toBe(!on);
    expect(renderSeedsSettingsCard().includes('seeds-settings-value-text">7<')).toBe(!on);
  });

  it('a 7-day ritual streak fires the milestone callback only when off', async () => {
    const { engagementService } = await import('@/services/engagement.service.js');
    const onStreakMilestone = vi.fn();
    engagementService.setCallbacks({ onStreakMilestone });

    engagementService.handleDataMessage({
      type: 'daily_checkin_recorded',
      weather: 'sunny',
      energy: 'high',
      streak: 7,
      isNewRecord: true,
      ritualId: 'morning-sky',
      timestamp: new Date().toISOString(),
    });

    expect(onStreakMilestone).toHaveBeenCalledTimes(on ? 0 : 1);
  });

  it('a 7-day streak shows the milestone notice only when off', async () => {
    const { showStreakMilestone } = await import('@/ui/notifications.ui.js');
    showStreakMilestone('Daily check-in', 7, 'ferni');
    expect(document.querySelectorAll('.notification--streak_milestone')).toHaveLength(on ? 0 : 1);
  });

  it('a due ritual is not flagged "streak at risk" (urgent) when on', async () => {
    document.body.innerHTML = '<span id="engagementBadge"></span>';
    const { engagementTriggerUI } = await import('@/ui/engagement-trigger.ui.js');
    engagementTriggerUI.updateBadges({ ritualsdue: 1, streakAtRisk: true });
    const badge = document.getElementById('engagementBadge');
    expect(badge?.textContent).toBe('1');
    expect(badge?.classList.contains('engagement-trigger-btn__badge--urgent')).toBe(!on);
  });

  it('a 7-day streak plays the confetti canvas only when off', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    const { celebrateStreak, isStreakMilestone } = await import('@/ui/streak-celebrations.ui.js');
    expect(isStreakMilestone(7)).toBe(!on);
    celebrateStreak(7, 'ferni');
    expect(document.querySelectorAll('.streak-celebration-canvas')).toHaveLength(on ? 0 : 1);
  });

  it('the client asks the server for a streak seed reward only when off', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ success: true, awarded: false }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const { roadmapService } = await import('@/services/roadmap.service.js');

    const result = await roadmapService.checkStreakReward(7);

    expect(result.awarded).toBe(false);
    const streakCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/api/roadmap/streak-reward')
    );
    expect(streakCalls).toHaveLength(on ? 0 : 1);
  });

  it('the returning-visit greeting has no streak milestone when on', async () => {
    localStorage.setItem(
      'voiceai_user_history',
      JSON.stringify({ streak: 7, lastStreakDate: new Date().toDateString() })
    );
    const { checkStreakMilestone } = await import('@/ui/greeting.ui.js');
    expect(checkStreakMilestone()).toBe(on ? null : 7);
  });

  it('the dormant ritual registry carries the streak ritual only when off', async () => {
    const { getRitualsByTrigger } = await import('@/services/ritual.registry.js');
    expect(getRitualsByTrigger('streak_achieved')).toHaveLength(on ? 0 : 1);
  });

  it('the streak ritual in the live ritual engine runs only when off', async () => {
    const { getRitualEngine } = await import('@/services/ritual-engine.service.js');
    const engine = getRitualEngine();
    const internals = engine as unknown as { executeSequence: () => Promise<void> };
    const run = vi.spyOn(internals, 'executeSequence').mockResolvedValue(undefined);
    await engine.trigger('streak', { streakCount: 7 });
    expect(run).toHaveBeenCalledTimes(on ? 0 : 1);
  });
});
