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

/** Turns the boot snapshot on. Only lk changes it: the page reads the snapshot it makes. */
export const SNAPSHOT_FLAG = 'FLAG_SNAPSHOT';

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

/**
 * Whether the snapshot may not show what the agent runs with: there is none, or a flag
 * secret changed after the worker that wrote it started (`secretTimes` as LiveKit reports
 * them, RFC 3339). A time that does not parse counts as later, so doubt reads as stale.
 */
export function isSnapshotStale(
  snapshot: FlagSnapshot | null,
  secretTimes: Readonly<Record<string, string>>
): boolean {
  if (!snapshot) return true;
  const started = Date.parse(snapshot.startedAt);
  if (Number.isNaN(started)) return true;
  return Object.values(secretTimes).some((t) => {
    const changed = Date.parse(t);
    return Number.isNaN(changed) || changed > started;
  });
}

/**
 * The switchable flags whose secret changed after the worker that wrote `snapshot` started,
 * in agentFlags() order (by name): their new values wait for the restarted worker. A time
 * that does not parse counts as later, as in isSnapshotStale. A reset leaves no secret, so
 * no time, and is not listed. No snapshot gives [] (the whole page is stale then).
 */
export function flagsPendingRestart(
  snapshot: FlagSnapshot | null,
  secretTimes: Readonly<Record<string, string>>
): string[] {
  if (!snapshot) return [];
  const started = Date.parse(snapshot.startedAt);
  return agentFlags()
    .filter(({ name, switchable }) => switchable && Object.hasOwn(secretTimes, name))
    .filter(({ name }) => {
      const changed = Date.parse(secretTimes[name] ?? '');
      return Number.isNaN(started) || Number.isNaN(changed) || changed > started;
    })
    .map(({ name }) => name);
}
