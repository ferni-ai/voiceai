/**
 * This Year Together: what shows when the year couldn't load.
 *
 * It used to be a bare "Something went wrong" with no way forward (and, until
 * the empty box's stray opacity: 0 went, nobody saw even that). Now it says it
 * warmly, in design tokens for zen and midnight alike, with one button: try again.
 *
 * @module ui/your-year-states
 */
import { t } from '../i18n/index.js';

const STYLE_ID = 'your-year-states-styles';

const STYLES = `
  .your-year-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3, 12px);
    text-align: center;
  }
  .your-year-error__title {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-text-primary);
  }
  .your-year-error__body {
    margin: 0;
    max-width: 32ch;
    color: var(--color-text-secondary);
  }
  .your-year-error__retry {
    min-height: 44px;
    padding: 0 var(--space-5, 20px);
    border: none;
    border-radius: var(--radius-full);
    background: var(--color-accent-primary);
    color: var(--color-text-inverse);
    font: inherit;
    cursor: pointer;
  }
  .your-year-error__retry:focus-visible {
    outline: 2px solid var(--color-accent-primary);
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

function paragraph(className: string, text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = className;
  p.textContent = text;
  return p;
}

/** The failed-load state: a warm line, what to do, and a Try again button. */
export function createYourYearError(onRetry: () => void): HTMLElement {
  injectStyles();
  const box = document.createElement('div');
  box.className = 'your-year-error';
  box.setAttribute('role', 'alert');
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'your-year-error__retry';
  retry.textContent = t('common.retry');
  retry.addEventListener('click', onRetry);
  box.append(
    paragraph('your-year-error__title', t('yourYearWithFerni.errorTitle')),
    paragraph('your-year-error__body', t('yourYearWithFerni.errorBody')),
    retry
  );
  return box;
}
