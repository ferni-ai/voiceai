/**
 * Tool Registry Exports
 *
 * Core registry system, types, and builder functions.
 * This is the recommended way to work with tools in new code.
 */
export { ALL_TOOL_DOMAINS, DOMAIN_TO_CATEGORY, EmptyServiceRegistry, EnvironmentServiceRegistry, ToolRegistry, assertTool, buildToolSet, getTool, isTool, registerTool, registerTools, toolRegistry, type BaseTool, type Tool, type ToolCategory, type ToolContext, type ToolDefinition, type ToolDomain, type ToolMetadata, type ToolSetResult, type ToolSetSpec, } from '../registry/index.js';
export { ESSENTIAL_DOMAINS, HIGH_PRIORITY_DOMAINS, convertLegacyTools, createDomainExport, getLoadedDomains, initializeToolRegistry, isDomainLoaded, loadToolDomain, loadToolDomainLazy, loadToolDomainsLazy, registerDomainLoader, registerLegacyTools, type InitializeToolRegistryOptions, } from '../registry/loader.js';
export { agentHasTool, buildAgentTools, buildAllTeamTools, buildEssentialTools, buildToolsForDomains, getAvailableToolsForAgent, getDefaultDomainsForRole, type BuildToolsOptions, } from '../builder.js';
export { initializeTeamHandlers, initializeTools, isTeamHandlerRegistryInitialized, isToolRegistryInitialized, shutdownTools, } from '../lifecycle.js';
export { getToolCategories, getToolDocumentation } from '../categories.js';
//# sourceMappingURL=registry.d.ts.map