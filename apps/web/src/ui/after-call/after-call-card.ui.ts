/**
 * After-call card: what Ferni will remember, and one gentle next step.
 *
 * The default post-call moment (the cost card only returns when the after-call
 * flag is turned off). When nothing new came out of the call it is just a
 * short warm close. Support Ferni is a quiet text link at the bottom, never a
 * separate ask.
 *
 * The card is a fixed sheet just below the call controls (above them when it
 * doesn't fit below and there is more room above), so it never covers Connect
 * and never grows the page, which can't scroll. It is capped to the viewport
 * and scrolls inside itself. Non-modal, focusable, closes on Escape or the
 * close button, and keeps still for prefers-reduced-motion.
 *
 * @module ui/after-call/after-call-card
 */

import { DURATION, EASING } from '../../config/animation-constants.js';
import { t } from '../../i18n/index.js';
import { createLogger } from '../../utils/logger.js';
import type { AfterCallData } from './after-call-data.js';

const log = createLogger('AfterCallCard');

const CARD_CLASS = 'ferni-after-call-card';
const STYLE_ID = 'ferni-after-call-styles';
/** Long enough to read; paused while focus is inside the card. */
const AUTO_DISMISS_MS = 60_000;

export interface AfterCallCardOptions {
  /** Name of the persona the user just talked to. */
  personaName: string;
  /** Opens Support Ferni. Shown as a quiet text link when given. */
  onSupport?: () => void;
}

