/**
 * Call Status UI
 *
 * The ONE place a failed or dropped call is explained. Shows a short message under
 * the call controls with the action that can fix it (try again, reconnect, sign in,
 * or how to allow the microphone). Showing a new notice replaces the old one, so
 * two call messages never stack.
 */

import type { ConnectFailure } from '../services/connect-failure.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('CallStatusUI');

const NOTICE_ID = 'callStatusNotice';
const STYLE_ID = 'call-status-styles';

const MIC_HELP =
  'Open your browser’s site settings (the icon left of the address bar), set Microphone to Allow, then try again.';

export interface CallNoticeHandlers {
  /** Start a new call attempt. */
  onRetry: () => void;
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .call-status {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-sm);
      margin-top: var(--space-md);
      padding: var(--space-sm) var(--space-md);
      max-width: min(420px, 90vw);
      border-radius: var(--radius-lg);
      border: 1px solid var(--color-border-subtle);
      background: var(--color-background-glass);
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
    .call-status__btn--primary { background: var(--persona-primary, var(--color-accent-primary)); color: var(--color-text-inverse); border-color: transparent; }
    .call-status__btn:hover, .call-status__btn:focus-visible { border-color: var(--color-border-strong); }
    .call-status__btn:focus-visible { outline: 2px solid var(--persona-primary, var(--color-accent-primary)); outline-offset: 2px; }
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

/** Remove the current call notice, if any. */
export function clearCallNotice(): void {
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
    help.textContent = MIC_HELP;
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
    const label = failure.kind === 'dropped' ? 'Reconnect' : 'Try again';
    actions.append(button(label, true, retry));
  }

  if (actions.childElementCount > 0) notice.appendChild(actions);
  mount(notice);
}
