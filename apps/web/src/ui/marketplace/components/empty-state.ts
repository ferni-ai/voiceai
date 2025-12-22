/**
 * Empty State Component
 *
 * Displays empty state messages in the marketplace.
 */

import { getModal } from '../state.js';

/**
 * Show empty state message
 */
export function showEmpty(message: string): void {
  const empty = getModal()?.querySelector('.marketplace-empty') as HTMLElement;
  const grid = getModal()?.querySelector('.marketplace-grid') as HTMLElement;
  if (!empty || !grid) return;

  grid.hidden = true;
  const title = empty.querySelector('.empty-title') as HTMLElement;
  const hint = empty.querySelector('.empty-hint') as HTMLElement;
  if (title) {
    title.textContent =
      message === 'No agents installed yet' ? 'Your team awaits.' : 'No matches yet.';
  }
  if (hint) {
    hint.textContent =
      message === 'No agents installed yet'
        ? 'Discover coaches who can help with what matters to you.'
        : 'Try a different search or explore all coaches.';
  }
  empty.style.display = 'flex';
}

/**
 * Hide empty state
 */
export function hideEmpty(): void {
  const empty = getModal()?.querySelector('.marketplace-empty') as HTMLElement;
  if (empty) {
    empty.style.display = 'none';
  }
}

