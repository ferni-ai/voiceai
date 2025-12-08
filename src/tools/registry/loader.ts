/**
 * Tool Registry Loader
 *
 * Auto-discovers and loads tools from the domains/ directory.
 * Each domain folder should have an index.ts that exports tool definitions.
 *
 * USAGE:
 *
 * // At startup
 * await initializeToolRegistry();
 *
 * // Or load specific domains
 * await loadToolDomain('calendar');
 */

import { getLogger } from '../../utils/safe-logger.js';

import { toolRegistry } from './index.js';
import { ALL_TOOL_DOMAINS, type ToolDomain, type ToolDefinition } from './types.js';

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
 */
export async function loadToolDomain(domain: ToolDomain): Promise<number> {
  const loader = domainLoaders[domain];
  if (!loader) {
    getLogger().debug({ domain }, 'No loader registered for domain, attempting dynamic import');

    // Try dynamic import
    try {
      const module = await import(`../domains/${domain}/index.js`);
      if (module.getToolDefinitions) {
        const definitions = await module.getToolDefinitions();
        toolRegistry.registerAll(definitions);
        getLogger().info(
          { domain, count: definitions.length },
          'Domain tools loaded via dynamic import'
        );
        return definitions.length;
      } else if (module.default && Array.isArray(module.default)) {
        toolRegistry.registerAll(module.default);
        getLogger().info(
          { domain, count: module.default.length },
          'Domain tools loaded via default export'
        );
        return module.default.length;
      }
    } catch (error) {
      // Domain not implemented yet - this is fine
      getLogger().debug({ domain, error }, 'Could not load domain (may not be implemented yet)');
      return 0;
    }

    return 0;
  }

  try {
    const definitions = await loader();
    toolRegistry.registerAll(definitions);
    getLogger().info({ domain, count: definitions.length }, 'Domain tools loaded');
    return definitions.length;
  } catch (error) {
    getLogger().error({ domain, error }, 'Failed to load domain tools');
    return 0;
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the tool registry by loading all domains
 */
export async function initializeToolRegistry(
  options: {
    domains?: ToolDomain[];
    skipDomains?: ToolDomain[];
    parallel?: boolean;
  } = {}
): Promise<{
  loaded: number;
  byDomain: Record<ToolDomain, number>;
  errors: string[];
}> {
  const startTime = Date.now();
  const domainsToLoad = options.domains || [...ALL_TOOL_DOMAINS];
  const skipSet = new Set(options.skipDomains || []);
  const byDomain: Record<string, number> = {};
  const errors: string[] = [];

  getLogger().info({ domains: domainsToLoad.length }, 'Initializing tool registry...');

  // Load domains
  if (options.parallel) {
    // Load all domains in parallel
    const results = await Promise.allSettled(
      domainsToLoad
        .filter((d) => !skipSet.has(d))
        .map(async (domain) => {
          const count = await loadToolDomain(domain);
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
      if (skipSet.has(domain)) continue;

      try {
        const count = await loadToolDomain(domain);
        byDomain[domain] = count;
      } catch (error) {
        errors.push(`${domain}: ${error}`);
      }
    }
  }

  // Mark initialized
  toolRegistry.markInitialized();

  const totalLoaded = Object.values(byDomain).reduce((sum, n) => sum + n, 0);
  const elapsed = Date.now() - startTime;

  getLogger().info(
    {
      totalTools: totalLoaded,
      domains: Object.keys(byDomain).length,
      elapsed,
      errors: errors.length,
    },
    'Tool registry initialization complete'
  );

  return {
    loaded: totalLoaded,
    byDomain: byDomain as Record<ToolDomain, number>,
    errors,
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
  initializeToolRegistry,
  loadToolDomain,
  registerDomainLoader,
  convertLegacyTools,
  registerLegacyTools,
  createDomainExport,
};
