/**
 * Marketplace State Management
 *
 * Centralized state for the marketplace UI.
 *
 * @module marketplace/state
 */

import type { MarketplaceTab, MarketplaceState } from './types.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('MarketplaceState');

// ============================================================================
// STATE
// ============================================================================

const state: MarketplaceState = {
  modal: null,
  currentTab: 'browse',
  currentCategory: null,
  searchQuery: '',
  isLoading: false,
};

// ============================================================================
// GETTERS
// ============================================================================

export function getModal(): HTMLElement | null {
  return state.modal;
}

export function getCurrentTab(): MarketplaceTab {
  return state.currentTab;
}

export function getCurrentCategory(): string | null {
  return state.currentCategory;
}

export function getSearchQuery(): string {
  return state.searchQuery;
}

export function isLoading(): boolean {
  return state.isLoading;
}

export function isOpen(): boolean {
  return state.modal?.classList.contains('open') ?? false;
}

// ============================================================================
// SETTERS
// ============================================================================

export function setModal(modal: HTMLElement | null): void {
  state.modal = modal;
}

export function setCurrentTab(tab: MarketplaceTab): void {
  log.debug('Tab changed:', tab);
  state.currentTab = tab;
}

export function setCurrentCategory(category: string | null): void {
  log.debug('Category changed:', category);
  state.currentCategory = category;
}

export function setSearchQuery(query: string): void {
  state.searchQuery = query;
}

export function setLoading(loading: boolean): void {
  state.isLoading = loading;
}

// ============================================================================
// STATE RESET
// ============================================================================

export function resetState(): void {
  state.currentTab = 'browse';
  state.currentCategory = null;
  state.searchQuery = '';
  state.isLoading = false;
}

// ============================================================================
// STATE EXPORT (for debugging)
// ============================================================================

export function getState(): Readonly<MarketplaceState> {
  return { ...state };
}
