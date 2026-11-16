/**
 * The flag values a dev agent booted with, as it reports them to ops/agent_flag_snapshot
 * (docs/plans/2026-11-16-dev-flag-switchboard.md, "1. Agent reports what it sees").
 *
 * Only the per-file flags (agentFlags()) are read from the env, by name, so no other agent
 * secret can end up in the document. `resolved` is resolvedValue, the same rule the page
 * uses, so the page shows what the agent's readers act on, not a guess at it.
 *
 * @module config/agent-flags/domain/snapshot
 */
import type { Env } from '../../env-flag.js';
import { agentFlags, resolvedValue } from './switchable.js';

export interface FlagSnapshot {
  /** When this worker started (ISO 8601). */
  startedAt: string;
  /** The commit the agent was built from, or null when it doesn't know. */
  buildSha: string | null;
  /** Every per-file flag: the env string as set (null when unset) and the value its reader acts on. */
  flags: Record<string, { raw: string | null; resolved: string }>;
}

export function buildFlagSnapshot(env: Env, now: Date, buildSha: string | null): FlagSnapshot {
  const flags: FlagSnapshot['flags'] = {};
  for (const { name } of agentFlags()) {
    const raw = env[name];
    flags[name] = { raw: raw ?? null, resolved: resolvedValue(name, raw) };
  }
  return { startedAt: now.toISOString(), buildSha, flags };
}
