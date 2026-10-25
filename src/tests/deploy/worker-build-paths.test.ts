/**
 * deploy-worker.yml builds the Pub/Sub and outreach worker images on pull
 * requests and pushes whose files match its `paths:` filter. The filter used
 * to name five src files while the images COPY all of src/, the workspace
 * manifests, patches/ and .npmrc, so a change that broke an image could merge
 * without the build ever running. Every COPY source of every Dockerfile the
 * workflow builds must match one of its paths.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, matchesGlob } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const WORKFLOW = '.github/workflows/deploy-worker.yml';

/** The globs under `on.<event>.paths` in the worker workflow. */
function triggerPaths(event: 'push' | 'pull_request'): string[] {
  const lines = read(WORKFLOW).split('\n');
  const start = lines.findIndex((l) => l === `  ${event}:`);
  const paths = lines.findIndex((l, i) => i > start && l === '    paths:');
  const end = lines.findIndex((l, i) => i > paths && /^ {0,4}\S/.test(l));
  return lines
    .slice(paths + 1, end)
    .map((l) => /^ {6}- '([^']+)'$/.exec(l)?.[1])
    .filter((g): g is string => g !== undefined);
}

/** The Dockerfiles the build matrix names. */
function dockerfiles(): string[] {
  return [...read(WORKFLOW).matchAll(/^ +dockerfile: (\S+)$/gm)].map((m) => m[1]);
}

/** Each COPY source (not the destination) in a Dockerfile; a directory gets a file path inside it. */
function copySources(dockerfile: string): string[] {
  return read(dockerfile)
    .split('\n')
    .filter((l) => /^COPY\s/.test(l) && !l.includes('--from='))
    .flatMap((l) => l.trim().split(/\s+/).slice(1, -1))
    .filter((src) => !src.startsWith('--'))
    .map((src) => (src.endsWith('/') ? `${src}any/file.ts` : src));
}

const sources = [...new Set(dockerfiles().flatMap(copySources))];

describe('the worker image build runs whenever an image input changes', () => {
  it('reads both Dockerfiles, their COPYs and the paths (guards against an empty check)', () => {
    expect(dockerfiles()).toEqual(['Dockerfile.worker', 'docker/Dockerfile.outreach']);
    for (const f of dockerfiles()) expect(existsSync(join(ROOT, f))).toBe(true);
    expect(sources.length).toBeGreaterThan(10);
    expect(sources).toEqual(expect.arrayContaining(['pnpm-workspace.yaml', 'src/any/file.ts']));
    expect(triggerPaths('push').length).toBeGreaterThan(5);
  });

  it('pull requests and pushes watch the same paths', () => {
    expect(triggerPaths('pull_request')).toEqual(triggerPaths('push'));
  });

  it.each(sources)('a change to %s runs the build', (src) => {
    expect(triggerPaths('push').some((g) => matchesGlob(src, g))).toBe(true);
  });

  it.each(dockerfiles())('a change to %s itself runs the build', (f) => {
    expect(triggerPaths('push').some((g) => matchesGlob(f, g))).toBe(true);
  });
});
