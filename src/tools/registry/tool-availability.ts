/**
 * Tools whose credentials are missing never reach the model.
 *
 * A prod tool audit (2026-10-17) found dead tools in every agent's always-on
 * set: the movie tools answer nothing without TMDB_API_KEY (unset on prod),
 * and the nine Sonos tools say "Sonos isn't connected" to everyone because no
 * one can link Sonos without SONOS_CLIENT_ID. They took tool slots and invited
 * dead ends. The always-on fetcher (orchestrator/tool-fetchers.ts) creates
 * every tool of a domain without checking `requiredServices`, so a definition
 * names the env vars it needs in `requiresEnv`, and the registry refuses to
 * register it while any is missing: no path can offer it. Each skipped tool is
 * logged once per process. With the key set the tool is registered as before.
 * TOOL_REQUIRES_ENV=off registers every tool, as before.
 *
 * @module tools/registry/tool-availability
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { getLogger } from '../../utils/safe-logger.js';
import type { ToolDefinition } from './types.js';

export function toolRequiresEnvEnabled(env: Env = process.env): boolean {
  return flagOn('TOOL_REQUIRES_ENV', env);
}

/** The env vars this tool needs that are unset or blank. */
export function missingEnv(
  def: Pick<ToolDefinition, 'requiresEnv'>,
  env: Env = process.env
): string[] {
  return (def.requiresEnv ?? []).filter((name) => !env[name]?.trim());
}

const logged = new Set<string>();

/** True when the tool may be registered; logs a skipped tool once per process. */
export function toolAvailable(
  def: Pick<ToolDefinition, 'id' | 'domain' | 'requiresEnv' | 'availableWhen'>,
  env: Env = process.env
): boolean {
  if (def.availableWhen && !def.availableWhen()) return false;
  if (!toolRequiresEnvEnabled(env)) return true;
  const missing = missingEnv(def, env);
  if (missing.length === 0) return true;
  if (!logged.has(def.id)) {
    logged.add(def.id);
    getLogger().info(
      { toolId: def.id, domain: def.domain, missingEnv: missing },
      'TOOL_UNAVAILABLE: required env not set, tool not offered'
    );
  }
  return false;
}

/** The same definitions, each needing these env vars (a domain's tools that share one key). */
export function requiringEnv(names: readonly string[], defs: ToolDefinition[]): ToolDefinition[] {
  return defs.map((def) => ({ ...def, requiresEnv: [...(def.requiresEnv ?? []), ...names] }));
}

/** Tests: forget which tools were logged. */
export function resetToolAvailabilityLog(): void {
  logged.clear();
}
