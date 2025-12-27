/**
 * Marketplace Registry
 *
 * Central registry for marketplace agents and tools.
 * Handles manifest loading, validation, installation tracking.
 *
 * Storage:
 * - In development: In-memory Maps for fast iteration
 * - In production: Firestore for persistence across restarts
 */

import { getLogger } from '../utils/safe-logger.js';
import type {
  AgentManifest,
  Installation,
  MarketplaceId,
  MarketplaceListing,
  PermissionGrant,
  PermissionScope,
  TenantId,
  ToolExecution,
  ToolManifest,
  TrustLevel,
  UserId,
} from './schema/types.js';
import { getMarketplaceStore, type MarketplaceStore } from './persistence/index.js';
import { cleanForFirestore } from '../utils/firestore-utils.js';

const log = getLogger().child({ module: 'marketplace-registry' });

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum number of executions to keep in memory */
const MAX_CACHED_EXECUTIONS = 1000;

// ============================================================================
// HYBRID STORAGE (In-memory cache + Firestore persistence)
// ============================================================================

// In-memory cache for fast synchronous access
interface RegistryCache {
  tools: Map<MarketplaceId, ToolManifest>;
  agents: Map<MarketplaceId, AgentManifest>;
  installations: Map<string, Installation>;
  executions: ToolExecution[];
}

const cache: RegistryCache = {
  tools: new Map(),
  agents: new Map(),
  installations: new Map(),
  executions: [],
};

// Persistent store (lazy initialized)
let persistentStore: MarketplaceStore | null = null;
let storeInitialized = false;

/**
 * Get the persistent store (lazy init)
 */
async function getStore(): Promise<MarketplaceStore> {
  if (!persistentStore) {
    persistentStore = await getMarketplaceStore();
    storeInitialized = true;
  }
  return persistentStore;
}

// ============================================================================
// TOOL REGISTRY
// ============================================================================

/**
 * Register a tool manifest in the marketplace
 */
export function registerTool(manifest: ToolManifest): void {
  const existingVersion = cache.tools.get(manifest.id);
  if (existingVersion && existingVersion.version >= manifest.version) {
    log.warn(
      { toolId: manifest.id, version: manifest.version },
      'Tool already registered with same or newer version'
    );
    return;
  }

  // Update cache immediately (sync)
  cache.tools.set(manifest.id, manifest);
  log.info({ toolId: manifest.id, version: manifest.version }, 'Tool registered');

  // Persist to store (async, fire-and-forget)
  getStore()
    .then(async (store) => store.saveTool(manifest))
    .catch((err) =>
      log.warn({ toolId: manifest.id, error: String(err) }, 'Failed to persist tool')
    );
}

/**
 * Get a tool manifest by ID (sync, from cache)
 */
export function getTool(id: MarketplaceId): ToolManifest | undefined {
  return cache.tools.get(id);
}

/**
 * Get a tool manifest by ID (async, checks store if not in cache)
 */
export async function getToolAsync(id: MarketplaceId): Promise<ToolManifest | null> {
  // Check cache first
  const cached = cache.tools.get(id);
  if (cached) return cached;

  // Check persistent store
  const store = await getStore();
  const tool = await store.getTool(id);
  if (tool) {
    // Populate cache
    cache.tools.set(id, tool);
  }
  return tool;
}

/**
 * List all registered tools
 */
export function listTools(options?: {
  category?: string;
  trustLevel?: TrustLevel;
  tags?: string[];
}): ToolManifest[] {
  let tools = Array.from(cache.tools.values());

  if (options?.category) {
    tools = tools.filter((t) => t.metadata.category === options.category);
  }

  if (options?.trustLevel) {
    tools = tools.filter((t) => t.verification.trustLevel === options.trustLevel);
  }

  if (options?.tags?.length) {
    tools = tools.filter((t) => options.tags!.some((tag) => t.metadata.tags.includes(tag)));
  }

  return tools;
}

// ============================================================================
// AGENT REGISTRY
// ============================================================================

/**
 * Register an agent manifest in the marketplace
 */
