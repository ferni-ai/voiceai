/**
 * Pure logic of the dev/prod secrets parity check (secrets-parity.ts). Prod Maya spoke in a
 * meditation voice for weeks because prod's MAYA_SANTOS_VOICE_ID drifted from dev's and
 * nothing compared the two agents.
 *
 * Values never survive parsing. A flag (a FLAG_MANIFEST key) set to on/off/shadow/live keeps
 * that word, which is not a secret. Every other value becomes an HMAC-SHA256 digest under a
 * key made fresh for each run, so digests can't be reversed or compared across runs. The
 * report prints names, counts and flag words only, never a digest.
 *
 * The check fails closed: a key on one side only, a value set on one side and unset on the
 * other, or a voice id or flag it couldn't compare is never CLEAN, and neither is a boot it
 * can't trust (missing, older than the latest secret change, or followed by a partial one).
 *
 * @module scripts/ops/secrets-parity-lib
 */
import { createHmac, randomBytes } from 'node:crypto';

export const FLAG_STATES: ReadonlySet<string> = new Set(['on', 'off', 'shadow', 'live']);

/** Persona voice ids. Never allowlisted: a voice that differs between dev and prod is drift. */
export const VOICE_ID = /_VOICE_ID$/;

const PREFIX = 'EFFECTIVE_SETTINGS ';
/** Log lines start `[2026-10-23T09:13:50.178Z] [worker] ...`. */
const STAMP = /^\[(\d{4}-\d\d-\d\dT[\d:.]+Z)\]/;

/**
 * A sealed value: `token` compares (`=word` or the HMAC) and `state` is set only for a flag
 * word. `set` / `unset`: the boot log printed `<set>` / `<unset>` instead of the value.
 */
export type Sealed = { readonly token: string; readonly state?: string } | 'set' | 'unset';
export type Sealer = (value: string) => string;
type IsFlag = (name: string) => boolean;

/** HMAC-SHA256 under a random 32-byte key that exists only for this run. */
export function newSealer(): Sealer {
  const key = randomBytes(32);
  return (value) => createHmac('sha256', key).update(value).digest('hex');
}

export interface Secrets {
  readonly names: string[];
  /** Latest `updatedAt` (ms) among the agent's secrets, null when none is given. */
  readonly newest: number | null;
}

/** `lk agent secrets --json`: `{secrets: [{name, kind, createdAt, updatedAt}]}`. No values. */
export function parseSecrets(json: string): Secrets {
  let list: unknown;
  try {
    list = (JSON.parse(json) as { secrets?: unknown }).secrets;
  } catch {
    throw new Error('lk agent secrets --json did not return JSON'); // never echo the input
  }
  if (!Array.isArray(list)) throw new Error('lk agent secrets --json returned no "secrets" list');
  const rows = list as Array<{ name?: unknown; updatedAt?: unknown }>;
  const times = rows.map((s) => Date.parse(String(s.updatedAt))).filter((t) => !Number.isNaN(t));
  return {
    names: rows.map((s) => s.name).filter((n): n is string => typeof n === 'string'),
    newest: times.length ? Math.max(...times) : null,
  };
}

/** One process's boot: the parts of its EFFECTIVE_SETTINGS lines, in log order. */
interface Boot {
  readonly id: string;
  readonly commit: string;
  readonly parts: number;
  readonly first: number; // log position of its first line
  readonly at: number | null; // timestamp of its first line
  readonly seen: Map<number, Map<string, Sealed>>;
  done: number | null; // log position where its last part arrived
}

export interface BootResult {
  readonly commit: string | null;
  readonly values: Map<string, Sealed>;
  readonly at: number | null;
  /** A boot with other settings started after the chosen one and never finished logging. */
  readonly partialNewer: boolean;
  /** Another boot with other settings logged alongside the chosen one (a rolling restart). */
  readonly concurrent: boolean;
}

/** Boots with different settings this close together are a restart still rolling out. */
const ROLLING_MS = 120_000;

/**
 * Collects `EFFECTIVE_SETTINGS {...}` boot lines from a log stream, sealing each value as it
 * arrives; other lines are ignored. The boot that finished logging last wins, so a rollback to
 * earlier settings (same commit and hash as an older boot) is read as the newest. A part that
 * repeats while its boot is still logging is a second instance of the same boot and is dropped.
 */
