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
export * from './schema/index.js';

// Executor exports
export {
  executeMarketplaceTool,
  executeBatch,
  type ExecutionContext,
  type ExecutionOptions,
  type ExecutionResult,
} from './executor/index.js';

// Registry exports
export {
  // Tools (sync - from cache)
  registerTool,
  getTool,
  listTools,
  // Tools (async - checks store)
  getToolAsync,

  // Agents (sync - from cache)
  registerAgent,
  getAgent,
  listAgents,
  // Agents (async - checks store)
  getAgentAsync,

  // Installations
  installItem,
  getInstallation,
  getInstallationAsync,
  listInstallations,
  hasPermission,
  uninstallItem,

  // Execution tracking
  recordExecution,
  getExecutionHistory,

  // Marketplace listings
  getListing,
  searchListings,

  // Initialization
  initializeMarketplaceRegistry,
  clearRegistry,
} from './registry.js';

// Persistence exports (for advanced use cases)
export {
  getMarketplaceStore,
  resetMarketplaceStore,
  type MarketplaceStore,
} from './persistence/index.js';