export function registerAgent(manifest: AgentManifest): void {
  const existingVersion = cache.agents.get(manifest.id);
  if (existingVersion && existingVersion.version >= manifest.version) {
    log.warn(
      { agentId: manifest.id, version: manifest.version },
      'Agent already registered with same or newer version'
    );
    return;
  }

  // Update cache immediately (sync)
  cache.agents.set(manifest.id, manifest);
  log.info({ agentId: manifest.id, version: manifest.version }, 'Agent registered');

  // Persist to store (async, fire-and-forget)
  getStore()
    .then(async (store) => store.saveAgent(manifest))
    .catch((err) =>
      log.warn({ agentId: manifest.id, error: String(err) }, 'Failed to persist agent')
    );
}

/**
 * Get an agent manifest by ID (sync, from cache)
 */
export function getAgent(id: MarketplaceId): AgentManifest | undefined {
  return cache.agents.get(id);
}

/**
 * Get an agent manifest by ID (async, checks store if not in cache)
 */
export async function getAgentAsync(id: MarketplaceId): Promise<AgentManifest | null> {
  const cached = cache.agents.get(id);
  if (cached) return cached;

  const store = await getStore();
  const agent = await store.getAgent(id);
  if (agent) {
    cache.agents.set(id, agent);
  }
  return agent;
}

/**
 * List all registered agents
 */
export function listAgents(options?: {
  category?: string;
  trustLevel?: TrustLevel;
  tags?: string[];
}): AgentManifest[] {
  let agents = Array.from(cache.agents.values());

  if (options?.category) {
    agents = agents.filter((a) => a.metadata.category === options.category);
  }

  if (options?.trustLevel) {
    agents = agents.filter((a) => a.verification.trustLevel === options.trustLevel);
  }

  if (options?.tags?.length) {
    agents = agents.filter((a) => options.tags!.some((tag) => a.metadata.tags.includes(tag)));
  }

  return agents;
}

// ============================================================================
// INSTALLATION MANAGEMENT
// ============================================================================

/**
 * Install a marketplace item for a user
 */
