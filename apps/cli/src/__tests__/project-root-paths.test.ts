/**
 * Scripts that derive the repo root from their own location break silently
 * when they move. generate-frontend-personas.ts used join(__dirname, '..') five
 * levels deep, so `pnpm build:frontend` read apps/cli/src/commands/src/... and
 * failed, which failed the Bundle Size check on every PR. This pins every such
 * root to the directory that holds pnpm-workspace.yaml.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = normalize(join(dirname(fileURLToPath(import.meta.url)), '../../../..'));

const ROOT_FROM_DIRNAME =
  /(?:const|let)\s+(\w*(?:[Rr]oot|ROOT)\w*)\s*=\s*(?:path\.)?(?:join|resolve)\(\s*(?:__dirname|import\.meta\.dirname)\s*((?:,\s*['"][./]+['"])+)\s*\)/g;

function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('repo-root paths derived from __dirname', () => {
  it('this test locates the workspace root', () => {
    expect(existsSync(join(repoRoot, 'pnpm-workspace.yaml'))).toBe(true);
  });

  it('every *root* computed from __dirname lands on the workspace root', () => {
    const wrong: string[] = [];
    let checked = 0;
    for (const dir of ['apps/cli/src', 'scripts', 'src']) {
      for (const file of tsFiles(join(repoRoot, dir))) {
        for (const m of readFileSync(file, 'utf8').matchAll(ROOT_FROM_DIRNAME)) {
          const segments = [...m[2].matchAll(/['"]([./]+)['"]/g)].map((s) => s[1]);
          const target = normalize(join(dirname(file), ...segments));
          checked++;
          if (!existsSync(join(target, 'pnpm-workspace.yaml'))) {
            wrong.push(`${relative(repoRoot, file)}: ${m[1]} -> ${relative(repoRoot, target) || '.'}`);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(10);
    expect(wrong).toEqual([]);
  });

  it('no CLI file derives the root by counting dirname() calls', () => {
    // dirname(dirname(__dirname)) is right in the single-file bundle and wrong
    // from source; use findProjectRoot() from services/project-root.ts.
    const offenders = tsFiles(join(repoRoot, 'apps/cli/src')).filter((f) =>
      /dirname\(\s*dirname\(\s*__dirname\s*\)\s*\)/.test(readFileSync(f, 'utf8'))
    );
    expect(offenders.map((f) => relative(repoRoot, f))).toEqual([]);
  });
});
