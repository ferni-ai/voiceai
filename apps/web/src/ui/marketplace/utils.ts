/**
 * Marketplace Utilities
 *
 * Shared utility functions for the marketplace UI.
 *
 * @module marketplace/utils
 */

import { createTimeoutTracker } from '../../utils/tracked-timeout.js';

// ============================================================================
// TIMEOUT TRACKING
// ============================================================================

/**
 * Create tracked timeouts to prevent memory leaks
 */
export const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// DEBOUNCE
// ============================================================================

/**
 * Debounce a function
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

// ============================================================================
// ACCESSIBILITY
// ============================================================================

/**
 * Announce a message to screen readers via ARIA live region.
 */
export function announceToScreenReader(message: string): void {
  const announcer = document.createElement('div');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('aria-atomic', 'true');
  announcer.style.cssText =
    'position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;';
  announcer.textContent = message;
  document.body.appendChild(announcer);
  trackedTimeout(() => announcer.remove(), 1000);
}

// ============================================================================
// STAR RATING RENDERING
// ============================================================================

/**
 * Render star rating icons
 */
export function renderStars(rating: number): string {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  const starIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" class="star-icon">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>`;

  const halfStarIcon = `<svg width="12" height="12" viewBox="0 0 24 24" class="star-icon star-half">
    <defs>
      <linearGradient id="half-star-gradient">
        <stop offset="50%" stop-color="currentColor"/>
        <stop offset="50%" stop-color="transparent"/>
      </linearGradient>
    </defs>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="url(#half-star-gradient)" stroke="currentColor" stroke-width="1"/>
  </svg>`;

  const emptyStarIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="star-icon star-empty">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>`;

  return (
    starIcon.repeat(fullStars) +
    (hasHalfStar ? halfStarIcon : '') +
    emptyStarIcon.repeat(emptyStars)
  );
}

/**
 * Format review count for display
 */
export function formatReviewCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
}

// ============================================================================
// INITIALS EXTRACTION
// ============================================================================

/**
 * Get initials from a name (max 2 characters)
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
