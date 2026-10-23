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
 * @module scripts/ops/secrets-parity-lib
 */
import { createHmac, randomBytes } from 'node:crypto';

export const FLAG_STATES: ReadonlySet<string> = new Set(['on', 'off', 'shadow', 'live']);

/** Persona voice ids. Never allowlisted: a voice that differs between dev and prod is drift. */
export const VOICE_ID = /_VOICE_ID$/;

/** What effective-settings.ts prints in place of a value it won't show. */
const HIDDEN: ReadonlySet<string> = new Set(['<set>', '<unset>']);
const PREFIX = 'EFFECTIVE_SETTINGS ';

/** A sealed value: `token` compares (`=word` or the HMAC); `state` only for a flag word. null = hidden. */
export type Sealed = { readonly token: string; readonly state?: string } | null;
export type Sealer = (value: string) => string;
type IsFlag = (name: string) => boolean;

/** HMAC-SHA256 under a random 32-byte key that exists only for this run. */
export function newSealer(): Sealer {
  const key = randomBytes(32);
  return (value) => createHmac('sha256', key).update(value).digest('hex');
}

/** Names from `lk agent secrets --json` (`{secrets: [{name, kind, createdAt, updatedAt}]}`). */
export function parseSecretNames(json: string): string[] {
  let list: unknown;
  try {
    list = (JSON.parse(json) as { secrets?: unknown }).secrets;
  } catch {
    throw new Error('lk agent secrets --json did not return JSON'); // never echo the input
  }
  if (!Array.isArray(list)) throw new Error('lk agent secrets --json returned no "secrets" list');
  return list.map((s: { name?: unknown }) => s.name).filter((n) => typeof n === 'string');
}

type Boot = { commit: string; parts: number; seen: Map<number, Map<string, Sealed>> };

/**
 * Collects `EFFECTIVE_SETTINGS {...}` boot lines from a log stream, sealing each value as it
 * arrives; other lines are ignored. A boot is complete once all its parts are in, and the last
 * boot to complete wins (a restart after update-secrets logs a new one).
 */
export class BootCollector {
  private readonly boots = new Map<string, Boot>();
  private readonly done = new Set<string>();
  private latest: Boot | undefined;

  constructor(
    private readonly isFlag: IsFlag,
    private readonly seal: Sealer
  ) {}

  add(line: string): void {
    const at = line.indexOf(PREFIX);
    if (at < 0) return;
    let p: Record<string, unknown>;
    try {
      p = JSON.parse(line.slice(at + PREFIX.length)) as Record<string, unknown>;
    } catch {
      return;
    }
    const { part, parts, commit, hash } = p;
    if (typeof part !== 'number' || typeof parts !== 'number' || typeof hash !== 'string') return;
    const id = `${String(commit)}|${hash}`;
    const boot = this.boots.get(id) ?? { commit: String(commit), parts, seen: new Map() };
    this.boots.set(id, boot);
    if (boot.seen.has(part)) return; // another instance of the same boot
    const values = new Map<string, Sealed>();
    for (const section of [p.flags, p.env]) {
      for (const [name, raw] of Object.entries((section ?? {}) as Record<string, unknown>)) {
        values.set(name, this.sealOne(name, String(raw).trim()));
      }
    }
    boot.seen.set(part, values);
    if (boot.seen.size === boot.parts) {
      this.done.add(id);
      this.latest = boot;
    }
  }

  get complete(): boolean {
    return this.latest !== undefined;
  }

  /** The latest complete boot's commit and values, and how many distinct boots completed. */
  result(): { commit: string | null; values: Map<string, Sealed>; boots: number } {
    const values = new Map<string, Sealed>();
    for (const part of this.latest?.seen.values() ?? [])
      for (const [k, v] of part) values.set(k, v);
    return { commit: this.latest?.commit ?? null, values, boots: this.done.size };
  }

  private sealOne(name: string, value: string): Sealed {
    if (HIDDEN.has(value)) return null;
    const word = value.toLowerCase();
    if (this.isFlag(name) && FLAG_STATES.has(word)) return { token: `=${word}`, state: word };
    return { token: this.seal(value) };
  }
}

/** Keys not compared by value (`NAME`, `PREFIX_*` or `*_SUFFIX`), each with its reason. */
export type Allowlist = ReadonlyArray<{ readonly pattern: string; readonly reason: string }>;

function matches(pattern: string, name: string): boolean {
  if (pattern.endsWith('*')) return name.startsWith(pattern.slice(0, -1));
  if (pattern.startsWith('*')) return name.endsWith(pattern.slice(1));
  return name === pattern;
}

/**
 * Reads `{"keys": {"PATTERN": "reason"}}`. Refuses an entry without a reason, or one that covers
 * a persona voice id or a flag among `names` (pass the flag manifest plus every key seen).
 */
