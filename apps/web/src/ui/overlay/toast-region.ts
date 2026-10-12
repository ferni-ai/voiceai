/**
 * Toast region: the one place transient feedback renders (behind the
 * overlay-host flag, see overlay-flag.ts).
 *
 * - One region in the top layer (`popover="manual"`), so a toast stays above
 *   sheets and dialogs instead of under them.
 * - Phones: top, full width minus 16 px gutters, below the safe area. Desktop:
 *   top-right under the settings trigger. The bottom band stays with the call
 *   controls and the menu trigger.
 * - 1 visible on phones, 2 on desktop; the rest wait in a FIFO queue (errors
 *   go to the front, identical messages are merged).
 * - Display time follows text length (toastDuration); hover or focus pauses
 *   it; Reduce Motion changes the animation, never the time on screen.
 * - Neutral surface; the tone shows only in the icon and the leading stripe.
 *
 * @module ui/overlay/toast-region
 */

import { DURATION } from '../../config/animation-constants.js';
import { t } from '../../i18n/index.js';
import { injectToastRegionStyles } from './toast-region.styles.js';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

/** Why a toast left: its time ran out, the reader closed it, its action ran, or code dismissed it. */
export type ToastDismissReason = 'timeout' | 'user' | 'action' | 'api';

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  /** Callers may extend the display time; they cannot shorten it. */
  duration?: number;
  action?: { label: string; callback: () => void };
  /** A bold headline above the message (achievements, notification cards). */
  title?: string;
  /** Achievement toasts use a star icon and the success stripe. */
  kind?: 'achievement';
  /** Shows a close button; `persistent` implies it. */
  dismissible?: boolean;
  /** Stays until the reader or the caller dismisses it. */
  persistent?: boolean;
  /** Called once when the toast leaves (or is dropped from the queue). */
  onDismiss?: (reason: ToastDismissReason) => void;
}

interface Entry {
  id: string;
  options: ToastOptions;
  element?: HTMLLIElement;
  timer?: ReturnType<typeof setTimeout>;
  remaining: number;
  startedAt: number;
}

const MIN_MS = 3000;
const MAX_MS = 8000;
const NEEDS_ATTENTION_MS = 6000;
const PHONE_QUERY = '(max-width: 768px)';

/** clamp(3 s, 1.5 s + 60 ms per character, 8 s); errors and actions get at least 6 s. */
export function toastDuration(options: ToastOptions): number {
  const byLength = Math.min(
    MAX_MS,
    Math.max(MIN_MS, 1500 + 60 * (options.message.length + (options.title?.length ?? 0)))
  );
  const floor = options.tone === 'error' || options.action ? NEEDS_ATTENTION_MS : 0;
  return Math.max(byLength, floor, options.duration ?? 0);
}

export function maxVisibleToasts(): number {
  return window.matchMedia?.(PHONE_QUERY).matches ? 1 : 2;
}

const STAR_PATH =
  '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>';

const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

const ICON_PATHS: Record<ToastTone, string> = {
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  success: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  warning: '<path d="M12 3 2 21h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
  error: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
};

class ToastRegion {
  private root: HTMLElement | null = null;
  private list: HTMLOListElement | null = null;
  private polite: HTMLElement | null = null;
  private assertive: HTMLElement | null = null;
  private visible: Entry[] = [];
  private queue: Entry[] = [];
  private paused = false;
  private counter = 0;

  show(options: ToastOptions): string {
    const duplicate = [...this.visible, ...this.queue].find(
      (e) =>
        e.options.message === options.message &&
        e.options.tone === options.tone &&
        e.options.title === options.title
    );
    if (duplicate) return duplicate.id;

    const entry: Entry = {
      id: `toast-${++this.counter}`,
      options,
      remaining: toastDuration(options),
      startedAt: 0,
    };
    if (options.tone === 'error') this.queue.unshift(entry);
    else this.queue.push(entry);
    this.drain();
    return entry.id;
  }

  dismiss(id: string, reason: ToastDismissReason = 'api'): void {
    const queued = this.queue.findIndex((e) => e.id === id);
    if (queued >= 0) {
      const [dropped] = this.queue.splice(queued, 1);
      dropped?.options.onDismiss?.(reason);
      return;
    }
    const entry = this.visible.find((e) => e.id === id);
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.options.onDismiss?.(reason);
    this.visible = this.visible.filter((e) => e !== entry);
    const el = entry.element;
    el?.classList.add('ferni-toast--leaving');
    setTimeout(() => {
      el?.remove();
      if (this.visible.length === 0 && this.queue.length === 0) this.close();
    }, DURATION.NORMAL);
    this.drain();
  }

  dismissAll(): void {
    [...this.queue].forEach((e) => this.dismiss(e.id));
    [...this.visible].forEach((e) => this.dismiss(e.id));
  }

  /** Test hook: ids currently on screen, oldest first. */
  visibleIds(): string[] {
    return this.visible.map((e) => e.id);
  }

  reset(): void {
    this.visible.forEach((e) => clearTimeout(e.timer));
    this.visible = [];
    this.queue = [];
    this.root?.remove();
    this.polite?.remove();
    this.assertive?.remove();
    this.root = this.list = this.polite = this.assertive = null;
  }

