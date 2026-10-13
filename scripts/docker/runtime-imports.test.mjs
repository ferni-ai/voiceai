import {
  cpSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { bareSpecifiers, checkLoads, packageName, runtimeImports } from './runtime-imports.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
const pkg = createRequire(join(ROOT, 'package.json'))('./package.json');

describe('bareSpecifiers', () => {
  it('finds package imports, across lines, and skips relative, node: and builtins', () => {
    const text = `
      const a = await import('compromise');
      const b = await import(
        "@livekit/agents-plugin-google/beta"
      );
      await import('./local.js'); await import('node:fs'); await import('fs/promises');
      await import(\`\${dynamic}\`);
    `;
    expect(bareSpecifiers(text)).toEqual(['compromise', '@livekit/agents-plugin-google/beta']);
  });

  it('names the package of a subpath', () => {
    expect(packageName('firebase-admin/firestore')).toBe('firebase-admin');
    expect(packageName('@google-cloud/storage')).toBe('@google-cloud/storage');
    expect(packageName('@a/b/c')).toBe('@a/b');
  });
});

describe('runtimeImports over src/', () => {
  const { specifiers, skipped } = runtimeImports(join(ROOT, 'src'), pkg.dependencies);

  it('includes the packages the 2026-10-11 outage hid behind import()', () => {
    expect(specifiers).toEqual(expect.arrayContaining(['compromise', 'compromise-dates']));
  });

  it('checks only production dependencies', () => {
    for (const spec of specifiers) expect(pkg.dependencies).toHaveProperty(packageName(spec));
    for (const spec of skipped) expect(pkg.dependencies).not.toHaveProperty(packageName(spec));
  });

  it('every lazily imported package loads from this install', () => {
    const result = checkLoads(specifiers, ROOT);
    expect(result.notFound).toEqual([]);
    expect(result.ok.length + result.failed.length).toBe(specifiers.length);
  }, 120_000);
});

describe('checkLoads after the image prune (the suffix-thumb outage)', () => {
  const dirs = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

  /** compromise and its dependencies, copied flat, then pruned as docker/Dockerfile.agent does. */
  function prunedInstall(keepSuffixThumb) {
    const app = mkdtempSync(join(tmpdir(), 'runtime-imports-'));
    dirs.push(app);
    const compromise = realpathSync(join(ROOT, 'node_modules', 'compromise'));
    const deps = ['compromise', 'efrt', 'grad-school', 'suffix-thumb'];
    for (const name of deps) {
      cpSync(join(dirname(compromise), name), join(app, 'node_modules', name), {
        recursive: true,
        dereference: true,
      });
    }
    writeFileSync(
      join(app, 'package.json'),
      JSON.stringify({ type: 'module', dependencies: { compromise: '*' } })
    );
    // find node_modules -type d \( -name test -o -name tests -o -name __tests__ -o -name docs \) -exec rm -rf
    const prune = (dir) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (!statSync(path).isDirectory()) continue;
        const kept = keepSuffixThumb && path.includes(`${join('node_modules', 'suffix-thumb')}`);
        if (['test', 'tests', '__tests__', 'docs'].includes(entry) && !kept)
          rmSync(path, { recursive: true });
        else prune(path);
      }
    };
    prune(join(app, 'node_modules'));
    return app;
  }

  it('fails when the prune deleted a runtime file', () => {
    const result = checkLoads(['compromise'], prunedInstall(false));
    expect(result.ok).toEqual([]);
    expect(result.notFound).toEqual([
      expect.objectContaining({ spec: 'compromise', error: expect.stringMatching(/suffix-thumb/) }),
    ]);
  });

  it('passes with the #989 exclusion', () => {
    expect(checkLoads(['compromise'], prunedInstall(true))).toMatchObject({
      ok: ['compromise'],
      notFound: [],
    });
  });
});
