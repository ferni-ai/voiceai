/**
 * Waiting Screen: what someone on the waitlist sees instead of an error.
 * Ferni settled in, their place in line, the next wave and their invite link;
 * "You're in" with the founding-member badge once their spot opens.
 *
 * Off by default: it reads GET /api/waitlist/me, which the server does not
 * serve yet, so turning it on everywhere would 404 on every sign-in. On with
 * VITE_WAITLIST_SCREEN=true or localStorage `ferni:flag:waitlist-screen` =
 * 'true'; off, the plain notice stays. Colors are design tokens only.
 */

import { getLocale, t } from '../i18n/index.js';
import { tp } from '../i18n/plural.js';
import {
  fetchWaitlistStatus,
  isDetailsUnknown,
  type WaitlistStatus,
} from '../services/waitlist-status.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('WaitingScreen');

export const WAITLIST_SCREEN_STORAGE_KEY = 'ferni:flag:waitlist-screen';
const WELCOMED_KEY = 'ferni:waitlist:welcomed';
const OVERLAY_ID = 'waiting-screen-overlay';

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function isWaitlistScreenEnabled(): boolean {
  const override = stored(WAITLIST_SCREEN_STORAGE_KEY);
  if (override === 'true' || override === 'false') return override === 'true';
  return import.meta.env.VITE_WAITLIST_SCREEN === 'true';
}

const STYLES = `
.waiting-screen { display: flex; flex-direction: column; align-items: center; gap: var(--space-3);
  text-align: center; color: var(--color-text-primary); width: 100%; max-width: 380px; margin: 0 auto; }
.waiting-screen__avatar { width: 96px; height: 96px; border-radius: var(--radius-full);
  box-shadow: 0 0 0 6px var(--color-accent-subtle); transform: translateY(2px) rotate(-5deg);
  animation: waiting-screen-breathe 6s ease-in-out infinite; }
.waiting-screen--in .waiting-screen__avatar { transform: none; animation: waiting-screen-hop 1.2s ease-out 1; }
.waiting-screen__title { font-family: var(--font-display, inherit); font-size: 1.75rem; font-weight: 600; margin: 0; }
.waiting-screen__position { font-size: 1.125rem; margin: 0; }
.waiting-screen__muted { color: var(--color-text-secondary); margin: 0; line-height: 1.5; }
.waiting-screen__invite { box-sizing: border-box; width: 100%; display: flex; flex-direction: column; gap: var(--space-2);
  padding: var(--space-4); border-radius: var(--radius-lg); background: var(--color-background-elevated);
  border: 1px solid var(--color-border-subtle); }
.waiting-screen__label { font-size: 0.875rem; color: var(--color-text-muted); margin: 0; }
.waiting-screen__link { font-family: var(--font-mono, monospace); font-size: 0.9375rem; overflow-wrap: anywhere;
  color: var(--color-text-primary); }
.waiting-screen__row { display: flex; gap: var(--space-2); justify-content: center; flex-wrap: wrap; }
.waiting-screen__btn { min-height: 44px; padding: var(--space-2) var(--space-4); border-radius: var(--radius-lg);
  font: inherit; font-weight: 500; cursor: pointer; border: 1px solid var(--color-border-subtle);
  background: transparent; color: var(--color-text-primary); }
.waiting-screen__btn--primary { background: var(--color-accent-primary); color: var(--color-text-on-accent);
  border-color: transparent; }
.waiting-screen__btn:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
.waiting-screen__badge { display: inline-block; padding: var(--space-1) var(--space-3); border-radius: var(--radius-full);
  background: var(--color-accent-subtle); color: var(--color-text-primary); font-weight: 600; font-size: 0.875rem; }
#${OVERLAY_ID} { position: fixed; inset: 0; z-index: var(--z-system); background: var(--color-background-primary);
  display: flex; align-items: center; justify-content: center; padding: var(--space-6) var(--space-4); overflow-y: auto; }
@keyframes waiting-screen-breathe { 50% { transform: translateY(0) rotate(-5deg) scale(1.03); } }
@keyframes waiting-screen-hop { 40% { transform: translateY(-6px) scale(1.05); } }
@media (prefers-reduced-motion: reduce) { .waiting-screen__avatar { animation: none !important; } }
`;

