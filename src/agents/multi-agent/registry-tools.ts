/**
 * Tools added to an agent by name from the tool registry, before the cap: the
 * everyday basics (everyday-basics.ts) and Alex's planning tools
 * (chief-of-staff-tools.ts).
 *
 * @module agents/multi-agent/registry-tools
 */
import { toolRegistry } from '../../tools/registry/index.js';
import { loadToolDomainsLazy } from '../../tools/registry/loader.js';
import type { ToolContext, ToolDomain } from '../../tools/registry/types.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

/**
 * `tools` plus whichever of `byName` (tool id to its domain) it lacks, built
 * for this agent. A failure to build them is logged and leaves them to topic
 * loading. `what` names them in the log.
 */
export async function withRegistryTools<T>(
  tools: Record<string, T>,
  ctx: ToolContext,
  byName: Readonly<Record<string, ToolDomain>>,
  what: string
): Promise<Record<string, T>> {
  const missing = Object.keys(byName).filter((name) => !(name in tools));
  if (missing.length === 0) return tools;
  try {
    await loadToolDomainsLazy([...new Set(missing.map((name) => byName[name]))]);
    const added: Record<string, T> = {};
    for (const name of missing) {
      const def = toolRegistry.get(name);
      if (def) added[name] = def.create(ctx) as T;
    }
    const absent = missing.filter((name) => !(name in added));
    if (absent.length > 0) log.warn({ absent }, `${what} not in the registry`);
    return { ...tools, ...added };
  } catch (error) {
    log.warn({ error: String(error) }, `Could not add the ${what.toLowerCase()}`);
    return tools;
  }
}
