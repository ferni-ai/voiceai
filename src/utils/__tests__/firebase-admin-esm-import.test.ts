/**
 * firebase-admin is CommonJS. Under plain Node ESM (how the built agent runs),
 * `await import('firebase-admin')` exposes apps / initializeApp / firestore
 * only on `.default`; the namespace itself has them undefined. Vitest's interop
 * hides this, so code that reads `admin.apps.length` passes its tests and then
 * throws in production, where every caller silently fell back to in-memory
 * storage ("Firebase not available").
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');
const IMPORT = /const (\w+) = await import\('firebase-admin'\);/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === '__tests__' || name === 'node_modules' ? [] : sourceFiles(path);
    }
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('firebase-admin dynamic import', () => {
  it('only has the admin API on .default under plain Node ESM', () => {
    const out = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "const m = await import('firebase-admin'); console.log(typeof m.apps, typeof m.default.apps)",
      ],
      { cwd: SRC, encoding: 'utf8' }
    ).trim();
    expect(out).toBe('undefined object');
  });

  it('every dynamic import uses the admin API through .default', () => {
    const violations: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(IMPORT)) {
        const name = match[1];
        let rest = text.slice((match.index ?? 0) + match[0].length);
        // Scope ends at the next import of the same name (a sibling function's binding).
        const next = rest.indexOf(`const ${name} = await import('firebase-admin');`);
        if (next !== -1) rest = rest.slice(0, next);
        const uses = [...rest.matchAll(new RegExp(`\\b${name}\\b(\\.\\w+)?`, 'g'))];
        const bad = uses.find((u) => u[1] !== '.default');
        if (bad) violations.push(`${relative(SRC, file)}: ${name}${bad[1] ?? ''}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
