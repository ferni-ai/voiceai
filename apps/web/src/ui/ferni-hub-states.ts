/**
 * "Your Day" hub: the empty, error and signed-out states. Each reads
 * differently, so a failure never passes for having nothing on your mind.
 */

import { t } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';
import { SECTION_ICONS } from './icons/hub-icons.js';

const log = createLogger('FerniHubStates');

/** Shown when every route answered and none had anything: says how the space fills. */
export function renderHubEmpty(): string {
  return `
    <div class="ferni-hub-empty">
      <div class="ferni-hub-empty-icon">${SECTION_ICONS.star}</div>
      <h3>${t('ui.hubEmptyTitle')}</h3>
      <p>${t('ui.hubEmptyBody')}</p>
    </div>
  `;
}

/** The error or signed-out message, with the one action that fixes it. */
export function renderHubProblem(state: 'error' | 'signed-out'): string {
  const signedOut = state === 'signed-out';
  return `
    <div class="ferni-hub-empty ferni-hub-problem" role="alert">
      <p>${signedOut ? t('ui.hubSignInFirst') : t('ui.hubSomethingUnexpected')}</p>
      <button type="button" class="ferni-hub-problem-action">
        ${signedOut ? t('ui.hubSignIn') : t('ui.hubTryAgain')}
      </button>
    </div>
  `;
}

const STYLE_ID = 'ferni-hub-state-styles';

function addStateStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .ferni-hub-problem p { margin-bottom: var(--space-4, 16px); }
    .ferni-hub-problem-action {
      min-height: 44px;
      padding: var(--space-2, 8px) var(--space-6, 24px);
      background: transparent;
      color: var(--color-text-primary);
      border: 1px solid var(--color-border-medium);
      border-radius: var(--radius-full);
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
    }
    .ferni-hub-problem-action:hover,
    .ferni-hub-problem-action:focus-visible { background: var(--color-bg-secondary); }
    .ferni-hub-problem-action:focus-visible {
      outline: 2px solid var(--color-accent-primary);
      outline-offset: 2px;
    }
  `;
  document.head.appendChild(style);
}

/** Wire the problem state's button: Try again reloads, Sign in opens the sign-in gate. */
export function bindHubProblem(
  root: Element,
  state: 'error' | 'signed-out',
  retry: () => void
): void {
  addStateStyles();
  root.querySelector('.ferni-hub-problem-action')?.addEventListener('click', () => {
    if (state === 'error') {
      retry();
      return;
    }
    void import('./sign-in-gate.ui.js')
      .then(({ showSignInGate }) => showSignInGate())
      .then(retry)
      .catch((error: unknown) => log.warn('Sign-in from the hub failed', { error: String(error) }));
  });
}