export class BootCollector {
  private readonly boots: Boot[] = [];
  private readonly current = new Map<string, Boot>();
  private position = 0;

  constructor(
    private readonly isFlag: IsFlag,
    private readonly seal: Sealer
  ) {}

  add(line: string): void {
    const at = line.indexOf(PREFIX);
    if (at < 0) return;
    let p: Record<string, unknown> | null;
    try {
      p = JSON.parse(line.slice(at + PREFIX.length)) as Record<string, unknown> | null;
    } catch {
      return;
    }
    if (!p || typeof p !== 'object') return;
    const { part, parts, commit, hash } = p;
    if (typeof part !== 'number' || typeof parts !== 'number' || typeof hash !== 'string') return;
    const position = ++this.position;
    const id = `${String(commit)}|${hash}`;
    let boot = this.current.get(id);
    if (!boot || boot.done !== null) {
      const stamp = STAMP.exec(line)?.[1];
      boot = {
        id,
        commit: String(commit),
        parts,
        first: position,
        done: null,
        seen: new Map(),
        at: stamp ? Date.parse(stamp) : null,
      };
      this.current.set(id, boot);
      this.boots.push(boot);
    } else if (boot.seen.has(part)) {
      return;
    }
    const values = new Map<string, Sealed>();
    for (const section of [p.flags, p.env]) {
      for (const [name, raw] of Object.entries((section ?? {}) as Record<string, unknown>)) {
        values.set(name, this.sealOne(name, String(raw).trim()));
      }
    }
    boot.seen.set(part, values);
    if (boot.seen.size === boot.parts) boot.done = position;
  }

  result(): BootResult {
    const done = this.boots.filter((b) => b.done !== null);
    const chosen = done.sort((a, b) => (a.done ?? 0) - (b.done ?? 0))[done.length - 1];
    const values = new Map<string, Sealed>();
    for (const part of chosen?.seen.values() ?? []) for (const [k, v] of part) values.set(k, v);
    const partialNewer = this.boots.some(
      (b) => b.done === null && b.id !== chosen?.id && b.first > (chosen?.first ?? 0)
    );
    const concurrent = this.boots.some(
      (b) =>
        chosen !== undefined &&
        b.id !== chosen.id &&
        ((b.first < (chosen.done ?? 0) && chosen.first < (b.done ?? Infinity)) ||
          (b.at !== null && chosen.at !== null && Math.abs(b.at - chosen.at) < ROLLING_MS))
    );
    return {
      commit: chosen?.commit ?? null,
      values,
      at: chosen?.at ?? null,
      partialNewer,
      concurrent,
    };
  }

  private sealOne(name: string, value: string): Sealed {
    if (value === '<set>') return 'set';
    if (value === '<unset>') return 'unset';
    const word = value.toLowerCase();
    if (this.isFlag(name) && FLAG_STATES.has(word)) return { token: `=${word}`, state: word };
    return { token: this.seal(value) };
  }
}

/** One agent: keys set on it, its latest boot, and why that boot can't be trusted (if so). */
export interface Snapshot {
  readonly label: string;
  readonly names: ReadonlySet<string>;
  readonly commit: string | null;
  readonly values: ReadonlyMap<string, Sealed>;
  readonly problems: readonly string[];
}

export function snapshotOf(label: string, secrets: Secrets, boot: BootResult): Snapshot {
  const problems: string[] = [];
  if (boot.commit === null) problems.push('no complete boot settings found in the log');
  if (boot.partialNewer) problems.push('a newer boot is only partly logged; read the log again');
  if (boot.concurrent) {
    problems.push(
      'two boots with different settings logged at once (rolling restart?); read again once it settles'
    );
  }
  if (secrets.names.length > 0 && secrets.newest === null) {
    problems.push('lk gave no updatedAt for the secrets, so boot freshness was not checked');
  }
  if (boot.commit !== null && boot.at === null) problems.push('boot time unknown');
  if (boot.at !== null && secrets.newest !== null && boot.at < secrets.newest) {
    problems.push('the boot read is older than the latest secret change');
  }
  return {
    label,
    names: new Set(secrets.names),
    commit: boot.commit,
    values: boot.values,
    problems,
  };
}

type Entry = { readonly pattern: string; readonly reason: string; readonly until?: number };

