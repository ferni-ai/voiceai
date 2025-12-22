/**
 * Marketplace UI Module
 *
 * A beautiful modal interface for browsing and installing agents from the
 * VoiceAI Agents marketplace (similar to Claude MCP's marketplace).
 *
 * Features:
 * - Browse available agents by category
 * - Search agents by name, description, or tags
 * - Install/uninstall agents with one click
 * - View installed agents
 * - Create custom agents
 *
 * This module re-exports the main marketplace UI functionality.
 * For internal use, import from submodules directly.
 *
 * @module marketplace
 *
 * USAGE:
 *   import { openMarketplace, closeMarketplace } from './ui/marketplace/index.js';
 *
 *   // Open the marketplace modal
 *   openMarketplace();
 */

// Re-export types
export type {
  MarketplaceAgent,
  MarketplaceAgentWithStatus,
  MarketplaceTab,
  AgentReview,
  ReviewStats,
  CategoryColors,
  MarketplaceState,
  CategoryId,
  ExternalBrandId,
  MarketplaceCallbacks,
} from './types.js';

// Re-export constants
export {
  DURATION,
  EASING,
  CATEGORY_LABELS,
  getCategoryLabel,
  isExternalBrand,
  getPersonaGradient,
  getPersonaGlow,
  getCategoryGradient,
  getCategoryGlow,
  getCategoryTextColor,
  getCategoryTint,
  ICONS,
  ANIMATION_PRESETS,
  getStaggerDelay,
  DOM_IDS,
  CSS_CLASSES,
} from './constants.js';

// Re-export state management
export {
  getModal,
  getCurrentTab,
  getCurrentCategory,
  getSearchQuery,
  isLoading,
  isOpen,
  setModal,
  setCurrentTab,
  setCurrentCategory,
  setSearchQuery,
  setLoading,
  resetState,
  getState,
} from './state.js';

// Re-export utilities
export {
  trackedTimeout,
  clearAllTimeouts,
  debounce,
  announceToScreenReader,
  renderStars,
  formatReviewCount,
  getInitials,
} from './utils.js';

// Re-export styles
export {
  getMarketplaceStyles,
  getDetailStyles,
  injectStyles,
  injectDetailStyles,
} from './styles/index.js';

// The main marketplace UI is still in the parent file (marketplace.ui.ts)
// This module provides the modular foundation for it.
// To complete the refactor, move the remaining logic here.

/**
 * Note: The main openMarketplace, closeMarketplace, and toggleMarketplace
 * functions are still in apps/web/src/ui/marketplace.ui.ts.
 *
 * This index.ts provides the modular building blocks that the main file uses.
 * A full migration would move all UI logic here, but for backward compatibility,
 * the main entry point remains marketplace.ui.ts.
 */