export function parseAllowlist(json: string, names: Iterable<string>, isFlag: IsFlag): Allowlist {
  const keys = (JSON.parse(json) as { keys?: Record<string, string> }).keys ?? {};
  const probes = [...names, 'ANY_PERSONA_VOICE_ID'];
  return Object.entries(keys).map(([pattern, reason]) => {
    if (!reason?.trim()) throw new Error(`allowlist: ${pattern} has no reason`);
    const hit = probes.find((n) => matches(pattern, n) && (VOICE_ID.test(n) || isFlag(n)));
    if (hit)
      throw new Error(`allowlist: ${pattern} covers ${hit}; voice ids and flags must be compared`);
    return { pattern, reason };
  });
}

export type Status = 'only-dev' | 'only-prod' | 'differs' | 'not-comparable' | 'unread';

export interface Row {
  readonly name: string;
  readonly status: Status;
  readonly allowlisted: boolean;
  /** Both flag words, only for a flag whose two values are on/off/shadow/live. */
  readonly states?: { readonly dev: string; readonly prod: string };
}

/** One agent: keys set on it (`lk agent secrets`) and its latest boot (commit null = none found). */
export interface Snapshot {
  readonly label: string;
  readonly names: ReadonlySet<string>;
  readonly commit: string | null;
  readonly values: ReadonlyMap<string, Sealed>;
  readonly boots: number;
}

/** One row per key that differs or can't be checked; keys equal on both sides are left out. */
export function compare(dev: Snapshot, prod: Snapshot, allow: Allowlist, isFlag: IsFlag): Row[] {
  const rows: Row[] = [];
  for (const name of [...new Set([...dev.names, ...prod.names])].sort()) {
    const d = dev.values.get(name);
    const p = prod.values.get(name);
    let status: Status | undefined;
    if (!prod.names.has(name)) status = 'only-dev';
    else if (!dev.names.has(name)) status = 'only-prod';
    else if (d && p) status = d.token === p.token ? undefined : 'differs';
    else if (d === undefined && p === undefined && dev.commit && prod.commit) status = 'unread';
    else status = 'not-comparable';
    if (!status) continue;
    const guarded = isFlag(name) || VOICE_ID.test(name);
    const allowlisted = !guarded && allow.some((e) => matches(e.pattern, name));
    const states = isFlag(name) && d?.state && p?.state ? { dev: d.state, prod: p.state } : null;
    rows.push({ name, status, allowlisted, ...(states ? { states } : {}) });
  }
  return rows;
}

/** 0 clean, 1 drift, 2 a value couldn't be compared and isn't allowlisted. Unread keys don't count. */
export function exitCode(rows: readonly Row[], dev: Snapshot, prod: Snapshot): 0 | 1 | 2 {
  const open = rows.filter((r) => !r.allowlisted && r.status !== 'unread');
  if (open.some((r) => r.status !== 'not-comparable')) return 1;
  return open.length > 0 || dev.commit === null || prod.commit === null ? 2 : 0;
}

const TITLE: Record<Status, string> = {
  'only-dev': 'Only on dev',
  'only-prod': 'Only on prod',
  differs: 'Values differ',
  'not-comparable': 'Cannot compare (value hidden in the boot log), not allowlisted',
  unread: 'Set on both, read by neither build (not in the boot log; candidates to remove)',
};

/** The report: names, counts and flag words only. Safe to paste into a PR. */
export function render(rows: readonly Row[], dev: Snapshot, prod: Snapshot): string {
  const head = (s: Snapshot) =>
    `- ${s.label}: ${s.names.size} keys; ` +
    (s.commit === null
      ? 'NO boot settings found, values not compared'
      : `boot settings of ${s.commit.slice(0, 9)}${s.boots > 1 ? ` (${s.boots} boots, latest used)` : ''}`);
  const out = ['## Secrets parity: dev vs prod', '', head(dev), head(prod), ''];
  for (const status of Object.keys(TITLE) as Status[]) {
    const names = rows
      .filter((r) => r.status === status && !r.allowlisted)
      .map((r) => (r.states ? `${r.name} (dev=${r.states.dev} prod=${r.states.prod})` : r.name));
    out.push(`${TITLE[status]} (${names.length})${names.length ? `: ${names.join(', ')}` : ''}`);
  }
  const code = exitCode(rows, dev, prod);
  out.push(`Allowlisted, not compared: ${rows.filter((r) => r.allowlisted).length} keys`, '');
  out.push(`Result: ${['CLEAN', 'DRIFT', 'CANNOT VERIFY'][code]} (exit ${code})`);
  return out.join('\n');
}
