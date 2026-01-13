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
import { getLogger } from '../../utils/safe-logger.js';
import { connectToMCPServer, disconnectAllMCPServers, disconnectFromMCPServer, getMCPConfig, getMCPConnection, getAllMCPConnections, callMCPTool, } from './mcp-loader.js';
import { loadDeveloperMCPServers, } from '../../services/developer-mcp-registry.js';
const log = getLogger();
// ============================================================================
// API SERVER CONVERSION
// ============================================================================
/**
 * Convert API-registered MCPServerConfig to BundleMCPServer format
 *
 * This bridges the API format with the file-based format so both
 * can be processed by the same connection logic.
 */
function convertAPIServerToBundleFormat(apiServer) {
    return {
        id: apiServer.serverId || apiServer.name,
        name: apiServer.name,
        transport: apiServer.transport,
        command: apiServer.command,
        args: apiServer.args,
        url: apiServer.endpoint, // API uses 'endpoint', bundle uses 'url'
        env: apiServer.env,
        autoConnect: apiServer.autoConnect ?? true,
        timeout: apiServer.timeout,
    };
}
/**
 * Load API-registered MCP servers for a publisher/persona combination
 *
 * @param publisherId - Publisher ID (required for API servers)
 * @param personaId - Optional persona ID to filter by
 */
async function loadAPIServers(publisherId, personaId) {
    try {
        const apiServers = await loadDeveloperMCPServers(publisherId, personaId);
        if (apiServers.length === 0) {
            return [];
        }
        const bundleServers = apiServers.map(convertAPIServerToBundleFormat);
        log.info({ publisherId, personaId, count: bundleServers.length }, 'Loaded API-registered MCP servers');
        return bundleServers;
    }
    catch (error) {
        log.error({ publisherId, personaId, error: String(error) }, 'Failed to load API-registered MCP servers');
        return [];
    }
}
/**
 * Merge file-based and API-registered servers
 *
 * API servers can override file-based servers with the same name.
 * This allows developers to customize default configurations via API.
 */
