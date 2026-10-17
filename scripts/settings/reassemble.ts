/**
 * Rebuilds the effective settings from the EFFECTIVE_SETTINGS lines a worker logs at boot.
 * Each boot logs numbered parts (see src/config/effective-settings.ts). Parts can be cut off
 * by a log pipeline, so only a complete set of parts counts.
 *
 * @module scripts/settings/reassemble
 */

export interface Settings {
  readonly commit: string;
  readonly hash: string;
  readonly flags: Readonly<Record<string, string>>;
  readonly env: Readonly<Record<string, string>>;
}

interface Part {
  readonly part: number;
  readonly parts: number;
  readonly commit: string;
  readonly hash: string;
  readonly flags?: Record<string, string>;
  readonly env?: Record<string, string>;
}

const PREFIX = 'EFFECTIVE_SETTINGS ';

function parsePart(line: string): Part | null {
  const at = line.indexOf(`${PREFIX}{`);
  if (at === -1) return null;
  try {
    return JSON.parse(line.slice(at + PREFIX.length)) as Part;
  } catch {
    return null; // a line cut off by the log pipeline
  }
}

/**
 * The most recent complete settings in the log text, or null when no complete set was logged.
 * A set is one boot's parts: the same hash and part count, each part number once. A part
 * number that is already in the set starts a new set (a restart with identical printed
 * settings logs the same hash again), so parts from two boots never mix.
 */
export function latestSettings(logText: string): Settings | null {
  const sets = new Map<string, Map<number, Part>>();
  let latest: Settings | null = null;
  for (const line of logText.split('\n')) {
    const part = parsePart(line);
    if (!part || typeof part.hash !== 'string' || !Number.isInteger(part.part)) continue;
    if (!Number.isInteger(part.parts) || part.part < 1 || part.part > part.parts) continue;
    const key = `${part.hash}:${part.parts}`;
    let got = sets.get(key);
    if (!got || got.has(part.part)) {
      got = new Map<number, Part>();
      sets.set(key, got);
    }
    got.set(part.part, part);
    if (got.size !== part.parts) continue;
    const ordered = [...got.values()].sort((a, b) => a.part - b.part);
    latest = {
      commit: ordered[0].commit,
      hash: part.hash,
      flags: Object.assign({}, ...ordered.map((p) => p.flags ?? {})),
      env: Object.assign({}, ...ordered.map((p) => p.env ?? {})),
    };
  }
  return latest;
}

/** Each name whose value differs between the two settings, as `[name, a, b]` (a missing value is `undefined`). */
export function diffSettings(
  a: Settings,
  b: Settings
): [string, string | undefined, string | undefined][] {
  const names = new Set([
    ...Object.keys(a.flags),
    ...Object.keys(a.env),
    ...Object.keys(b.flags),
    ...Object.keys(b.env),
  ]);
  const out: [string, string | undefined, string | undefined][] = [];
  for (const name of [...names].sort()) {
    const left = a.flags[name] ?? a.env[name];
    const right = b.flags[name] ?? b.env[name];
    if (left !== right) out.push([name, left, right]);
  }
  return out;
}