  private drain(): void {
    while (this.queue.length > 0 && this.visible.length < maxVisibleToasts()) {
      const entry = this.queue.shift();
      if (entry) this.mount(entry);
    }
  }

  private mount(entry: Entry): void {
    this.ensureRoot();
    const requested = entry.options.tone ?? 'info';
    const tone: ToastTone = requested in ICON_PATHS ? requested : 'info';
    const el = document.createElement('li');
    const { title, kind, message } = entry.options;
    const achievement = kind === 'achievement';
    // A headline with an action lays out as a card: the action gets its own row.
    const card = Boolean(title && entry.options.action);
    el.className = `ferni-toast ferni-toast--${achievement ? 'achievement' : tone}${card ? ' ferni-toast--card' : ''} ferni-toast--entering`;
    el.dataset.toastId = entry.id;
    el.innerHTML = `<svg class="ferni-toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${achievement ? STAR_PATH : ICON_PATHS[tone]}</svg>`;
    const body = document.createElement('span');
    body.className = 'ferni-toast__body';
    if (title) {
      const heading = document.createElement('strong');
      heading.className = 'ferni-toast__title';
      heading.textContent = title;
      body.appendChild(heading);
    }
    const text = document.createElement('span');
    text.className = 'ferni-toast__message';
    text.textContent = message;
    body.appendChild(text);
    el.appendChild(body);

    const action = entry.options.action;
    if (action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ferni-toast__action';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        action.callback();
        this.dismiss(entry.id, 'action');
      });
      el.appendChild(button);
    }

    if (entry.options.dismissible || entry.options.persistent) {
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'ferni-toast__close';
      close.setAttribute('aria-label', t('accessibility.dismissNotification'));
      close.innerHTML = CLOSE_ICON;
      close.addEventListener('click', () => this.dismiss(entry.id, 'user'));
      el.appendChild(close);
    }

    entry.element = el;
    this.list?.appendChild(el);
    this.visible.push(entry);
    this.bringToFront();
    requestAnimationFrame(() => el.classList.remove('ferni-toast--entering'));
    this.announce(title ? `${title}. ${message}` : message, tone === 'error');
    if (!this.paused) this.startTimer(entry);
  }

  private startTimer(entry: Entry): void {
    if (entry.options.persistent) return;
    entry.startedAt = Date.now();
    entry.timer = setTimeout(() => this.dismiss(entry.id, 'timeout'), entry.remaining);
  }

  private pause(): void {
    if (this.paused) return;
    this.paused = true;
    for (const entry of this.visible) {
      clearTimeout(entry.timer);
      entry.remaining = Math.max(0, entry.remaining - (Date.now() - entry.startedAt));
    }
  }

  private resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.visible.forEach((entry) => this.startTimer(entry));
  }

  private announce(message: string, urgent: boolean): void {
    const target = urgent ? this.assertive : this.polite;
    if (!target) return;
    target.textContent = '';
    // A fresh text node after clearing makes repeat messages announce again.
    requestAnimationFrame(() => (target.textContent = message));
  }

  private ensureRoot(): void {
    if (this.root) return;
    injectToastRegionStyles();
    const root = document.createElement('section');
    root.className = 'ferni-toast-region';
    root.setAttribute('aria-label', t('notifications.regionLabel'));
    root.setAttribute('popover', 'manual');
    const list = document.createElement('ol');
    list.className = 'ferni-toast-region__list';
    root.appendChild(list);
    root.addEventListener('pointerenter', () => this.pause());
    root.addEventListener('pointerleave', () => this.resume());
    root.addEventListener('focusin', () => this.pause());
    root.addEventListener('focusout', () => this.resume());

    // Live regions stay outside the popover so they exist before any text lands.
    const polite = document.createElement('div');
    polite.className = 'ferni-toast-live';
    polite.setAttribute('role', 'status');
    const assertive = document.createElement('div');
    assertive.className = 'ferni-toast-live';
    assertive.setAttribute('role', 'alert');

    document.body.append(root, polite, assertive);
    Object.assign(this, { root, list, polite, assertive });
  }

  /** Re-enter the top layer so a dialog opened after the region stays below it. */
  private bringToFront(): void {
    const root = this.root;
    if (!root || typeof root.showPopover !== 'function') return;
    if (root.matches(':popover-open')) root.hidePopover();
    root.showPopover();
  }

  private close(): void {
    const root = this.root;
    if (root && typeof root.hidePopover === 'function' && root.matches(':popover-open')) {
      root.hidePopover();
    }
  }
}

let region: ToastRegion | null = null;

function getRegion(): ToastRegion {
  region ??= new ToastRegion();
  return region;
}

export const showToast = (options: ToastOptions): string => getRegion().show(options);
export const dismissToast = (id: string): void => getRegion().dismiss(id);
export const dismissAllToasts = (): void => getRegion().dismissAll();
export const visibleToastIds = (): string[] => getRegion().visibleIds();

/** Tests only: drop the region and its DOM. */
export function resetToastRegion(): void {
  region?.reset();
  region = null;
}
