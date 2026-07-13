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
 * This maps domain names to their module paths.
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
const DOMAIN_MODULES: Record<string, string> = {
  // Life Coaching Domains
  career: '../../tools/domains/career/index.js',
  grief: '../../tools/domains/grief/index.js',
  'pattern-mastery': '../../tools/domains/pattern-mastery/index.js',
  'workflow-mastery': '../../tools/domains/workflow-mastery/index.js',
  health: '../../tools/domains/health/index.js', // Fallback for tools not in health-executor
  wellness: '../../tools/domains/wellness/index.js',
  wisdom: '../../tools/domains/wisdom/index.js',
  communication: '../../tools/domains/communication/index.js',
  crisis: '../../tools/domains/crisis/index.js',
  relationships: '../../tools/domains/relationships/index.js',
  boundaries: '../../tools/domains/boundaries/index.js',
  dating: '../../tools/domains/dating/index.js',
  anger: '../../tools/domains/anger/index.js',
  procrastination: '../../tools/domains/procrastination/index.js',
  'burnout-recovery': '../../tools/domains/burnout-recovery/index.js',
  'trauma-support': '../../tools/domains/trauma-support/index.js',
  'chronic-conditions': '../../tools/domains/chronic-conditions/index.js',
  'digital-wellness': '../../tools/domains/digital-wellness/index.js',
  'body-relationship': '../../tools/domains/body-relationship/index.js',
  neurodiversity: '../../tools/domains/neurodiversity/index.js',
  'self-compassion': '../../tools/domains/self-compassion/index.js',
  intimacy: '../../tools/domains/intimacy/index.js',
  'breakup-recovery': '../../tools/domains/breakup-recovery/index.js',
  midlife: '../../tools/domains/midlife/index.js',
  'life-transitions': '../../tools/domains/life-transitions/index.js',
  'life-planning': '../../tools/domains/life-planning/index.js',
  decisions: '../../tools/domains/decisions/index.js',
  family: '../../tools/domains/family/index.js',
  creativity: '../../tools/domains/creativity/index.js',
  learning: '../../tools/domains/learning/index.js',
  meaning: '../../tools/domains/meaning/index.js',
  dreams: '../../tools/domains/dreams/index.js',
  vulnerability: '../../tools/domains/vulnerability/index.js',
  presence: '../../tools/domains/presence/index.js',
  play: '../../tools/domains/play/index.js',
  stories: '../../tools/domains/stories/index.js',
  connection: '../../tools/domains/connection/index.js',
  curiosity: '../../tools/domains/curiosity/index.js',
  community: '../../tools/domains/community/index.js',
  sobriety: '../../tools/domains/sobriety/index.js',
  finance: '../../tools/domains/finance/index.js', // Fallback for tools not in finance-executor
  travel: '../../tools/domains/travel/index.js', // Fallback for tools not in travel-executor
  engagement: '../../tools/domains/engagement/index.js',
  games: '../../tools/domains/games/index.js', // Fallback for tools not in entertainment-executor
  'ceo-coaching': '../../tools/domains/ceo-coaching/index.js', // Fallback for tools not in ceo-executor
  transportation: '../../tools/domains/transportation/index.js', // Part of travel-executor
  'simple-utilities': '../../tools/domains/simple-utilities/index.js', // Humor tools in entertainment-executor
};

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

  for (const [domainName, modulePath] of Object.entries(DOMAIN_MODULES)) {
    try {
      // Dynamic import of domain module
      const domainModule = (await import(modulePath)) as {
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
      log.debug({ domain: domainName, toolCount: definitions.length }, 'Domain loaded');
    } catch (err) {
      // Domain might not exist or have issues - that's OK, skip it
      log.debug({ domain: domainName, error: String(err) }, 'Domain not available');
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
  domainCache.clear();
  toolToDomainMap.clear();
}
