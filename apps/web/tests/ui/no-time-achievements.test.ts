/**
 * Ferni doesn't comment on when or how long someone talks: no achievement,
 * milestone or badge for the hour, the weekday or the length of a call.
 * Night Owl ("Chatted past midnight") and Early Bird ("First chat of the day")
 * are retired, as are the Ferni milestones night-talk, early-riser,
 * midnight-friend, weekend-warrior, deep-dive, marathon-talk and
 * quick-checkin, and the trophy room's time badges.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const play = vi.fn();
vi.mock('../../src/ui/sound.ui.js', () => ({ soundUI: { play } }));
vi.mock('../../src/services/outreach.service.js', () => ({
  outreachService: { sendMilestoneCelebration: vi.fn(() => Promise.resolve()) },
}));
vi.mock('../../src/services/push-notifications.service.js', () => ({
  showNotification: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../src/ui/ferni-moments.ui.js', () => ({ ferniMoments: { play: vi.fn() } }));
vi.mock('../../src/ui/celebrations.ui.js', () => ({
  celebrationsUI: { celebrate: vi.fn(), warmthGlow: vi.fn() },
}));

const RETIRED_MILESTONES = [
  'night-talk',
  'early-riser',
  'midnight-friend',
  'weekend-warrior',
  'deep-dive',
  'marathon-talk',
  'quick-checkin',
];

beforeEach(() => {
  localStorage.clear();
  play.mockClear();
  document.body.innerHTML = '<div class="avatar-container"><div id="coachAvatar"></div></div>';
  Element.prototype.animate = vi.fn() as unknown as Element['animate'];
  vi.useFakeTimers();
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('easter-egg achievements', () => {
  it('has no time-of-day achievements', async () => {
    const eggs = await import('../../src/ui/easter-eggs.ui.js');
    const ids = eggs.getAchievements().map((a) => a.id);
    expect(ids).not.toContain('night-owl');
    expect(ids).not.toContain('early-bird');
    expect(ids.length).toBeGreaterThan(5);
  });

  it('unlocks nothing at 2am or after a morning call', async () => {
    const eggs = await import('../../src/ui/easter-eggs.ui.js');
    vi.setSystemTime(new Date(2026, 9, 11, 2, 0));
    eggs.initEasterEggsUI();
    vi.setSystemTime(new Date(2026, 9, 11, 7, 30));
    window.dispatchEvent(new CustomEvent('ferni:conversation-start'));
    vi.setSystemTime(new Date(2026, 9, 11, 7, 45));
    window.dispatchEvent(
      new CustomEvent('ferni:conversation-end', { detail: { durationMinutes: 15 } })
    );
    vi.advanceTimersByTime(65_000);

    expect(eggs.getUnlockedCount()).toBe(0);
    expect(document.querySelector('.achievement-notification')).toBeNull();
    eggs.easterEggsUI.dispose();
  });
});

describe('Ferni milestones', () => {
  it('defines none of the time or length milestones', async () => {
    const m = await import('../../src/ui/ferni-milestones.ui.js');
    m.resetMilestones();
    const ids = m.getMilestones().map((x) => x.id);
    for (const retired of RETIRED_MILESTONES) expect(ids).not.toContain(retired);
    expect(ids).toContain('first-hello');
  });

  it('celebrates nothing for a long 2am weekend call beyond the first hello', async () => {
    const m = await import('../../src/ui/ferni-milestones.ui.js');
    m.resetMilestones();
    m.initFerniMilestones();
    vi.setSystemTime(new Date(2026, 9, 11, 2, 0)); // a Sunday, 2am
    window.dispatchEvent(
      new CustomEvent('ferni:connection-state', { detail: { state: 'connected' } })
    );
    window.dispatchEvent(
      new CustomEvent('ferni:conversation-end', { detail: { durationMinutes: 90 } })
    );

    const celebrated = m
      .getMilestones()
      .filter((x) => x.celebrated)
      .map((x) => x.id);
    expect(celebrated).toEqual(['first-hello']);
  });
});
