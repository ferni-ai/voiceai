/**
 * Call Status UI
 *
 * The ONE place a failed or dropped call is explained. Shows a short message just
 * above the call controls with the action that can fix it (try again, reconnect,
 * sign in, or how to allow the microphone). Showing a new notice replaces the old
 * one, so two call messages never stack.
 *
 * It floats over the screen rather than sitting in the column under the controls:
 * in the column it pushed the three buttons below it off a 1280x800 screen (the
 * page doesn't scroll), so a failed call hid the very buttons that help next.
 */

import { t } from '../i18n/index.js';
import type { ConnectFailure } from '../services/connect-failure.js';
import { createLogger } from '../utils/logger.js';
import { anchorAboveControls, anchoredCardCss } from './after-call/anchor-above-controls.js';
import { isWaitlistScreenEnabled, showWaitingOverlay } from './waiting-screen.ui.js';

const log = createLogger('CallStatusUI');

const NOTICE_ID = 'callStatusNotice';
const STYLE_ID = 'call-status-styles';

/**
 * How to allow the microphone on this device. Phones have no desktop-style
 * site-settings icon: iPhone Safari keeps it under the aA menu, other iPhone
 * browsers in iOS Settings, Chrome on Android under the address-bar icon.
 */
export function micHelpText(userAgent: string = navigator.userAgent, touchPoints = navigator.maxTouchPoints): string {
  // iPadOS reports itself as a Mac; touch support gives it away.
  const ios = /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1);
  if (ios) {
    const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);
    return t(otherBrowser ? 'entrance.micHelpIos' : 'entrance.micHelpIosSafari');
  }
  if (/Android/.test(userAgent)) return t('entrance.micHelpAndroid');
  return t('entrance.micHelpDesktop');
}

export interface CallNoticeHandlers {
  /** Start a new call attempt. */
  onRetry: () => void;
  /** Offered as a second action while the call is still open: hang up for good. */
  onEnd?: () => void;
  /** Move keyboard focus to the main action (a prompt shown mid-call, not after a click). */
  focusAction?: boolean;
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .call-status {
      position: fixed;
      left: 50%;
      transform: translateX(-50%);
      z-index: var(--z-banner);
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-sm);
      padding: var(--space-sm) var(--space-md);
      width: max-content;
      max-width: min(420px, calc(100vw - 2 * var(--space-md)));
      border-radius: var(--radius-lg);
      border: 1px solid var(--color-border-subtle);
      background: var(--color-background-elevated);
      box-shadow: var(--shadow-lg);
      color: var(--color-text-primary);
      font-family: var(--font-body);
      font-size: var(--text-sm);
      text-align: center;
    }
    .call-status__message { margin: 0; }
    .call-status__help { color: var(--color-text-secondary); margin: 0; }
    .call-status__actions { display: flex; gap: var(--space-sm); flex-wrap: wrap; justify-content: center; }
    .call-status__btn {
      min-height: 44px;
      padding: 0 var(--space-md);
      border-radius: var(--radius-full);
      border: 1px solid var(--color-border-medium);
      background: transparent;
      color: var(--color-text-primary);
      font: inherit;
      cursor: pointer;
    }
    /* Text pairs with its own fill: --persona-on-primary for the persona colour,
       --color-text-on-accent for the accent fallback. --color-text-inverse is ink in
       midnight, which put dark text on the dark forest fill (2.96:1). */
    .call-status__btn--primary { background: var(--persona-primary, var(--color-accent-primary)); color: var(--persona-on-primary, var(--color-text-on-accent)); border-color: transparent; }
    .call-status__btn:hover, .call-status__btn:focus-visible { border-color: var(--color-border-strong); }
    .call-status__btn:focus-visible { outline: 2px solid var(--persona-primary, var(--color-accent-primary)); outline-offset: 2px; }
    ${anchoredCardCss('.call-status')}
  `;
  document.head.appendChild(style);
}

function button(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = primary ? 'call-status__btn call-status__btn--primary' : 'call-status__btn';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

/** Stops the current notice following the controls when the viewport changes. */
let stopAnchor: (() => void) | null = null;

/** Remove the current call notice, if any. */
export function clearCallNotice(): void {
  stopAnchor?.();
  stopAnchor = null;
  document.getElementById(NOTICE_ID)?.remove();
}

function mount(notice: HTMLElement): void {
  const anchor = document.querySelector('.controls-row');
  if (anchor?.parentElement) {
    anchor.insertAdjacentElement('afterend', notice);
  } else {
    document.body.appendChild(notice);
  }
}

/**
 * Show why a call couldn't start (or stopped) and what to do about it.
 * A failure with no message (a cancelled attempt) clears the notice instead.
 */
export function showCallNotice(failure: ConnectFailure, handlers: CallNoticeHandlers): void {
  clearCallNotice();
  // Still on the waitlist: their place in line, not an error
  if (failure.waitlist && isWaitlistScreenEnabled() && showWaitingOverlay(failure.waitlist)) return;
  if (!failure.message) return;
  injectStyles();

  const notice = document.createElement('div');
  notice.id = NOTICE_ID;
  notice.className = 'call-status';
  notice.setAttribute('role', 'alert');
  notice.dataset['kind'] = failure.kind;

  const text = document.createElement('p');
  text.className = 'call-status__message';
  text.textContent = failure.message;
  notice.appendChild(text);

  const actions = document.createElement('div');
  actions.className = 'call-status__actions';
  const retry = (): void => {
    clearCallNotice();
    handlers.onRetry();
  };

  if (failure.action === 'mic-help') {
    const help = document.createElement('p');
    help.className = 'call-status__help';
    help.textContent = micHelpText();
    help.hidden = true;
    notice.appendChild(help);
    actions.append(
      button('How to allow', false, () => {
        help.hidden = !help.hidden;
      }),
      button('Try again', true, retry)
    );
  } else if (failure.action === 'sign-in') {
    actions.append(
      button('Sign in', true, () => {
        clearCallNotice();
        void import('./sign-in-gate.ui.js')
          .then(({ showSignInGate }) => showSignInGate())
          .catch((err) => log.error('Sign-in gate failed to open', err));
      })
    );
  } else if (failure.action === 'retry') {
    const reconnect = failure.kind === 'dropped' || failure.kind === 'agent_left';
    actions.append(button(reconnect ? 'Reconnect' : 'Try again', true, retry));
  }

  const { onEnd } = handlers;
  if (onEnd) {
    actions.append(
      button(t('accessibility.endCall'), false, () => {
        clearCallNotice();
        onEnd();
      })
    );
  }

  if (actions.childElementCount > 0) notice.appendChild(actions);
  mount(notice);
  stopAnchor = anchorAboveControls(notice);
  if (handlers.focusAction) actions.querySelector<HTMLButtonElement>('button')?.focus();
}
