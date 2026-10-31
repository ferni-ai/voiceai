/**
 * Dynamic Tool Loader - the tools a mid-session update offers for a list of
 * domains (DynamicToolLoader.getToolsForDomains).
 */

import { getLogger } from '../../utils/safe-logger.js';
import { toolRegistry } from '../registry/index.js';
import type { Tool, ToolContext, ToolDomain } from '../registry/types.js';
import { ALL_TOOL_DOMAINS } from '../registry/types.js';
import { TOPIC_ONLY_TOOLS } from './travel-topics.js';

/** The lead tools the registry lists under a domain */
export function leadToolsIn(domain: ToolDomain, lead: readonly string[]): string[] {
  if (lead.length === 0) return [];
  return toolRegistry
    .getByDomain(domain)
    .map((d) => d.id)
    .filter((id) => lead.includes(id));
}

/**
 * Each domain's tools, interleaved, with the lead tools first. A domain in
 * `onlyTools` (re-offered for its lead tools) or in TOPIC_ONLY_TOOLS brings
 * only the tools listed for it.
 */
export function toolsForDomains(
  domains: readonly string[],
  ctx: ToolContext,
  leadTools: readonly string[],
  onlyTools?: ReadonlyMap<ToolDomain, readonly string[]>
): Record<string, Tool> {
  const isDomain = (d: string): d is ToolDomain =>
    (ALL_TOOL_DOMAINS as readonly string[]).includes(d);
  const unknownDomains = domains.filter((d) => !isDomain(d));
  if (unknownDomains.length > 0) {
    getLogger().warn({ unknownDomains }, '🔄 Not tool domains; no tools offered for them');
  }
  // One domain at a time, then interleaved: offered one domain after another,
  // the update's cap ran out inside the first. "find me a taco place nearby"
  // loads information (57 tools) and local-search (6), and none of
  // local-search's tools landed.
  const perDomain = domains.filter(isDomain).map((domain) => {
    const only = onlyTools?.get(domain) ?? TOPIC_ONLY_TOOLS[domain];
    const spec = only ? { optional: [...only] } : { domains: [domain] };
    return Object.entries(toolRegistry.buildToolSet(spec, ctx).tools);
  });
  // The tools the turn's topics asked for (getCommuteTime, searchFlights) go first.
  const interleaved: Record<string, Tool> = {};
  for (const id of leadTools) {
    const entry = perDomain.flat().find(([name]) => name === id);
    if (entry) interleaved[id] = entry[1];
  }
  for (let i = 0; perDomain.some((tools) => i < tools.length); i++) {
    for (const tools of perDomain) {
      const entry = tools[i];
      if (entry && !(entry[0] in interleaved)) interleaved[entry[0]] = entry[1];
    }
  }
  return interleaved;
}
