/**
 * After-call card: what Ferni will remember, and one gentle next step.
 *
 * Shown after the goodbye ceremony in place of the cost card when the
 * after-call flag is on. Non-modal, focusable, closes on Escape or the close
 * button, and keeps still for prefers-reduced-motion.
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
  /** Opens the conversation cost card, so cost stays one tap away. */
  onShowCost?: () => void;
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
      bottom: 120px;
      left: 50%;
      width: min(340px, calc(100% - 2 * var(--space-md)));
      transform: translateX(-50%) translateY(12px);
      opacity: 0;
      background: var(--color-bg-elevated);
      color: var(--color-text-primary);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-lg);
      padding: var(--space-md) var(--space-lg);
      z-index: var(--z-notification);
      transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD},
        transform ${DURATION.SLOW}ms ${EASING.STANDARD};
    }
    .${CARD_CLASS}.visible { opacity: 1; transform: translateX(-50%) translateY(0); }
    .${CARD_CLASS}:focus-visible,
    .${CARD_CLASS} button:focus-visible {
      outline: 2px solid var(--color-accent-primary);
      outline-offset: 2px;
    }
    .${CARD_CLASS} h2 {
      margin: 0 0 var(--space-xs);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-secondary);
    }
    .${CARD_CLASS} section + section { margin-top: var(--space-md); }
    .${CARD_CLASS} ul { margin: 0; padding-left: var(--space-md); }
    .${CARD_CLASS} li, .${CARD_CLASS} p {
      margin: 0;
      font-size: var(--font-size-base);
      line-height: var(--line-height-normal);
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
    .${CARD_CLASS} .after-call-cost {
      margin-top: var(--space-md);
      background: transparent;
      border: none;
      padding: 0;
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
      text-decoration: underline;
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

  const close = el('button', 'after-call-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', t('afterCall.close'));
  close.addEventListener('click', () => hideAfterCallCard());

  root.append(close, remember, next);

  if (options.onShowCost) {
    const onShowCost = options.onShowCost;
    const cost = el('button', 'after-call-cost', t('afterCall.seeCost'));
    cost.type = 'button';
    cost.addEventListener('click', () => {
      hideAfterCallCard();
      onShowCost();
    });
    root.appendChild(cost);
  }

  root.addEventListener('keydown', onKeydown);
  root.addEventListener('focusin', clearDismissTimer);
  root.addEventListener('focusout', armDismissTimer);
  return root;
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
  document.addEventListener('keydown', onDocumentKeydown);

  const shown = card;
  const reveal = (): void => {
    if (card !== shown) return; // closed or replaced before the first frame
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
  if (!card) return;

  const closing = card;
  card = null;
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
