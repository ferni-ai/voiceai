/**
 * MCP Tool Integration for Agent Extensibility
 *
 * This module bridges MCP servers with the tool builder system.
 * It loads MCP tools from persona bundles AND API-registered servers,
 * then converts them into LiveKit-compatible tool definitions.
 *
 * Server Sources:
 * 1. File-based: mcp.json in persona bundle directory
 * 2. API-registered: Registered via /api/v2/developers/mcp-servers
 *
 * @module personas/bundles/mcp-integration
 */
import { connectToMCPServer, disconnectAllMCPServers, disconnectFromMCPServer, getMCPConnection, callMCPTool } from './mcp-loader.js';
/**
 * MCP tool definition compatible with the builder system
 */
export interface MCPToolDefinition {
    /** Tool name (prefixed with server ID) */
    name: string;
    /** Tool description from MCP server */
    description: string;
    /** JSON Schema for parameters */
    inputSchema?: unknown;
    /** Server ID this tool belongs to */
    serverId: string;
    /** Original tool name on the MCP server */
    originalName: string;
}
/**
 * Options for loading MCP tools
 */
export interface LoadMCPToolsOptions {
    /** Persona ID */
    personaId: string;
    /** Bundle path (optional, will look up by personaId if not provided) */
    bundlePath?: string;
    /** Publisher ID - required to load API-registered servers */
    publisherId?: string;
}
/**
 * Load MCP tools for a persona
 *
 * This connects to all auto-connect MCP servers defined in:
 * 1. The persona's mcp.json file (file-based)
 * 2. API-registered servers for the publisher/persona (if publisherId provided)
 *
 * Returns tool definitions that can be integrated with the main tool builder.
 */
export declare function loadMCPToolsForPersona(personaIdOrOptions: string | LoadMCPToolsOptions, bundlePathDeprecated?: string): Promise<MCPToolDefinition[]>;
/**
 * Build LiveKit-compatible tools from MCP tool definitions
 *
 * This creates llm.tool() instances that delegate to MCP servers
 */
export declare function buildMCPTools(personaIdOrOptions: string | LoadMCPToolsOptions, bundlePathDeprecated?: string): Promise<Record<string, unknown>>;
/**
 * Initialize MCP connections for a persona
 *
 * Call this when a session starts to connect to all auto-connect servers.
 * Supports both file-based and API-registered MCP servers.
 */
export declare function initializeMCPConnections(personaIdOrOptions: string | LoadMCPToolsOptions, bundlePathDeprecated?: string): Promise<{
    connected: string[];
    failed: string[];
}>;
/**
 * Cleanup MCP connections
 *
 * Call this when a session ends or when switching personas
 */
export declare function cleanupMCPConnections(): Promise<void>;
/**
 * Get current MCP connection status
 *
 * Returns status of all active MCP connections from the mcp-loader.
 */
export declare function getMCPConnectionStatus(): Array<{
    serverId: string;
    status: string;
    toolCount: number;
    error?: string;
}>;
declare const _default: {
    loadMCPToolsForPersona: typeof loadMCPToolsForPersona;
    buildMCPTools: typeof buildMCPTools;
    initializeMCPConnections: typeof initializeMCPConnections;
    cleanupMCPConnections: typeof cleanupMCPConnections;
    getMCPConnectionStatus: typeof getMCPConnectionStatus;
};
export default _default;
export { connectToMCPServer, disconnectFromMCPServer, disconnectAllMCPServers, getMCPConnection, callMCPTool, };
//# sourceMappingURL=mcp-integration.d.ts.map