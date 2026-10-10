/**
 * Alias and handoff-tool-name lookup for the agent registry (unified-registry.ts).
 *
 * Personas can claim the same alias: Peter John (Ferni's team) and Peter Lynch
 * (Financial Legends) both declare "peter"; Ferni's role id "life-coach" is also
 * one of Maya's aliases. The map used to be last-write-wins, so "peter" and
 * "handoffToPeter" went to whichever bundle loaded last (Peter Lynch). Now a
 * contested name is settled the same way the handoff tools name personas
 * (handoff-tool-naming.ts): the coordinator first, then the coordinator's team,
 * then everyone else, ties by id. Each collision is logged once per logger.
 *
 * @module personas/registry/alias-map
 */

import { assignHandoffToolNames } from '../../tools/handoff/handoff-tool-naming.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { Agent } from './unified-registry.js';

/** Where collisions are reported (the registry's logger, or a test spy). */
export interface AliasCollisionLog {
  warn: (fields: Record<string, unknown>, message: string) => void;
}

const registryLog: AliasCollisionLog = createLogger({ module: 'AgentAliasMap' });

/** Collisions already reported, per logger, so a cache refresh doesn't repeat them. */
const reported = new WeakMap<AliasCollisionLog, Set<string>>();

const coordinatorOf = (agents: readonly Agent[]): Agent | undefined =>
  agents.find((a) => a.isCoordinator) ?? agents[0];

/** 0 coordinator, 1 the coordinator's team, 2 anyone else. */
function teamRank(agent: Agent, coordinator: Agent | undefined): number {
  if (agent.id === coordinator?.id) return 0;
  return agent.manifest?.team?.membership === coordinator?.manifest?.team?.membership ? 1 : 2;
}

/**
 * The agents with their handoff tool names, assigned by the same function that
 * names the handoff tools (assignHandoffToolNames), so a tool name and the
 * registry can never disagree about who it reaches.
 */
export function withHandoffToolNames(agents: Agent[]): Agent[] {
  const coordinator = coordinatorOf(agents);
  if (!coordinator) return agents;
  const names = assignHandoffToolNames(agents, coordinator);
  return agents.map((agent) => ({
    ...agent,
    handoffToolName: names.get(agent.id) ?? agent.handoffToolName,
  }));
}

/**
 * name (lowercase) -> agent id. An agent's own id and handoff tool name always
 * reach it; an alias two agents share goes to the higher-ranked one.
 */
export function buildAliasMap(
  agents: Iterable<Agent>,
  log: AliasCollisionLog = registryLog
): Map<string, string> {
  const list = [...agents];
  const coordinator = coordinatorOf(list);
  // [kind, team rank, id]: lower wins. kind 0 = own id, 1 = tool name, 2 = alias.
  const claims = new Map<string, Array<{ id: string; rank: [number, number, string] }>>();
  const claim = (name: string, agent: Agent, kind: number): void => {
    const key = name.toLowerCase().trim();
    const entries = claims.get(key) ?? [];
    if (entries.some((e) => e.id === agent.id)) return;
    entries.push({ id: agent.id, rank: [kind, teamRank(agent, coordinator), agent.id] });
    claims.set(key, entries);
  };
  for (const agent of list) {
    claim(agent.id, agent, 0);
    claim(agent.handoffToolName, agent, 1);
    for (const alias of agent.aliases) claim(alias, agent, 2);
  }

  const map = new Map<string, string>();
  for (const [key, entries] of claims) {
    entries.sort((a, b) => compareRank(a.rank, b.rank));
    map.set(key, entries[0].id);
    if (entries.length > 1) reportCollision(log, key, entries[0].id, entries.slice(1));
  }
  return map;
}

function compareRank(a: [number, number, string], b: [number, number, string]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]);
}

function reportCollision(
  log: AliasCollisionLog,
  alias: string,
  keptBy: string,
  others: Array<{ id: string }>
): void {
  const alsoClaimedBy = others.map((o) => o.id);
  const seen = reported.get(log) ?? new Set<string>();
  const signature = `${alias}:${keptBy}:${alsoClaimedBy.join(',')}`;
  if (seen.has(signature)) return;
  seen.add(signature);
  reported.set(log, seen);
  log.warn({ alias, keptBy, alsoClaimedBy }, 'Alias claimed by more than one persona');
}
