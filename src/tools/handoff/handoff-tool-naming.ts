/**
 * Names and descriptions of generated handoff tools (handoff-factory.ts).
 *
 * @module tools/handoff/handoff-tool-naming
 */

import type { Agent } from '../../personas/registry/unified-registry.js';

/** 'Peter John' -> 'Peter'; 'Peter Lynch' (full) -> 'PeterLynch'. Letters only. */
function nameForTool(agent: Agent, full: boolean): string {
  const name = full ? agent.name : agent.name.split(' ')[0];
  return name.replace(/[^a-zA-Z]/g, '');
}

/**
 * Tool name per agent ID. A tool is named after the first name
 * (handoffToMaya); when two personas share one (Peter John on Ferni's team and
 * Peter Lynch of the Financial Legends), the one on the coordinator's team keeps
 * it and the other is named in full (handoffToPeterLynch). Before this, both
 * were handoffToPeter and whichever was built last took the name.
 */
export function assignHandoffToolNames(agents: Agent[], coordinator: Agent): Map<string, string> {
  const membership = (a: Agent): string | undefined => a.manifest?.team?.membership;
  const byShort = new Map<string, Agent[]>();
  for (const agent of agents) {
    const short = nameForTool(agent, false);
    byShort.set(short, [...(byShort.get(short) ?? []), agent]);
  }
  const names = new Map<string, string>();
  for (const [short, group] of byShort) {
    const home = group.filter(
      (a) => a.id === coordinator.id || membership(a) === membership(coordinator)
    );
    const keeper = group.length === 1 ? group[0] : home.length === 1 ? home[0] : undefined;
    for (const agent of group) {
      names.set(agent.id, `handoffTo${agent === keeper ? short : nameForTool(agent, true)}`);
    }
  }
  return names;
}

/** What the agent does, for the tool description: never "undefined". */
export function specialtyOf(agent: Agent): string | undefined {
  const text = [agent.roleDescription, agent.description].find(
    (t): t is string => typeof t === 'string' && t.trim().length > 0
  );
  return text?.trim().replace(/\.+$/, '');
}
