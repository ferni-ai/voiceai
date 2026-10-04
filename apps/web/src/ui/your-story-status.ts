/**
 * Your Story — empty and error states.
 *
 * Shown instead of the dashboard when there is no story yet or it couldn't
 * load. Demo data is never used as a stand-in here: made-up numbers shown
 * without the demo banner read as the user's own.
 *
 * @module ui/your-story-status
 */

import { t } from '../i18n/index.js';

export type YourStoryStatus = 'empty' | 'error';

const STYLE_ID = 'your-story-status-styles';

const STYLES = `
  .your-story__status {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md, 1rem);
    padding: var(--space-xl, 2.618rem) var(--space-md, 1rem);
    text-align: center;
  }
  .your-story__status-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.25rem;
    color: var(--color-text-primary);
  }
  .your-story__status-body {
    margin: 0;
    max-width: 28rem;
    font-family: var(--font-body);
    font-size: 0.9375rem;
    line-height: 1.6;
    color: var(--color-text-secondary);
  }
  .your-story__status-retry {
    min-height: 44px;
    padding: var(--space-sm, 0.5rem) var(--space-lg, 1.618rem);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--color-accent);
    font-family: var(--font-body);
    cursor: pointer;
  }
  .your-story__status-retry:hover,
  .your-story__status-retry:focus-visible {
    background: var(--color-accent-subtle);
  }
  .your-story__status-retry:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
`;

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

/**
 * Build the empty or error state. The retry button only appears for errors,
 * and only when a retry callback is given.
 */
export function buildYourStoryStatus(kind: YourStoryStatus, onRetry?: () => void): HTMLElement {
  injectStyles();

  const root = document.createElement('div');
  root.className = 'your-story__status';
  root.dataset.status = kind;
  root.setAttribute('role', kind === 'error' ? 'alert' : 'status');

  const title = document.createElement('h3');
  title.className = 'your-story__status-title';
  const body = document.createElement('p');
  body.className = 'your-story__status-body';

  if (kind === 'empty') {
    title.textContent = t('yourStory.empty.title', 'Your story starts here');
    body.textContent = t(
      'yourStory.empty.body',
      "Once we've talked a few times, the moments that matter to you will show up here."
    );
    root.append(title, body);
    return root;
  }

  title.textContent = t('yourStory.error.title', "Couldn't load your story");
  body.textContent = t('yourStory.error.body', 'Something went wrong on our end. Try again?');
  root.append(title, body);

  if (onRetry) {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'your-story__status-retry';
    retry.textContent = t('yourStory.error.retry', 'Try again');
    retry.addEventListener('click', onRetry);
    root.appendChild(retry);
  }
  return root;
}
