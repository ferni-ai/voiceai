/**
 * Dynamic Domain Executor - Bridge to ALL Domain Tools
 *
 * This executor bridges the JSON workaround path to all registered domain tools.
 * Instead of maintaining individual executors for every domain, this:
 * 1. Looks up the tool in the central registry
 * 2. Creates/invokes the tool with proper context
 * 3. Returns the result
 *
 * This enables voice-calling of ~135+ tools that exist in domains/ but weren't
 * manually wired to the JSON workaround system.
 *
 * @module agents/shared/tool-executors/dynamic-domain-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { isTool } from '../../../tools/registry/types.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'DynamicDomainExecutor' });

// Cache for loaded domains to avoid repeated imports
const domainCache = new Map<string, unknown>();

// Map of tool IDs to their domain for routing
const toolToDomainMap = new Map<string, string>();

// Flag to track initialization
let initialized = false;

/**
 * Domain definitions with their tool exports.
 * This maps domain names to loaders for their modules.
 *
 * NOTE (January 2026): Some domains also have specialized executors in index.ts:
 * - health → health-executor.ts (handles FTIS semantic IDs)
 * - finance → finance-executor.ts (handles FTIS semantic IDs)
 * - games → entertainment-executor.ts (handles FTIS semantic IDs)
 * - travel → travel-executor.ts (handles FTIS semantic IDs)
 * - ceo-coaching → ceo-executor.ts (handles FTIS semantic IDs)
 *
 * PRECEDENCE: Specialized executors are checked FIRST (via toolToExecutor map).
 * This dynamic executor only runs if the tool ID isn't claimed by a specialized executor.
 * This provides a fallback for domain tools that aren't in specialized HANDLED_TOOLS arrays.
 */
type DomainLoader = () => Promise<unknown>;

/**
 * Static import thunks (not computed path strings): TypeScript and the bundler
 * check each path, so a wrong one fails the build instead of silently loading
 * nothing. Paths are relative to this file (src/agents/shared/tool-executors/).
 */
const DOMAIN_MODULES: Record<string, DomainLoader> = {
  // Life Coaching Domains
  career: () => import('../../../tools/domains/career/index.js'),
  grief: () => import('../../../tools/domains/grief/index.js'),
  'pattern-mastery': () => import('../../../tools/domains/pattern-mastery/index.js'),
  'workflow-mastery': () => import('../../../tools/domains/workflow-mastery/index.js'),
  health: () => import('../../../tools/domains/health/index.js'), // Fallback for tools not in health-executor
  wellness: () => import('../../../tools/domains/wellness/index.js'),
  wisdom: () => import('../../../tools/domains/wisdom/index.js'),
  communication: () => import('../../../tools/domains/communication/index.js'),
  crisis: () => import('../../../tools/domains/crisis/index.js'),
  relationships: () => import('../../../tools/domains/relationships/index.js'),
  boundaries: () => import('../../../tools/domains/boundaries/index.js'),
  dating: () => import('../../../tools/domains/dating/index.js'),
  anger: () => import('../../../tools/domains/anger/index.js'),
  procrastination: () => import('../../../tools/domains/procrastination/index.js'),
  'burnout-recovery': () => import('../../../tools/domains/burnout-recovery/index.js'),
  'trauma-support': () => import('../../../tools/domains/trauma-support/index.js'),
  'chronic-conditions': () => import('../../../tools/domains/chronic-conditions/index.js'),
  'digital-wellness': () => import('../../../tools/domains/digital-wellness/index.js'),
  'body-relationship': () => import('../../../tools/domains/body-relationship/index.js'),
  neurodiversity: () => import('../../../tools/domains/neurodiversity/index.js'),
  'self-compassion': () => import('../../../tools/domains/self-compassion/index.js'),
  intimacy: () => import('../../../tools/domains/intimacy/index.js'),
  'breakup-recovery': () => import('../../../tools/domains/breakup-recovery/index.js'),
  midlife: () => import('../../../tools/domains/midlife/index.js'),
  'life-transitions': () => import('../../../tools/domains/life-transitions/index.js'),
  'life-planning': () => import('../../../tools/domains/life-planning/index.js'),
  decisions: () => import('../../../tools/domains/decisions/index.js'),
  family: () => import('../../../tools/domains/family/index.js'),
  creativity: () => import('../../../tools/domains/creativity/index.js'),
  learning: () => import('../../../tools/domains/learning/index.js'),
  meaning: () => import('../../../tools/domains/meaning/index.js'),
  dreams: () => import('../../../tools/domains/dreams/index.js'),
  vulnerability: () => import('../../../tools/domains/vulnerability/index.js'),
  presence: () => import('../../../tools/domains/presence/index.js'),
  play: () => import('../../../tools/domains/play/index.js'),
  stories: () => import('../../../tools/domains/stories/index.js'),
  connection: () => import('../../../tools/domains/connection/index.js'),
  curiosity: () => import('../../../tools/domains/curiosity/index.js'),
  community: () => import('../../../tools/domains/community/index.js'),
  sobriety: () => import('../../../tools/domains/sobriety/index.js'),
  finance: () => import('../../../tools/domains/finance/index.js'), // Fallback for tools not in finance-executor
  travel: () => import('../../../tools/domains/travel/index.js'), // Fallback for tools not in travel-executor
  engagement: () => import('../../../tools/domains/engagement/index.js'),
  games: () => import('../../../tools/domains/games/index.js'), // Fallback for tools not in entertainment-executor
  'ceo-coaching': () => import('../../../tools/domains/ceo-coaching/index.js'), // Fallback for tools not in ceo-executor
  transportation: () => import('../../../tools/domains/transportation/index.js'), // Part of travel-executor
  'simple-utilities': () => import('../../../tools/domains/simple-utilities/index.js'), // Humor tools in entertainment-executor
};

