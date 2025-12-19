/**
 * Tool Registry Loader
 *
 * Auto-discovers and loads tools from the domains/ directory.
 * Each domain folder should have an index.ts that exports tool definitions.
 *
 * LAZY LOADING:
 * By default, only essential domains are loaded at startup.
 * Other domains are loaded on-demand when requested.
 *
 * USAGE:
 *
 * // At startup (loads only essential domains by default)
 * await initializeToolRegistry();
 *
 * // Load all domains (legacy behavior)
 * await initializeToolRegistry({ lazyLoading: false });
 *
 * // Or load specific domains on-demand
 * await loadToolDomain('calendar');
 */

import { getLogger } from '../../utils/safe-logger.js';
import { perfInstrumentation } from '../../services/performance-instrumentation.js';

import { toolRegistry } from './index.js';
import { ALL_TOOL_DOMAINS, type ToolDomain, type ToolDefinition } from './types.js';

// ============================================================================
// LAZY LOADING CONFIGURATION
// ============================================================================

/**
 * Essential domains that are always loaded at startup.
 * These are needed for basic agent functionality.
 */
export const ESSENTIAL_DOMAINS: ToolDomain[] = [
  'memory', // Core memory operations
  'handoff', // Agent switching
  'awareness', // Time/context awareness
  'simple-utilities', // Timers, conversions, etc.
  'entertainment', // Music - MUST be available immediately (users ask for music often!)
  'behavior', // Behavior control - modes, pacing, presence (core to how Ferni speaks)
];

/**
 * High-priority domains loaded shortly after essential.
 * These are commonly used but can be slightly delayed.
 */
export const HIGH_PRIORITY_DOMAINS: ToolDomain[] = [
  'information', // News, weather, search
  'productivity', // Tasks, notes
  // Note: 'entertainment' moved to ESSENTIAL_DOMAINS - music needs to be available immediately
];

/**
 * Track which domains have been loaded
 */
const loadedDomains = new Set<ToolDomain>();

/**
 * Check if a domain has been loaded
 */
export function isDomainLoaded(domain: ToolDomain): boolean {
  return loadedDomains.has(domain);
}

/**
 * Get list of loaded domains
 */
export function getLoadedDomains(): ToolDomain[] {
  return Array.from(loadedDomains);
}

// ============================================================================
// DOMAIN LOADERS
// ============================================================================

/**
 * Map of domain to loader function
 * Each domain's index.ts should export a `getToolDefinitions()` function
 */
const domainLoaders: Partial<Record<ToolDomain, () => Promise<ToolDefinition[]>>> = {};

/**
 * Register a domain loader
 */
export function registerDomainLoader(
  domain: ToolDomain,
  loader: () => Promise<ToolDefinition[]>
): void {
  domainLoaders[domain] = loader;
  getLogger().debug({ domain }, 'Domain loader registered');
}

/**
 * Load tools from a specific domain
 * @param domain The domain to load
 * @param options.isLazy Whether this is a lazy load (for metrics)
 */
export async function loadToolDomain(
  domain: ToolDomain,
  options: { isLazy?: boolean } = {}
): Promise<number> {
  // Skip if already loaded
  if (loadedDomains.has(domain)) {
    getLogger().debug({ domain }, 'Domain already loaded, skipping');
    return toolRegistry.getByDomain(domain).length;
  }

  const startTime = Date.now();
  const loader = domainLoaders[domain];
  let toolCount = 0;

  if (!loader) {
    getLogger().warn(
      { domain },
      'No loader registered for domain - skipping (register loaders via registerDomainLoader or use autoRegisterAllDomains)'
    );
    // Note: Dynamic imports with variables don't work in Vitest/bundlers
    // Domains must be pre-registered via registerDomainLoader()
  } else {
    try {
      const definitions = await loader();
      toolRegistry.registerAll(definitions);
      toolCount = definitions.length;
      getLogger().info({ domain, count: definitions.length }, 'Domain tools loaded');
    } catch (error) {
      getLogger().error({ domain, error }, 'Failed to load domain tools');
    }
  }

  // Track metrics
  const loadTimeMs = Date.now() - startTime;
  if (toolCount > 0) {
    loadedDomains.add(domain);
    perfInstrumentation.recordToolLoad(domain, toolCount, loadTimeMs, options.isLazy ?? false);
  }

  return toolCount;
}

