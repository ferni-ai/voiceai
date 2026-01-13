/**
 * Developer MCP Registry Service
 *
 * Manages API-registered MCP servers and provides them to the agent system.
 * Bridges the gap between the developer API and the existing MCP loader.
 *
 * Usage:
 *   // Load servers for a session
 *   const servers = await loadDeveloperMCPServers(publisherId, personaId);
 *
 *   // Merge with file-based config
 *   const allServers = [...fileBasedServers, ...servers];
 *
 * @module services/developer-mcp-registry
 */
import { type DeveloperMCPServer } from '../types/developer-platform.js';
/** MCP server config format expected by mcp-loader.ts */
export interface MCPServerConfig {
    name: string;
    transport: 'stdio' | 'http' | 'websocket';
    command?: string;
    args?: string[];
    endpoint?: string;
    headers?: Record<string, string>;
    env?: Record<string, string>;
    autoConnect?: boolean;
    timeout?: number;
    source: 'file' | 'api';
    serverId?: string;
    publisherId?: string;
}
/**
 * Clear cache for a publisher (called when servers are updated via API)
 */
export declare function clearServerCache(publisherId: string, personaId?: string): void;
/**
 * Load developer-registered MCP servers for a session
 *
 * Returns servers in the format expected by mcp-loader.ts
 * Filters by enabled status and optionally by persona
 *
 * @param publisherId - Publisher ID to load servers for
 * @param personaId - Optional persona ID to filter by
 * @returns Array of MCP server configs
 */
export declare function loadDeveloperMCPServers(publisherId: string, personaId?: string): Promise<MCPServerConfig[]>;
/**
 * Get a single MCP server by ID (for connection testing)
 */
export declare function getDeveloperMCPServer(serverId: string, publisherId: string): Promise<MCPServerConfig | null>;
/**
 * Convert DeveloperMCPServer type to MCPServerConfig
 * (for use when you already have the full server object)
 */
export declare function serverToConfig(server: DeveloperMCPServer): MCPServerConfig;
/**
 * Merge file-based and API-registered MCP servers
 *
 * API servers take precedence (can override file-based by name)
 *
 * @param fileServers - Servers from persona bundle files
 * @param apiServers - Servers registered via API
 * @returns Merged server list
 */
export declare function mergeMCPServers(fileServers: MCPServerConfig[], apiServers: MCPServerConfig[]): MCPServerConfig[];
/**
 * Get cache stats for monitoring
 */
export declare function getCacheStats(): {
    entryCount: number;
    totalServers: number;
    oldestEntry: number | null;
};
//# sourceMappingURL=developer-mcp-registry.d.ts.map