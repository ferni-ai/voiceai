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
  readonly flags: Words;
  readonly env: Words;
}

type Words = Readonly<Record<string, string>>;

const PREFIX = 'EFFECTIVE_SETTINGS ';

function isWords(value: unknown): value is Words {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === 'string')
  );
}

/** A settings line that is well formed, or null for any other line. `'malformed'` for a settings line that is not. */
function parsePart(line: string): Part | 'malformed' | null {
  const at = line.indexOf(`${PREFIX}{`);
  if (at === -1) return null;
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(line.slice(at + PREFIX.length)) as Record<string, unknown>;
  } catch {
    return 'malformed'; // cut off by the log pipeline
  }
  const { part, parts, commit, hash } = body;
  const flags = body.flags ?? {};
  const env = body.env ?? {};
  const ok =
    Number.isInteger(part) &&
    Number.isInteger(parts) &&
    (part as number) >= 1 &&
    (part as number) <= (parts as number) &&
    typeof commit === 'string' &&
    typeof hash === 'string' &&
    isWords(flags) &&
    isWords(env);
  if (!ok) return 'malformed';
  return { part, parts, commit, hash, flags, env } as Part;
}

/**
 * The most recent complete settings in the log text, or null when no complete set was logged.
 * A set is one boot's parts, read as one run: part 1 starts it, and each next part must follow
 * with the same hash, part count and commit. Any settings line that is cut off or malformed,
 * and any break in the sequence, ends the run. So a boot whose first part was lost cannot
 * borrow the parts of the boot before it. Assumes one instance's log stream, which is what
 * `lk agent logs` tails.
 */
export function latestSettings(logText: string): Settings | null {
  let latest: Settings | null = null;
  let run: { hash: string; parts: number; commit: string; got: Part[] } | null = null;
  for (const line of logText.split('\n')) {
    const parsed = parsePart(line);
    if (parsed === null) continue;
    if (parsed === 'malformed') {
      run = null;
      continue;
    }
    if (parsed.part === 1) {
      run = { hash: parsed.hash, parts: parsed.parts, commit: parsed.commit, got: [parsed] };
    } else if (
      run &&
      parsed.part === run.got.length + 1 &&
      parsed.hash === run.hash &&
      parsed.parts === run.parts &&
      parsed.commit === run.commit
    ) {
      run.got.push(parsed);
    } else {
      run = null;
      continue;
    }
    if (run.got.length !== run.parts) continue;
    // Object.fromEntries defines each name as an own property, so a name such as __proto__ stays data.
    latest = {
      commit: run.commit,
      hash: run.hash,
      flags: Object.fromEntries(run.got.flatMap((p) => Object.entries(p.flags))),
      env: Object.fromEntries(run.got.flatMap((p) => Object.entries(p.env))),
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

/** Secret-classed names, in flags or env, whose logged value is not a `<set>` or `<unset>` marker. Names only, never values. */
export function secretLeaks(settings: Settings): string[] {
  return [...Object.entries(settings.flags), ...Object.entries(settings.env)]
    .filter(
      ([name, value]) =>
        ENV_CLASSIFICATION[name] === 'secret' && value !== '<set>' && value !== '<unset>'
    )
    .map(([name]) => name);
}
