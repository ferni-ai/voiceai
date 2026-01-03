/**
 * Dynamic Tool Loader
 *
 * Intelligently loads and unloads tool domains based on conversation context.
 * This keeps the active tool count low while ensuring relevant tools are available.
 *
 * Features:
 * - Topic detection → domain mapping
 * - Automatic loading when topic detected
 * - Automatic unloading after inactivity
 * - Priority-based loading (essential domains always loaded)
 */

import { getLogger } from '../../utils/safe-logger.js';
import { toolRegistry } from '../registry/index.js';
import { loadToolDomain } from '../registry/loader.js';
import type { ToolDomain, ToolContext, Tool } from '../registry/types.js';

import type {
  DynamicLoaderConfig,
  DynamicLoaderStatus,
  LoadedDomainState,
  TopicDetectionResult,
} from './types.js';
import { TOPIC_TO_DOMAINS, DOMAIN_PRIORITY, DEFAULT_ESSENTIAL_DOMAINS } from './topic-mappings.js';

// Re-export types
export type {
  DynamicLoaderConfig,
  DynamicLoaderStatus,
  LoadedDomainState,
  TopicDetectionResult,
} from './types.js';

// Re-export mappings for consumers who need them
export { TOPIC_TO_DOMAINS, DOMAIN_PRIORITY, DEFAULT_ESSENTIAL_DOMAINS } from './topic-mappings.js';

// ============================================================================
// DYNAMIC LOADER CLASS
// ============================================================================

