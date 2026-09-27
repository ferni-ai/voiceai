/**
 * First-turn / initial-spawn tool policy for multi-agent.
 *
 * Essential-only shrinks cold-path tool load; turn optimizer / wireHandlers
 * expand after greeting when mid-session updates are safe.
 *
 * @module agents/multi-agent/initial-tools
 */

export interface InitialToolPolicy {
  essentialOnly: boolean;
}

/**
 * Filter initial spawn tools to essential + handoff names when policy is on.
 */
export function filterInitialSpawnTools<T extends { name: string }>(
  all: readonly T[],
  essentialNames: ReadonlySet<string>,
  handoffNames: ReadonlySet<string>,
  policy: InitialToolPolicy
): T[] {
  if (!policy.essentialOnly) {
    return [...all];
  }
  return all.filter((t) => essentialNames.has(t.name) || handoffNames.has(t.name));
}

/**
 * Env: MULTI_AGENT_ESSENTIAL_TOOLS_FIRST !== 'false' → essential-only on.
 */
export function getInitialToolPolicyFromEnv(
  env: NodeJS.ProcessEnv = process.env
): InitialToolPolicy {
  return {
    essentialOnly: env.MULTI_AGENT_ESSENTIAL_TOOLS_FIRST !== 'false',
  };
}

/**
 * Tool cap for the first agent when TOOL_LIMIT is unset.
 *
 * The essential domains hold ~340 tools. Sending all of them on every LLM call
 * costs prefill latency and tool-choice accuracy, and Gemini Live cannot swap
 * tools mid-session without reconnecting, so the initial set has to be good on
 * its own. capToolsToLimit keeps must-keep tools (safety, memory, handoffs, core
 * actions from tool-config) first and fills the rest.
 */
export const DEFAULT_INITIAL_TOOL_LIMIT = 64;

export function resolveInitialToolLimit(configuredLimit: number): number {
  return configuredLimit > 0 ? configuredLimit : DEFAULT_INITIAL_TOOL_LIMIT;
}
