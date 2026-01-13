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

import { perfInstrumentation } from '../../services/performance-instrumentation.js';
import { getLogger } from '../../utils/safe-logger.js';

import { toolRegistry } from './index.js';
import { ALL_TOOL_DOMAINS, type ToolDefinition, type ToolDomain } from './types.js';

// ============================================================================
// LAZY LOADING CONFIGURATION
// ============================================================================

/**
 * Essential domains that are always loaded at startup.
 * These are needed for basic agent functionality.
 *
 * NOTE: Without semantic router, Gemini needs tools available at session start.
 * If a tool isn't here, Gemini won't know it can call it!
 */
export const ESSENTIAL_DOMAINS: ToolDomain[] = [
  // Core system domains
  'memory', // Core memory operations
  'handoff', // Agent switching
  'awareness', // Time/context awareness
  'simple-utilities', // Timers, conversions, etc.
  'behavior', // Behavior control - modes, pacing, presence (core to how Ferni speaks)

  // User-facing essential domains (CRITICAL: users expect these immediately!)
  'calendar', // Schedule meetings, events, reminders - users ask constantly!
  'scheduling', // Scheduling coordination - complements calendar
  'communication', // Email, SMS - core actions
  'telephony', // Phone calls ("call my mom") - must be available immediately!
  'productivity', // Tasks, notes, todos - users create these immediately!
  'family', // Family actions, messages - common use case

  // Daily wellness & habits (people check these every day!)
  'habits', // "How are my habits?", "Log my workout" - daily use
  'wellness', // "I'm stressed", emotional support - critical for relationship

  // Entertainment & info
  'entertainment', // Music - MUST be available immediately (users ask for music often!)
  'information', // News, weather, search - users ask constantly!
];

/**
 * High-priority domains loaded shortly after essential.
 * These are commonly used but load after startup to keep initial load fast.
 */
export const HIGH_PRIORITY_DOMAINS: ToolDomain[] = [
  // Life management (common but slightly less urgent)
  'finance', // "Check my budget" - common daily question
  'health', // Health tracking, nutrition - frequent use
  'decisions', // "Help me decide" - common but not urgent
  'home', // Home tasks, errands - daily life
  'research', // "Look up..." - information gathering
  'life-planning', // Goals, milestones - periodic check-ins
];

/**
 * Track which domains have been loaded
 */
const loadedDomains = new Set<ToolDomain>();

/**
 * Track in-progress domain loads to prevent race conditions.
 * When multiple callers request the same domain simultaneously,
 * only one load executes and others await the same promise.
 */
const pendingLoads = new Map<ToolDomain, Promise<number>>();

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

  // RACE CONDITION FIX: If another caller is already loading this domain,
  // wait for that load to complete instead of starting a duplicate load.
  const existingLoad = pendingLoads.get(domain);
  if (existingLoad) {
    getLogger().debug({ domain }, 'Domain load already in progress, awaiting existing promise');
    return existingLoad;
  }

  // Create and track the loading promise
  const loadPromise = doLoadDomain(domain, options);
  pendingLoads.set(domain, loadPromise);

  try {
    return await loadPromise;
  } finally {
    // Always clean up pending loads map
    pendingLoads.delete(domain);
  }
}

/**
 * Internal domain loading implementation (separated for race condition handling)
 */
