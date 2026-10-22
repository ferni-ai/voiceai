/**
 * Notification cards in the toast region (overlay plan PR e): NotificationsUI,
 * proactive outreach and trust signals render as toasts with the overlay-host
 * flag on, and keep their own cards with it off.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TOAST_REGION_STORAGE_KEY } from '../../../src/ui/overlay/toast-flag';

vi.mock('@/services/modal-coordinator.service.js', () => ({
  modalCoordinator: { hasMinimumConversations: () => true, isConversationActive: () => false },
}));
vi.mock('@/services/relationship-stage.service.js', () => ({
  relationshipStageService: { getStage: () => 'established' },
}));
vi.mock('@/utils/tracked-timeout.js', () => ({
  createTimeoutTracker: () => ({
    trackedTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearAll: vi.fn(),
  }),
}));

import NotificationsUI from '@/ui/notifications.ui.js';
import { initProactiveOutreachUI, showOutreach } from '@/ui/proactive-outreach.ui.js';
import { OVERLAY_HOST_STORAGE_KEY } from '@/ui/overlay/overlay-flag.js';
import {
  dismissAllToasts,
  resetToastRegion,
  showToast,
  visibleToastIds,
} from '@/ui/overlay/toast-region.js';
import { showTrustSignal } from '@/ui/trust-signals.ui.js';

function phone(on: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: on && query === '(max-width: 768px)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const toasts = () =>
  [...document.querySelectorAll('.ferni-toast')].map((el) => ({
    title: el.querySelector('.ferni-toast__title')?.textContent ?? null,
    message: el.querySelector('.ferni-toast__message')?.textContent ?? null,
  }));

const click = (selector: string) =>
  (document.querySelector(selector) as HTMLElement | null)?.click();

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  localStorage.clear();
  phone(false);
  resetToastRegion();
});

afterEach(() => {
  localStorage.clear();
  resetToastRegion();
  vi.useRealTimers();
});

describe('toast region: cards', () => {
  it('keeps a persistent toast until the reader closes it, and says why it left', () => {
    const onDismiss = vi.fn();
    showToast({
      title: 'Your practice awaits',
      message: 'Evening reflection',
      persistent: true,
      onDismiss,
    });
    vi.advanceTimersByTime(60_000);
    expect(visibleToastIds()).toHaveLength(1);
    click('.ferni-toast__close');
    expect(visibleToastIds()).toEqual([]);
    expect(onDismiss).toHaveBeenCalledWith('user');
  });

  it('reports timeout, action and dropped-from-queue dismissals', () => {
    const timedOut = vi.fn();
    showToast({ message: 'Saved', onDismiss: timedOut });
    vi.advanceTimersByTime(3000);
    expect(timedOut).toHaveBeenCalledWith('timeout');

    const acted = vi.fn();
    showToast({ message: 'Note', action: { label: 'View', callback: vi.fn() }, onDismiss: acted });
    click('.ferni-toast__action');
    expect(acted).toHaveBeenCalledWith('action');

    phone(true);
    showToast({ message: 'Visible', persistent: true });
    const dropped = vi.fn();
    showToast({ message: 'Queued', onDismiss: dropped });
    expect(dropped).not.toHaveBeenCalled();
    dismissAllToasts();
    expect(dropped).toHaveBeenCalledWith('api');
  });
});

describe('NotificationsUI', () => {
  it('keeps its own card with the toast kill switch set', () => {
    localStorage.setItem(TOAST_REGION_STORAGE_KEY, 'off'); // the kill switch: old per-surface toasts
    new NotificationsUI().show({
      id: 'n1',
      type: 'ritual_reminder',
      title: 'Your practice awaits',
      message: 'Evening reflection',
      priority: 'medium',
      timestamp: Date.now(),
    });
    expect(document.querySelector('.notification')).not.toBeNull();
    expect(toasts()).toEqual([]);
  });

  it('becomes a toast with its action, close button and callbacks when the flag is on', () => {
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    const start = vi.fn();
    const ui = new NotificationsUI();
    ui.setCallbacks({ onAction, onDismiss });
    ui.show({
      id: 'n1',
      type: 'ritual_reminder',
      title: 'Your practice awaits',
      message: 'Evening reflection',
      priority: 'medium',
      timestamp: Date.now(),
      action: { label: 'Begin', callback: start },
    });

    expect(document.querySelector('.notification')).toBeNull();
    expect(toasts()).toEqual([{ title: 'Your practice awaits', message: 'Evening reflection' }]);
    expect(ui.getCount()).toBe(1);
    vi.advanceTimersByTime(60_000); // no dismissAfter: it waits for the reader
    click('.ferni-toast__action');
    expect(start).toHaveBeenCalled();
    expect(onAction).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
    expect(ui.getCount()).toBe(0);
  });

  it('dismiss(id) removes its toast', () => {
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    const ui = new NotificationsUI();
    ui.show({
      id: 'n2',
      type: 'welcome',
      title: 'Hi',
      message: 'Welcome back',
      priority: 'low',
      timestamp: 0,
      dismissAfter: 20_000,
    });
    ui.dismiss('n2');
    expect(visibleToastIds()).toEqual([]);
  });
});

describe('proactive outreach', () => {
  beforeEach(() => initProactiveOutreachUI());

  it('becomes one toast whose action asks to talk', () => {
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    const respond = vi.fn();
    document.addEventListener('ferni:outreach-respond', respond);
    showOutreach({
      id: 'o1',
      type: 'thinking_of_you',
      message: 'Good luck tomorrow.',
      personaName: 'Ferni',
    });
    showOutreach({
      id: 'o2',
      type: 'random_warmth',
      message: 'Hope today is kind to you.',
      personaName: 'Maya',
    });
    vi.advanceTimersByTime(300);

    expect(document.querySelector('.proactive-outreach')).toBeNull();
    expect(toasts().map((t) => t.message)).toEqual(['Hope today is kind to you.']);
    click('.ferni-toast__action');
    expect(respond).toHaveBeenCalledTimes(1);
    document.removeEventListener('ferni:outreach-respond', respond);
  });
});

describe('trust signals', () => {
  it('become toasts on desktop and are remembered once the reader closes them', () => {
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    const signal = {
      type: 'growth' as const,
      title: 'You kept going',
      message: 'Three mornings in a row.',
    };
    showTrustSignal(signal);
    expect(toasts()).toEqual([{ title: 'You kept going', message: 'Three mornings in a row.' }]);

    click('.ferni-toast__close');
    vi.advanceTimersByTime(300);
    showTrustSignal(signal);
    expect(toasts()).toEqual([]);
  });

  it('stay off phones, as the card did', () => {
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    phone(true);
    showTrustSignal({ type: 'small_win', title: 'Nice', message: 'You showed up.' });
    expect(toasts()).toEqual([]);
  });
});
