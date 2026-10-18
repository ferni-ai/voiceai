/**
 * A timer, a reminder and the weather for every persona the caller is handed to.
 *
 * shared-capabilities.md tells every teammate they can set timers, set reminders
 * and check the weather, so they call the tool instead of handing off (#1128).
 * A handed-to persona starts with the Tool Gateway's Tier 0 (memory, handoff,
 * entertainment, awareness, behavior), which has none of the three, and with
 * HANDOFF_FULL_TOOLS the essential set has setReminder but no timer or weather.
 *
 * Cost: at most three declarations on a handed-to persona's requests. All three
 * are essential tools (tool-config.ts), so capToolsToLimit keeps them.
 *
 * @module agents/multi-agent/everyday-basics
 */
import { toolRegistry } from '../../tools/registry/index.js';
import { loadToolDomainsLazy } from '../../tools/registry/loader.js';
import type { ToolContext, ToolDomain } from '../../tools/registry/types.js';
import { getLogger } from '../../utils/safe-logger.js';
import { withAlwaysOnInfoTools } from './always-on-info-tools.js';
import { sameTurnToolsEnabled } from '../../config/same-turn-tools-config.js';
import { withLeanAlwaysOnTools } from './lean-always-on.js';

const log = getLogger();

/** Each everyday basic and the domain it is registered in. */
export const EVERYDAY_BASICS: Readonly<Record<string, ToolDomain>> = {
  quickTimer: 'simple-utilities',
  setReminder: 'productivity',
  getWeather: 'information',
};

/**
 * `tools` plus whichever EVERYDAY_BASICS it lacks, built for this agent. A
 * failure to build them is logged and leaves them to topic loading.
 */
export async function withEverydayBasics<T>(
  tools: Record<string, T>,
  ctx: ToolContext
): Promise<Record<string, T>> {
  const missing = Object.keys(EVERYDAY_BASICS).filter((name) => !(name in tools));
  if (missing.length === 0) return tools;
  try {
    await loadToolDomainsLazy([...new Set(missing.map((name) => EVERYDAY_BASICS[name]))]);
    const added: Record<string, T> = {};
    for (const name of missing) {
      const def = toolRegistry.get(name);
      if (def) added[name] = def.create(ctx) as T;
    }
    const absent = missing.filter((name) => !(name in added));
    if (absent.length > 0) log.warn({ absent }, 'Everyday basics not in the registry');
    return { ...tools, ...added };
  } catch (error) {
    log.warn({ error: String(error) }, 'Could not add the everyday basics');
    return tools;
  }
}

/**
 * Every agent's always-on tools before the cap: the info tools (ALWAYS_ON_INFO_TOOLS),
 * and for a persona the caller is handed to, the everyday basics. With
 * TOOLS_SAME_TURN, the lean always-on set instead (lean-always-on.ts).
 */
export async function withAlwaysOnTools<T>(
  tools: Record<string, T>,
  ctx: ToolContext,
  handedTo: boolean
): Promise<Record<string, T>> {
  if (sameTurnToolsEnabled()) return withLeanAlwaysOnTools(tools, ctx);
  const withInfo = await withAlwaysOnInfoTools(tools, ctx);
  return handedTo ? withEverydayBasics(withInfo, ctx) : withInfo;
}
