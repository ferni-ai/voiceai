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
import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { getLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { COLLECTIONS } from '../../types/developer-platform.js';
import { decryptSensitive } from '../../services/privacy-crypto.js';
const log = getLogger();
// ============================================================================
// MCP LOADER
// ============================================================================
/**
 * Load API-registered MCP servers from Firestore
 *
 * Fetches enabled servers for a publisher, optionally filtered by persona.
 */
export async function loadAPIRegisteredServers(publisherId, personaId) {
    try {
        const db = getFirestoreDb();
        if (!db) {
            log.warn('Firestore not available, skipping API-registered servers');
            return [];
        }
        let query = db
            .collection(COLLECTIONS.MCP_SERVERS)
            .where('publisherId', '==', publisherId)
            .where('enabled', '==', true)
            .where('status', '==', 'active');
        // If personaId provided, filter to that persona or global (no personaId)
        // We need to make two queries since Firestore doesn't support OR
        const servers = [];
        // Query 1: Servers for this specific persona
        if (personaId) {
            const personaSnapshot = await query.where('personaId', '==', personaId).get();
            for (const doc of personaSnapshot.docs) {
                const server = await convertApiServerToBundleServer(doc.data());
                if (server)
                    servers.push(server);
            }
        }
        // Query 2: Global servers (no personaId set)
        // Use a separate query without the personaId filter
        const globalQuery = db
            .collection(COLLECTIONS.MCP_SERVERS)
            .where('publisherId', '==', publisherId)
            .where('enabled', '==', true)
            .where('status', '==', 'active');
        const globalSnapshot = await globalQuery.get();
        for (const doc of globalSnapshot.docs) {
            const data = doc.data();
            // Only include servers without personaId (global)
            if (!data.personaId) {
                const server = await convertApiServerToBundleServer(data);
                if (server)
                    servers.push(server);
            }
        }
        log.info({ publisherId, personaId, serverCount: servers.length }, 'Loaded API-registered MCP servers');
        return servers;
    }
    catch (error) {
        log.error({ error, publisherId, personaId }, 'Failed to load API-registered MCP servers');
        return [];
    }
}
/**
 * Decrypt secrets from Firestore storage
 *
 * Secrets are stored encrypted with 'enc_' prefix.
 * This function decrypts them for use in MCP server connections.
 */
async function decryptSecrets(secrets) {
    const decrypted = {};
    for (const [key, value] of Object.entries(secrets)) {
        try {
            // Check if value is encrypted (has enc_ prefix)
            if (value.startsWith('enc_')) {
                decrypted[key] = await decryptSensitive(value);
            }
            else {
                // Handle legacy unencrypted values
                decrypted[key] = value;
            }
        }
        catch (error) {
            log.error({ key, error: String(error) }, 'Failed to decrypt MCP server secret');
            // Skip failed secrets rather than fail entire server
        }
    }
    return decrypted;
}
/**
 * Convert API DeveloperMCPServer to BundleMCPServer format
 *
 * Decrypts secrets for use in MCP server connections.
 */
async function convertApiServerToBundleServer(apiServer) {
    try {
        const bundleServer = {
            id: apiServer.id,
            name: apiServer.name,
            transport: apiServer.transport,
            autoConnect: apiServer.autoConnect,
        };
        // Transport-specific config
        if (apiServer.transport === 'stdio') {
            if (!apiServer.command) {
                log.warn({ serverId: apiServer.id }, 'API MCP server missing command for stdio transport');
                return null;
            }
            bundleServer.command = apiServer.command;
            bundleServer.args = apiServer.args;
        }
        else if (apiServer.transport === 'http' || apiServer.transport === 'websocket') {
            if (!apiServer.endpoint) {
                log.warn({ serverId: apiServer.id }, 'API MCP server missing endpoint for http transport');
                return null;
            }
            bundleServer.url = apiServer.endpoint;
            // Note: BundleMCPServer doesn't support headers directly,
            // API headers will be handled at connection time
        }
        // Decrypt and add env from secrets
        if (apiServer.secrets && Object.keys(apiServer.secrets).length > 0) {
            bundleServer.env = await decryptSecrets(apiServer.secrets);
        }
        // Add timeout
        if (apiServer.timeout) {
            bundleServer.timeout = apiServer.timeout;
        }
        return bundleServer;
    }
    catch (error) {
        log.error({ error, serverId: apiServer.id }, 'Failed to convert API MCP server');
        return null;
    }
}
/**
 * Load MCP configuration from file and API sources
 *
 * @param bundlePath - Path to persona bundle directory (for file-based config)
 * @param publisherId - Optional publisher ID (for API-registered servers)
 * @param personaId - Optional persona ID (to filter API servers)
 */
export async function loadMCPConfig(bundlePath, publisherId, personaId) {
    const allServers = [];
    // 1. Load file-based config
    try {
        const mcpPath = join(bundlePath, 'mcp.json');
        const mcpStat = await stat(mcpPath).catch(() => null);
        if (mcpStat?.isFile()) {
            const content = await readFile(mcpPath, 'utf-8');
            const config = JSON.parse(content);
            if (config.servers && Array.isArray(config.servers)) {
                for (const server of config.servers) {
                    if (!server.id || !server.transport) {
                        log.warn({ server }, 'Invalid MCP server: missing id or transport');
                        continue;
                    }
                    const validTransports = ['stdio', 'http', 'websocket'];
                    if (!validTransports.includes(server.transport)) {
                        log.warn({ server }, 'Invalid MCP server: unknown transport');
                        continue;
                    }
                    if (server.transport === 'stdio' && !server.command) {
                        log.warn({ server }, 'Invalid MCP server: stdio transport requires command');
                        continue;
                    }
                    if ((server.transport === 'http' || server.transport === 'websocket') && !server.url) {
                        log.warn({ server }, 'Invalid MCP server: http/websocket transport requires url');
                        continue;
                    }
                    allServers.push(server);
                }
                log.debug({ bundlePath, serverCount: allServers.length }, 'Loaded file-based MCP config');
            }
        }
    }
    catch (error) {
        log.error({ error, bundlePath }, 'Failed to load file-based MCP config');
    }
    // 2. Load API-registered servers (if publisherId provided)
    if (publisherId) {
        const apiServers = await loadAPIRegisteredServers(publisherId, personaId);
        // Merge, avoiding duplicate IDs (file-based takes precedence)
        const existingIds = new Set(allServers.map((s) => s.id));
        for (const apiServer of apiServers) {
            if (!existingIds.has(apiServer.id)) {
                allServers.push(apiServer);
                existingIds.add(apiServer.id);
            }
            else {
                log.debug({ serverId: apiServer.id }, 'Skipping API server - ID already exists in file config');
            }
        }
        log.debug({ publisherId, totalServers: allServers.length }, 'Merged file and API MCP servers');
    }
    if (allServers.length === 0) {
        return null;
    }
    log.info({ bundlePath, publisherId, serverCount: allServers.length }, 'Loaded MCP configuration');
    return { servers: allServers };
}
// ============================================================================
// MCP CONFIG CACHE
// ============================================================================
const mcpConfigCache = new Map();
/**
 * Get MCP config for a bundle (with caching)
 *
 * @param bundlePath - Path to the persona bundle
 * @param options - Optional settings
 * @param options.publisherId - Publisher ID for loading API-registered servers
 * @param options.personaId - Persona ID for filtering API-registered servers
 * @param options.forceReload - Force reload from disk/API, ignoring cache
 */
export async function getMCPConfig(bundlePath, options = {}) {
    const { publisherId, personaId, forceReload = false } = options;
    // Cache key includes publisherId to separate cached results
    const cacheKey = publisherId ? `${bundlePath}:${publisherId}` : bundlePath;
    if (!forceReload && mcpConfigCache.has(cacheKey)) {
        return mcpConfigCache.get(cacheKey) ?? null;
    }
    const config = await loadMCPConfig(bundlePath, publisherId, personaId);
    mcpConfigCache.set(cacheKey, config);
    return config;
}
/**
 * Clear MCP config cache for a bundle
 */
export function clearMCPConfigCache(bundlePath) {
    if (bundlePath) {
        mcpConfigCache.delete(bundlePath);
    }
    else {
        mcpConfigCache.clear();
    }
}
// ============================================================================
// MCP CONNECTION HELPERS
// ============================================================================
/**
 * Get servers that should auto-connect
 */
export function getAutoConnectServers(config) {
    if (!config)
        return [];
    return config.servers.filter((s) => s.autoConnect !== false);
}
/**
 * Find a server by ID
 */
export function findServer(config, serverId) {
    if (!config)
        return null;
    return config.servers.find((s) => s.id === serverId) || null;
}
/**
 * Get all server IDs
 */
export function getServerIds(config) {
    if (!config)
        return [];
    return config.servers.map((s) => s.id);
}
/**
 * Active MCP connections by server ID
 */
const activeConnections = new Map();
/**
 * Connect to an MCP server using the Model Context Protocol SDK
 *
 * Supports:
 * - stdio: Spawns a child process running the MCP server
 * - http/websocket: Connects via SSE transport
 */
export async function connectToMCPServer(server) {
    log.info({ serverId: server.id, transport: server.transport }, 'Connecting to MCP server');
    // Check if already connected
    if (activeConnections.has(server.id)) {
        const existing = activeConnections.get(server.id);
        if (existing.status === 'connected') {
            log.debug({ serverId: server.id }, 'Already connected to MCP server');
            return existing;
        }
    }
    const connection = {
        serverId: server.id,
        status: 'connecting',
    };
    try {
        let transport;
        if (server.transport === 'stdio') {
            // Create stdio transport for local process
            if (!server.command) {
                throw new Error('stdio transport requires command');
            }
            // Build env with only defined values
            let envRecord = undefined;
            if (server.env) {
                envRecord = { ...server.env };
                // Also include relevant process.env vars, filtering out undefined
                for (const [key, value] of Object.entries(process.env)) {
                    if (value !== undefined && !(key in envRecord)) {
                        envRecord[key] = value;
                    }
                }
            }
            transport = new StdioClientTransport({
                command: server.command,
                args: server.args || [],
                env: envRecord,
            });
        }
        else if (server.transport === 'http' || server.transport === 'websocket') {
            // Create SSE transport for HTTP/WebSocket
            if (!server.url) {
                throw new Error('http/websocket transport requires url');
            }
            // SSE transport uses URL constructor
            transport = new SSEClientTransport(new URL(server.url));
        }
        else {
            throw new Error(`Unsupported transport: ${server.transport}`);
        }
        // Create MCP client
        const client = new Client({
            name: `ferni-agent-${server.id}`,
            version: '1.0.0',
        }, {
            capabilities: {},
        });
        // Connect to the server
        await client.connect(transport);
        // List available tools
        const toolsResult = await client.listTools();
        const tools = toolsResult.tools.map((t) => ({
            name: t.name,
            description: t.description || '',
            inputSchema: t.inputSchema,
        }));
        connection.status = 'connected';
        connection.client = client;
        connection.transport = transport;
        connection.tools = tools;
        activeConnections.set(server.id, connection);
        log.info({ serverId: server.id, toolCount: tools.length }, 'Connected to MCP server');
        return connection;
    }
    catch (error) {
        connection.status = 'error';
        connection.error = error instanceof Error ? error.message : String(error);
        log.error({ serverId: server.id, error: connection.error }, 'Failed to connect to MCP server');
        activeConnections.set(server.id, connection);
        return connection;
    }
}
/**
 * Disconnect from an MCP server
 */
export async function disconnectFromMCPServer(serverId) {
    log.info({ serverId }, 'Disconnecting from MCP server');
    const connection = activeConnections.get(serverId);
    if (!connection) {
        log.debug({ serverId }, 'No active connection to disconnect');
        return;
    }
    try {
        if (connection.client) {
            await connection.client.close();
        }
    }
    catch (error) {
        log.error({ serverId, error: String(error) }, 'Error closing MCP connection');
    }
    activeConnections.delete(serverId);
    log.info({ serverId }, 'Disconnected from MCP server');
}
/**
 * Disconnect all MCP servers
 */
export async function disconnectAllMCPServers() {
    const serverIds = Array.from(activeConnections.keys());
    await Promise.all(serverIds.map((id) => disconnectFromMCPServer(id)));
}
/**
 * Get an active MCP connection
 */
export function getMCPConnection(serverId) {
    return activeConnections.get(serverId) || null;
}
/**
 * Get all active MCP connections
 */
export function getAllMCPConnections() {
    return Array.from(activeConnections.values());
}
/**
 * List tools available on an MCP server
 */
export async function listMCPTools(serverId) {
    const connection = activeConnections.get(serverId);
    if (!connection || connection.status !== 'connected' || !connection.client) {
        return [];
    }
    try {
        const result = await connection.client.listTools();
        return result.tools.map((t) => ({
            name: t.name,
            description: t.description || '',
            inputSchema: t.inputSchema,
        }));
    }
    catch (error) {
        log.error({ serverId, error: String(error) }, 'Failed to list MCP tools');
        return [];
    }
}
/**
 * Call a tool on an MCP server
 */
export async function callMCPTool(serverId, toolName, params) {
    log.info({ serverId, toolName }, 'Calling MCP tool');
    const connection = activeConnections.get(serverId);
    if (!connection || connection.status !== 'connected' || !connection.client) {
        throw new Error(`MCP server not connected: ${serverId}`);
    }
    try {
        const result = await connection.client.callTool({
            name: toolName,
            arguments: params,
        });
        log.info({ serverId, toolName }, 'MCP tool call completed');
        // Return the content from the result
        if (result.content && Array.isArray(result.content)) {
            // MCP returns content as an array of content blocks
            const textBlocks = result.content.filter((c) => c.type === 'text');
            if (textBlocks.length === 1) {
                return textBlocks[0].text;
            }
            return textBlocks.map((b) => b.text).join('\n');
        }
        return result;
    }
    catch (error) {
        log.error({ serverId, toolName, error: String(error) }, 'MCP tool call failed');
        throw error;
    }
}
export default {
    loadMCPConfig,
    getMCPConfig,
    clearMCPConfigCache,
    getAutoConnectServers,
    findServer,
    getServerIds,
    connectToMCPServer,
    disconnectFromMCPServer,
    disconnectAllMCPServers,
    getMCPConnection,
    getAllMCPConnections,
    listMCPTools,
    callMCPTool,
};
//# sourceMappingURL=mcp-loader.js.map