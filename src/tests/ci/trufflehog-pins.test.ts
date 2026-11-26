/**
 * Every trufflehog run in CI scans with one release, pinned by digest (#2993).
 *
 * The action is pinned to a commit, but that pins only the action's script: it
 * runs `docker run "${IMAGE}:${VERSION}"`, and `version` defaults to "latest".
 * On 2026-11-19 the whole-tree scan of main ran the 3.99.2 image, the two action
 * steps ran :latest (3.99.9), and both comments said 3.99.7.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');
const WORKFLOWS = ['.github/workflows/ci.yml', '.github/workflows/secret-scan-main.yml'];

/** A release plus the digest of its image index, e.g. 3.99.7@sha256:<64 hex>. */
const PINNED = /^\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/;

/** The text after `key:` on each line that has it, with quotes stripped. */
function values(text: string, key: string): string[] {
  const re = new RegExp(`^\\s*${key}:\\s*['"]?([^'"\\s#]+)`, 'gm');
  return [...text.matchAll(re)].map((m) => m[1]);
}

/** Each `uses: trufflesecurity/trufflehog@...` step and the lines of its `with:` block. */
function actionSteps(text: string): Array<{ ref: string; withBlock: string }> {
  const lines = text.split('\n');
  const steps: Array<{ ref: string; withBlock: string }> = [];
  lines.forEach((line, i) => {
    const m = /^(\s*)uses:\s*trufflesecurity\/trufflehog@(\S+)/.exec(line);
    if (!m) return;
    const indent = m[1].length;
    const body: string[] = [];
    for (const next of lines.slice(i + 1)) {
      const lead = /^\s*/.exec(next)?.[0].length ?? 0;
      if (next.trim() && lead < indent) break;
      if (/^\s*- /.test(next) && lead <= indent) break;
      body.push(next);
    }
    steps.push({ ref: m[2], withBlock: body.join('\n') });
  });
  return steps;
}

describe('trufflehog pins (#2993)', () => {
  const texts = WORKFLOWS.map(read);
  const steps = texts.flatMap(actionSteps);
  const scanMain = read('.github/workflows/secret-scan-main.yml');
  const release = values(scanMain, 'TRUFFLEHOG_VERSION');

  it('finds the three scans: two action steps and the whole-tree docker run', () => {
    expect(steps).toHaveLength(2);
    expect(scanMain).toMatch(
      /docker run [^\n]*"ghcr\.io\/trufflesecurity\/trufflehog:\$TRUFFLEHOG_VERSION"/
    );
  });

  it('pins one release by digest in secret-scan-main.yml', () => {
    expect(release).toHaveLength(1);
    expect(release[0]).toMatch(PINNED);
  });

  it('gives every action step that same version, never the default :latest', () => {
    for (const s of steps)
      expect(s.withBlock).toMatch(/version:\s*\$\{\{\s*env\.TRUFFLEHOG_VERSION\s*\}\}/);
    const ciEnv = values(read('.github/workflows/ci.yml'), 'TRUFFLEHOG_VERSION');
    expect(ciEnv).toEqual(release);
  });

  it('pins every action step to one commit, and every version comment names the pinned release', () => {
    const refs = new Set(steps.map((s) => s.ref));
    expect(refs.size).toBe(1);
    expect([...refs][0]).toMatch(/^[0-9a-f]{40}$/);
    for (const text of texts) {
      for (const comment of text.match(/trufflehog[^\n]*\b\d+\.\d+\.\d+\b/gi) ?? []) {
        expect(comment, comment).toContain(release[0].split('@')[0]);
      }
    }
  });
});
