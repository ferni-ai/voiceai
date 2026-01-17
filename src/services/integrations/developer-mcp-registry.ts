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

import { getLogger } from '../../utils/safe-logger.js';
import { COLLECTIONS, type DeveloperMCPServer } from '../../types/developer-platform.js';
import { decryptSensitive } from '../identity/privacy-crypto.js';

const log = getLogger().child({ module: 'developer-mcp-registry' });

// ============================================================================
// TYPES
// ============================================================================

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
  // Metadata for tracking
  source: 'file' | 'api';
  serverId?: string;
  publisherId?: string;
}

/** Cache entry for loaded servers */
interface CacheEntry {
  servers: MCPServerConfig[];
  loadedAt: number;
  expiresAt: number;
}

// ============================================================================
// CACHE
// ============================================================================

/** In-memory cache for loaded servers (TTL: 5 minutes) */
const serverCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generate cache key for a publisher/persona combination
 */
function getCacheKey(publisherId: string, personaId?: string): string {
  return personaId ? `${publisherId}:${personaId}` : publisherId;
}

/**
 * Get cached servers if still valid
 */
function getCachedServers(publisherId: string, personaId?: string): MCPServerConfig[] | null {
  const key = getCacheKey(publisherId, personaId);
  const entry = serverCache.get(key);

  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    serverCache.delete(key);
    return null;
  }

  return entry.servers;
}

/**
 * Cache servers for a publisher/persona
 */
function cacheServers(
  publisherId: string,
  personaId: string | undefined,
  servers: MCPServerConfig[]
): void {
  const key = getCacheKey(publisherId, personaId);
  const now = Date.now();

  serverCache.set(key, {
    servers,
    loadedAt: now,
    expiresAt: now + CACHE_TTL_MS,
  });
}

/**
 * Clear cache for a publisher (called when servers are updated via API)
 */
export function clearServerCache(publisherId: string, personaId?: string): void {
  if (personaId) {
    serverCache.delete(getCacheKey(publisherId, personaId));
  } else {
    // Clear all entries for this publisher
    for (const key of serverCache.keys()) {
      if (key.startsWith(publisherId)) {
        serverCache.delete(key);
      }
    }
  }
  log.debug({ publisherId, personaId }, 'Cleared MCP server cache');
}