/**
 * `keys`: not compared by value (expected to differ, or hidden from the boot log).
 * `onlyOn`: may be set on that agent alone. A voice id is never allowed. A flag is allowed only
 * under `onlyOn.dev` (a dev-first experiment) with an `until` date at most 30 days away.
 * `expired`: entries past their `until` date; they allow nothing and fail the check.
 */
export interface Allowlist {
  readonly keys: readonly Entry[];
  readonly onlyOn: { readonly dev: readonly Entry[]; readonly prod: readonly Entry[] };
  readonly expired: readonly string[];
}

function matches(pattern: string, name: string): boolean {
  if (pattern.endsWith('*')) return name.startsWith(pattern.slice(0, -1));
  if (pattern.startsWith('*')) return name.endsWith(pattern.slice(1));
  return name === pattern;
}

const DAY = 86_400_000;
const MAX_UNTIL_DAYS = 30;

/**
 * Reads `{"keys": {PATTERN: reason}, "onlyOn": {"dev": {...}, "prod": {...}}}`. A value is a
 * reason, or `{"reason": "...", "until": "YYYY-MM-DD"}` (required for a flag under onlyOn.dev).
 * Patterns: `NAME`, `PREFIX_*`, `*_SUFFIX`. `names` = the flag manifest plus every key seen.
 */
export function parseAllowlist(
  json: string,
  names: Iterable<string>,
  isFlag: IsFlag,
  now = Date.now()
): Allowlist {
  type File = { keys?: Record<string, unknown>; onlyOn?: Record<string, Record<string, unknown>> };
  let file: File;
  try {
    file = JSON.parse(json) as File;
  } catch {
    throw new Error('allowlist is not valid JSON');
  }
  const probes = [...names, 'ANY_PERSONA_VOICE_ID'];
  const expired: string[] = [];
  const entries = (section: 'keys' | 'dev' | 'prod', map: Record<string, unknown> = {}): Entry[] =>
    Object.entries(map).flatMap(([pattern, value]) => {
      const raw = (typeof value === 'string' ? { reason: value } : (value ?? {})) as Record<
        string,
        unknown
      >;
      const reason = typeof raw.reason === 'string' ? raw.reason.trim() : '';
      if (!reason) throw new Error(`allowlist: ${pattern} has no reason`);
      const until =
        raw.until === undefined ? undefined : Date.parse(`${String(raw.until)}T00:00:00Z`);
      if (until !== undefined && Number.isNaN(until))
        throw new Error(`allowlist: ${pattern} until must be YYYY-MM-DD`);
      const hit = (test: (n: string) => boolean) =>
        probes.find((n) => matches(pattern, n) && test(n));
      const voice = hit((n) => VOICE_ID.test(n));
      const flag = hit(isFlag);
      if (voice || (flag && section !== 'dev')) {
        throw new Error(
          `allowlist: ${pattern} covers ${voice ?? flag}; voice ids and flags must be compared`
        );
      }
      if (flag && until === undefined) {
        throw new Error(
          `allowlist: ${pattern} covers the flag ${flag}; give it an until date (YYYY-MM-DD)`
        );
      }
      if (until !== undefined && until > now + MAX_UNTIL_DAYS * DAY) {
        throw new Error(`allowlist: ${pattern} until is more than ${MAX_UNTIL_DAYS} days away`);
      }
      if (until !== undefined && until + DAY <= now) {
        expired.push(pattern);
        return [];
      }
      return [{ pattern, reason, ...(until !== undefined ? { until } : {}) }];
    });
  const keys = entries('keys', file.keys);
  const onlyOn = {
    dev: entries('dev', file.onlyOn?.dev),
    prod: entries('prod', file.onlyOn?.prod),
  };
  return { keys, onlyOn, expired };
}

export type Status =
  'only-dev' | 'only-prod' | 'presence' | 'differs' | 'not-comparable' | 'unread' | 'expired';

export interface Row {
  readonly name: string;
  readonly status: Status;
  readonly allowlisted: boolean;
  /** A voice id or a flag: never allowlisted, and must be compared. */
  readonly guarded: boolean;
  /** Both flag words, only for a flag whose two values are on/off/shadow/live. */
  readonly states?: { readonly dev: string; readonly prod: string };
}

