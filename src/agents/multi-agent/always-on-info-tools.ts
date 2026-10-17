/**
 * News, weather and web search for every persona from its first turn, behind
 * ALWAYS_ON_INFO_TOOLS (off by default).
 *
 * A persona the caller is handed to starts with the Tool Gateway's Tier 0
 * (memory, handoff, entertainment, awareness, behavior: ~56 tools), and topic
 * tools reach an agent only after its reply has started (deferred-tool-update.ts).
 * On a prod call (2026-10-17) Peter answered "can you check the weather?" by
 * calling getCurrentContext and asking for a city, and Peter and Nayan both said
 * "I don't have a tool to pull up current news". The information domain is ~57
 * tools; these four are what callers ask for out of the blue.
 *
 * Cost: four more declarations on every request of every persona (a handed-to
 * persona's tools.offered goes from 55 to about 59). All four are essential tools
 * (tool-config.ts), so capToolsToLimit keeps them.
 *
 * @module agents/multi-agent/always-on-info-tools
 */
import { flagOn } from '../../config/env-flag.js';
import { toolRegistry } from '../../tools/registry/index.js';
import { loadToolDomainsLazy } from '../../tools/registry/loader.js';
import type { ToolContext } from '../../tools/registry/types.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

export const ALWAYS_ON_INFO_TOOLS: readonly string[] = [
  'getNews',
  'getWeather',
  'getWeatherForecast',
  'searchWeb',
];

/**
 * `tools` plus whichever ALWAYS_ON_INFO_TOOLS it lacks, built for this agent.
 * Unchanged when the flag is off; a failure to build them is logged and leaves
 * them to topic loading.
 */
export async function withAlwaysOnInfoTools<T>(
  tools: Record<string, T>,
  ctx: ToolContext
): Promise<Record<string, T>> {
  if (!flagOn('ALWAYS_ON_INFO_TOOLS')) return tools;
  const missing = ALWAYS_ON_INFO_TOOLS.filter((name) => !(name in tools));
  if (missing.length === 0) return tools;
  try {
    await loadToolDomainsLazy(['information']);
    const added: Record<string, T> = {};
    for (const def of toolRegistry.getByDomain('information')) {
      if (missing.includes(def.id)) added[def.id] = def.create(ctx) as T;
    }
    const absent = missing.filter((name) => !(name in added));
    if (absent.length > 0) log.warn({ absent }, 'Always-on info tools not in the registry');
    return { ...tools, ...added };
  } catch (error) {
    log.warn({ error: String(error) }, 'Could not add always-on info tools');
    return tools;
  }
}
