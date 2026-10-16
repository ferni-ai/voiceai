/**
 * Dynamic Tool Loader - registering and building the essential domains' tools
 * outside a session loader (job entry, timeout fallback).
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  DEFAULT_ESSENTIAL_DOMAINS,
  INTENT_TOOL_DOMAINS,
  INTENT_TOOL_IDS,
} from './essential-domains.js';

let essentialDomainsReady: Promise<void> | null = null;
let intentDomainsReady: Promise<void> | null = null;

/**
 * How long a call waits for the intent domains (places, travel, packages).
 * They load in the background at job entry. Past this wait the call starts
 * without them, and later calls get them.
 */
export const INTENT_LOAD_WAIT_MS = 3_000;

/** Load the intent domains in the background. Never rejects: a failure is logged and the call goes on without them. */
function startIntentDomains(): Promise<void> {
  intentDomainsReady ??= (async () => {
    const { loadToolDomainsLazy } = await import('../registry/loader.js');
    await loadToolDomainsLazy([...INTENT_TOOL_DOMAINS]);
  })().catch((error: unknown) => {
    intentDomainsReady = null; // let the next call retry
    getLogger().warn({ error: String(error) }, 'Intent tool domains failed to load');
  });
  return intentDomainsReady;
}

/** Wait for the intent domains, but no longer than INTENT_LOAD_WAIT_MS. */
async function waitForIntentDomains(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    startIntentDomains(),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, INTENT_LOAD_WAIT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

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
    // Not awaited: the intent domains must not hold up the essential set.
    void startIntentDomains();
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
  await waitForIntentDomains();

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

  // Only the named intent tools, from their domains: the rest of those domains stay out.
  // Built apart so a failure here costs these tools, not the essential set.
  let intentTools: Record<string, unknown> = {};
  try {
    const intent = toolRegistry.buildToolSet(
      { domains: INTENT_TOOL_DOMAINS as unknown as ToolDomainType[] },
      ctx as import('../registry/types.js').ToolContext
    );
    intentTools = Object.fromEntries(
      Object.entries(intent.tools).filter(([name]) => INTENT_TOOL_IDS.includes(name))
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'Intent tools could not be built; continuing without them');
  }

  log.info(
    {
      essentialDomains: DEFAULT_ESSENTIAL_DOMAINS.length,
      totalTools: result.stats.total,
      intentTools: Object.keys(intentTools).length,
      skipped: result.skipped?.length || 0,
    },
    '🎵 Essential domain tools loaded from registry'
  );

  // Named tools first: the mid-session cap keeps the first non-essential tools
  // it is offered, so these survive it.
  const tools = result.tools as Record<string, unknown>;
  const namedFirst = Object.fromEntries(
    Object.entries(tools).filter(([name]) => INTENT_TOOL_IDS.includes(name))
  );
  return { ...namedFirst, ...intentTools, ...tools };
}
