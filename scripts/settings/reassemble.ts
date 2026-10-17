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

/** The most recent complete settings in the log text, or null when no complete set was logged. */
export function latestSettings(logText: string): Settings | null {
  const sets = new Map<string, { parts: number; got: Map<number, Part> }>();
  let latest: Settings | null = null;
  for (const line of logText.split('\n')) {
    const part = parsePart(line);
    if (!part || typeof part.hash !== 'string') continue;
    const set = sets.get(part.hash) ?? { parts: part.parts, got: new Map<number, Part>() };
    set.got.set(part.part, part);
    sets.set(part.hash, set);
    if (set.got.size !== set.parts) continue;
    const ordered = [...set.got.values()].sort((a, b) => a.part - b.part);
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