function statusOf(name: string, dev: Snapshot, prod: Snapshot): Status | undefined {
  if (!prod.names.has(name)) return 'only-dev';
  if (!dev.names.has(name)) return 'only-prod';
  const d = dev.values.get(name);
  const p = prod.values.get(name);
  if (typeof d === 'object' && typeof p === 'object')
    return d.token === p.token ? undefined : 'differs';
  if (d === undefined && p === undefined)
    return dev.commit && prod.commit ? 'unread' : 'not-comparable';
  if (d !== undefined && p !== undefined && (d === 'unset') !== (p === 'unset')) return 'presence';
  return 'not-comparable';
}

/** One row per key that differs or can't be checked; keys equal on both sides are left out. */
export function compare(dev: Snapshot, prod: Snapshot, allow: Allowlist, isFlag: IsFlag): Row[] {
  const rows: Row[] = [];
  const listed = (list: readonly Entry[], name: string) =>
    list.some((e) => matches(e.pattern, name));
  for (const name of [...new Set([...dev.names, ...prod.names])].sort()) {
    const status = statusOf(name, dev, prod);
    if (!status) continue;
    const guarded = isFlag(name) || VOICE_ID.test(name);
    // `presence` and `unread` are never allowlisted; a key on one side needs an onlyOn entry.
    const pool =
      status === 'only-dev'
        ? allow.onlyOn.dev
        : status === 'only-prod'
          ? allow.onlyOn.prod
          : status === 'differs' || status === 'not-comparable'
            ? allow.keys
            : [];
    // A flag passes only as a dated onlyOn.dev entry; a voice id never does.
    const dated = status === 'only-dev' && isFlag(name) && !VOICE_ID.test(name);
    const allowlisted = dated
      ? pool.some((e) => matches(e.pattern, name) && e.until !== undefined)
      : !guarded && listed(pool, name);
    const d = dev.values.get(name);
    const p = prod.values.get(name);
    const states =
      isFlag(name) && typeof d === 'object' && typeof p === 'object' && d.state && p.state
        ? { dev: d.state, prod: p.state }
        : null;
    rows.push({ name, status, allowlisted, guarded, ...(states ? { states } : {}) });
  }
  for (const name of allow.expired)
    rows.push({ name, status: 'expired', allowlisted: false, guarded: false });
  return rows;
}

const DRIFT: ReadonlySet<Status> = new Set([
  'only-dev',
  'only-prod',
  'presence',
  'differs',
  'expired',
]);

/** 0 clean, 1 drift, 2 something couldn't be compared or a boot can't be trusted. */
export function exitCode(rows: readonly Row[], dev: Snapshot, prod: Snapshot): 0 | 1 | 2 {
  const open = rows.filter((r) => !r.allowlisted && (r.status !== 'unread' || r.guarded));
  if (open.some((r) => DRIFT.has(r.status))) return 1;
  return open.length > 0 || dev.problems.length > 0 || prod.problems.length > 0 ? 2 : 0;
}

const TITLE: Record<Status, string> = {
  'only-dev': 'Only on dev',
  'only-prod': 'Only on prod',
  presence: 'Set on one side, unset on the other',
  differs: 'Values differ',
  'not-comparable': 'Cannot compare (value hidden in the boot log), not allowlisted',
  unread: 'Set on both, read by neither build (voice ids and flags here fail the check)',
  expired: 'Allowlist entries past their until date (remove them, or extend with a reason)',
};

/** The report: names, counts and flag words only. Safe to paste into a PR. */
export function render(rows: readonly Row[], dev: Snapshot, prod: Snapshot): string {
  const head = (s: Snapshot) =>
    [`- ${s.label}: ${s.names.size} keys; boot settings of ${s.commit?.slice(0, 9) ?? 'none'}`]
      .concat(s.problems.map((p) => `  ! ${s.label}: ${p}`))
      .join('\n');
  const out = ['## Secrets parity: dev vs prod', '', head(dev), head(prod), ''];
  for (const status of Object.keys(TITLE) as Status[]) {
    const names = rows
      .filter((r) => r.status === status && !r.allowlisted)
      .map((r) => (r.states ? `${r.name} (dev=${r.states.dev} prod=${r.states.prod})` : r.name));
    out.push(`${TITLE[status]} (${names.length})${names.length ? `: ${names.join(', ')}` : ''}`);
  }
  const code = exitCode(rows, dev, prod);
  out.push(`Allowlisted: ${rows.filter((r) => r.allowlisted).length} keys`, '');
  out.push(`Result: ${['CLEAN', 'DRIFT', 'CANNOT VERIFY'][code]} (exit ${code})`);
  return out.join('\n');
}