function mergeServers(fileServers, apiServers) {
    const serverMap = new Map();
    // Add file servers first
    for (const server of fileServers) {
        serverMap.set(server.id, server);
    }
    // API servers override file-based
    for (const server of apiServers) {
        serverMap.set(server.id, server);
    }
    return Array.from(serverMap.values());
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
export async function loadMCPToolsForPersona(personaIdOrOptions, bundlePathDeprecated) {
    // Support both old signature (personaId, bundlePath) and new options object
    const options = typeof personaIdOrOptions === 'string'
        ? { personaId: personaIdOrOptions, bundlePath: bundlePathDeprecated }
        : personaIdOrOptions;
    const { personaId, bundlePath, publisherId } = options;
    try {
        // ================================================================
        // 1. Load file-based MCP config
        // ================================================================
        let fileConfig = null;
        if (bundlePath) {
            fileConfig = await getMCPConfig(bundlePath);
        }
        else {
            // Try to get bundle path from loader
            const { loadBundleById } = await import('./loader.js');
            const bundle = await loadBundleById(personaId);
            if (bundle?.bundlePath) {
                fileConfig = await getMCPConfig(bundle.bundlePath);
            }
        }
        const fileServers = fileConfig?.servers || [];
        // ================================================================
        // 2. Load API-registered servers (if publisherId provided)
        // ================================================================
        let apiServers = [];
        if (publisherId) {
            apiServers = await loadAPIServers(publisherId, personaId);
        }
        // ================================================================
        // 3. Merge servers (API servers can override file-based)
        // ================================================================
        const allServers = mergeServers(fileServers, apiServers);
        if (allServers.length === 0) {
            log.debug({ personaId }, 'No MCP servers configured');
            return [];
        }
        // Filter to auto-connect servers
        const autoConnectServers = allServers.filter((s) => s.autoConnect !== false);
        if (autoConnectServers.length === 0) {
            log.debug({ personaId }, 'No auto-connect MCP servers configured');
            return [];
        }
        // ================================================================
        // 4. Connect to servers and collect tools
        // ================================================================
        const tools = [];
        for (const server of autoConnectServers) {
            try {
                const connection = await connectToMCPServer(server);
                if (connection.status === 'connected' && connection.tools) {
                    for (const tool of connection.tools) {
                        tools.push({
                            name: `mcp_${server.id}_${tool.name}`,
                            description: tool.description || `MCP tool: ${tool.name}`,
                            inputSchema: tool.inputSchema,
                            serverId: server.id,
                            originalName: tool.name,
                        });
                    }
                    log.info({ personaId, serverId: server.id, toolCount: connection.tools.length }, 'MCP server tools loaded');
                }
                else if (connection.status === 'error') {
                    log.warn({ personaId, serverId: server.id, error: connection.error }, 'MCP server connection failed, skipping');
                }
            }
            catch (error) {
                log.error({ personaId, serverId: server.id, error: String(error) }, 'Failed to connect to MCP server');
            }
        }
        log.info({
            personaId,
            totalTools: tools.length,
            fileServers: fileServers.length,
            apiServers: apiServers.length,
            connectedServers: autoConnectServers.length,
        }, 'MCP tools loaded for persona');
        return tools;
    }
    catch (error) {
        log.error({ personaId, error: String(error) }, 'Failed to load MCP tools');
        return [];
    }
}
/**
 * Build LiveKit-compatible tools from MCP tool definitions
 *
 * This creates llm.tool() instances that delegate to MCP servers
 */
export async function buildMCPTools(personaIdOrOptions, bundlePathDeprecated) {
    // Extract personaId for logging
    const personaId = typeof personaIdOrOptions === 'string'
        ? personaIdOrOptions
        : personaIdOrOptions.personaId;
    const mcpToolDefs = await loadMCPToolsForPersona(personaIdOrOptions, bundlePathDeprecated);
    if (mcpToolDefs.length === 0) {
        return {};
    }
    try {
        const { llm } = await import('@livekit/agents');
        const { z } = await import('zod');
        const tools = {};
        for (const toolDef of mcpToolDefs) {
            // Create a generic parameter schema that accepts any object
            // The MCP server handles validation based on inputSchema
            const paramSchema = z.object({}).passthrough();
            tools[toolDef.name] = llm.tool({
                description: toolDef.description,
                parameters: paramSchema,
                execute: async (params) => {
                    try {
                        const result = await callMCPTool(toolDef.serverId, toolDef.originalName, params);
                        // Return result as string for the LLM
                        if (typeof result === 'string') {
                            return result;
                        }
                        return JSON.stringify(result);
                    }
                    catch (error) {
                        log.error({
                            serverId: toolDef.serverId,
                            toolName: toolDef.originalName,
                            error: String(error),
                        }, 'MCP tool execution failed');
                        return `I encountered an issue while using this tool. Let me try a different approach.`;
                    }
                },
            });
        }
        log.info({ personaId, mcpToolCount: Object.keys(tools).length }, 'MCP tools built for persona');
        return tools;
    }
    catch (error) {
        log.error({ personaId, error: String(error) }, 'Failed to build MCP tools');
        return {};
    }
}
// ============================================================================
// CONNECTION LIFECYCLE MANAGEMENT
// ============================================================================
/**
 * Initialize MCP connections for a persona
 *
 * Call this when a session starts to connect to all auto-connect servers.
 * Supports both file-based and API-registered MCP servers.
 */
export async function initializeMCPConnections(personaIdOrOptions, bundlePathDeprecated) {
    // Support both old signature and new options object
    const options = typeof personaIdOrOptions === 'string'
        ? { personaId: personaIdOrOptions, bundlePath: bundlePathDeprecated }
        : personaIdOrOptions;
    const { personaId, bundlePath, publisherId } = options;
    const result = { connected: [], failed: [] };
    try {
        // ================================================================
        // 1. Load file-based MCP config
        // ================================================================
        let fileConfig = null;
        if (bundlePath) {
            fileConfig = await getMCPConfig(bundlePath);
        }
        else {
            const { loadBundleById } = await import('./loader.js');
            const bundle = await loadBundleById(personaId);
            if (bundle?.bundlePath) {
                fileConfig = await getMCPConfig(bundle.bundlePath);
            }
        }
        const fileServers = fileConfig?.servers || [];
        // ================================================================
        // 2. Load API-registered servers (if publisherId provided)
        // ================================================================
        let apiServers = [];
        if (publisherId) {
            apiServers = await loadAPIServers(publisherId, personaId);
        }
        // ================================================================
        // 3. Merge and filter auto-connect servers
        // ================================================================
        const allServers = mergeServers(fileServers, apiServers);
        const autoConnectServers = allServers.filter((s) => s.autoConnect !== false);
        if (autoConnectServers.length === 0) {
            return result;
        }
        // ================================================================
        // 4. Connect to servers
        // ================================================================
        for (const server of autoConnectServers) {
            try {
                const connection = await connectToMCPServer(server);
                if (connection.status === 'connected') {
                    result.connected.push(server.id);
                }
                else {
                    result.failed.push(server.id);
                }
            }
            catch {
                result.failed.push(server.id);
            }
        }
        log.info({
            personaId,
            connected: result.connected.length,
            failed: result.failed.length,
            fileServers: fileServers.length,
            apiServers: apiServers.length,
        }, 'MCP connections initialized');
    }
    catch (error) {
        log.error({ personaId, error: String(error) }, 'Failed to initialize MCP connections');
    }
    return result;
}
/**
 * Cleanup MCP connections
 *
 * Call this when a session ends or when switching personas
 */
export async function cleanupMCPConnections() {
    try {
        await disconnectAllMCPServers();
        log.info('MCP connections cleaned up');
    }
    catch (error) {
        log.error({ error: String(error) }, 'Error cleaning up MCP connections');
    }
}
/**
 * Get current MCP connection status
 *
 * Returns status of all active MCP connections from the mcp-loader.
 */
export function getMCPConnectionStatus() {
    try {
        const connections = getAllMCPConnections();
        return connections.map((conn) => ({
            serverId: conn.serverId,
            status: conn.status,
            toolCount: conn.tools?.length ?? 0,
            error: conn.error,
        }));
    }
    catch (error) {
        log.warn({ error: String(error) }, 'Error getting MCP connection status');
        return [];
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    loadMCPToolsForPersona,
    buildMCPTools,
    initializeMCPConnections,
    cleanupMCPConnections,
    getMCPConnectionStatus,
};
// Re-export MCP loader functions for convenience
export { connectToMCPServer, disconnectFromMCPServer, disconnectAllMCPServers, getMCPConnection, callMCPTool, };
//# sourceMappingURL=mcp-integration.js.map