/**
 * The agent flags section's pure state (docs/plans/2026-11-16-dev-flag-switchboard.md), and
 * the shapes of the dev server's /api/v1/admin/agent-flags routes. The web app cannot import
 * from src/, so these types repeat src/config/agent-flags field for field: FlagValue and
 * SwitchableFlag (domain/switchable.ts), FlagSnapshot (domain/snapshot.ts), FlagChange
 * (ports/flag-store.ts) and the bodies in src/api/v1/admin/agent-flags.ts.
 *
 * @module AgentFlagsState
 */

/** Every word some flag reader acts on. */
export type FlagValue = 'on' | 'off' | 'shadow' | 'live' | 'defer' | 'reports';

export interface SwitchableFlag {
  name: string;
  kind: 'experiment' | 'kill-switch' | 'config';
  owner: 'voice' | 'tools' | 'memory' | 'intelligence' | 'outreach' | 'billing' | 'platform';
  default: string;
  switchable: boolean;
  modes: FlagValue[];
}

export interface FlagSnapshot {
  startedAt: string;
  buildSha: string | null;
  flags: Record<string, { raw: string | null; resolved: string }>;
}

export interface FlagChange {
  at: string;
  actor: string;
  set: Record<string, string>;
  reset: string[];
  result: 'applied' | 'refused' | 'failed';
  detail?: string;
}

/** GET /api/v1/admin/agent-flags */
export interface AgentFlagsBody {
  flags: SwitchableFlag[];
  snapshot: FlagSnapshot | null;
  stale: boolean;
  pendingRestart: string[];
  changes: FlagChange[];
  warning?: string;
}

/** A room on the dev project with someone in it (GET …/rooms, or a 409 from apply). */
export interface OccupiedRoom {
  name: string;
  participants: number;
}

/** What the next apply sends: flags to set, and flags to reset to their default. */
export interface Staged {
  set: Record<string, FlagValue>;
  reset: string[];
}

/**
 * Stages `value` for `name`. Choosing what the agent already runs (`running`, or 'default'
 * when it runs the default `def`) removes the entry; 'default' otherwise moves the name to
 * reset. A name is never in both. The input is not changed.
 */
export function stage(
  s: Staged,
  name: string,
  value: FlagValue | 'default',
  running: string,
  def: string
): Staged {
  const set = { ...s.set };
  delete set[name];
  const reset = s.reset.filter((n) => n !== name);
  const unchanged = value === 'default' ? running === def : value === running;
  if (unchanged) return { set, reset };
  if (value === 'default') return { set, reset: [...reset, name] };
  return { set: { ...set, [name]: value }, reset };
}

/** Whether `snapshot` came from a worker started after the apply and shows every change. */
function showsApplied(snapshot: FlagSnapshot | null, applied: Staged, appliedAt: number): boolean {
  if (!snapshot || !(Date.parse(snapshot.startedAt) > appliedAt)) return false;
  const setLive = Object.entries(applied.set).every(
    ([name, value]) => snapshot.flags[name]?.resolved === value
  );
  // A reset removes the secret, so the new worker reports the flag unset.
  const resetLive = applied.reset.every((name) => snapshot.flags[name]?.raw === null);
  return setLive && resetLive;
}

/**
 * After an apply at `appliedAt`: 'live' once a snapshot from a worker started after it shows
 * every applied value, 'timeout' when `timeoutMs` has passed without one (or `appliedAt` does
 * not parse), otherwise 'waiting'.
 */
export function confirmState(
  snapshot: FlagSnapshot | null,
  applied: Staged,
  appliedAt: string,
  now: Date,
  timeoutMs: number
): 'waiting' | 'live' | 'timeout' {
  const appliedMs = Date.parse(appliedAt);
  if (Number.isNaN(appliedMs)) return 'timeout';
  if (showsApplied(snapshot, applied, appliedMs)) return 'live';
  return now.getTime() - appliedMs >= timeoutMs ? 'timeout' : 'waiting';
}
