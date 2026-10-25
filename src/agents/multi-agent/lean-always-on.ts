/**
 * TOOLS_SAME_TURN: every agent starts from the lean always-on set
 * (config/same-turn-tools-config.ts) instead of the first 64 tools of the
 * essential domains.
 *
 * The essential domains hold ~140 tools; the cap kept 64 and the post-greeting
 * update added the rest up to 88, so a dev call held 91 tools before its first
 * topic and 113 after two (release check 2026-10-18). With topic tools reaching
 * the turn that asks (agents/personas/same-turn-tools.ts), the always-on set
 * only needs what callers ask for out of the blue. Tools the set names that the
 * build lacks (quickTimer, getContactInfo, getWeather...) are built here; the
 * rest of each domain waits for its topic.
 *
 * @module agents/multi-agent/lean-always-on
 */
import { LEAN_ALWAYS_ON_TOOLS } from '../../config/same-turn-tools-config.js';
import { isEssentialTool } from '../../config/tool-config.js';
import { toolRegistry } from '../../tools/registry/index.js';
import { loadToolDomainsLazy } from '../../tools/registry/loader.js';
import type { ToolContext, ToolDomain } from '../../tools/registry/types.js';
import { getLogger } from '../../utils/safe-logger.js';

/**
 * `tools` cut to the always-on set (isEssentialTool under TOOLS_SAME_TURN:
 * the lean tools, handoffs, team tools, endCall, the call journal), plus the
 * lean tools it lacks, built for this agent. Tools whose services are missing
 * stay out, as in any build (registry buildToolSet).
 */
export async function withLeanAlwaysOnTools<T>(
  tools: Record<string, T>,
  ctx: ToolContext
): Promise<Record<string, T>> {
  const kept = Object.fromEntries(Object.entries(tools).filter(([name]) => isEssentialTool(name)));
  const missing = Object.keys(LEAN_ALWAYS_ON_TOOLS).filter((name) => !(name in kept));
  if (missing.length === 0) return kept;
  try {
    const domains = new Set(missing.map((name) => LEAN_ALWAYS_ON_TOOLS[name] as ToolDomain));
    await loadToolDomainsLazy([...domains]);
    const built = toolRegistry.buildToolSet({ optional: missing }, ctx).tools;
    return { ...kept, ...(built as Record<string, T>) };
  } catch (error) {
    getLogger().warn({ error: String(error) }, 'Could not add the lean always-on tools');
    return kept;
  }
}