async function doLoadDomain(
  domain: ToolDomain,
  options: { isLazy?: boolean }
): Promise<number> {
  const startTime = Date.now();
  const loader = domainLoaders[domain];
  let toolCount = 0;

  if (!loader) {
    // FIX: Log error (not just warning) for missing loaders - this is a critical issue
    // Missing loaders mean tools won't be available to the voice agent
    const errorMsg = `❌ No loader registered for domain "${domain}" - tools will NOT be available!`;
    getLogger().error({ domain }, errorMsg);
    // Also output to stderr for maximum visibility
    process.stderr.write(`\n🚨 TOOL DOMAIN ERROR: ${errorMsg}\n`);
    process.stderr.write(`   Fix: Register via registerDomainLoader() or include in autoRegisterAllDomains()\n\n`);
    // Note: Dynamic imports with variables don't work in Vitest/bundlers
    // Domains must be pre-registered via registerDomainLoader()
    // Return -1 to indicate failure (vs 0 which means success with no tools)
    return -1;
  } else {
    try {
      const definitions = await loader();
      toolRegistry.registerAll(definitions);
      toolCount = definitions.length;
      getLogger().info({ domain, count: definitions.length }, 'Domain tools loaded');
    } catch (error) {
      const errorMsg = `Failed to load domain "${domain}" tools: ${error}`;
      getLogger().error({ domain, error: String(error) }, errorMsg);
      // Output to stderr for maximum visibility
      process.stderr.write(`\n🚨 TOOL LOAD FAILURE: ${errorMsg}\n\n`);
      // Return -1 to indicate failure
      return -1;
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

/** Maximum time to wait for lazy domain loading before timing out */
const LAZY_LOAD_TIMEOUT_MS = 5000; // 5 seconds

/**
 * Load multiple domains lazily with timeout protection.
 * Prevents hanging requests if domain loading gets stuck.
 */
export async function loadToolDomainsLazy(domains: ToolDomain[]): Promise<number> {
  const unloadedDomains = domains.filter((d) => !loadedDomains.has(d));
  if (unloadedDomains.length === 0) {
    return 0;
  }

  getLogger().info({ domains: unloadedDomains }, '🔄 Lazy loading multiple domains');

  // Wrap with timeout to prevent hanging indefinitely
  const loadWithTimeout = async (domain: ToolDomain): Promise<number> => {
    return Promise.race([
      loadToolDomain(domain, { isLazy: true }),
      new Promise<number>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timeout loading domain "${domain}" after ${LAZY_LOAD_TIMEOUT_MS}ms`)),
          LAZY_LOAD_TIMEOUT_MS
        )
      ),
    ]);
  };

  const results = await Promise.allSettled(unloadedDomains.map(loadWithTimeout));

  // Log any timeouts or failures
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      getLogger().warn(
        { domain: unloadedDomains[i], error: String(result.reason) },
        '⚠️ Domain lazy load failed or timed out'
      );
    }
  });

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
      loader: async () =>
        import('../domains/memory/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'handoff' as ToolDomain,
      loader: async () =>
        import('../domains/handoff/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'entertainment' as ToolDomain,
      loader: async () =>
        import('../domains/entertainment/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'awareness' as ToolDomain,
      loader: async () =>
        import('../domains/awareness/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'simple-utilities' as ToolDomain,
      loader: async () =>
        import('../domains/simple-utilities/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'information' as ToolDomain,
      loader: async () =>
        import('../domains/information/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'productivity' as ToolDomain,
      loader: async () =>
        import('../domains/productivity/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'calendar' as ToolDomain,
      loader: async () =>
        import('../domains/calendar/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'communication' as ToolDomain,
      loader: async () =>
        import('../domains/communication/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'habits' as ToolDomain,
      loader: async () =>
        import('../domains/habits/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'finance' as ToolDomain,
      loader: async () =>
        import('../domains/finance/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'research' as ToolDomain,
      loader: async () =>
        import('../domains/research/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'life-planning' as ToolDomain,
      loader: async () =>
        import('../domains/life-planning/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'wellness' as ToolDomain,
      loader: async () =>
        import('../domains/wellness/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'wisdom' as ToolDomain,
      loader: async () =>
        import('../domains/wisdom/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'telephony' as ToolDomain,
      loader: async () =>
        import('../domains/telephony/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'proactive' as ToolDomain,
      loader: async () =>
        import('../domains/proactive/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'games' as ToolDomain,
      loader: async () =>
        import('../domains/games/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'cameo' as ToolDomain,
      loader: async () =>
        import('../domains/cameo/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'engagement' as ToolDomain,
      loader: async () =>
        import('../domains/engagement/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === DEEP HUMAN ENGAGEMENT DOMAINS ===
    {
      name: 'grief' as ToolDomain,
      loader: async () =>
        import('../domains/grief/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'presence' as ToolDomain,
      loader: async () =>
        import('../domains/presence/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'meaning' as ToolDomain,
      loader: async () =>
        import('../domains/meaning/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'relationships' as ToolDomain,
      loader: async () =>
        import('../domains/relationships/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'stories' as ToolDomain,
      loader: async () =>
        import('../domains/stories/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'curiosity' as ToolDomain,
      loader: async () =>
        import('../domains/curiosity/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'vulnerability' as ToolDomain,
      loader: async () =>
        import('../domains/vulnerability/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'dreams' as ToolDomain,
      loader: async () =>
        import('../domains/dreams/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'play' as ToolDomain,
      loader: async () =>
        import('../domains/play/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'self-compassion' as ToolDomain,
      loader: async () =>
        import('../domains/self-compassion/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === LIFE COACHING DOMAINS ===
    {
      name: 'crisis' as ToolDomain,
      loader: async () =>
        import('../domains/crisis/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'health' as ToolDomain,
      loader: async () =>
        import('../domains/health/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'career' as ToolDomain,
      loader: async () =>
        import('../domains/career/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'decisions' as ToolDomain,
      loader: async () =>
        import('../domains/decisions/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'family' as ToolDomain,
      loader: async () =>
        import('../domains/family/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'home' as ToolDomain,
      loader: async () =>
        import('../domains/home/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'learning' as ToolDomain,
      loader: async () =>
        import('../domains/learning/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'creativity' as ToolDomain,
      loader: async () =>
        import('../domains/creativity/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'community' as ToolDomain,
      loader: async () =>
        import('../domains/community/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'legal-admin' as ToolDomain,
      loader: async () =>
        import('../domains/legal-admin/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'second-chances' as ToolDomain,
      loader: async () =>
        import('../domains/second-chances/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'connection' as ToolDomain,
      loader: async () =>
        import('../domains/connection/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'difficult-conversations' as ToolDomain,
      loader: async () =>
        import('../domains/difficult-conversations/index.js').then(async (m) =>
          m.getToolDefinitions()
        ),
    },
    {
      name: 'life-transitions' as ToolDomain,
      loader: async () =>
        import('../domains/life-transitions/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'reflection-games' as ToolDomain,
      loader: async () =>
        import('../domains/reflection-games/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'quiet-growth' as ToolDomain,
      loader: async () =>
        import('../domains/quiet-growth/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === PERSONA-SPECIFIC "BETTER THAN HUMAN" DOMAINS ===
    {
      name: 'pattern-mastery' as ToolDomain,
      loader: async () =>
        import('../domains/pattern-mastery/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'workflow-mastery' as ToolDomain,
      loader: async () =>
        import('../domains/workflow-mastery/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'milestone-mastery' as ToolDomain,
      loader: async () =>
        import('../domains/milestone-mastery/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'habit-persistence' as ToolDomain,
      loader: async () =>
        import('../domains/habit-persistence/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'timeless-perspective' as ToolDomain,
      loader: async () =>
        import('../domains/timeless-perspective/index.js').then(async (m) =>
          m.getToolDefinitions()
        ),
    },

    // === DEVELOPER DOMAIN ===
    {
      name: 'developer' as ToolDomain,
      loader: async () =>
        import('../domains/developer/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === DEVELOPER-CUSTOM DOMAIN (API-registered tools) ===
    // This domain is populated dynamically via Developer Platform API, not static files.
    // Tools are registered at runtime through developer-tool-integration.ts
    {
      name: 'developer-custom' as ToolDomain,
      loader: async () => [], // Empty - tools are registered dynamically via API
    },

    // === BEHAVIOR DOMAIN (Bidirectional behavior system) ===
    {
      name: 'behavior' as ToolDomain,
      loader: async () =>
        import('../domains/behavior/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === LIFE THESIS DOMAIN (Cross-persona "why" capturing) ===
    {
      name: 'life-thesis' as ToolDomain,
      loader: async () =>
        import('../domains/life-thesis/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === MARKETING DOMAIN (Alex's social media dogfooding tools) ===
    {
      name: 'marketing' as ToolDomain,
      loader: async () =>
        import('../domains/marketing/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === SMART HOME DOMAIN (Home Assistant integration) ===
    {
      name: 'smart-home' as ToolDomain,
      loader: async () =>
        import('../domains/smart-home/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === WEBHOOKS DOMAIN (IFTTT, Zapier, Siri Shortcuts) ===
    {
      name: 'webhooks' as ToolDomain,
      loader: async () =>
        import('../domains/webhooks/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === REFERRAL DOMAIN (Viral growth via voice calls) ===
    {
      name: 'referral' as ToolDomain,
      loader: async () =>
        import('../domains/referral/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === MEDIA DISCOVERY DOMAINS ===
    {
      name: 'books' as ToolDomain,
      loader: async () =>
        import('../domains/books/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'podcasts' as ToolDomain,
      loader: async () =>
        import('../domains/podcasts/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'video' as ToolDomain,
      loader: async () =>
        import('../domains/video/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === NEW LIFE COACHING DOMAINS (EXPANSION) ===
    {
      name: 'boundaries' as ToolDomain,
      loader: async () =>
        import('../domains/boundaries/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'social-skills' as ToolDomain,
      loader: async () =>
        import('../domains/social-skills/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'body-relationship' as ToolDomain,
      loader: async () =>
        import('../domains/body-relationship/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'anger' as ToolDomain,
      loader: async () =>
        import('../domains/anger/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'shame' as ToolDomain,
      loader: async () =>
        import('../domains/shame/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'envy' as ToolDomain,
      loader: async () =>
        import('../domains/envy/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'resentment' as ToolDomain,
      loader: async () =>
        import('../domains/resentment/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'caregiver' as ToolDomain,
      loader: async () =>
        import('../domains/caregiver/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'divorce' as ToolDomain,
      loader: async () =>
        import('../domains/divorce/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'new-parent' as ToolDomain,
      loader: async () =>
        import('../domains/new-parent/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'empty-nest' as ToolDomain,
      loader: async () =>
        import('../domains/empty-nest/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'infidelity' as ToolDomain,
      loader: async () =>
        import('../domains/infidelity/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'health-diagnosis' as ToolDomain,
      loader: async () =>
        import('../domains/health-diagnosis/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'job-loss' as ToolDomain,
      loader: async () =>
        import('../domains/job-loss/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'sobriety' as ToolDomain,
      loader: async () =>
        import('../domains/sobriety/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'sandwich-generation' as ToolDomain,
      loader: async () =>
        import('../domains/sandwich-generation/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'blended-family' as ToolDomain,
      loader: async () =>
        import('../domains/blended-family/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'coming-out' as ToolDomain,
      loader: async () =>
        import('../domains/coming-out/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'faith-transition' as ToolDomain,
      loader: async () =>
        import('../domains/faith-transition/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'dating' as ToolDomain,
      loader: async () =>
        import('../domains/dating/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'neurodiversity' as ToolDomain,
      loader: async () =>
        import('../domains/neurodiversity/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'trauma-support' as ToolDomain,
      loader: async () =>
        import('../domains/trauma-support/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'procrastination' as ToolDomain,
      loader: async () =>
        import('../domains/procrastination/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'digital-wellness' as ToolDomain,
      loader: async () =>
        import('../domains/digital-wellness/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'perfectionism' as ToolDomain,
      loader: async () =>
        import('../domains/perfectionism/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'intimacy' as ToolDomain,
      loader: async () =>
        import('../domains/intimacy/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'burnout-recovery' as ToolDomain,
      loader: async () =>
        import('../domains/burnout-recovery/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'chronic-conditions' as ToolDomain,
      loader: async () =>
        import('../domains/chronic-conditions/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'midlife' as ToolDomain,
      loader: async () =>
        import('../domains/midlife/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'breakup-recovery' as ToolDomain,
      loader: async () =>
        import('../domains/breakup-recovery/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === SCHEDULING DOMAIN (Voice-accessible scheduling) ===
    {
      name: 'scheduling' as ToolDomain,
      loader: async () =>
        import('../domains/scheduling/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === CONCIERGE DOMAIN (AI-powered outreach) ===
    {
      name: 'concierge' as ToolDomain,
      loader: async () =>
        import('../domains/concierge/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === VIBE DOMAIN (Unified environment control) ===
    {
      name: 'vibe' as ToolDomain,
      loader: async () =>
        import('../domains/vibe/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === GROUP CONVERSATION DOMAIN (Team roundtables, conference calls) ===
    {
      name: 'group-conversation' as ToolDomain,
      loader: async () =>
        import('../domains/group-conversation/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === TRAVEL DOMAIN (Flights, hotels, trip planning) ===
    {
      name: 'travel' as ToolDomain,
      loader: async () =>
        import('../domains/travel/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === SETTINGS DOMAIN (User preferences: language, voice, session settings) ===
    {
      name: 'settings' as ToolDomain,
      loader: async () =>
        import('../domains/settings/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === ROUTINES DOMAIN (Ferni's care routines - "What I Do For You") ===
    {
      name: 'routines' as ToolDomain,
      loader: async () =>
        import('../domains/routines/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === NAYAN'S SUPERHUMAN WISDOM DOMAIN ===
    {
      name: 'nayan-wisdom' as ToolDomain,
      loader: async () =>
        import('../domains/nayan-wisdom/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === MAYA'S SUPERHUMAN COACHING DOMAIN ===
    {
      name: 'maya-coaching' as ToolDomain,
      loader: async () =>
        import('../domains/maya-coaching/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === ALEX'S SUPERHUMAN COMMUNICATION DOMAIN ===
    {
      name: 'superhuman-communication' as ToolDomain,
      loader: async () =>
        import('../domains/communication/superhuman-tools/llm-tools.js').then((m) => m.getToolDefinitions()),
    },

    // === JORDAN'S SUPERHUMAN PLANNING DOMAIN ===
    {
      name: 'jordan-planning' as ToolDomain,
      loader: async () =>
        import('../domains/jordan-planning/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === PETER'S SUPERHUMAN ANALYTICS DOMAIN ===
    {
      name: 'peter-analytics' as ToolDomain,
      loader: async (): Promise<ToolDefinition[]> => {
        const m = await import('../domains/peter-analytics/index.js');
        return m.getToolDefinitions();
      },
    },

    // === LOCAL SEARCH DOMAIN (Google Places + Yelp) ===
    {
      name: 'local-search' as ToolDomain,
      loader: async () =>
        import('../domains/local-search/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === VOICE ENROLLMENT DOMAIN (Phone caller voice enrollment) ===
    {
      name: 'voice-enrollment' as ToolDomain,
      loader: async () =>
        import('../domains/voice-enrollment/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === INSIGHTS DOMAIN (Analytics summaries, progress tracking) ===
    {
      name: 'insights' as ToolDomain,
      loader: async () =>
        import('../domains/insights/index.js').then(async (m) => m.getToolDefinitions()),
    },

    // === LIFE AUTOMATION DOMAINS ===
    {
      name: 'commerce' as ToolDomain,
      loader: async () =>
        import('../domains/commerce/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'documents' as ToolDomain,
      loader: async () =>
        import('../domains/documents/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'email-intelligence' as ToolDomain,
      loader: async () =>
        import('../domains/email-intelligence/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'meal-planning' as ToolDomain,
      loader: async () =>
        import('../domains/meal-planning/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'projects' as ToolDomain,
      loader: async () =>
        import('../domains/projects/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'social-events' as ToolDomain,
      loader: async () =>
        import('../domains/social-events/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'transportation' as ToolDomain,
      loader: async () =>
        import('../domains/transportation/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'vehicle' as ToolDomain,
      loader: async () =>
        import('../domains/vehicle/index.js').then(async (m) => m.getToolDefinitions()),
    },
    {
      name: 'workflows' as ToolDomain,
      loader: async () =>
        import('../domains/workflows/index.js').then(async (m) => m.getToolDefinitions()),
    },
  ];

  for (const { name, loader } of domains) {
    // Cast loader to expected type - some domains return FunctionTool[] which is compatible at runtime
    registerDomainLoader(name, loader as () => Promise<ToolDefinition[]>);
  }

  getLogger().info(
    { domainsRegistered: domains.length, expectedDomains: ALL_TOOL_DOMAINS.length },
    'Domain loaders auto-registered'
  );

  // FIX: Sanity check - THROW if domains are missing (not just log)
  // Missing domains is a critical bug that prevents tools from being available
  const registeredDomainNames = new Set(domains.map((d) => d.name));
  const missingDomains = ALL_TOOL_DOMAINS.filter((d) => !registeredDomainNames.has(d));
  if (missingDomains.length > 0) {
    const errorMsg = `CRITICAL: autoRegisterAllDomains is missing ${missingDomains.length} domains: ${missingDomains.join(', ')}. Tools will not be available!`;
    getLogger().error({ missingDomains }, `❌ ${errorMsg}`);
    // Throw in non-production to catch this during development
    // In production, log but don't crash (some tools are better than none)
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(errorMsg);
    }
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
        const { domain, count } = result.value;
        // FIX: Handle -1 return value (no loader registered)
        if (count < 0) {
          errors.push(`${domain}: No loader registered`);
        } else {
          byDomain[domain] = count;
        }
      } else {
        errors.push(String(result.reason));
      }
    }
  } else {
    // Load domains sequentially
    for (const domain of domainsToLoad) {
      try {
        const count = await loadToolDomain(domain, { isLazy: false });
        // FIX: Handle -1 return value (no loader registered)
        if (count < 0) {
          errors.push(`${domain}: No loader registered`);
        } else {
          byDomain[domain] = count;
        }
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

  // 🚨 CRITICAL: Output summary to stderr for visibility
  process.stderr.write(`\n${'='.repeat(60)}\n`);
  process.stderr.write(`🔧 TOOL REGISTRY INITIALIZATION SUMMARY\n`);
  process.stderr.write(`   Total tools loaded: ${totalLoaded}\n`);
  process.stderr.write(`   Domains loaded: ${Object.keys(byDomain).length}\n`);
  process.stderr.write(`   Remaining domains (lazy): ${remainingDomains.length}\n`);
  process.stderr.write(`   Time: ${elapsed}ms\n`);

  if (errors.length > 0) {
    process.stderr.write(`\n🚨 ERRORS (${errors.length}):\n`);
    for (const err of errors) {
      process.stderr.write(`   ❌ ${err}\n`);
    }
    process.stderr.write(`\n⚠️  Some tools will not be available!\n`);
  }

  if (totalLoaded < 20) {
    process.stderr.write(`\n🚨🚨🚨 CRITICAL WARNING 🚨🚨🚨\n`);
    process.stderr.write(`Only ${totalLoaded} tools loaded! Expected 40-80 minimum.\n`);
    process.stderr.write(`Voice agent capabilities will be severely limited.\n`);
    process.stderr.write(`🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨\n`);
  }

  process.stderr.write(`${'='.repeat(60)}\n\n`);

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