/**
 * Load a domain lazily (on-demand)
 * This is the preferred method for loading domains after startup.
 */
export async function loadToolDomainLazy(domain: ToolDomain): Promise<number> {
  if (loadedDomains.has(domain)) {
    return toolRegistry.getByDomain(domain).length;
  }

  getLogger().info({ domain }, '🔄 Lazy loading domain on-demand');
  return loadToolDomain(domain, { isLazy: true });
}

/**
 * Load multiple domains lazily
 */
export async function loadToolDomainsLazy(domains: ToolDomain[]): Promise<number> {
  const unloadedDomains = domains.filter((d) => !loadedDomains.has(d));
  if (unloadedDomains.length === 0) {
    return 0;
  }

  getLogger().info({ domains: unloadedDomains }, '🔄 Lazy loading multiple domains');

  const results = await Promise.allSettled(
    unloadedDomains.map((d) => loadToolDomain(d, { isLazy: true }))
  );

  return results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value : 0), 0);
}

// ============================================================================
// AUTO-REGISTRATION (Static Imports for Vitest/Bundlers)
// ============================================================================

/**
 * Auto-register all domain loaders using static imports
 * This is required for Vitest and bundlers that can't handle dynamic imports with variables
 *
 * Call this before initializeToolRegistry() in test/production environments
 *
 * ⚠️ CRITICAL: This MUST include ALL domains from ALL_TOOL_DOMAINS in types.ts!
 * Missing domains = tools not available to voice agent!
 */