let card: HTMLElement | null = null;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;
let returnFocusTo: HTMLElement | null = null;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .${CARD_CLASS} {
      position: fixed;
      left: 50%;
      bottom: calc(env(safe-area-inset-bottom, 0px) + var(--space-md));
      z-index: var(--z-sticky);
      box-sizing: border-box;
      width: min(340px, calc(100% - 2 * var(--space-md)));
      max-height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 2 * var(--space-md));
      overflow-y: auto;
      overscroll-behavior: contain;
      transform: translate(-50%, 12px);
      opacity: 0;
      background: var(--color-bg-elevated);
      color: var(--color-text-primary);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-lg);
      padding: var(--space-md) var(--space-lg);
      transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD},
        transform ${DURATION.SLOW}ms ${EASING.STANDARD};
    }
    .${CARD_CLASS}.below-controls {
      top: calc(var(--after-call-anchor) + var(--space-sm));
      bottom: auto;
      max-height: calc(100dvh - var(--after-call-anchor) - var(--space-sm) - env(safe-area-inset-bottom, 0px) - var(--space-md));
    }
    .${CARD_CLASS}.above-controls {
      bottom: calc(var(--after-call-anchor) + var(--space-sm));
      max-height: calc(100dvh - var(--after-call-anchor) - var(--space-sm) - env(safe-area-inset-top, 0px) - var(--space-md));
    }
    .${CARD_CLASS}.visible { opacity: 1; transform: translateX(-50%); }
    .${CARD_CLASS}:focus-visible,
    .${CARD_CLASS} button:focus-visible {
      outline: 2px solid var(--color-accent-primary);
      outline-offset: 2px;
    }
    .${CARD_CLASS} h2 {
      margin: 0 0 var(--space-xs);
      font-size: var(--text-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-secondary);
    }
    .${CARD_CLASS} section + section { margin-top: var(--space-md); }
    .${CARD_CLASS} ul { margin: 0; padding-left: var(--space-md); }
    .${CARD_CLASS} li, .${CARD_CLASS} p {
      margin: 0;
      font-size: var(--text-base);
      line-height: var(--leading-normal);
    }
    .${CARD_CLASS} .after-call-close {
      position: absolute;
      top: var(--space-xs);
      right: var(--space-xs);
      background: transparent;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: var(--space-xs);
      border-radius: var(--radius-full);
    }
    .${CARD_CLASS} .after-call-close-line { padding-right: var(--space-md); }
    .${CARD_CLASS} .after-call-support {
      display: block;
      margin-top: var(--space-sm);
      background: transparent;
      border: none;
      padding: 0;
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      text-decoration: underline;
      text-underline-offset: 2px;
      cursor: pointer;
    }
    @media (prefers-reduced-motion: reduce) {
      .${CARD_CLASS}, .${CARD_CLASS}.visible { transition: none; transform: translateX(-50%); }
    }
  `;
  document.head.appendChild(style);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildCard(data: AfterCallData, options: AfterCallCardOptions): HTMLElement {
  const root = el('div', CARD_CLASS);
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'false');
  root.setAttribute('aria-label', t('afterCall.ariaLabel'));
  root.tabIndex = -1;

  const close = el('button', 'after-call-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', t('afterCall.close'));
  close.addEventListener('click', () => hideAfterCallCard());
  root.appendChild(close);

  if (data.remembered.length === 0 && !data.nextStep) {
    // Nothing to recap: a short warm close instead of empty headings.
    root.appendChild(el('p', 'after-call-close-line', t('afterCall.invitation')));
  } else {
    root.append(...buildRecap(data, options));
  }

  if (options.onSupport) {
    const onSupport = options.onSupport;
    const support = el('button', 'after-call-support', t('menu.items.supportFerni'));
    support.type = 'button';
    support.addEventListener('click', () => {
      hideAfterCallCard();
      onSupport();
    });
    root.appendChild(support);
  }

  root.addEventListener('keydown', onKeydown);
  root.addEventListener('focusin', clearDismissTimer);
  root.addEventListener('focusout', armDismissTimer);
  return root;
}

function buildRecap(data: AfterCallData, options: AfterCallCardOptions): HTMLElement[] {
  const remember = el('section', 'after-call-remember');
  remember.setAttribute('aria-labelledby', 'after-call-remember-title');
  const rememberTitle = el('h2', undefined, t('afterCall.rememberTitle', { name: options.personaName }));
  rememberTitle.id = 'after-call-remember-title';
  remember.appendChild(rememberTitle);
  if (data.remembered.length > 0) {
    const list = el('ul');
    data.remembered.forEach((item) => list.appendChild(el('li', undefined, item)));
    remember.appendChild(list);
  } else {
    remember.appendChild(el('p', 'after-call-empty', t('afterCall.rememberEmpty')));
  }

  const next = el('section', 'after-call-next');
  next.setAttribute('aria-labelledby', 'after-call-next-title');
  const nextTitle = el('h2', undefined, t('afterCall.nextStepTitle'));
  nextTitle.id = 'after-call-next-title';
  next.appendChild(nextTitle);
  next.appendChild(
    data.nextStep
      ? el('p', 'after-call-commitment', data.nextStep)
      : el('p', 'after-call-invitation', t('afterCall.invitation'))
  );

  return [remember, next];
}

/**
 * Anchor the card just below the call controls, or just above them when it
 * doesn't fit below and there is more room above, so it never sits on Connect
 * and scrolls inside itself as little as possible. Without controls on screen
 * it stays a bottom sheet.
 */
function placeCard(): void {
  if (!card) return;
  card.classList.remove('below-controls', 'above-controls');
  const connect = document.getElementById('connectBtn');
  // Connect's row, plus the round buttons under it (daily practice, predictions, insights).
  const rects = [connect?.closest('.controls-row') ?? connect, document.querySelector('.engagement-triggers')]
    .map((node) => node?.getBoundingClientRect())
    .filter((rect): rect is DOMRect => rect !== undefined && rect.height > 0);
  if (rects.length === 0) return;
  const top = Math.min(...rects.map((rect) => rect.top));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const roomBelow = window.innerHeight - bottom;
  const below = roomBelow >= card.scrollHeight || roomBelow >= top;
  card.style.setProperty('--after-call-anchor', `${Math.round(below ? bottom : window.innerHeight - top)}px`);
  card.classList.add(below ? 'below-controls' : 'above-controls');
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.stopPropagation();
    hideAfterCallCard();
  }
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && card) hideAfterCallCard();
}

function clearDismissTimer(): void {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
}

function armDismissTimer(): void {
  clearDismissTimer();
  dismissTimer = setTimeout(() => hideAfterCallCard(), AUTO_DISMISS_MS);
}

export function showAfterCallCard(data: AfterCallData, options: AfterCallCardOptions): HTMLElement {
  hideAfterCallCard(true);
  injectStyles();

  returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  card = buildCard(data, options);
  document.body.appendChild(card);
  placeCard();
  window.addEventListener('resize', placeCard);
  document.addEventListener('keydown', onDocumentKeydown);

  const shown = card;
  const reveal = (): void => {
    if (card !== shown) return; // closed or replaced before the first frame
    placeCard(); // the controls may have settled since the card was mounted
    shown.classList.add('visible');
    shown.focus({ preventScroll: true });
  };
  if (prefersReducedMotion()) reveal();
  else requestAnimationFrame(() => requestAnimationFrame(reveal));

  armDismissTimer();
  log.info('After-call card shown', {
    remembered: data.remembered.length,
    hasNextStep: data.nextStep !== null,
  });
  return card;
}

/** Remove the card. `immediate` skips the fade (used when replacing it). */
export function hideAfterCallCard(immediate = false): void {
  clearDismissTimer();
  document.removeEventListener('keydown', onDocumentKeydown);
  window.removeEventListener('resize', placeCard);
  if (!card) return;

  const closing = card;
  card = null;
  // Held toasts wait for this (AFTER_CALL_CARD_CLOSED_EVENT in app/call-end-paths.ts).
  document.dispatchEvent(new CustomEvent('ferni:after-call-card-closed'));
  const hadFocus = closing.contains(document.activeElement);
  closing.classList.remove('visible');
  if (immediate || prefersReducedMotion()) closing.remove();
  else setTimeout(() => closing.remove(), DURATION.SLOW);

  if (hadFocus && returnFocusTo?.isConnected) returnFocusTo.focus();
  returnFocusTo = null;
}

export function isAfterCallCardShowing(): boolean {
  return card !== null;
}
