/**
 * Tool Registry Exports
 *
 * Core registry system, types, and builder functions.
 * This is the recommended way to work with tools in new code.
 */

// ============================================================================
// TOOL REGISTRY SYSTEM
// ============================================================================

export {
  ALL_TOOL_DOMAINS,
  DOMAIN_TO_CATEGORY,
  EmptyServiceRegistry,
  EnvironmentServiceRegistry,
  ToolRegistry,
  assertTool,
  buildToolSet,
  getTool,
  // Type guards
  isTool,
  registerTool,
  registerTools,
  toolRegistry,
  type BaseTool,
  // Types
  type Tool,
  type ToolCategory,
  type ToolContext,
  type ToolDefinition,
  type ToolDomain,
  type ToolMetadata,
  type ToolSetResult,
  type ToolSetSpec,
} from '../registry/index.js';

export {
  ESSENTIAL_DOMAINS,
  HIGH_PRIORITY_DOMAINS,
  convertLegacyTools,
  createDomainExport,
  getLoadedDomains,
  initializeToolRegistry,
  isDomainLoaded,
  loadToolDomain,
  loadToolDomainLazy,
  loadToolDomainsLazy,
  registerDomainLoader,
  registerLegacyTools,
  type InitializeToolRegistryOptions,
} from '../registry/loader.js';

// ============================================================================
// AGENT TOOL BUILDER
// ============================================================================

export {
  agentHasTool,
  buildAgentTools,
  buildAllTeamTools,
  buildEssentialTools,
  buildToolsForDomains,
  getAvailableToolsForAgent,
  getDefaultDomainsForRole,
  type BuildToolsOptions,
} from '../builder.js';

// ============================================================================
// LIFECYCLE FUNCTIONS
// ============================================================================

export {
  initializeTeamHandlers,
  initializeTools,
  isTeamHandlerRegistryInitialized,
  isToolRegistryInitialized,
  shutdownTools,
} from '../lifecycle.js';

// ============================================================================
// CATEGORIES & DOCUMENTATION
// ============================================================================

export { getToolCategories, getToolDocumentation } from '../categories.js';