export async function autoRegisterAllDomains(): Promise<void> {
  // Use static imports so bundlers can analyze them
  // Note: We import getToolDefinitions from each domain's index file
  // ⚠️ Keep this list in sync with ALL_TOOL_DOMAINS in types.ts!

  const domains = [
    // === CORE FUNCTIONAL DOMAINS ===
    {
      name: 'memory' as ToolDomain,
      loader: () => import('../domains/memory/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'handoff' as ToolDomain,
      loader: () => import('../domains/handoff/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'entertainment' as ToolDomain,
      loader: () => import('../domains/entertainment/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'awareness' as ToolDomain,
      loader: () => import('../domains/awareness/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'simple-utilities' as ToolDomain,
      loader: () =>
        import('../domains/simple-utilities/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'information' as ToolDomain,
      loader: () => import('../domains/information/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'productivity' as ToolDomain,
      loader: () => import('../domains/productivity/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'calendar' as ToolDomain,
      loader: () => import('../domains/calendar/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'communication' as ToolDomain,
      loader: () => import('../domains/communication/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'habits' as ToolDomain,
      loader: () => import('../domains/habits/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'finance' as ToolDomain,
      loader: () => import('../domains/finance/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'research' as ToolDomain,
      loader: () => import('../domains/research/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'life-planning' as ToolDomain,
      loader: () => import('../domains/life-planning/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'wellness' as ToolDomain,
      loader: () => import('../domains/wellness/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'wisdom' as ToolDomain,
      loader: () => import('../domains/wisdom/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'telephony' as ToolDomain,
      loader: () => import('../domains/telephony/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'proactive' as ToolDomain,
      loader: () => import('../domains/proactive/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'games' as ToolDomain,
      loader: () => import('../domains/games/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'cameo' as ToolDomain,
      loader: () => import('../domains/cameo/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'engagement' as ToolDomain,
      loader: () => import('../domains/engagement/index.js').then((m) => m.getToolDefinitions()),
    },

    // === DEEP HUMAN ENGAGEMENT DOMAINS ===
    {
      name: 'grief' as ToolDomain,
      loader: () => import('../domains/grief/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'presence' as ToolDomain,
      loader: () => import('../domains/presence/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'meaning' as ToolDomain,
      loader: () => import('../domains/meaning/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'relationships' as ToolDomain,
      loader: () => import('../domains/relationships/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'stories' as ToolDomain,
      loader: () => import('../domains/stories/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'curiosity' as ToolDomain,
      loader: () => import('../domains/curiosity/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'vulnerability' as ToolDomain,
      loader: () => import('../domains/vulnerability/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'dreams' as ToolDomain,
      loader: () => import('../domains/dreams/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'play' as ToolDomain,
      loader: () => import('../domains/play/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'self-compassion' as ToolDomain,
      loader: () =>
        import('../domains/self-compassion/index.js').then((m) => m.getToolDefinitions()),
    },

    // === LIFE COACHING DOMAINS ===
    {
      name: 'crisis' as ToolDomain,
      loader: () => import('../domains/crisis/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'health' as ToolDomain,
      loader: () => import('../domains/health/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'career' as ToolDomain,
      loader: () => import('../domains/career/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'decisions' as ToolDomain,
      loader: () => import('../domains/decisions/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'family' as ToolDomain,
      loader: () => import('../domains/family/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'home' as ToolDomain,
      loader: () => import('../domains/home/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'learning' as ToolDomain,
      loader: () => import('../domains/learning/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'creativity' as ToolDomain,
      loader: () => import('../domains/creativity/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'community' as ToolDomain,
      loader: () => import('../domains/community/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'legal-admin' as ToolDomain,
      loader: () => import('../domains/legal-admin/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'second-chances' as ToolDomain,
      loader: () =>
        import('../domains/second-chances/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'connection' as ToolDomain,
      loader: () => import('../domains/connection/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'difficult-conversations' as ToolDomain,
      loader: () =>
        import('../domains/difficult-conversations/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'life-transitions' as ToolDomain,
      loader: () =>
        import('../domains/life-transitions/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'reflection-games' as ToolDomain,
      loader: () =>
        import('../domains/reflection-games/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'quiet-growth' as ToolDomain,
      loader: () => import('../domains/quiet-growth/index.js').then((m) => m.getToolDefinitions()),
    },

    // === PERSONA-SPECIFIC "BETTER THAN HUMAN" DOMAINS ===
    {
      name: 'pattern-mastery' as ToolDomain,
      loader: () =>
        import('../domains/pattern-mastery/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'workflow-mastery' as ToolDomain,
      loader: () =>
        import('../domains/workflow-mastery/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'milestone-mastery' as ToolDomain,
      loader: () =>
        import('../domains/milestone-mastery/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'habit-persistence' as ToolDomain,
      loader: () =>
        import('../domains/habit-persistence/index.js').then((m) => m.getToolDefinitions()),
    },
    {
      name: 'timeless-perspective' as ToolDomain,
      loader: () =>
        import('../domains/timeless-perspective/index.js').then((m) => m.getToolDefinitions()),
    },

    // === DEVELOPER DOMAIN ===
    {
      name: 'developer' as ToolDomain,
      loader: () => import('../domains/developer/index.js').then((m) => m.getToolDefinitions()),
    },

    // === BEHAVIOR DOMAIN (Bidirectional behavior system) ===
    {
      name: 'behavior' as ToolDomain,
      loader: () => import('../domains/behavior/index.js').then((m) => m.getToolDefinitions()),
    },
  ];

  for (const { name, loader } of domains) {
    registerDomainLoader(name, loader);
  }

  getLogger().info(
    { domainsRegistered: domains.length, expectedDomains: ALL_TOOL_DOMAINS.length },
    'Domain loaders auto-registered'
  );

  // Sanity check: warn if we're missing any domains
  const registeredDomainNames = new Set(domains.map((d) => d.name));
  const missingDomains = ALL_TOOL_DOMAINS.filter((d) => !registeredDomainNames.has(d));
  if (missingDomains.length > 0) {
    getLogger().error(
      { missingDomains },
      '⚠️ CRITICAL: autoRegisterAllDomains is missing some domains! Tools will not be available.'
    );
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export interface InitializeToolRegistryOptions {
  /** Specific domains to load (overrides lazyLoading) */
  domains?: ToolDomain[];
  /** Domains to skip */
  skipDomains?: ToolDomain[];
  /** Load domains in parallel */
  parallel?: boolean;
  /**
   * Enable lazy loading (default: true)
   * When true, only essential domains are loaded at startup.
   * Other domains are loaded on-demand.
   */
  lazyLoading?: boolean;
  /**
   * Also load high-priority domains at startup (only with lazyLoading)
   * Default: true
   */
  loadHighPriority?: boolean;
}

/**
 * Initialize the tool registry
 *
 * By default, uses lazy loading which only loads essential domains at startup.
 * Set lazyLoading: false for legacy behavior (load all domains).
 */
export async function initializeToolRegistry(options: InitializeToolRegistryOptions = {}): Promise<{
  loaded: number;
  byDomain: Record<ToolDomain, number>;
  errors: string[];
  lazyLoadingEnabled: boolean;
  remainingDomains: ToolDomain[];
}> {
  perfInstrumentation.startPhase('tool-registry-init');
  const startTime = Date.now();

  // Determine if we're using lazy loading
  const lazyLoading = options.lazyLoading ?? true;
  const loadHighPriority = options.loadHighPriority ?? true;

  // Determine which domains to load
  let domainsToLoad: ToolDomain[];
  if (options.domains) {
    // Explicit domains override everything
    domainsToLoad = options.domains;
  } else if (lazyLoading) {
    // Lazy loading: start with essential, optionally add high-priority
    domainsToLoad = [...ESSENTIAL_DOMAINS];
    if (loadHighPriority) {
      domainsToLoad.push(...HIGH_PRIORITY_DOMAINS);
    }
  } else {
    // Legacy: load all domains
    domainsToLoad = [...ALL_TOOL_DOMAINS];
  }

  const skipSet = new Set(options.skipDomains || []);
  const byDomain: Record<string, number> = {};
  const errors: string[] = [];

  // Remove duplicates and skipped domains
  domainsToLoad = [...new Set(domainsToLoad)].filter((d) => !skipSet.has(d));

  getLogger().info(
    {
      domainsToLoad: domainsToLoad.length,
      lazyLoading,
      totalAvailable: ALL_TOOL_DOMAINS.length,
    },
    'Initializing tool registry...'
  );

  // Take memory snapshot before loading
  perfInstrumentation.snapshotMemory('before-tool-load');

  // Load domains
  if (options.parallel !== false) {
    // Load all domains in parallel (default)
    const results = await Promise.allSettled(
      domainsToLoad.map(async (domain) => {
        const count = await loadToolDomain(domain, { isLazy: false });
        return { domain, count };
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        byDomain[result.value.domain] = result.value.count;
      } else {
        errors.push(String(result.reason));
      }
    }
  } else {
    // Load domains sequentially
    for (const domain of domainsToLoad) {
      try {
        const count = await loadToolDomain(domain, { isLazy: false });
        byDomain[domain] = count;
      } catch (error) {
        errors.push(`${domain}: ${error}`);
      }
    }
  }

  // Take memory snapshot after loading
  perfInstrumentation.snapshotMemory('after-tool-load');

  // Mark initialized
  toolRegistry.markInitialized();

  const totalLoaded = Object.values(byDomain).reduce((sum, n) => sum + n, 0);
  const elapsed = Date.now() - startTime;

  // Calculate remaining domains for lazy loading
  const remainingDomains = ALL_TOOL_DOMAINS.filter((d) => !loadedDomains.has(d));

  perfInstrumentation.endPhase('tool-registry-init', {
    totalTools: totalLoaded,
    domainsLoaded: Object.keys(byDomain).length,
    lazyLoading,
  });

  getLogger().info(
    {
      totalTools: totalLoaded,
      domainsLoaded: Object.keys(byDomain).length,
      remainingDomains: remainingDomains.length,
      lazyLoading,
      elapsed,
      errors: errors.length,
    },
    lazyLoading
      ? '🚀 Tool registry initialized (lazy loading enabled)'
      : '🔧 Tool registry initialization complete'
  );

  return {
    loaded: totalLoaded,
    byDomain: byDomain as Record<ToolDomain, number>,
    errors,
    lazyLoadingEnabled: lazyLoading,
    remainingDomains,
  };
}

// ============================================================================
// LEGACY TOOL MIGRATION HELPERS
// ============================================================================

/**
 * Helper to convert existing tool creator functions to ToolDefinitions
 *
 * USAGE:
 * const legacyTools = createSomeTools();
 * const definitions = convertLegacyTools(legacyTools, 'productivity');
 */
export function convertLegacyTools(
  tools: Record<string, unknown>,
  domain: ToolDomain,
  options: {
    prefix?: string;
    tags?: string[];
  } = {}
): ToolDefinition[] {
  const definitions: ToolDefinition[] = [];

  for (const [id, tool] of Object.entries(tools)) {
    if (typeof tool !== 'object' || tool === null) continue;

    const toolObj = tool as Record<string, unknown>;

    // Check if it looks like a tool
    if (typeof toolObj.description !== 'string') {
      getLogger().debug({ id }, 'Skipping non-tool entry');
      continue;
    }

    const definition: ToolDefinition = {
      id: options.prefix ? `${options.prefix}_${id}` : id,
      name: id.replace(/([A-Z])/g, ' $1').trim(), // camelCase to Title Case
      description: toolObj.description as string,
      domain,
      tags: options.tags,
      create: () => ({
        description: toolObj.description as string,
        parameters: toolObj.parameters as ToolDefinition['create'] extends (ctx: unknown) => infer R
          ? R extends { parameters?: infer P }
            ? P
            : undefined
          : undefined,
        execute:
          typeof toolObj.execute === 'function'
            ? toolObj.execute.bind(toolObj)
            : async () => ({ error: 'Not implemented' }),
      }),
    };

    definitions.push(definition);
  }

  return definitions;
}

/**
 * Register legacy tools directly
 */
export function registerLegacyTools(
  tools: Record<string, unknown>,
  domain: ToolDomain,
  options: {
    prefix?: string;
    tags?: string[];
  } = {}
): number {
  const definitions = convertLegacyTools(tools, domain, options);
  toolRegistry.registerAll(definitions);
  return definitions.length;
}

// ============================================================================
// DOMAIN REGISTRATION HELPER
// ============================================================================

/**
 * Helper for domain index files to create a standard structure
 *
 * USAGE (in domains/calendar/index.ts):
 *
 * import { createDomainExport } from '../../registry/loader.js';
 * import { appointmentTools } from './appointments.js';
 * import { schedulingTools } from './scheduling.js';
 *
 * export const { getToolDefinitions, domain } = createDomainExport(
 *   'calendar',
 *   [...appointmentTools, ...schedulingTools]
 * );
 *
 * export default getToolDefinitions;
 */
export function createDomainExport(
  domain: ToolDomain,
  definitions: ToolDefinition[]
): {
  getToolDefinitions: () => Promise<ToolDefinition[]>;
  domain: ToolDomain;
  definitions: ToolDefinition[];
} {
  // Validate all definitions have the correct domain
  for (const def of definitions) {
    if (def.domain !== domain && !def.additionalDomains?.includes(domain)) {
      getLogger().warn(
        { toolId: def.id, expected: domain, actual: def.domain },
        'Tool domain mismatch in domain export'
      );
    }
  }

  return {
    getToolDefinitions: async () => definitions,
    domain,
    definitions,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Initialization
  initializeToolRegistry,

  // Domain loading
  loadToolDomain,
  loadToolDomainLazy,
  loadToolDomainsLazy,
  registerDomainLoader,

  // Domain status
  isDomainLoaded,
  getLoadedDomains,
  ESSENTIAL_DOMAINS,
  HIGH_PRIORITY_DOMAINS,

  // Legacy helpers
  convertLegacyTools,
  registerLegacyTools,
  createDomainExport,
};
