/**
 * The flag manifest is a ratchet: every env flag the code reads must be listed
 * in FLAG_MANIFEST with its default, owner and kind. A flag nobody listed is a
 * flag nobody can say the state of (the 2026-10-11 audit found ~315 flags that
 * had never been set and four set secrets that nothing read).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flagOn } from '../env-flag.js';
import { FLAG_KINDS, FLAG_MANIFEST, FLAG_OWNERS, type FlagName } from '../flag-manifest.js';

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') sourceFiles(path, out);
    } else if (/\.ts$/.test(entry) && !/\.(test|spec|d)\.ts$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

const NAME = '[A-Z][A-Z0-9_]+';
// process.env.X / env.X / env['X'], optionally normalised, compared with an
// on/off word: the shape of an env flag read.
const DIRECT = new RegExp(
  String.raw`(?:process\.env|\benv)(?:\.(${NAME})|\[['"](${NAME})['"]\])` +
    String.raw`(?:\s*(?:\?\?|\|\|)\s*['"]['"]|\??\.trim\(\)|\??\.toLowerCase\(\)|\))*` +
    String.raw`\s*[!=]==?\s*['"](?:on|off|true|false|1|0|live|shadow|yes|no)['"]`,
  'g'
);
// Reads through a helper that takes the flag name.
const HELPER = new RegExp(
  String.raw`\b(?:flagOn|envEnabled)\(\s*['"](${NAME})['"]|\bon\(env,\s*['"](${NAME})['"]`,
  'g'
);

/** Flag names read in src/, each with the first place it is read. */
function flagReads(): Map<string, string> {
  const reads = new Map<string, string>();
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const re of [DIRECT, HELPER]) {
      for (const m of text.matchAll(re)) {
        const name = m[1] ?? m[2];
        const line = text.slice(0, m.index).split('\n').length;
        if (name && !reads.has(name)) reads.set(name, `${relative(SRC, file)}:${line}`);
      }
    }
  }
  return reads;
}

describe('flag manifest', () => {
  it('lists every env flag read in src/', () => {
    const reads = flagReads();
    expect(reads.size).toBeGreaterThan(100); // the scanner still finds flags
    const missing = [...reads].filter(([name]) => !(name in FLAG_MANIFEST));
    expect(
      missing.map(([name, where]) => `${name} (${where})`),
      'Add each to the manifest with its default, owner and kind. New flag: pnpm flags:new NAME --default off --owner <owner> --kind experiment --issue #123'
    ).toEqual([]);
  });

  it('gives each flag a known owner and kind', () => {
    for (const [name, spec] of Object.entries(FLAG_MANIFEST)) {
      expect(FLAG_OWNERS, name).toContain(spec.owner);
      expect(FLAG_KINDS, name).toContain(spec.kind);
      expect(spec.default, name).not.toBe('');
    }
  });

  it('catches an unlisted flag read in each shape the scanner knows', () => {
    const shapes = [
      "process.env.NOT_A_FLAG_X === 'on'",
      "process.env['NOT_A_FLAG_X'] !== 'false'",
      "(env.NOT_A_FLAG_X ?? '').toLowerCase() === 'true'",
      "on(env, 'NOT_A_FLAG_X')",
      "flagOn('NOT_A_FLAG_X')",
    ];
    for (const shape of shapes) {
      const found = [...shape.matchAll(DIRECT), ...shape.matchAll(HELPER)].map((m) => m[1] ?? m[2]);
      expect(found, shape).toEqual(['NOT_A_FLAG_X']);
    }
    // Not flags: other comparisons and event names.
    for (const shape of ["process.env.NODE_ENV === 'production'", "process.on('SIGTERM'"]) {
      expect([...shape.matchAll(DIRECT), ...shape.matchAll(HELPER)], shape).toEqual([]);
    }
  });
});

describe('flagOn', () => {
  const offFlag: FlagName = 'CANDOR';
  const onFlag: FlagName = 'TURN_KEEPER';

  it('uses the manifest defaults these tests rely on', () => {
    expect(FLAG_MANIFEST[offFlag].default).toBe('off');
    expect(FLAG_MANIFEST[onFlag].default).toBe('on');
  });

  it('reads on, true, 1 and live in any case as on', () => {
    for (const value of ['on', 'true', '1', 'live', 'ON', 'True', ' on ', 'LIVE']) {
      expect(flagOn(offFlag, { [offFlag]: value }), value).toBe(true);
    }
  });

  it('reads off, false and 0 in any case as off, even for a default-on flag', () => {
    for (const value of ['off', 'false', '0', 'OFF', ' False ']) {
      expect(flagOn(onFlag, { [onFlag]: value }), value).toBe(false);
    }
  });

  it('falls back to the manifest default when unset, empty or unrecognised', () => {
    for (const value of [undefined, '', '  ', 'maybe', 'yes please']) {
      expect(flagOn(offFlag, { [offFlag]: value }), String(value)).toBe(false);
      expect(flagOn(onFlag, { [onFlag]: value }), String(value)).toBe(true);
    }
  });

  it('reads process.env when no env is passed', () => {
    const saved = process.env[offFlag];
    try {
      process.env[offFlag] = 'TRUE';
      expect(flagOn(offFlag)).toBe(true);
      delete process.env[offFlag];
      expect(flagOn(offFlag)).toBe(false);
    } finally {
      if (saved === undefined) delete process.env[offFlag];
      else process.env[offFlag] = saved;
    }
  });
});
