/**
 * Marketplace API Routes
 *
 * This file is a backward-compatible re-export from the modular marketplace/ directory.
 * The implementation has been split into smaller, focused modules:
 *
 * - marketplace/helpers.ts         - Shared utilities and validation
 * - marketplace/publisher-routes.ts - Publisher portal operations
 * - marketplace/browse-routes.ts    - Catalog browsing
 * - marketplace/install-routes.ts   - Installation management
 * - marketplace/billing-routes.ts   - Usage tracking and billing
 * - marketplace/index.ts           - Main router
 *
 * @module MarketplaceRoutes
 */

// Re-export everything from the modular implementation
export {
  handleMarketplaceRoutes,
  isMarketplaceRoute,
  isMarketplaceAdminRoute,
} from './marketplace/index.js';
export type { PublisherSession } from './marketplace/helpers.js';
