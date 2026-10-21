/**
 * Achievement toasts (overlay plan PR d): celebrations render in the toast
 * region when the overlay-host flag is on, and are unchanged when it is off.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TOAST_REGION_STORAGE_KEY } from '../../../src/ui/overlay/toast-flag';

vi.mock('@/services/haptics.service.js', () => ({ getHapticsService: () => ({ play: vi.fn() }) }));
vi.mock('@/services/outreach.service.js', () => ({
  outreachService: { sendMilestoneCelebration: vi.fn(() => Promise.resolve()) },
}));
vi.mock('@/services/push-notifications.service.js', () => ({
  showNotification: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/services/ferni-audio.service.js', () => ({
  getFerniAudioEngine: () => ({ play: vi.fn() }),
}));
vi.mock('@/services/glow-controller.service.js', () => ({
  getGlowController: () => ({ pulse: vi.fn() }),
}));
vi.mock('@/ui/sound.ui.js', () => ({ soundUI: { play: vi.fn() } }));
vi.mock('@/ui/ferni-moments.ui.js', () => ({ ferniMoments: { play: vi.fn() } }));
vi.mock('@/ui/celebrations.ui.js', () => ({ celebrationsUI: { celebrate: vi.fn() } }));
vi.mock('@/utils/tracked-timeout.js', () => ({
  createTimeoutTracker: () => ({
    trackedTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearAll: vi.fn(),
  }),
}));

import { getCelebrationUI } from '@/ui/celebration.ui.js';
import { resetMilestones, triggerMilestone } from '@/ui/ferni-milestones.ui.js';
import { getMomentsManager, resetMomentsManager } from '@/ui/moments/manager.js';
import { OVERLAY_HOST_STORAGE_KEY } from '@/ui/overlay/overlay-flag.js';
import { resetToastRegion, showToast, toastDuration } from '@/ui/overlay/toast-region.js';

function reducedMotion(on: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: on && query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const achievements = (): { title: string | null; message: string | null }[] =>
  [...document.querySelectorAll('.ferni-toast--achievement')].map((el) => ({
    title: el.querySelector('.ferni-toast__title')?.textContent ?? null,
    message: el.querySelector('.ferni-toast__message')?.textContent ?? null,
  }));

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  localStorage.clear();
  reducedMotion(false);
  resetToastRegion();
  resetMomentsManager();
});

afterEach(() => {
  localStorage.clear();
  resetMomentsManager();
  resetToastRegion();
  vi.useRealTimers();
});

describe('achievement toast', () => {
  it('renders a headline, a message and the star icon', () => {
    showToast({ kind: 'achievement', title: 'Early Bird', message: 'First chat of the day' });
    expect(achievements()).toEqual([{ title: 'Early Bird', message: 'First chat of the day' }]);
    expect(
      document.querySelector('.ferni-toast--achievement .ferni-toast__icon path')
    ).not.toBeNull();
  });

  it('counts the headline in the reading time', () => {
    const message = 'x'.repeat(40);
    expect(toastDuration({ kind: 'achievement', title: 'y'.repeat(30), message })).toBe(
      1500 + 60 * 70
    );
    expect(toastDuration({ message })).toBe(3000 + 900);
  });
});

describe('moments.celebrate', () => {
  it('keeps the centred celebration card with the toast kill switch set', async () => {
    localStorage.setItem(TOAST_REGION_STORAGE_KEY, 'off'); // the kill switch: old per-surface toasts
    void getMomentsManager().celebrate('badge', {
      title: 'Early Bird',
      subtitle: 'First chat of the day',
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(document.querySelector('.moment-celebration')).not.toBeNull();
    expect(achievements()).toEqual([]);
  });

  it('shows an achievement toast instead by default', async () => {
    await getMomentsManager().celebrate('badge', {
      title: 'Early Bird',
      subtitle: 'First chat of the day',
    });
    expect(document.querySelector('.moment-celebration')).toBeNull();
    expect(achievements()).toEqual([{ title: 'Early Bird', message: 'First chat of the day' }]);
  });
});

describe('celebration card (celebration.ui)', () => {
  it('shows an achievement toast and no card when the flag is on', async () => {
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    await getCelebrationUI().celebrate({
      type: 'big_win',
      title: 'Nice work',
      subtitle: 'Seven days in a row',
    });
    expect(document.querySelector('.ferni-celebration-card')).toBeNull();
    expect(achievements()).toEqual([{ title: 'Nice work', message: 'Seven days in a row' }]);
  });
});

describe('Ferni milestones', () => {
  beforeEach(() => resetMilestones());

  it('shows nothing under Reduce Motion with the toast kill switch set', async () => {
    localStorage.setItem(TOAST_REGION_STORAGE_KEY, 'off'); // the kill switch: old per-surface toasts
    reducedMotion(true);
    triggerMilestone('first-hello');
    await vi.advanceTimersByTimeAsync(100);
    expect(document.querySelector('.ferni-milestone')).toBeNull();
    expect(achievements()).toEqual([]);
  });

  it('still shows and announces the milestone under Reduce Motion when the flag is on', async () => {
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    reducedMotion(true);
    triggerMilestone('first-hello');
    await vi.advanceTimersByTimeAsync(100);
    expect(achievements()).toHaveLength(1);
    expect(document.querySelector('.ferni-milestone')).toBeNull();
    expect(document.querySelector('.ferni-toast-live[role="status"]')?.textContent).not.toBe('');
  });
});

describe('easter-egg achievements', () => {
  it('render in the toast region when the flag is on, never as the corner card', async () => {
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    document.body.innerHTML = '<div class="avatar-container"><div id="coachAvatar"></div></div>';
    Element.prototype.animate = vi.fn() as unknown as Element['animate'];
    const eggs = await import('@/ui/easter-eggs.ui.js');
    eggs.initEasterEggsUI();
    const avatar = document.getElementById('coachAvatar');
    for (let i = 0; i < 3; i++) avatar?.click(); // triple-click unlocks an achievement

    expect(document.querySelector('.achievement-notification')).toBeNull();
    // Clicking the avatar also pokes its eye, a second achievement; both are toasts.
    expect(achievements().map((a) => a.title)).toContain('Clicker');
    eggs.easterEggsUI.dispose();
  });
});
