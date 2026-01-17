/**
 * Marketplace Styles Index
 *
 * Aggregates all marketplace styles into a single export.
 *
 * @module marketplace/styles
 */

import { getBaseStyles } from './base.js';
import { getCardStyles } from './cards.js';
import { getTeamStyles } from './team.js';
import { getDetailStyles } from './detail.js';
import { getCreationsStyles } from './creations.js';

/**
 * Get all marketplace styles combined
 */
export function getMarketplaceStyles(): string {
  return [
    getBaseStyles(),
    getCardStyles(),
    getTeamStyles(),
    getCreationsStyles(),
  ].join('\n');
}

/**
 * Get detail panel styles (loaded separately)
 */
export { getDetailStyles };

/**
 * Inject marketplace styles into document head
 */
export function injectStyles(): void {
  if (document.getElementById('marketplace-styles')) return;

  const styleSheet = document.createElement('style');
  styleSheet.id = 'marketplace-styles';
  styleSheet.textContent = getMarketplaceStyles();
  document.head.appendChild(styleSheet);
}

/**
 * Inject detail panel styles
 */
export function injectDetailStyles(): void {
  if (document.getElementById('marketplace-detail-styles')) return;

  const styleSheet = document.createElement('style');
  styleSheet.id = 'marketplace-detail-styles';
  styleSheet.textContent = getDetailStyles();
  document.head.appendChild(styleSheet);
}