/** Domain names this executor loads, in load order. */
export const DYNAMIC_DOMAINS: readonly string[] = Object.keys(DOMAIN_MODULES);

/** Which domains loaded on the last initialization, and which failed (with why). */
const loadReport: { loaded: string[]; failed: Array<{ domain: string; error: string }> } = {
  loaded: [],
  failed: [],
};

export function getDynamicDomainLoadReport(): {
  loaded: readonly string[];
  failed: ReadonlyArray<{ domain: string; error: string }>;
} {
  return { loaded: [...loadReport.loaded], failed: [...loadReport.failed] };
}

/**
 * Tool definition interface (matches registry/types.ts)
 */
interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  domain: string;
  create: (ctx: unknown) => {
    description: string;
    parameters?: unknown;
    execute: (params: unknown) => Promise<unknown>;
  };
}

/**
 * Initialize the dynamic executor by loading tool metadata from all domains.
 * Called lazily on first tool request.
 */
async function initializeDomainMap(): Promise<void> {
  if (initialized) return;

  const startTime = Date.now();
  let totalTools = 0;
  let loadedDomains = 0;

  loadReport.loaded = [];
  loadReport.failed = [];
  for (const [domainName, load] of Object.entries(DOMAIN_MODULES)) {
    try {
      // Dynamic import of domain module
      const domainModule = (await load()) as {
        getToolDefinitions?: () => Promise<ToolDefinition[]>;
        definitions?: ToolDefinition[];
      };

      // Cache the module
      domainCache.set(domainName, domainModule);

      // Get tool definitions
      let definitions: ToolDefinition[] = [];
      if (typeof domainModule.getToolDefinitions === 'function') {
        definitions = await domainModule.getToolDefinitions();
      } else if (Array.isArray(domainModule.definitions)) {
        definitions = domainModule.definitions;
      }

      // Map each tool ID to its domain
      for (const def of definitions) {
        const toolId = def.id.toLowerCase();
        toolToDomainMap.set(toolId, domainName);
        totalTools++;
      }

      loadedDomains++;
      loadReport.loaded.push(domainName);
      log.debug({ domain: domainName, toolCount: definitions.length }, 'Domain loaded');
    } catch (err) {
      // Skip a broken domain, but say so: its tools won't be voice-callable.
      loadReport.failed.push({ domain: domainName, error: String(err) });
      log.warn({ domain: domainName, error: String(err) }, 'Domain failed to load');
    }
  }

  initialized = true;
  log.info(
    { loadedDomains, totalTools, durationMs: Date.now() - startTime },
    '🔧 Dynamic domain executor initialized'
  );
}

