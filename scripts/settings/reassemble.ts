/**
 * Rebuilds the effective settings from the EFFECTIVE_SETTINGS lines a worker logs at boot.
 * Each boot logs numbered parts (see src/config/effective-settings.ts). Parts can be cut off
 * by a log pipeline, so only a complete set of parts counts.
 *
 * @module scripts/settings/reassemble
 */

import { ENV_CLASSIFICATION } from '../../src/config/env-classification.js';

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
 * A set is one boot's parts, read as one run: part 1 starts it, and each following part must
 * be the next number with the same hash, part count and commit. Any break drops the run, so
 * parts from two boots (or from two replicas during a rolling deploy) never combine.
 */
export function latestSettings(logText: string): Settings | null {
  let latest: Settings | null = null;
  let run: { hash: string; parts: number; commit: string; got: Part[] } | null = null;
  for (const line of logText.split('\n')) {
    const part = parsePart(line);
    if (!part || typeof part.hash !== 'string' || typeof part.commit !== 'string') continue;
    if (!Number.isInteger(part.part) || !Number.isInteger(part.parts)) continue;
    if (part.part < 1 || part.part > part.parts) continue;
    if (part.part === 1) {
      run = { hash: part.hash, parts: part.parts, commit: part.commit, got: [part] };
    } else if (
      run &&
      part.part === run.got.length + 1 &&
      part.hash === run.hash &&
      part.parts === run.parts &&
      part.commit === run.commit
    ) {
      run.got.push(part);
    } else {
      run = null;
      continue;
    }
    if (run.got.length !== run.parts) continue;
    latest = {
      commit: run.commit,
      hash: run.hash,
      flags: Object.assign({}, ...run.got.map((p) => p.flags ?? {})),
      env: Object.assign({}, ...run.got.map((p) => p.env ?? {})),
    };
    run = null;
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

/** Secret-classed names whose logged value is not a `<set>` or `<unset>` marker. Their names only, never values. */
export function secretLeaks(settings: Settings): string[] {
  return Object.entries(settings.env)
    .filter(
      ([name, value]) =>
        ENV_CLASSIFICATION[name] === 'secret' && value !== '<set>' && value !== '<unset>'
    )
    .map(([name]) => name);
}
