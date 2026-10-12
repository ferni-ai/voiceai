/**
 * Every Cartesia model id and API version written in the repo is pinned.
 *
 * Cartesia shuts down Sonic 2, Turbo and Sonic 3 before 3.6 after 2026-10-20,
 * and the old aliases (`sonic-3-latest`, `sonic-latest`) now serve the beta
 * `sonic-preview`. A model id must be a dated snapshot at 3.6 or newer, and a
 * Cartesia-Version literal must be the pinned version. Runtime env values are
 * pinned by `pinCartesiaModel` / `pinCartesiaApiVersion`; this scan covers the
 * ids written into source, scripts, manifests and the env template.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CARTESIA_API_VERSION_PINNED, isPinnedCartesiaModel } from '../voice-ids.js';

const ROOT = join(__dirname, '../../..');

/** Files allowed a dated pre-3.6 snapshot, and why. */
const PRE_36_SNAPSHOT_ALLOWED: Record<string, string> = {
  // Data: the models a Pro clone was fine-tuned on (Cartesia's answer), not a model choice.
  'src/config/voice-capabilities.ts': 'PVC fine-tune list',
};

function trackedFiles(): string[] {
  const out = execFileSync(
    'git',
    ['ls-files', '--', 'src', 'apps/cli/src', 'scripts', '.env.example'],
    { cwd: ROOT, encoding: 'utf8' }
  );
  return out
    .split('\n')
    .filter((f) => /\.(ts|mts|js|mjs|cjs|json|sh|py)$|^\.env\.example$/.test(f))
    .filter((f) => !/__tests__\/|\.test\.|\.spec\./.test(f))
    .filter((f) => existsSync(join(ROOT, f))); // a deletion not yet staged
}

/** Model ids in string literals, JSON values and env assignments. */
export function modelIdsIn(text: string): string[] {
  const ids: string[] = [];
  for (const m of text.matchAll(/(['"`])(sonic(?:-[a-z0-9.]+)*)\1/g)) ids.push(m[2]);
  for (const m of text.matchAll(/^\s*#?\s*CARTESIA_MODEL=(\S+)/gm)) ids.push(m[1]);
  return ids.filter((id) => id !== 'sonic-boom');
}

/** Cartesia-Version literals in headers and query strings. */
export function apiVersionsIn(text: string): string[] {
  const out: string[] = [];
  const re =
    /(?:Cartesia-Version['"]?\s*:\s*|cartesia_version[=:]\s*['"]?|_VERSION\s*=\s*)['"]?(\d{4}-\d{2}-\d{2})/g;
  for (const m of text.matchAll(re)) out.push(m[1]);
  return out;
}

describe('isPinnedCartesiaModel', () => {
  it('accepts dated snapshots at 3.6 or newer only', () => {
    expect(isPinnedCartesiaModel('sonic-3.6-2026-08-27')).toBe(true);
    expect(isPinnedCartesiaModel('sonic-3.7-2026-12-01')).toBe(true);
    expect(isPinnedCartesiaModel('sonic-4.0-2027-01-01')).toBe(true);
    for (const id of [
      'sonic-3-latest',
      'sonic-latest',
      'sonic-preview',
      'sonic-3.6',
      'sonic-3',
      'sonic-3-2025-10-27',
      'sonic-3-2026-01-12',
      'sonic-3.5-2026-05-04',
      'sonic-2-2025-03-07',
      'sonic-turbo-2025-06-04',
      'sonic-english',
      'sonic',
    ]) {
      expect(isPinnedCartesiaModel(id), id).toBe(false);
    }
  });
});

describe('the scanners', () => {
  it('find quoted, JSON and env model ids, and header/query versions', () => {
    expect(
      modelIdsIn(`model_id: 'sonic-english', "model": "sonic-3-latest"\nCARTESIA_MODEL=sonic-2`)
    ).toEqual(['sonic-english', 'sonic-3-latest', 'sonic-2']);
    expect(
      modelIdsIn("see docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags; import 'sonic-boom'")
    ).toEqual([]);
    expect(apiVersionsIn(`'Cartesia-Version': '2024-06-10', cartesia_version=2025-04-16`)).toEqual([
      '2024-06-10',
      '2025-04-16',
    ]);
  });
});

describe('repo pins (Cartesia Oct 20 2026 shutdown)', () => {
  const files = trackedFiles();

  it('scans a real file set', () => {
    expect(files).toContain('src/config/voice-ids.ts');
    expect(files.some((f) => f.endsWith('persona.manifest.json'))).toBe(true);
  });

  it('every model id is a dated Sonic 3.6+ snapshot', () => {
    const bad: string[] = [];
    for (const file of files) {
      for (const id of modelIdsIn(readFileSync(join(ROOT, file), 'utf8'))) {
        const allowedOld =
          PRE_36_SNAPSHOT_ALLOWED[file] && /^sonic-[\d.]+-\d{4}-\d{2}-\d{2}$/.test(id);
        if (!isPinnedCartesiaModel(id) && !allowedOld) bad.push(`${file}: ${id}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it(`every Cartesia-Version literal is ${CARTESIA_API_VERSION_PINNED}`, () => {
    const bad: string[] = [];
    for (const file of files) {
      for (const v of apiVersionsIn(readFileSync(join(ROOT, file), 'utf8'))) {
        if (v !== CARTESIA_API_VERSION_PINNED) bad.push(`${file}: ${v}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('no caller uses an endpoint Cartesia shut down', () => {
    const bad = files.filter((f) =>
      /\/voices\/clone\/clip|\/voices\/mix|\/voice-changer\//.test(
        readFileSync(join(ROOT, f), 'utf8')
      )
    );
    expect(bad).toEqual([]);
  });
});
