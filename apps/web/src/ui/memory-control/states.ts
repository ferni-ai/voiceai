/**
 * Loading, empty and error states for the memory panel.
 *
 * @module ui/memory-control/states
 */

import { t } from '../../i18n/index.js';
import { esc } from './format.js';

export const ICONS = {
  edit: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  trash:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>',
};

export function renderLoading(label: string): string {
  return `
    <div class="memory-state" role="status" aria-live="polite">
      <span class="memory-state__spinner" aria-hidden="true"></span>
      <p class="memory-state__text">${esc(label)}</p>
    </div>`;
}

export function renderEmpty(title: string, body: string): string {
  return `
    <div class="memory-state">
      <span class="memory-state__icon">${ICONS.leaf}</span>
      <p class="memory-state__title">${esc(title)}</p>
      <p class="memory-state__text">${esc(body)}</p>
    </div>`;
}

export function renderError(message: string): string {
  return `
    <div class="memory-state" role="alert">
      <p class="memory-state__title">${esc(message)}</p>
      <button type="button" class="memory-btn memory-btn--quiet" data-action="retry">${esc(
        t('memoryControl.tryAgain', 'Try again')
      )}</button>
    </div>`;
}
