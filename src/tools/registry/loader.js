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
import { ALL_TOOL_DOMAINS } from './types.js';
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
export const ESSENTIAL_DOMAINS = [
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
export const HIGH_PRIORITY_DOMAINS = [
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
const loadedDomains = new Set();
/**
 * Track in-progress domain loads to prevent race conditions.
 * When multiple callers request the same domain simultaneously,
 * only one load executes and others await the same promise.
 */
const pendingLoads = new Map();
/**
 * Check if a domain has been loaded
 */
export function isDomainLoaded(domain) {
    return loadedDomains.has(domain);
}
/**
 * Get list of loaded domains
 */
export function getLoadedDomains() {
    return Array.from(loadedDomains);
}
// ============================================================================
// DOMAIN LOADERS
// ============================================================================
/**
 * Map of domain to loader function
 * Each domain's index.ts should export a `getToolDefinitions()` function
 */
const domainLoaders = {};
/**
 * Register a domain loader
 */
export function registerDomainLoader(domain, loader) {
    domainLoaders[domain] = loader;
    getLogger().debug({ domain }, 'Domain loader registered');
}
/**
 * Load tools from a specific domain
 * @param domain The domain to load
 * @param options.isLazy Whether this is a lazy load (for metrics)
 */
export async function loadToolDomain(domain, options = {}) {
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
    }
    finally {
        // Always clean up pending loads map
        pendingLoads.delete(domain);
    }
}
/**
 * Internal domain loading implementation (separated for race condition handling)
 */
async function doLoadDomain(domain, options) {
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
    }
    else {
        try {
            const definitions = await loader();
            toolRegistry.registerAll(definitions);
            toolCount = definitions.length;
            getLogger().info({ domain, count: definitions.length }, 'Domain tools loaded');
        }
        catch (error) {
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
export async function loadToolDomainLazy(domain) {
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
export async function loadToolDomainsLazy(domains) {
    const unloadedDomains = domains.filter((d) => !loadedDomains.has(d));
    if (unloadedDomains.length === 0) {
        return 0;
    }
    getLogger().info({ domains: unloadedDomains }, '🔄 Lazy loading multiple domains');
    // Wrap with timeout to prevent hanging indefinitely
    const loadWithTimeout = async (domain) => {
        return Promise.race([
            loadToolDomain(domain, { isLazy: true }),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout loading domain "${domain}" after ${LAZY_LOAD_TIMEOUT_MS}ms`)), LAZY_LOAD_TIMEOUT_MS)),
        ]);
    };
    const results = await Promise.allSettled(unloadedDomains.map(loadWithTimeout));
    // Log any timeouts or failures
    results.forEach((result, i) => {
        if (result.status === 'rejected') {
            getLogger().warn({ domain: unloadedDomains[i], error: String(result.reason) }, '⚠️ Domain lazy load failed or timed out');
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
export async function autoRegisterAllDomains() {
    // Use static imports so bundlers can analyze them
    // Note: We import getToolDefinitions from each domain's index file
    // ⚠️ Keep this list in sync with ALL_TOOL_DOMAINS in types.ts!
    const domains = [
        // === CORE FUNCTIONAL DOMAINS ===
        {
            name: 'memory',
            loader: async () => import('../domains/memory/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'handoff',
            loader: async () => import('../domains/handoff/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'entertainment',
            loader: async () => import('../domains/entertainment/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'awareness',
            loader: async () => import('../domains/awareness/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'simple-utilities',
            loader: async () => import('../domains/simple-utilities/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'information',
            loader: async () => import('../domains/information/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'productivity',
            loader: async () => import('../domains/productivity/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'calendar',
            loader: async () => import('../domains/calendar/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'communication',
            loader: async () => import('../domains/communication/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'habits',
            loader: async () => import('../domains/habits/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'finance',
            loader: async () => import('../domains/finance/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'research',
            loader: async () => import('../domains/research/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'life-planning',
            loader: async () => import('../domains/life-planning/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'wellness',
            loader: async () => import('../domains/wellness/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'wisdom',
            loader: async () => import('../domains/wisdom/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'telephony',
            loader: async () => import('../domains/telephony/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'proactive',
            loader: async () => import('../domains/proactive/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'games',
            loader: async () => import('../domains/games/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'cameo',
            loader: async () => import('../domains/cameo/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'engagement',
            loader: async () => import('../domains/engagement/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === DEEP HUMAN ENGAGEMENT DOMAINS ===
        {
            name: 'grief',
            loader: async () => import('../domains/grief/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'presence',
            loader: async () => import('../domains/presence/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'meaning',
            loader: async () => import('../domains/meaning/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'relationships',
            loader: async () => import('../domains/relationships/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'stories',
            loader: async () => import('../domains/stories/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'curiosity',
            loader: async () => import('../domains/curiosity/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'vulnerability',
            loader: async () => import('../domains/vulnerability/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'dreams',
            loader: async () => import('../domains/dreams/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'play',
            loader: async () => import('../domains/play/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'self-compassion',
            loader: async () => import('../domains/self-compassion/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === LIFE COACHING DOMAINS ===
        {
            name: 'crisis',
            loader: async () => import('../domains/crisis/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'health',
            loader: async () => import('../domains/health/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'career',
            loader: async () => import('../domains/career/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'decisions',
            loader: async () => import('../domains/decisions/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'family',
            loader: async () => import('../domains/family/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'home',
            loader: async () => import('../domains/home/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'learning',
            loader: async () => import('../domains/learning/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'creativity',
            loader: async () => import('../domains/creativity/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'community',
            loader: async () => import('../domains/community/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'legal-admin',
            loader: async () => import('../domains/legal-admin/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'second-chances',
            loader: async () => import('../domains/second-chances/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'connection',
            loader: async () => import('../domains/connection/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'difficult-conversations',
            loader: async () => import('../domains/difficult-conversations/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'life-transitions',
            loader: async () => import('../domains/life-transitions/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'reflection-games',
            loader: async () => import('../domains/reflection-games/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'quiet-growth',
            loader: async () => import('../domains/quiet-growth/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === PERSONA-SPECIFIC "BETTER THAN HUMAN" DOMAINS ===
        {
            name: 'pattern-mastery',
            loader: async () => import('../domains/pattern-mastery/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'workflow-mastery',
            loader: async () => import('../domains/workflow-mastery/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'milestone-mastery',
            loader: async () => import('../domains/milestone-mastery/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'habit-persistence',
            loader: async () => import('../domains/habit-persistence/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'timeless-perspective',
            loader: async () => import('../domains/timeless-perspective/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === DEVELOPER DOMAIN ===
        {
            name: 'developer',
            loader: async () => import('../domains/developer/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === DEVELOPER-CUSTOM DOMAIN (API-registered tools) ===
        // This domain is populated dynamically via Developer Platform API, not static files.
        // Tools are registered at runtime through developer-tool-integration.ts
        {
            name: 'developer-custom',
            loader: async () => [], // Empty - tools are registered dynamically via API
        },
        // === BEHAVIOR DOMAIN (Bidirectional behavior system) ===
        {
            name: 'behavior',
            loader: async () => import('../domains/behavior/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === LIFE THESIS DOMAIN (Cross-persona "why" capturing) ===
        {
            name: 'life-thesis',
            loader: async () => import('../domains/life-thesis/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === MARKETING DOMAIN (Alex's social media dogfooding tools) ===
        {
            name: 'marketing',
            loader: async () => import('../domains/marketing/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === SMART HOME DOMAIN (Home Assistant integration) ===
        {
            name: 'smart-home',
            loader: async () => import('../domains/smart-home/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === WEBHOOKS DOMAIN (IFTTT, Zapier, Siri Shortcuts) ===
        {
            name: 'webhooks',
            loader: async () => import('../domains/webhooks/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === REFERRAL DOMAIN (Viral growth via voice calls) ===
        {
            name: 'referral',
            loader: async () => import('../domains/referral/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === MEDIA DISCOVERY DOMAINS ===
        {
            name: 'books',
            loader: async () => import('../domains/books/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'podcasts',
            loader: async () => import('../domains/podcasts/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'video',
            loader: async () => import('../domains/video/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === NEW LIFE COACHING DOMAINS (EXPANSION) ===
        {
            name: 'boundaries',
            loader: async () => import('../domains/boundaries/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'social-skills',
            loader: async () => import('../domains/social-skills/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'body-relationship',
            loader: async () => import('../domains/body-relationship/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'anger',
            loader: async () => import('../domains/anger/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'shame',
            loader: async () => import('../domains/shame/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'envy',
            loader: async () => import('../domains/envy/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'resentment',
            loader: async () => import('../domains/resentment/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'caregiver',
            loader: async () => import('../domains/caregiver/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'divorce',
            loader: async () => import('../domains/divorce/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'new-parent',
            loader: async () => import('../domains/new-parent/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'empty-nest',
            loader: async () => import('../domains/empty-nest/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'infidelity',
            loader: async () => import('../domains/infidelity/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'health-diagnosis',
            loader: async () => import('../domains/health-diagnosis/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'job-loss',
            loader: async () => import('../domains/job-loss/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'sobriety',
            loader: async () => import('../domains/sobriety/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'sandwich-generation',
            loader: async () => import('../domains/sandwich-generation/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'blended-family',
            loader: async () => import('../domains/blended-family/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'coming-out',
            loader: async () => import('../domains/coming-out/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'faith-transition',
            loader: async () => import('../domains/faith-transition/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'dating',
            loader: async () => import('../domains/dating/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'neurodiversity',
            loader: async () => import('../domains/neurodiversity/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'trauma-support',
            loader: async () => import('../domains/trauma-support/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'procrastination',
            loader: async () => import('../domains/procrastination/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'digital-wellness',
            loader: async () => import('../domains/digital-wellness/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'perfectionism',
            loader: async () => import('../domains/perfectionism/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'intimacy',
            loader: async () => import('../domains/intimacy/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'burnout-recovery',
            loader: async () => import('../domains/burnout-recovery/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'chronic-conditions',
            loader: async () => import('../domains/chronic-conditions/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'midlife',
            loader: async () => import('../domains/midlife/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'breakup-recovery',
            loader: async () => import('../domains/breakup-recovery/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === SCHEDULING DOMAIN (Voice-accessible scheduling) ===
        {
            name: 'scheduling',
            loader: async () => import('../domains/scheduling/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === CONCIERGE DOMAIN (AI-powered outreach) ===
        {
            name: 'concierge',
            loader: async () => import('../domains/concierge/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === VIBE DOMAIN (Unified environment control) ===
        {
            name: 'vibe',
            loader: async () => import('../domains/vibe/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === GROUP CONVERSATION DOMAIN (Team roundtables, conference calls) ===
        {
            name: 'group-conversation',
            loader: async () => import('../domains/group-conversation/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === TRAVEL DOMAIN (Flights, hotels, trip planning) ===
        {
            name: 'travel',
            loader: async () => import('../domains/travel/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === SETTINGS DOMAIN (User preferences: language, voice, session settings) ===
        {
            name: 'settings',
            loader: async () => import('../domains/settings/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === ROUTINES DOMAIN (Ferni's care routines - "What I Do For You") ===
        {
            name: 'routines',
            loader: async () => import('../domains/routines/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === NAYAN'S SUPERHUMAN WISDOM DOMAIN ===
        {
            name: 'nayan-wisdom',
            loader: async () => import('../domains/nayan-wisdom/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === MAYA'S SUPERHUMAN COACHING DOMAIN ===
        {
            name: 'maya-coaching',
            loader: async () => import('../domains/maya-coaching/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === ALEX'S SUPERHUMAN COMMUNICATION DOMAIN ===
        {
            name: 'superhuman-communication',
            loader: async () => import('../domains/communication/superhuman-tools/llm-tools.js').then((m) => m.getToolDefinitions()),
        },
        // === JORDAN'S SUPERHUMAN PLANNING DOMAIN ===
        {
            name: 'jordan-planning',
            loader: async () => import('../domains/jordan-planning/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === PETER'S SUPERHUMAN ANALYTICS DOMAIN ===
        {
            name: 'peter-analytics',
            loader: async () => {
                const m = await import('../domains/peter-analytics/index.js');
                return m.getToolDefinitions();
            },
        },
        // === LOCAL SEARCH DOMAIN (Google Places + Yelp) ===
        {
            name: 'local-search',
            loader: async () => import('../domains/local-search/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === VOICE ENROLLMENT DOMAIN (Phone caller voice enrollment) ===
        {
            name: 'voice-enrollment',
            loader: async () => import('../domains/voice-enrollment/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === INSIGHTS DOMAIN (Analytics summaries, progress tracking) ===
        {
            name: 'insights',
            loader: async () => import('../domains/insights/index.js').then(async (m) => m.getToolDefinitions()),
        },
        // === LIFE AUTOMATION DOMAINS ===
        {
            name: 'commerce',
            loader: async () => import('../domains/commerce/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'documents',
            loader: async () => import('../domains/documents/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'email-intelligence',
            loader: async () => import('../domains/email-intelligence/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'meal-planning',
            loader: async () => import('../domains/meal-planning/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'projects',
            loader: async () => import('../domains/projects/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'social-events',
            loader: async () => import('../domains/social-events/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'transportation',
            loader: async () => import('../domains/transportation/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'vehicle',
            loader: async () => import('../domains/vehicle/index.js').then(async (m) => m.getToolDefinitions()),
        },
        {
            name: 'workflows',
            loader: async () => import('../domains/workflows/index.js').then(async (m) => m.getToolDefinitions()),
        },
    ];
    for (const { name, loader } of domains) {
        // Cast loader to expected type - some domains return FunctionTool[] which is compatible at runtime
        registerDomainLoader(name, loader);
    }
    getLogger().info({ domainsRegistered: domains.length, expectedDomains: ALL_TOOL_DOMAINS.length }, 'Domain loaders auto-registered');
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
/**
 * Initialize the tool registry
 *
 * By default, uses lazy loading which only loads essential domains at startup.
 * Set lazyLoading: false for legacy behavior (load all domains).
 */
export async function initializeToolRegistry(options = {}) {
    perfInstrumentation.startPhase('tool-registry-init');
    const startTime = Date.now();
    // Determine if we're using lazy loading
    const lazyLoading = options.lazyLoading ?? true;
    const loadHighPriority = options.loadHighPriority ?? true;
    // Determine which domains to load
    let domainsToLoad;
    if (options.domains) {
        // Explicit domains override everything
        domainsToLoad = options.domains;
    }
    else if (lazyLoading) {
        // Lazy loading: start with essential, optionally add high-priority
        domainsToLoad = [...ESSENTIAL_DOMAINS];
        if (loadHighPriority) {
            domainsToLoad.push(...HIGH_PRIORITY_DOMAINS);
        }
    }
    else {
        // Legacy: load all domains
        domainsToLoad = [...ALL_TOOL_DOMAINS];
    }
    const skipSet = new Set(options.skipDomains || []);
    const byDomain = {};
    const errors = [];
    // Remove duplicates and skipped domains
    domainsToLoad = [...new Set(domainsToLoad)].filter((d) => !skipSet.has(d));
    getLogger().info({
        domainsToLoad: domainsToLoad.length,
        lazyLoading,
        totalAvailable: ALL_TOOL_DOMAINS.length,
    }, 'Initializing tool registry...');
    // Take memory snapshot before loading
    perfInstrumentation.snapshotMemory('before-tool-load');
    // Load domains
    if (options.parallel !== false) {
        // Load all domains in parallel (default)
        const results = await Promise.allSettled(domainsToLoad.map(async (domain) => {
            const count = await loadToolDomain(domain, { isLazy: false });
            return { domain, count };
        }));
        for (const result of results) {
            if (result.status === 'fulfilled') {
                const { domain, count } = result.value;
                // FIX: Handle -1 return value (no loader registered)
                if (count < 0) {
                    errors.push(`${domain}: No loader registered`);
                }
                else {
                    byDomain[domain] = count;
                }
            }
            else {
                errors.push(String(result.reason));
            }
        }
    }
    else {
        // Load domains sequentially
        for (const domain of domainsToLoad) {
            try {
                const count = await loadToolDomain(domain, { isLazy: false });
                // FIX: Handle -1 return value (no loader registered)
                if (count < 0) {
                    errors.push(`${domain}: No loader registered`);
                }
                else {
                    byDomain[domain] = count;
                }
            }
            catch (error) {
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
    getLogger().info({
        totalTools: totalLoaded,
        domainsLoaded: Object.keys(byDomain).length,
        remainingDomains: remainingDomains.length,
        lazyLoading,
        elapsed,
        errors: errors.length,
    }, lazyLoading
        ? '🚀 Tool registry initialized (lazy loading enabled)'
        : '🔧 Tool registry initialization complete');
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
        byDomain: byDomain,
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
export function convertLegacyTools(tools, domain, options = {}) {
    const definitions = [];
    for (const [id, tool] of Object.entries(tools)) {
        if (typeof tool !== 'object' || tool === null)
            continue;
        const toolObj = tool;
        // Check if it looks like a tool
        if (typeof toolObj.description !== 'string') {
            getLogger().debug({ id }, 'Skipping non-tool entry');
            continue;
        }
        const definition = {
            id: options.prefix ? `${options.prefix}_${id}` : id,
            name: id.replace(/([A-Z])/g, ' $1').trim(), // camelCase to Title Case
            description: toolObj.description,
            domain,
            tags: options.tags,
            create: () => ({
                description: toolObj.description,
                parameters: toolObj.parameters,
                execute: typeof toolObj.execute === 'function'
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
export function registerLegacyTools(tools, domain, options = {}) {
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
export function createDomainExport(domain, definitions) {
    // Validate all definitions have the correct domain
    for (const def of definitions) {
        if (def.domain !== domain && !def.additionalDomains?.includes(domain)) {
            getLogger().warn({ toolId: def.id, expected: domain, actual: def.domain }, 'Tool domain mismatch in domain export');
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
//# sourceMappingURL=loader.js.map