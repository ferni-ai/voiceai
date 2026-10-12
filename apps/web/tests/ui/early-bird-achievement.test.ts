/**
 * "Early Bird — First chat of the day" must be earned by a real morning call.
 *
 * Before: initEasterEggsUI() unlocked it (and played a success sound) 1.5 s
 * after the first page load of each day, at any hour, with no call at all.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const play = vi.fn();
vi.mock('../../src/ui/sound.ui.js', () => ({ soundUI: { play } }));

async function loadEasterEggs() {
  vi.resetModules();
  return import('../../src/ui/easter-eggs.ui.js');
}

function earlyBirdUnlocked(mod: Awaited<ReturnType<typeof loadEasterEggs>>): boolean {
  return mod.getAchievements().find((a) => a.id === 'early-bird')?.unlocked ?? false;
}

function finishCall(startAt: Date, minutes = 10): void {
  vi.setSystemTime(startAt);
  window.dispatchEvent(new CustomEvent('ferni:conversation-start'));
  vi.setSystemTime(new Date(startAt.getTime() + minutes * 60_000));
  window.dispatchEvent(new CustomEvent('ferni:conversation-end', { detail: { durationMinutes: minutes } }));
}

describe('Early Bird achievement', () => {
  let mod: Awaited<ReturnType<typeof loadEasterEggs>>;

  beforeEach(async () => {
    localStorage.clear();
    play.mockClear();
    // The avatar the stretch animates; without it the old load-time path bailed out early.
    document.body.innerHTML = '<div class="avatar-container"><div id="coachAvatar"></div></div>';
    Element.prototype.animate = vi.fn() as unknown as Element['animate'];
    vi.useFakeTimers();
    // Pin a neutral midday clock: init's sleepy-mode check unlocks Night Owl (and
    // plays 'success') between midnight and 5am local time, so tests that init
    // before setting a time failed whenever CI ran overnight in UTC.
    vi.setSystemTime(new Date(2026, 9, 11, 12, 0));
    mod = await loadEasterEggs();
  });

  afterEach(() => {
    mod.dispose();
    vi.useRealTimers();
  });

  it('does not fire on page load, even on the first morning visit of the day', () => {
    vi.setSystemTime(new Date(2026, 9, 11, 8, 0));
    mod.initEasterEggsUI();
    vi.advanceTimersByTime(5_000);

    expect(earlyBirdUnlocked(mod)).toBe(false);
    expect(play).not.toHaveBeenCalledWith('success');
  });

  it('fires after a call that started in the morning finishes', () => {
    mod.initEasterEggsUI();
    finishCall(new Date(2026, 9, 11, 7, 30));

    expect(earlyBirdUnlocked(mod)).toBe(true);
  });

  it('does not fire for an afternoon call', () => {
    mod.initEasterEggsUI();
    finishCall(new Date(2026, 9, 11, 15, 0));

    expect(earlyBirdUnlocked(mod)).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });

  it('does not fire when a call ends without having started', () => {
    mod.initEasterEggsUI();
    vi.setSystemTime(new Date(2026, 9, 11, 8, 0));
    window.dispatchEvent(new CustomEvent('ferni:conversation-end'));

    expect(earlyBirdUnlocked(mod)).toBe(false);
  });

  it('celebrates at most once per day', () => {
    mod.initEasterEggsUI();
    finishCall(new Date(2026, 9, 11, 7, 0));
    const afterFirst = play.mock.calls.length;
    finishCall(new Date(2026, 9, 11, 9, 0));

    expect(play.mock.calls.length).toBe(afterFirst);
  });
});

describe('shouldCelebrateMorningCall', () => {
  it('uses the local morning window and the stored date', async () => {
    const { shouldCelebrateMorningCall } = await import('../../src/ui/morning-call.js');
    const now = new Date(2026, 9, 11, 9, 0);

    expect(shouldCelebrateMorningCall(new Date(2026, 9, 11, 5, 0), null, now)).toBe(true);
    expect(shouldCelebrateMorningCall(new Date(2026, 9, 11, 4, 59), null, now)).toBe(false);
    expect(shouldCelebrateMorningCall(new Date(2026, 9, 11, 12, 0), null, now)).toBe(false);
    expect(shouldCelebrateMorningCall(new Date(2026, 9, 11, 8, 0), now.toDateString(), now)).toBe(false);
    expect(shouldCelebrateMorningCall(null, null, now)).toBe(false);
  });
});
