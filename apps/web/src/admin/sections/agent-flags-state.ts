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

/**
 * Whether `snapshot` came from a worker started after `appliedAt` and shows `name` at
 * `value`, or unset for a reset (null): a reset removes the secret, so the worker reports none.
 */
function confirms(
  snapshot: FlagSnapshot | null,
  name: string,
  value: FlagValue | null,
  appliedAt: number
): boolean {
  if (!snapshot || !(Date.parse(snapshot.startedAt) > appliedAt)) return false;
  const flag = snapshot.flags[name];
  return value === null ? flag?.raw === null : flag?.resolved === value;
}

function showsApplied(snapshot: FlagSnapshot | null, applied: Staged, appliedAt: number): boolean {
  return (
    Object.entries(applied.set).every(([n, v]) => confirms(snapshot, n, v, appliedAt)) &&
    applied.reset.every((n) => confirms(snapshot, n, null, appliedAt))
  );
}

/**
 * The `now` to give confirmState: `appliedAt` plus the browser time since the 200 arrived
 * (`receivedMs`, Date.now() then). The timeout is then measured by one clock, the browser's,
 * so a browser clock that runs ahead or behind the server's cannot cut the wait short.
 */
export function nowOnServerClock(appliedAt: string, receivedMs: number, nowMs: number): Date {
  return new Date(Date.parse(appliedAt) + (nowMs - receivedMs));
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

/** Applied changes no snapshot has confirmed yet, by flag: the value set, or null for a reset. */
export type Unconfirmed = Record<string, { value: FlagValue | null; appliedAt: string }>;

/** Adds every name of an apply at `appliedAt` that timed out; a later apply replaces a name. */
export function unconfirm(u: Unconfirmed, applied: Staged, appliedAt: string): Unconfirmed {
  const next = { ...u };
  for (const [name, value] of Object.entries(applied.set)) next[name] = { value, appliedAt };
  for (const name of applied.reset) next[name] = { value: null, appliedAt };
  return next;
}

/** Drops each name `snapshot` confirms: from a worker started after its apply, at its value. */
export function settle(u: Unconfirmed, snapshot: FlagSnapshot | null): Unconfirmed {
  return Object.fromEntries(
    Object.entries(u).filter(
      ([name, { value, appliedAt }]) => !confirms(snapshot, name, value, Date.parse(appliedAt))
    )
  );
}

/**
 * The running value to stage `name` against. For a name changed after the worker started (an
 * unconfirmed apply, or the server's pendingRestart) the agent's next value is unknown, so ''
 * makes every choice stage; otherwise the snapshot's `resolved` ('' when there is none).
 */
export function runningForStage(
  name: string,
  resolved: string | null,
  pendingRestart: readonly string[],
  u: Unconfirmed
): string {
  if (Object.hasOwn(u, name) || pendingRestart.includes(name)) return '';
  return resolved ?? '';
}