function injectStyles(): void {
  if (document.getElementById('waiting-screen-styles')) return;
  const style = document.createElement('style');
  style.id = 'waiting-screen-styles';
  style.textContent = STYLES;
  document.head.appendChild(style);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
  const b = el(
    'button',
    primary ? 'waiting-screen__btn waiting-screen__btn--primary' : 'waiting-screen__btn',
    label
  );
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function avatar(): HTMLImageElement {
  const img = el('img', 'waiting-screen__avatar');
  img.src = '/ferni-avatar.svg';
  img.alt = 'Ferni';
  img.width = 96;
  img.height = 96;
  img.dataset['expression'] = 'settling';
  return img;
}

const DATE_FORMAT = { weekday: 'long', month: 'long', day: 'numeric' } as const;

function waveDate(iso: string | null): string | null {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(getLocale(), DATE_FORMAT).format(date);
}

function invite(url: string, daysMovedUp: number): HTMLElement {
  const box = el('div', 'waiting-screen__invite');
  box.append(
    el('p', 'waiting-screen__label', t('waitlistScreen.inviteLabel')),
    el('code', 'waiting-screen__link', url)
  );
  const row = el('div', 'waiting-screen__row');
  const copy = button(t('waitlistScreen.copy'), true, () => {
    void navigator.clipboard
      ?.writeText(url)
      .then(() => (copy.textContent = t('waitlistScreen.copied')))
      .catch((err: unknown) => log.warn('Copy failed', err));
  });
  copy.setAttribute('aria-live', 'polite');
  row.appendChild(copy);
  const share = (): void => void navigator.share({ url }).catch(() => undefined);
  if (typeof navigator.share === 'function')
    row.appendChild(button(t('waitlistScreen.share'), false, share));
  box.append(row, el('p', 'waiting-screen__muted', t('waitlistScreen.inviteHelp')));
  if (daysMovedUp > 0) {
    box.appendChild(
      el('p', 'waiting-screen__muted', tp('waitlistScreen.friendsMovedYouUp', daysMovedUp))
    );
  }
  return box;
}

export interface WaitingScreenOptions {
  /** "Come in" on the You're-in state */
  onEnter?: () => void;
  /** Extra controls under the screen (the gate's "try a different account") */
  extra?: HTMLElement[];
  /** Id for the heading, so a dialog can name itself after it */
  titleId?: string;
}

/** The waiting or You're-in screen; null when the status has nothing to show (expired, not joined). */
export function buildWaitingScreen(
  status: WaitlistStatus,
  options: WaitingScreenOptions = {}
): HTMLElement | null {
  const admitted = status.status === 'admitted';
  if (!admitted && status.status !== 'waiting') return null;
  injectStyles();

  const root = el('section', `waiting-screen waiting-screen--${admitted ? 'in' : 'waiting'}`);
  const title = el(
    'h1',
    'waiting-screen__title',
    t(admitted ? 'waitlistScreen.inTitle' : 'waitlistScreen.title')
  );
  if (options.titleId) title.id = options.titleId;
  root.append(avatar(), title);

  if (admitted) {
    if (status.foundingMember) {
      const badge =
        status.foundingWave !== null
          ? t('waitlistScreen.badge', { wave: status.foundingWave })
          : t('waitlistScreen.badgeNoWave');
      root.appendChild(el('span', 'waiting-screen__badge', badge));
    }
    root.appendChild(el('p', 'waiting-screen__muted', t('waitlistScreen.inMessage')));
    if (options.onEnter) root.appendChild(button(t('waitlistScreen.enter'), true, options.onEnter));
  } else {
    // Position unknown (the refusal had no details): the title alone, soft
    const { position } = status;
    const waves = status.wavesAway ?? 0;
    if (position !== null) {
      const line =
        waves > 1
          ? t('waitlistScreen.position', { position, waves })
          : t('waitlistScreen.positionNext', { position });
      root.appendChild(el('p', 'waiting-screen__position', line));
    }
    const date = waveDate(status.nextWaveAt);
    if (date)
      root.appendChild(el('p', 'waiting-screen__muted', t('waitlistScreen.nextWave', { date })));
    if (status.referralUrl)
      root.appendChild(invite(status.referralUrl, status.referrals.creditedDays));
    root.appendChild(el('p', 'waiting-screen__muted', t('waitlistScreen.emailPromise')));
  }

  if (options.extra?.length) {
    const row = el('div', 'waiting-screen__row');
    row.append(...options.extra);
    root.appendChild(row);
  }
  return root;
}

/**
 * The sign-in gate's waitlisted answer (a remembered sign-in gets it too):
 * replace the gate's content with the waiting screen. False when the status
 * can't be read, so the gate keeps its plain notice.
 */
export async function showWaitingInGate(
  content: Element,
  recheck: () => void,
  signOut: () => void,
  titleId: string,
  read = fetchWaitlistStatus
): Promise<boolean> {
  if (!isWaitlistScreenEnabled()) return false;
  const status = await read();
  // "Try a different account" stays; "Come in" (admitted since the check) checks again
  const other = button(t('auth.tryDifferentAccount'), false, signOut);
  const screen =
    status && buildWaitingScreen(status, { titleId, onEnter: recheck, extra: [other] });
  if (!screen) return false;
  content.replaceChildren(screen);
  return true;
}

export function hideWaitingOverlay(): void {
  document.getElementById(OVERLAY_ID)?.remove();
}

/**
 * Full-screen waiting (or You're-in) screen over the app. Returns false when
 * there's nothing to show. With the position unknown it shows the soft screen
 * at once, then asks GET /api/waitlist/me and fills in the details.
 */
export function showWaitingOverlay(status: WaitlistStatus, read = fetchWaitlistStatus): boolean {
  hideWaitingOverlay();
  const titleId = 'waiting-screen-title';
  const close = button(
    t(status.status === 'admitted' ? 'waitlistScreen.enter' : 'waitlistScreen.notNow'),
    false,
    hideWaitingOverlay
  );
  const screen = buildWaitingScreen(status, { titleId, extra: [close] });
  if (!screen) return false;
  const overlay = el('div', '');
  overlay.id = OVERLAY_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', titleId);
  overlay.appendChild(screen);
  document.body.appendChild(overlay);
  screen.querySelector<HTMLButtonElement>('button')?.focus();
  if (isDetailsUnknown(status)) {
    void read().then((details) => {
      // Only if it's still open and the answer says more
      if (details && !isDetailsUnknown(details) && overlay.isConnected)
        showWaitingOverlay(details, read);
    });
  }
  return true;
}

/**
 * First sign-in after a spot opened: a one-time "You're in" with the
 * founding-member badge. Quiet when the status can't be read.
 */
export async function celebrateAdmissionOnce(read = fetchWaitlistStatus): Promise<boolean> {
  if (!isWaitlistScreenEnabled() || stored(WELCOMED_KEY)) return false;
  const status = await read();
  if (status?.status !== 'admitted') return false;
  try {
    localStorage.setItem(WELCOMED_KEY, String(status.foundingWave ?? 'yes'));
  } catch {
    // No storage: they may see it again next time, which is harmless
  }
  return showWaitingOverlay(status);
}
