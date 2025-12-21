/**
 * Marketplace UI Module
 * 
 * This module provides a beautiful modal interface for browsing and installing agents
 * from the VoiceAI Agents marketplace.
 * 
 * Features:
 * - Browse available agents by category
 * - Search agents by name, description, or tags
 * - Install/uninstall agents with one click
 * - View installed agents
 * - Create custom agents
 * 
 * @module marketplace
 * 
 * @example
 * ```typescript
 * import { openMarketplace, closeMarketplace } from './ui/marketplace/index.js';
 * 
 * // Open the marketplace modal
 * openMarketplace();
 * ```
 */

// Re-export everything from the main marketplace UI
export {
  openMarketplace,
  closeMarketplace,
  toggleMarketplace,
  isMarketplaceLoading,
  marketplaceUI,
} from '../marketplace.ui.js';

// Export types
export type { MarketplaceTab, CategoryColors, AgentReview, ExtendedMarketplaceAgent } from './types.js';

// Export utilities (for use by other modules)
export {
  getCategoryColors,
  getCategoryGradient,
  getCategoryGlow,
  getPersonaGradient,
  getPersonaGlow,
  getCategoryLabel,
  renderStars,
  formatReviewCount,
  debounce,
  announceToScreenReader,
} from './utils.js';

// Export constants
export { CATEGORY_COLORS, EXTERNAL_BRANDS, CATEGORY_LABELS } from './constants.js';