export async function installItem(options: {
  itemType: 'agent' | 'tool';
  itemId: MarketplaceId;
  userId: UserId;
  tenantId?: TenantId;
  permissions: PermissionScope[];
}): Promise<Installation> {
  const { itemType, itemId, userId, tenantId, permissions } = options;

  // Verify item exists
  const manifest = itemType === 'tool' ? getTool(itemId) : getAgent(itemId);
  if (!manifest) {
    throw new Error(`${itemType} not found: ${itemId}`);
  }

  // Check required permissions are granted
  const requiredPerms = manifest.permissions.required.map((p) => p.scope);
  const missingPerms = requiredPerms.filter((p) => !permissions.includes(p));
  if (missingPerms.length > 0) {
    throw new Error(`Missing required permissions: ${missingPerms.join(', ')}`);
  }

  // Create installation record
  const installationId = `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const permissionGrants: PermissionGrant[] = permissions.map((scope) => ({
    scope,
    grantedAt: now,
    grantedBy: userId,
  }));

  const installation: Installation = {
    id: installationId,
    itemType,
    itemId,
    itemVersion: manifest.version,
    userId,
    // Only include tenantId if defined (Firestore rejects undefined values)
    ...(tenantId && { tenantId }),
    installedAt: now,
    installedBy: userId,
    installSource: 'marketplace',
    status: 'active',
    permissions: permissionGrants,
    usage: {
      totalExecutions: 0,
      totalExecutionTimeMs: 0,
      errorCount: 0,
    },
  };

  // Update cache
  cache.installations.set(installationId, installation);
  log.info({ installationId, itemType, itemId, userId }, 'Item installed');

  // Persist to store
  const store = await getStore();
  await store.saveInstallation(installation);

  return installation;
}

/**
 * Get installation for a user + item combination (sync, from cache)
 */
export function getInstallation(userId: UserId, itemId: MarketplaceId): Installation | undefined {
  return Array.from(cache.installations.values()).find(
    (i) => i.userId === userId && i.itemId === itemId && i.status === 'active'
  );
}

/**
 * Get installation for a user + item combination (async, checks store)
 */
export async function getInstallationAsync(
  userId: UserId,
  itemId: MarketplaceId
): Promise<Installation | null> {
  // Check cache first
  const cached = getInstallation(userId, itemId);
  if (cached) return cached;

  // Check persistent store
  const store = await getStore();
  const installation = await store.getInstallationByUserItem(userId, itemId);
  if (installation) {
    cache.installations.set(installation.id, installation);
  }
  return installation;
}

/**
 * List all installations for a user (sync, from cache)
 */
export function listInstallations(
  userId: UserId,
  options?: { itemType?: 'agent' | 'tool' }
): Installation[] {
  let installations = Array.from(cache.installations.values()).filter(
    (i) => i.userId === userId && i.status === 'active'
  );

  if (options?.itemType) {
    installations = installations.filter((i) => i.itemType === options.itemType);
  }

  return installations;
}

/**
 * Check if user has permission for a scope
 */
export function hasPermission(
  userId: UserId,
  itemId: MarketplaceId,
  scope: PermissionScope
): boolean {
  const installation = getInstallation(userId, itemId);
  if (!installation) return false;

  const grant = installation.permissions.find((p) => p.scope === scope);
  if (!grant) return false;

  // Check expiration
  if (grant.expiresAt && new Date(grant.expiresAt) < new Date()) {
    return false;
  }

  return true;
}

/**
 * Uninstall an item
 */
export async function uninstallItem(installationId: string): Promise<void> {
  const installation = cache.installations.get(installationId);
  if (!installation) {
    throw new Error(`Installation not found: ${installationId}`);
  }

  installation.status = 'uninstalled';
  installation.statusChangedAt = new Date().toISOString();

  // Update persistent store
  const store = await getStore();
  await store.updateInstallation(installationId, {
    status: 'uninstalled',
    statusChangedAt: installation.statusChangedAt,
  });

  log.info({ installationId, itemId: installation.itemId }, 'Item uninstalled');
}

// ============================================================================
// EXECUTION TRACKING
// ============================================================================

/**
 * Record a tool execution for auditing
 */
export function recordExecution(execution: Omit<ToolExecution, 'id'>): ToolExecution {
  const fullExecution: ToolExecution = {
    ...execution,
    id: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };

  // Update cache with size limit to prevent unbounded memory growth
  cache.executions.push(fullExecution);
  if (cache.executions.length > MAX_CACHED_EXECUTIONS) {
    // Keep most recent executions, drop oldest
    cache.executions = cache.executions.slice(-MAX_CACHED_EXECUTIONS);
  }

  // Update installation usage in cache
  const installation = getInstallation(execution.userId, execution.toolId);
  if (installation) {
    installation.usage.totalExecutions++;
    installation.usage.totalExecutionTimeMs += execution.durationMs;
    installation.usage.lastUsedAt = execution.executedAt;

    if (execution.status !== 'success') {
      installation.usage.errorCount++;
      installation.usage.lastError = {
        code: execution.errorCode || 'UNKNOWN',
        message: execution.errorMessage || 'Unknown error',
        occurredAt: execution.executedAt,
      };
    }

    // Persist installation usage update (fire-and-forget)
    getStore()
      .then(async (store) =>
        store.updateInstallation(installation.id, { usage: installation.usage })
      )
      .catch((err) =>
        log.warn({ installationId: installation.id, error: String(err) }, 'Failed to persist usage')
      );
  }

  // Persist execution (fire-and-forget)
  getStore()
    .then(async (store) => store.saveExecution(fullExecution))
    .catch((err) =>
      log.warn({ executionId: fullExecution.id, error: String(err) }, 'Failed to persist execution')
    );

  return fullExecution;
}

/**
 * Get execution history for a user (sync, from cache)
 */
export function getExecutionHistory(
  userId: UserId,
  options?: {
    toolId?: MarketplaceId;
    limit?: number;
    since?: string;
  }
): ToolExecution[] {
  let executions = cache.executions.filter((e) => e.userId === userId);

  if (options?.toolId) {
    executions = executions.filter((e) => e.toolId === options.toolId);
  }

  if (options?.since) {
    const sinceDate = new Date(options.since);
    executions = executions.filter((e) => new Date(e.executedAt) >= sinceDate);
  }

  // Sort by most recent first
  executions.sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());

  if (options?.limit) {
    executions = executions.slice(0, options.limit);
  }

  return executions;
}

// ============================================================================
// MARKETPLACE LISTINGS
// ============================================================================

/**
 * Get marketplace listing for display
 */
export function getListing(id: MarketplaceId): MarketplaceListing | undefined {
  const tool = getTool(id);
  const agent = getAgent(id);
  const item = tool || agent;
  const type = tool ? 'tool' : 'agent';

  if (!item) return undefined;

  // Count active installations
  const activeInstalls = Array.from(cache.installations.values()).filter(
    (i) => i.itemId === id && i.status === 'active'
  ).length;

  return {
    id: item.id,
    type,
    name: item.name,
    displayName: type === 'agent' ? (agent as AgentManifest).displayName : item.name,
    version: item.version,
    publisher: item.publisher,
    description: item.description,
    metadata: {
      category: item.metadata.category,
      tags: item.metadata.tags,
      icon: item.metadata.icon,
      colors: type === 'agent' ? (agent as AgentManifest).metadata.colors : undefined,
    },
    trustLevel: item.verification.trustLevel,
    verified: item.verification.verified,
    license: item.licensing.type,
    pricing: item.licensing.pricing,
    stats: {
      downloads: 0, // Would come from analytics
      activeInstalls,
      rating: 5.0, // Would come from reviews
      reviewCount: 0,
    },
    publishedAt: new Date().toISOString(), // Would be from manifest
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Search marketplace listings
 */
export function searchListings(
  query: string,
  options?: {
    type?: 'agent' | 'tool';
    category?: string;
    trustLevel?: TrustLevel;
    limit?: number;
  }
): MarketplaceListing[] {
  const allIds = [...Array.from(cache.tools.keys()), ...Array.from(cache.agents.keys())];

  let listings = allIds
    .map((id) => getListing(id))
    .filter((l): l is MarketplaceListing => l !== undefined);

  // Filter by type
  if (options?.type) {
    listings = listings.filter((l) => l.type === options.type);
  }

  // Filter by category
  if (options?.category) {
    listings = listings.filter((l) => l.metadata.category === options.category);
  }

  // Filter by trust level
  if (options?.trustLevel) {
    listings = listings.filter((l) => l.trustLevel === options.trustLevel);
  }

  // Search by query
  if (query) {
    const q = query.toLowerCase();
    listings = listings.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.description.short.toLowerCase().includes(q) ||
        l.metadata.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  // Sort by active installs
  listings.sort((a, b) => b.stats.activeInstalls - a.stats.activeInstalls);

  if (options?.limit) {
    listings = listings.slice(0, options.limit);
  }

  return listings;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the marketplace registry
 *
 * In production, this loads existing data from Firestore into the cache.
 * In development, it uses the in-memory store.
 */
export async function initializeMarketplaceRegistry(): Promise<void> {
  log.info('Initializing marketplace registry...');

  try {
    // Initialize the persistent store
    const store = await getStore();

    // Load all tools from store into cache
    const tools = await store.listTools();
    for (const tool of tools) {
      cache.tools.set(tool.id, tool);
    }

    // Load all agents from store into cache
    const agents = await store.listAgents();
    for (const agent of agents) {
      cache.agents.set(agent.id, agent);
    }

    log.info(
      {
        tools: cache.tools.size,
        agents: cache.agents.size,
        storeType: store.isAvailable() ? 'firestore' : 'in-memory',
      },
      'Marketplace registry initialized'
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to load from persistent store, using empty cache');
  }
}

/**
 * Clear registry (for testing)
 */
export function clearRegistry(): void {
  cache.tools.clear();
  cache.agents.clear();
  cache.installations.clear();
  cache.executions = [];

  // Reset store instance
  persistentStore = null;
  storeInitialized = false;
}