export class DynamicToolLoader {
  private config: DynamicLoaderConfig;
  private loadedDomains = new Map<ToolDomain, LoadedDomainState>();
  private toolContext: ToolContext | null = null;
  private unloadTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<DynamicLoaderConfig> = {}) {
    this.config = {
      essentialDomains: DEFAULT_ESSENTIAL_DOMAINS,
      unloadAfterMs: 5 * 60 * 1000, // 5 minutes
      maxLoadedDomains: 10, // Increased to accommodate essential domains
      enableAutoUnload: true,
      ...config,
    };
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize with tool context and load essential domains
   */
  async initialize(ctx: ToolContext): Promise<void> {
    this.toolContext = ctx;

    // Load essential domains
    for (const domain of this.config.essentialDomains) {
      await this.loadDomain(domain, true);
    }

    // Start auto-unload timer if enabled
    if (this.config.enableAutoUnload) {
      this.startUnloadTimer();
    }

    getLogger().info(
      {
        essentialDomains: this.config.essentialDomains,
        maxLoadedDomains: this.config.maxLoadedDomains,
      },
      '🔄 Dynamic tool loader initialized'
    );
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    if (this.unloadTimer) {
      clearInterval(this.unloadTimer);
      this.unloadTimer = null;
    }
    this.loadedDomains.clear();
    getLogger().info('🔄 Dynamic tool loader shut down');
  }

  // ==========================================================================
  // TOPIC DETECTION
  // ==========================================================================

  /**
   * Detect topics from user message and suggest domains
   */
  detectTopics(message: string): TopicDetectionResult {
    const lowerMessage = message.toLowerCase();
    const detectedTopics: string[] = [];
    const domainScores = new Map<ToolDomain, number>();

    // Check each topic keyword
    for (const [topic, domains] of Object.entries(TOPIC_TO_DOMAINS)) {
      if (lowerMessage.includes(topic)) {
        detectedTopics.push(topic);
        for (const domain of domains) {
          const currentScore = domainScores.get(domain) || 0;
          const priority = DOMAIN_PRIORITY[domain] || 10;
          domainScores.set(domain, currentScore + priority);
        }
      }
    }

    // Sort domains by score
    const suggestedDomains = Array.from(domainScores.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([domain]) => domain)
      .slice(0, 5); // Top 5 domains - ensures action domains like telephony aren't cut off

    // Calculate confidence based on matches
    const confidence = Math.min(detectedTopics.length / 3, 1);

    return {
      detectedTopics,
      suggestedDomains,
      confidence,
    };
  }

  // ==========================================================================
  // DOMAIN LOADING
  // ==========================================================================

  /**
   * Load a domain's tools
   */
  async loadDomain(domain: ToolDomain, isEssential = false): Promise<boolean> {
    // Already loaded?
    if (this.loadedDomains.has(domain)) {
      // Update last used time
      const state = this.loadedDomains.get(domain)!;
      state.lastUsedAt = new Date();
      return true;
    }

    // Check max loaded domains
    if (!isEssential && this.loadedDomains.size >= this.config.maxLoadedDomains) {
      // Unload least recently used non-essential domain
      await this.unloadLeastUsed();
    }

    try {
      const toolCount = await loadToolDomain(domain);

      this.loadedDomains.set(domain, {
        domain,
        loadedAt: new Date(),
        lastUsedAt: new Date(),
        toolCount,
        isEssential,
      });

      getLogger().info({ domain, toolCount, isEssential }, '🔄 Domain loaded dynamically');
      return true;
    } catch (error) {
      getLogger().warn({ domain, error }, '🔄 Failed to load domain');
      return false;
    }
  }

  /**
   * Unload a domain's tools (if not essential)
   */
  async unloadDomain(domain: ToolDomain): Promise<boolean> {
    const state = this.loadedDomains.get(domain);
    if (!state) return false;
    if (state.isEssential) {
      getLogger().debug({ domain }, '🔄 Cannot unload essential domain');
      return false;
    }

    // Get all tools for this domain from the registry
    const domainTools = toolRegistry.getByDomain(domain);
    let unloadedCount = 0;

    // Unregister each tool from the registry
    for (const tool of domainTools) {
      // Only unregister if this is the tool's primary domain
      // (to avoid breaking tools that have multiple domains)
      if (tool.domain === domain) {
        const success = toolRegistry.unregister(tool.id);
        if (success) {
          unloadedCount++;
        }
      }
    }

    // Update local tracking
    this.loadedDomains.delete(domain);

    getLogger().info(
      { domain, unloadedCount, totalInDomain: domainTools.length },
      '🔄 Domain unloaded from registry'
    );
    return true;
  }

  /**
   * Unload the least recently used non-essential domain
   */
  private async unloadLeastUsed(): Promise<void> {
    let oldest: LoadedDomainState | null = null;

    for (const state of this.loadedDomains.values()) {
      if (state.isEssential) continue;
      if (!oldest || state.lastUsedAt < oldest.lastUsedAt) {
        oldest = state;
      }
    }

    if (oldest) {
      await this.unloadDomain(oldest.domain);
    }
  }

  // ==========================================================================
  // AUTO-LOADING FROM CONTEXT
  // ==========================================================================

  /**
   * Process a user message and load relevant domains
   */
  async processMessage(message: string): Promise<ToolDomain[]> {
    const detection = this.detectTopics(message);

    if (detection.confidence < 0.3 || detection.suggestedDomains.length === 0) {
      return [];
    }

    const loadedDomains: ToolDomain[] = [];

    for (const domain of detection.suggestedDomains) {
      if (!this.loadedDomains.has(domain)) {
        const success = await this.loadDomain(domain);
        if (success) {
          loadedDomains.push(domain);
        }
      } else {
        // Update last used
        const state = this.loadedDomains.get(domain)!;
        state.lastUsedAt = new Date();
      }
    }

    if (loadedDomains.length > 0) {
      getLogger().info(
        {
          message: message.slice(0, 50),
          topics: detection.detectedTopics,
          loadedDomains,
        },
        '🔄 Auto-loaded domains based on context'
      );
    }

    return loadedDomains;
  }

  /**
   * Get tools for the current context
   */
  getCurrentTools(): Record<string, Tool> {
    if (!this.toolContext) {
      throw new Error('DynamicToolLoader not initialized');
    }

    const loadedDomainList = Array.from(this.loadedDomains.keys());

    // Build tools from loaded domains
    const result = toolRegistry.buildToolSet({ domains: loadedDomainList }, this.toolContext);

    return result.tools;
  }

  // ==========================================================================
  // AUTO-UNLOAD TIMER
  // ==========================================================================

  private startUnloadTimer(): void {
    this.unloadTimer = setInterval(() => {
      this.checkForUnload();
    }, 60000); // Check every minute
  }

  private checkForUnload(): void {
    const now = Date.now();

    for (const [domain, state] of this.loadedDomains) {
      if (state.isEssential) continue;

      const idleTime = now - state.lastUsedAt.getTime();
      if (idleTime > this.config.unloadAfterMs) {
        // FIX: Don't fire-and-forget - catch errors to prevent unhandled rejections
        this.unloadDomain(domain).catch((err) => {
          getLogger().warn({ domain, error: String(err) }, '🔄 Error during auto-unload');
        });
      }
    }
  }

  // ==========================================================================
  // STATUS
  // ==========================================================================

  /**
   * Get current loader status
   */
  getStatus(): DynamicLoaderStatus {
    return {
      loadedDomains: Array.from(this.loadedDomains.values()),
      totalTools: Array.from(this.loadedDomains.values()).reduce((sum, s) => sum + s.toolCount, 0),
      config: this.config,
    };
  }

  /**
   * Check if a domain is currently loaded
   */
  isDomainLoaded(domain: ToolDomain): boolean {
    return this.loadedDomains.has(domain);
  }

  /**
   * Get list of loaded domains
   */
  getLoadedDomains(): ToolDomain[] {
    return Array.from(this.loadedDomains.keys());
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

export const dynamicToolLoader = new DynamicToolLoader();

export default dynamicToolLoader;

// ============================================================================
// HELPER: Load Essential Domains (for timeout fallback)
// ============================================================================

/**
 * Load essential domain tools quickly (for timeout fallback scenarios).
 * Uses the tool registry to build tools from essential domains.
 * 
 * @param userId - User ID for tool context  
 * @param services - Session services
 * @returns Record of tool name → tool definition
 */
export async function loadEssentialDomains(
  userId: string,
  services: unknown
): Promise<Record<string, unknown>> {
  const log = getLogger();
  
  // Import registry and build tools for essential domains
  const { toolRegistry, EnvironmentServiceRegistry } = await import('../registry/index.js');
  type ToolDomainType = import('../registry/types.js').ToolDomain;
  
  // Create a minimal tool context
  const ctx = {
    userId: userId || 'anonymous',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    services: services || new EnvironmentServiceRegistry(),
  };
  
  // Cast domains to the expected type
  const domains = DEFAULT_ESSENTIAL_DOMAINS as unknown as ToolDomainType[];
  
  // Build tools from essential domains
  const result = toolRegistry.buildToolSet(
    { domains },
    ctx as import('../registry/types.js').ToolContext
  );
  
  log.info(
    { 
      essentialDomains: DEFAULT_ESSENTIAL_DOMAINS.length,
      totalTools: result.stats.total,
      skipped: result.skipped?.length || 0
    },
    '🎵 Essential domain tools loaded from registry'
  );
  
  return result.tools as Record<string, unknown>;
}
