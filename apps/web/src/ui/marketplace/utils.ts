/**
 * Marketplace UI Utilities
 * @module marketplace/utils
 */

import { CATEGORY_COLORS, EXTERNAL_BRANDS, CATEGORY_LABELS } from './constants.js';
import type { CategoryColors } from './types.js';

/**
 * Get colors for a category - returns primary, secondary, and glow
 */
export function getCategoryColors(category: string): CategoryColors {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.custom;
}

/**
 * Get gradient for a persona using CSS variables.
 * Applies via data-persona attribute which sets --persona-primary and --persona-secondary.
 */
export function getPersonaGradient(personaId: string): string {
  if ((EXTERNAL_BRANDS as readonly string[]).includes(personaId)) {
    return `var(--gradient-${personaId})`;
  }
  return 'linear-gradient(135deg, var(--persona-secondary), var(--persona-primary))';
}

/**
 * Get gradient for a category (marketplace agents)
 */
export function getCategoryGradient(category: string): string {
  const colors = getCategoryColors(category);
  return `linear-gradient(135deg, ${colors.secondary}, ${colors.primary})`;
}

/**
 * Get glow color for avatar shadows using CSS variables.
 */
export function getPersonaGlow(personaId: string): string {
  if ((EXTERNAL_BRANDS as readonly string[]).includes(personaId)) {
    return `var(--external-${personaId}-glow)`;
  }
  return 'var(--persona-glow)';
}

/**
 * Get glow color for a category (marketplace agents)
 */
export function getCategoryGlow(category: string): string {
  const colors = getCategoryColors(category);
  return colors.glow;
}

/**
 * Get display label for a category
 */
export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || category.charAt(0).toUpperCase() + category.slice(1);
}

/**
 * Render star rating HTML
 */
export function renderStars(rating: number): string {
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

  const starFull = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" class="star-icon star-full"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
  const starHalf = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" class="star-icon star-half"><defs><linearGradient id="half-${Math.random().toString(36).slice(2)}"><stop offset="50%" stop-color="currentColor"/><stop offset="50%" stop-color="transparent"/></linearGradient></defs><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="url(#half-${Math.random().toString(36).slice(2)})"/></svg>`;
  const starEmpty = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="star-icon star-empty"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

  return (
    starFull.repeat(fullStars) +
    (hasHalf ? starHalf : '') +
    starEmpty.repeat(emptyStars)
  );
}

/**
 * Format review count with K suffix for large numbers
 */
export function formatReviewCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

/**
 * Debounce function for search input
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Announce a message to screen readers via ARIA live region.
 */
export function announceToScreenReader(message: string, cleanupFn: (fn: () => void, ms: number) => void): void {
  const announcer = document.createElement('div');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('aria-atomic', 'true');
  announcer.style.cssText =
    'position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;';
  announcer.textContent = message;
  document.body.appendChild(announcer);
  cleanupFn(() => announcer.remove(), 1000);
}