/**
 * Execute a tool from a dynamically loaded domain.
 */
async function executeDomainTool(
  toolId: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  // Ensure initialization
  await initializeDomainMap();

  const toolIdLower = toolId.toLowerCase();
  const domainName = toolToDomainMap.get(toolIdLower);

  if (!domainName) {
    log.debug({ toolId }, 'Tool not found in any domain');
    return null;
  }

  // Get cached domain module
  const domainModule = domainCache.get(domainName) as {
    getToolDefinitions?: () => Promise<ToolDefinition[]>;
    definitions?: ToolDefinition[];
  };

  if (!domainModule) {
    log.warn({ toolId, domain: domainName }, 'Domain module not cached');
    return null;
  }

  // Get tool definitions
  let definitions: ToolDefinition[] = [];
  if (typeof domainModule.getToolDefinitions === 'function') {
    definitions = await domainModule.getToolDefinitions();
  } else if (Array.isArray(domainModule.definitions)) {
    definitions = domainModule.definitions;
  }

  // Find the specific tool
  const toolDef = definitions.find((d) => d.id.toLowerCase() === toolIdLower);
  if (!toolDef) {
    log.warn({ toolId, domain: domainName }, 'Tool definition not found in domain');
    return null;
  }

  // Create tool context matching ToolContext from registry/types.ts
  const toolContext = {
    userId: ctx.userId || 'anonymous',
    agentId: ctx.personaId || 'ferni',
    agentDisplayName: ctx.personaId || 'Ferni',
    sessionId: ctx.sessionId,
    services: {
      has: () => false,
      get: () => {
        throw new Error('Service not available');
      },
      getOptional: () => undefined,
    },
  };

  try {
    // Create and execute the tool
    const tool = toolDef.create(toolContext);
    if (!isTool(tool)) {
      log.error({ toolId, domain: domainName }, 'Tool missing execute');
      return "I couldn't run that action right now.";
    }
    const result = await tool.execute(args);

    log.info(
      { toolId, domain: domainName, argsKeys: Object.keys(args) },
      '✅ Dynamic domain tool executed'
    );

    return result;
  } catch (err) {
    log.error(
      { toolId, domain: domainName, error: String(err) },
      '❌ Dynamic domain tool execution failed'
    );
    return `I couldn't complete that action right now. ${String(err)}`;
  }
}

/**
 * Get all tool IDs handled by the dynamic executor.
 */
export async function getDynamicToolIds(): Promise<string[]> {
  await initializeDomainMap();
  return Array.from(toolToDomainMap.keys());
}

/**
 * Check if a tool is handled by the dynamic executor.
 */
export async function isDynamicTool(toolId: string): Promise<boolean> {
  await initializeDomainMap();
  return toolToDomainMap.has(toolId.toLowerCase());
}

/**
 * The dynamic domain executor.
 * This is a catch-all executor that routes to any registered domain tool.
 *
 * NOTE: This executor should be registered LAST in the executor chain,
 * after all specialized executors, so that manual overrides take precedence.
 */
export const dynamicDomainExecutor: DomainExecutor = {
  domain: 'dynamic-domains',
  // This will be populated with all tool IDs at initialization
  // For now, use a getter pattern
  get handles(): readonly string[] {
    // Return empty array initially - we'll use execute() to dynamically check
    // The actual routing is done in execute() by checking toolToDomainMap
    return [];
  },
  execute: executeDomainTool,
};

/**
 * Force re-initialization (useful for testing or hot reload).
 */
export function resetDynamicExecutor(): void {
  initialized = false;
  loadReport.loaded = [];
  loadReport.failed = [];
  domainCache.clear();
  toolToDomainMap.clear();
}