// ============================================================================
// MAIN API
// ============================================================================

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
export async function loadDeveloperMCPServers(
  publisherId: string,
  personaId?: string
): Promise<MCPServerConfig[]> {
  // Check cache first
  const cached = getCachedServers(publisherId, personaId);
  if (cached) {
    log.debug({ publisherId, personaId, count: cached.length }, 'Returning cached MCP servers');
    return cached;
  }

  try {
    // Lazy import Firestore to avoid circular deps
    const { getFirestore } = await import('../../api/v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Build query - get enabled servers for this publisher
    const query = db
      .collection(COLLECTIONS.MCP_SERVERS)
      .where('publisherId', '==', publisherId)
      .where('enabled', '==', true);

    // If personaId specified, also include persona-specific servers
    // Otherwise get all publisher servers (personaId = null OR matches)
    const snapshot = await query.get();

    const servers: MCPServerConfig[] = [];

    for (const doc of snapshot.docs) {
      const data = doc.data() as Record<string, unknown>;

      // Skip if persona-specific and doesn't match
      const serverPersonaId = data.personaId as string | undefined;
      if (serverPersonaId && personaId && serverPersonaId !== personaId) {
        continue;
      }

      // Convert to MCPServerConfig format (async - decrypts secrets)
      const config = await developerServerToConfig(doc.id, data);
      servers.push(config);
    }

    // Cache the results
    cacheServers(publisherId, personaId, servers);

    log.info({ publisherId, personaId, count: servers.length }, 'Loaded developer MCP servers');

    return servers;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error(
      { error: err.message, publisherId, personaId },
      'Failed to load developer MCP servers'
    );
    return [];
  }
}

/**
 * Get a single MCP server by ID (for connection testing)
 */
export async function getDeveloperMCPServer(
  serverId: string,
  publisherId: string
): Promise<MCPServerConfig | null> {
  try {
    const { getFirestore } = await import('../../api/v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    const doc = await db.collection(COLLECTIONS.MCP_SERVERS).doc(serverId).get();

    if (!doc.exists) return null;

    const data = doc.data() as Record<string, unknown>;

    // Verify ownership
    if (data.publisherId !== publisherId) return null;

    return await developerServerToConfig(doc.id, data);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, serverId }, 'Failed to get developer MCP server');
    return null;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Convert Firestore document to MCPServerConfig format
 * Decrypts secrets using AES-256-GCM before returning
 */
async function developerServerToConfig(
  id: string,
  data: Record<string, unknown>
): Promise<MCPServerConfig> {
  const config: MCPServerConfig = {
    name: data.name as string,
    transport: data.transport as 'stdio' | 'http' | 'websocket',
    source: 'api',
    serverId: id,
    publisherId: data.publisherId as string,
  };

  // Transport-specific config
  if (data.command) config.command = data.command as string;
  if (data.args) config.args = data.args as string[];
  if (data.endpoint) config.endpoint = data.endpoint as string;
  if (data.headers) config.headers = data.headers as Record<string, string>;

  // Convert secrets to env vars - DECRYPT them first!
  const secrets = data.secrets as Record<string, string> | undefined;
  if (secrets && Object.keys(secrets).length > 0) {
    config.env = await decryptSecrets(secrets);
  }

  // Behavior
  if (typeof data.autoConnect === 'boolean') config.autoConnect = data.autoConnect;
  if (typeof data.timeout === 'number') config.timeout = data.timeout;

  return config;
}

/**
 * Decrypt all secrets in a secrets object
 * Handles both encrypted (enc_ prefix) and legacy unencrypted secrets
 */
async function decryptSecrets(secrets: Record<string, string>): Promise<Record<string, string>> {
  const decrypted: Record<string, string> = {};

  for (const [key, value] of Object.entries(secrets)) {
    try {
      if (value.startsWith('enc_')) {
        decrypted[key] = await decryptSensitive<string>(value);
      } else {
        // Legacy unencrypted secret - warn and use as-is
        log.warn({ key }, 'Using legacy unencrypted MCP secret - consider re-registering');
        decrypted[key] = value;
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error({ key, error: err.message }, 'Failed to decrypt MCP secret');
      // Skip this secret rather than fail entirely
    }
  }

  return decrypted;
}

/**
 * Convert DeveloperMCPServer type to MCPServerConfig
 * (for use when you already have the full server object)
 */
export function serverToConfig(server: DeveloperMCPServer): MCPServerConfig {
  const config: MCPServerConfig = {
    name: server.name,
    transport: server.transport,
    source: 'api',
    serverId: server.id,
    publisherId: server.publisherId,
  };

  if (server.command) config.command = server.command;
  if (server.args) config.args = server.args;
  if (server.endpoint) config.endpoint = server.endpoint;
  if (server.headers) config.headers = server.headers;
  if (server.secrets) config.env = server.secrets;
  if (server.autoConnect !== undefined) config.autoConnect = server.autoConnect;
  if (server.timeout) config.timeout = server.timeout;

  return config;
}

// ============================================================================
// INTEGRATION WITH MCP LOADER
// ============================================================================

/**
 * Merge file-based and API-registered MCP servers
 *
 * API servers take precedence (can override file-based by name)
 *
 * @param fileServers - Servers from persona bundle files
 * @param apiServers - Servers registered via API
 * @returns Merged server list
 */
export function mergeMCPServers(
  fileServers: MCPServerConfig[],
  apiServers: MCPServerConfig[]
): MCPServerConfig[] {
  // Create map with file servers first
  const serverMap = new Map<string, MCPServerConfig>();

  for (const server of fileServers) {
    serverMap.set(server.name, { ...server, source: 'file' });
  }

  // API servers override file-based
  for (const server of apiServers) {
    serverMap.set(server.name, server);
  }

  return Array.from(serverMap.values());
}

// ============================================================================
// STATS
// ============================================================================

/**
 * Get cache stats for monitoring
 */
export function getCacheStats(): {
  entryCount: number;
  totalServers: number;
  oldestEntry: number | null;
} {
  let totalServers = 0;
  let oldestEntry: number | null = null;

  for (const entry of serverCache.values()) {
    totalServers += entry.servers.length;
    if (oldestEntry === null || entry.loadedAt < oldestEntry) {
      oldestEntry = entry.loadedAt;
    }
  }

  return {
    entryCount: serverCache.size,
    totalServers,
    oldestEntry,
  };
}
