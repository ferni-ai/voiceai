/**
 * Marketplace UI State Management
 * @module marketplace/state
 */

import type { MarketplaceTab } from './types.js';
import { createTimeoutTracker } from '../../utils/tracked-timeout.js';

// FIX BUG: Track all setTimeout calls for proper cleanup
export const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

/** Marketplace modal element reference */
export let marketplaceModal: HTMLElement | null = null;

/** Current active tab */
export let currentTab: MarketplaceTab = 'browse';

/** Current category filter */
export let currentCategory: string | null = null;

/** Search query */
export let searchQuery = '';

/** Loading state for marketplace UI */
export let isLoadingState = false;

/** Detail panel element reference */
export let detailPanel: HTMLElement | null = null;

// State setters
export function setMarketplaceModal(modal: HTMLElement | null): void {
  marketplaceModal = modal;
}

export function setCurrentTab(tab: MarketplaceTab): void {
  currentTab = tab;
}

export function setCurrentCategory(category: string | null): void {
  currentCategory = category;
}

export function setSearchQuery(query: string): void {
  searchQuery = query;
}

export function setIsLoadingState(loading: boolean): void {
  isLoadingState = loading;
}

export function setDetailPanel(panel: HTMLElement | null): void {
  detailPanel = panel;
}

/** Check if marketplace is loading */
export function isMarketplaceLoading(): boolean {
  return isLoadingState;
}

