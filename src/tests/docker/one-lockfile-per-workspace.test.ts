/**
 * The pnpm workspace has exactly one lockfile, pnpm-lock.yaml. A second one
 * inside a workspace package drifts: apps/web kept an npm package-lock.json
 * that the UI image installed from with `npm ci`, nothing kept it in sync, and
 * when #392 added a dev dependency to apps/web/package.json every UI deploy
 * from main failed. Dependabot also switches a package with an npm lockfile to
 * npm, which cannot resolve "workspace:*".
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');

/** The `packages:` list of pnpm-workspace.yaml (plain `  - path` entries). */
function readWorkspacePackages(): string[] {
  const lines = readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf8').split('\n');
  const start = lines.indexOf('packages:');
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const entry = /^\s+-\s+['"]?([^'"#\s]+)['"]?/.exec(line);
    if (!entry) break;
    out.push(entry[1] as string);
  }
  return out;
}

const workspacePackages = readWorkspacePackages();

const dockerfiles = ['docker', '.']
  .flatMap((dir) =>
    readdirSync(join(ROOT, dir))
      .filter((name) => name.startsWith('Dockerfile'))
      .map((name) => join(dir, name))
  )
  .filter((path) => existsSync(join(ROOT, path)));

/** Dockerfile instructions only: comments may describe the old setup. */
const instructions = (file: string): string[] =>
  readFileSync(join(ROOT, file), 'utf8')
    .split('\n')
    .map((line) => (line.trim().startsWith('#') ? '' : line));

describe('one lockfile per pnpm workspace', () => {
  it('reads the real workspace', () => {
    expect(workspacePackages).toContain('apps/web');
    expect(dockerfiles).toContain(join('docker', 'Dockerfile.ui'));
  });

  it('no workspace package carries its own npm or yarn lockfile', () => {
    const strays = workspacePackages
      .filter((pkg) => pkg !== '.')
      .flatMap((pkg) =>
        ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock']
          .map((name) => join(pkg, name))
          .filter((path) => existsSync(join(ROOT, path)))
      );
    expect(strays).toEqual([]);
  });

  it('no Dockerfile installs a workspace package with npm', () => {
    const npmInstalls = dockerfiles.flatMap((file) =>
      instructions(file)
        .map((line, i) => ({ line: line.trim(), at: `${file}:${i + 1}` }))
        .filter(({ line }) =>
          workspacePackages
            .filter((pkg) => pkg !== '.')
            .some((pkg) => line.includes(`${pkg}/package-lock.json`))
        )
        .map(({ at }) => at)
    );
    expect(npmInstalls).toEqual([]);
  });

  it('the UI image builds the frontend from the shared pnpm install', () => {
    const ui = instructions(join('docker', 'Dockerfile.ui')).join('\n');
    expect(ui).toMatch(/^FROM workspace-deps AS frontend-builder$/m);
    expect(ui).not.toMatch(/npm ci/);
  });
});
