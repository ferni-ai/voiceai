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
import { isDomainLoaded as isDomainRegistered, loadToolDomain } from '../registry/loader.js';
import { getEssentialTools } from '../../config/tool-config.js';
import { loadIntentManual } from '../retrieval/dense-index.js';
import type { ToolDomain, ToolContext, Tool } from '../registry/types.js';
import { ALL_TOOL_DOMAINS, EnvironmentServiceRegistry } from '../registry/types.js';

import type {
  DynamicLoaderConfig,
  DynamicLoaderStatus,
  LoadedDomainState,
  TopicDetectionResult,
} from './types.js';
import { DOMAIN_PRIORITY, DEFAULT_ESSENTIAL_DOMAINS } from './topic-mappings.js';
import { TOPIC_PATTERNS } from './topic-patterns.js';

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
      maxLoadedDomains: 10, // counts the essential domains: see types.ts
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
    // Ensure services has a .has() method - EnvironmentServiceRegistry checks env vars
    this.toolContext = {
      ...ctx,
      services: ctx.services || new EnvironmentServiceRegistry(),
    };

    // Load essential domains
    for (const domain of this.config.essentialDomains) {
      await this.loadDomain(domain, true);
    }
    await this.registerEssentialTools();

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

    // Check each topic keyword, as a whole word
    for (const [topic, domains, pattern] of TOPIC_PATTERNS) {
      if (pattern.test(lowerMessage)) {
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

  private essentialToolIds(): readonly string[] {
    return this.config.essentialToolIds ?? getEssentialTools();
  }

  /**
   * Register the definitions of the essential tools whose domains aren't
   * loaded. quickTimer and quickAlarm were on the "must survive any cap" list,
   * but their domain (simple-utilities) loads only on keywords, and tools a
   * turn's words load reach the agent after that turn's reply starts: asked
   * for a 20 s tea timer, Ferni had none and said "I can't set a timer
   * directly" (dev, 2026-09-30).
   */
  private async registerEssentialTools(): Promise<void> {
    let domainOf = this.config.domainOfTool;
    if (!domainOf) {
      let manual: ReturnType<typeof loadIntentManual> | null = null;
      try {
        manual = loadIntentManual(); // read once: it parses the whole catalog
      } catch (error) {
        getLogger().warn({ error: String(error) }, 'Could not read the tool manual');
      }
      domainOf = (id) => manual?.tools[id]?.domain as ToolDomain | undefined;
    }
    const domains = new Set<ToolDomain>();
    for (const id of this.essentialToolIds()) {
      const domain = domainOf(id);
      if (domain && !isDomainRegistered(domain)) domains.add(domain);
    }
    await Promise.all(
      [...domains].map((domain) =>
        loadToolDomain(domain).catch((error: unknown) =>
          getLogger().warn({ domain, error: String(error) }, 'Could not register essential tools')
        )
      )
    );
  }

  /**
   * Load the whole catalog for this session, never unloaded. For per-turn
   * tool retrieval, which sends each request only the tools its words need:
   * retrieval can only send tools the agent has, and "keep an eye on the
   * time" found setTimer and quickTimer but neither was loaded (dev,
   * 2026-09-30). Building all ~1,160 tools takes ~50 ms and ~60 MB per
   * session; the first session in a process also imports the domain modules
   * (~2 s), so call this off the critical path.
   */
  async loadAllDomains(domains: readonly ToolDomain[] = ALL_TOOL_DOMAINS): Promise<number> {
    const results = await Promise.all(domains.map((domain) => this.loadDomain(domain, true)));
    return results.filter(Boolean).length;
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

    // Drop the domain from THIS session's set only. The registry is shared by
    // every session in the process: unregistering here stripped the domain's
    // tools from the other callers' next tool builds as well.
    this.loadedDomains.delete(domain);

    getLogger().info({ domain, toolCount: state.toolCount }, '🔄 Domain unloaded from session');
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

    // Build tools from loaded domains, plus the essential tools by id
    const result = toolRegistry.buildToolSet(
      { domains: loadedDomainList, optional: [...this.essentialToolIds()] },
      this.toolContext
    );

    return result.tools;
  }

  /**
   * Get only the named domains' tools, for a mid-session update after a topic
   * loads them. getCurrentTools() lists the essential domains first, so the
   * update's 64-tool cap kept those and cut the new domain: getCommuteTime
   * stayed unavailable all call (local, 2026-10-08).
   */
  getToolsForDomains(domains: readonly string[]): Record<string, Tool> {
    const ctx = this.toolContext;
    if (!ctx) {
      throw new Error('DynamicToolLoader not initialized');
    }
    const isDomain = (d: string): d is ToolDomain =>
      (ALL_TOOL_DOMAINS as readonly string[]).includes(d);
    const unknownDomains = domains.filter((d) => !isDomain(d));
    if (unknownDomains.length > 0) {
      getLogger().warn({ unknownDomains }, '🔄 Not tool domains; no tools offered for them');
    }
    // One domain at a time, then interleaved: offered one domain after another,
    // the update's cap ran out inside the first. "find me a taco place nearby"
    // loads information (57 tools) and local-search (6), and none of
    // local-search's tools landed.
    const perDomain = domains
      .filter(isDomain)
      .map((domain) => Object.entries(toolRegistry.buildToolSet({ domains: [domain] }, ctx).tools));
    const interleaved: Record<string, Tool> = {};
    for (let i = 0; perDomain.some((tools) => i < tools.length); i++) {
      for (const tools of perDomain) {
        const entry = tools[i];
        if (entry && !(entry[0] in interleaved)) interleaved[entry[0]] = entry[1];
      }
    }
    return interleaved;
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

/**
 * A process-wide loader. Do not use it for a voice session: several calls run
 * in one worker process, and a loader builds tools with the user and session
 * it was last initialized for, so a shared one handed one caller tools bound
 * to another caller (tools such as listRoutines read ctx.userId at build
 * time). Sessions create their own with createSessionToolLoader().
 */
export const dynamicToolLoader = new DynamicToolLoader();

/** A loader for one voice session; call shutdown() when the session ends. */
export function createSessionToolLoader(
  config: Partial<DynamicLoaderConfig> = {}
): DynamicToolLoader {
  return new DynamicToolLoader(config);
}

export default dynamicToolLoader;

export { ensureEssentialDomainsLoaded, loadEssentialDomains } from './essential-domain-loader.js';
