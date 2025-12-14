/**
 * Marketplace Module
 *
 * Agent and tool marketplace for the Ferni Voice AI Platform.
 *
 * Architecture:
 *   schema/         - Type definitions and interfaces
 *   registry.ts     - Hybrid registry (in-memory cache + Firestore persistence)
 *   persistence/    - Storage abstraction (Firestore/in-memory)
 *   executor/       - Sandboxed tool execution
 *   examples/       - Example manifests
 *
 * Storage:
 *   - Development: In-memory store for fast iteration
 *   - Production: Firestore for persistence across restarts
 *
 * Usage:
 *   import { registerTool, installItem, executeMarketplaceTool } from './marketplace';
 */

// Schema exports
export type * from './schema/index.js';

// Executor exports
export {
  executeBatch,
  executeMarketplaceTool,
  type ExecutionContext,
  type ExecutionOptions,
  type ExecutionResult,
} from './executor/index.js';

// Registry exports
export {
  clearRegistry,
  getAgent,
  // Agents (async - checks store)
  getAgentAsync,
  getExecutionHistory,
  getInstallation,
  getInstallationAsync,
  // Marketplace listings
  getListing,
  getTool,
  // Tools (async - checks store)
  getToolAsync,
  hasPermission,
  // Initialization
  initializeMarketplaceRegistry,
  // Installations
  installItem,
  listAgents,
  listInstallations,
  listTools,
  // Execution tracking
  recordExecution,
  // Agents (sync - from cache)
  registerAgent,
  // Tools (sync - from cache)
  registerTool,
  searchListings,
  uninstallItem,
} from './registry.js';

// Persistence exports (for advanced use cases)
export {
  getMarketplaceStore,
  resetMarketplaceStore,
  type MarketplaceStore,
} from './persistence/index.js';

// Reviews exports
export {
  addPublisherResponse,
  createReview,
  deleteReview,
  flagReview,
  getPendingReviews,
  getReview,
  getReviewStats,
  listReviews,
  moderateReview,
  reviewsService,
  updateReview,
  voteReview,
  type Review,
  type ReviewStats,
  type ReviewVote,
} from './reviews/index.js';

// Billing exports
export {
  calculateBilling,
  calculateRevenueShare,
  checkQuota,
  getPendingPayouts,
  getUsageSummary,
  recordUsage,
  type BilledAmount,
  type Quota,
  type RevenueShare,
  type UsageMetrics,
  type UsageRecord,
  type UsageSummary,
} from './billing/index.js';
