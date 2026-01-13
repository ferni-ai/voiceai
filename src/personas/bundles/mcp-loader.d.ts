/**
 * Agent MCP Configuration Loader
 *
 * Loads MCP (Model Context Protocol) server configurations from both:
 * 1. File-based config (mcp.json in persona bundles)
 * 2. API-registered servers (Firestore developer_mcp_servers collection)
 *
 * MCP allows agents to connect to external tool servers for
 * extended functionality without bundling tools directly.
 *
 * File-based configuration in mcp.json:
 * ```json
 * {
 *   "servers": [
 *     {
 *       "id": "my-tools",
 *       "name": "My Custom Tools",
 *       "transport": "stdio",
 *       "command": "node",
 *       "args": ["./mcp-server.js"],
 *       "autoConnect": true
 *     },
 *     {
 *       "id": "external-api",
 *       "name": "External API Server",
 *       "transport": "http",
 *       "url": "https://api.example.com/mcp",
 *       "timeout": 30000
 *     }
 *   ]
 * }
 * ```
 *
 * API-registered servers are loaded from Firestore and merged with file-based config.
 *
 * @module personas/bundles/mcp-loader
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { BundleMCPConfig, BundleMCPServer } from './types/commands.js';
/**
 * Load API-registered MCP servers from Firestore
 *
 * Fetches enabled servers for a publisher, optionally filtered by persona.
 */
export declare function loadAPIRegisteredServers(publisherId: string, personaId?: string): Promise<BundleMCPServer[]>;
/**
 * Load MCP configuration from file and API sources
 *
 * @param bundlePath - Path to persona bundle directory (for file-based config)
 * @param publisherId - Optional publisher ID (for API-registered servers)
 * @param personaId - Optional persona ID (to filter API servers)
 */
export declare function loadMCPConfig(bundlePath: string, publisherId?: string, personaId?: string): Promise<BundleMCPConfig | null>;
/**
 * Get MCP config for a bundle (with caching)
 *
 * @param bundlePath - Path to the persona bundle
 * @param options - Optional settings
 * @param options.publisherId - Publisher ID for loading API-registered servers
 * @param options.personaId - Persona ID for filtering API-registered servers
 * @param options.forceReload - Force reload from disk/API, ignoring cache
 */
export declare function getMCPConfig(bundlePath: string, options?: {
    publisherId?: string;
    personaId?: string;
    forceReload?: boolean;
}): Promise<BundleMCPConfig | null>;
/**
 * Clear MCP config cache for a bundle
 */
export declare function clearMCPConfigCache(bundlePath?: string): void;
/**
 * Get servers that should auto-connect
 */
export declare function getAutoConnectServers(config: BundleMCPConfig | null): BundleMCPServer[];
/**
 * Find a server by ID
 */
export declare function findServer(config: BundleMCPConfig | null, serverId: string): BundleMCPServer | null;
/**
 * Get all server IDs
 */
export declare function getServerIds(config: BundleMCPConfig | null): string[];
export interface MCPConnection {
    serverId: string;
    status: 'connecting' | 'connected' | 'disconnected' | 'error';
    tools?: Array<{
        name: string;
        description: string;
        inputSchema?: unknown;
    }>;
    error?: string;
    client?: Client;
    transport?: StdioClientTransport | SSEClientTransport;
}
/**
 * Connect to an MCP server using the Model Context Protocol SDK
 *
 * Supports:
 * - stdio: Spawns a child process running the MCP server
 * - http/websocket: Connects via SSE transport
 */
export declare function connectToMCPServer(server: BundleMCPServer): Promise<MCPConnection>;
/**
 * Disconnect from an MCP server
 */
export declare function disconnectFromMCPServer(serverId: string): Promise<void>;
/**
 * Disconnect all MCP servers
 */
export declare function disconnectAllMCPServers(): Promise<void>;
/**
 * Get an active MCP connection
 */
export declare function getMCPConnection(serverId: string): MCPConnection | null;
/**
 * Get all active MCP connections
 */
export declare function getAllMCPConnections(): MCPConnection[];
/**
 * List tools available on an MCP server
 */
export declare function listMCPTools(serverId: string): Promise<Array<{
    name: string;
    description: string;
    inputSchema?: unknown;
}>>;
/**
 * Call a tool on an MCP server
 */
export declare function callMCPTool(serverId: string, toolName: string, params: Record<string, unknown>): Promise<unknown>;
declare const _default: {
    loadMCPConfig: typeof loadMCPConfig;
    getMCPConfig: typeof getMCPConfig;
    clearMCPConfigCache: typeof clearMCPConfigCache;
    getAutoConnectServers: typeof getAutoConnectServers;
    findServer: typeof findServer;
    getServerIds: typeof getServerIds;
    connectToMCPServer: typeof connectToMCPServer;
    disconnectFromMCPServer: typeof disconnectFromMCPServer;
    disconnectAllMCPServers: typeof disconnectAllMCPServers;
    getMCPConnection: typeof getMCPConnection;
    getAllMCPConnections: typeof getAllMCPConnections;
    listMCPTools: typeof listMCPTools;
    callMCPTool: typeof callMCPTool;
};
export default _default;
//# sourceMappingURL=mcp-loader.d.ts.map