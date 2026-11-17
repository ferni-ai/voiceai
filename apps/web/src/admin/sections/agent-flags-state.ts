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
  value: string | null,
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
export type Unconfirmed = Record<string, { value: string | null; appliedAt: string }>;

/** Adds every name of an apply at `appliedAt`, unless the name has a later apply already. */
export function unconfirm(
  u: Unconfirmed,
  applied: { set: Record<string, string>; reset: string[] },
  appliedAt: string
): Unconfirmed {
  const next = { ...u };
  const add = (name: string, value: string | null): void => {
    const had = next[name];
    if (!had || !(Date.parse(had.appliedAt) > Date.parse(appliedAt))) {
      next[name] = { value, appliedAt };
    }
  };
  for (const [name, value] of Object.entries(applied.set)) add(name, value);
  for (const name of applied.reset) add(name, null);
  return next;
}

export interface Settled {
  unconfirmed: Unconfirmed;
  /** Names a newer worker runs at another value than applied: dropped, to be reported once. */
  superseded: Unconfirmed;
}

/**
 * Drops each name `snapshot` confirms. A worker started after the apply is authoritative, so
 * a name it reports at another value is dropped too (into `superseded`), unless it is waiting
 * for a restart (`pendingRestart`).
 */
export function settle(
  u: Unconfirmed,
  snapshot: FlagSnapshot | null,
  pendingRestart: readonly string[]
): Settled {
  const settled: Settled = { unconfirmed: {}, superseded: {} };
  for (const [name, entry] of Object.entries(u)) {
    const appliedMs = Date.parse(entry.appliedAt);
    if (confirms(snapshot, name, entry.value, appliedMs)) continue;
    const newer = snapshot !== null && Date.parse(snapshot.startedAt) > appliedMs;
    const into = newer && !pendingRestart.includes(name) ? 'superseded' : 'unconfirmed';
    settled[into][name] = entry;
  }
  return settled;
}

/**
 * The unconfirmed names after a GET: `u`, plus every applied change in the audit trail made
 * after the snapshot's worker started (so the marks survive a reload, other tabs and other
 * admins, resets included), then settled against the snapshot.
 */
export function trackUnconfirmed(u: Unconfirmed, body: AgentFlagsBody): Settled {
  const started = Date.parse(body.snapshot?.startedAt ?? '');
  let next = u;
  // Any order: unconfirm keeps the latest apply of a name (the trail arrives newest first).
  for (const c of body.changes) {
    if (c.result === 'applied' && Date.parse(c.at) > started) next = unconfirm(next, c, c.at);
  }
  return settle(next, body.snapshot, body.pendingRestart);
}

/**
 * The running value to stage `value` for `name` against (see stage). An unconfirmed name
 * stages against what was applied (the default, for a reset), so re-picking it stages
 * nothing. A name waiting for a restart has an unknown next value, so '' makes every choice
 * stage; so does no snapshot. 'default' on a flag whose secret is set, even to the default's
 * value, stages a reset, so the secret is removed and the flag follows the manifest again.
 */
export function runningForStage(
  name: string,
  value: FlagValue | 'default',
  def: string,
  running: { raw: string | null; resolved: string } | undefined,
  pendingRestart: readonly string[],
  u: Unconfirmed
): string {
  const applied = u[name];
  if (applied) {
    if (applied.value === null) return def;
    return value === 'default' ? '' : applied.value;
  }
  if (pendingRestart.includes(name) || !running) return '';
  return value === 'default' && running.raw !== null ? '' : running.resolved;
}
