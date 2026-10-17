/**
 * Dynamic Tool Loader - registering and building the essential domains' tools
 * outside a session loader (job entry, timeout fallback).
 */

import { getLogger } from '../../utils/safe-logger.js';
import { DEFAULT_ESSENTIAL_DOMAINS } from './essential-domains.js';

let essentialDomainsReady: Promise<void> | null = null;

/**
 * Register the domain loaders and load the essential domains, once per context.
 *
 * A LiveKit job runs in its own context with a fresh module graph, so the
 * worker's startup preload never reaches it. Without this, the registry is
 * empty when the first agent is built and the call starts with no domain
 * tools. Safe to call early (e.g. at job entry) to take it off the critical
 * path; later callers await the same promise.
 */
export function ensureEssentialDomainsLoaded(): Promise<void> {
  essentialDomainsReady ??= (async () => {
    const { autoRegisterAllDomains, loadToolDomainsLazy } = await import('../registry/loader.js');
    await autoRegisterAllDomains();
    await loadToolDomainsLazy([...DEFAULT_ESSENTIAL_DOMAINS]);
  })().catch((error: unknown) => {
    essentialDomainsReady = null; // let the next caller retry
    throw error;
  });
  return essentialDomainsReady;
}

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

  await ensureEssentialDomainsLoaded();

  // Import registry and build tools for essential domains
  const { toolRegistry, EnvironmentServiceRegistry } = await import('../registry/index.js');
  type ToolDomainType = import('../registry/types.js').ToolDomain;

  // Tools look services up through a ServiceRegistry (has/get). Callers on the
  // live path pass their SessionServices, which is a different shape; building
  // with it threw "services.has is not a function" and the call got no tools.
  const isServiceRegistry = typeof (services as { has?: unknown } | undefined)?.has === 'function';
  const ctx = {
    userId: userId || 'anonymous',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    services: isServiceRegistry ? services : new EnvironmentServiceRegistry(),
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
      skipped: result.skipped?.length || 0,
    },
    '🎵 Essential domain tools loaded from registry'
  );

  return result.tools as Record<string, unknown>;
}
