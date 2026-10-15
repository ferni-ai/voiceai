/**
 * One streak reward, one notice.
 *
 * checkStreakMilestones used to announce a streak award twice: awardSeeds sent
 * ferni:seeds-earned, then the service also sent ferni:streak-milestone for the
 * same seeds, and seeds-toast whispered both. The real seeds economy and the real
 * seeds-toast listeners run here; only the whisper renderer is stubbed.
 */

import { describe, expect, it, vi } from 'vitest';

const celebration = vi.hoisted(() => vi.fn());
vi.mock('../../src/ui/whisper.ui.js', () => ({ whisper: { celebration } }));

function localDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Six days in a row ending yesterday, so today's conversation completes a 7-day streak.
localStorage.setItem(
  'ferni_seeds_state',
  JSON.stringify({
    lastDailyClaimDate: localDate(1),
    currentStreak: 6,
    lastConversationDate: localDate(1),
    totalEarned: 0,
    awardedMilestones: [],
    referralCodesUsed: [],
  })
);

const { recordConversation } = await import('../../src/services/seeds-economy.service.js');
const { initSeedsToast } = await import('../../src/ui/seeds-toast.ui.js');

describe('streak milestone seeds', () => {
  it('reaching a 7-day streak whispers the streak award exactly once', () => {
    initSeedsToast();
    const earned = vi.fn();
    document.addEventListener('ferni:seeds-earned', earned);

    recordConversation();

    document.removeEventListener('ferni:seeds-earned', earned);
    // The streak award still reaches the balance listeners (seeds-display, Moments).
    const streakEvents = earned.mock.calls.filter(
      ([e]) => (e as CustomEvent<{ type: string }>).detail.type === 'streak'
    );
    expect(streakEvents).toHaveLength(1);

    const streakWhispers = celebration.mock.calls.filter(([amount]) => amount === 25);
    expect(streakWhispers).toHaveLength(1);
    // Daily bonus + streak bonus: two rewards, two notices.
    expect(celebration).toHaveBeenCalledTimes(2);
  });
});
