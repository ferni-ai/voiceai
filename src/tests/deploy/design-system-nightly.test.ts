/**
 * design-system.yml is the only CI that builds @ferni/react, the VS Code extension,
 * the Figma plugin and Storybook, and the only CI that runs brand:check. Until
 * 2026-11 every job in it was gated on OPTIONAL_CI, which is off, so none of it
 * ran. brand:check also had continue-on-error, and the Figma build's
 * `|| echo ... > dist/ui.html` fallback made it exit 0 when esbuild failed.
 *
 * These pin the nightly shape: the checks run on the schedule whatever
 * OPTIONAL_CI says, a failure turns the run red (no escape hatches), a red
 * nightly opens an issue, and the publish jobs still never run unasked.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { running } from './workflow-jobs.js';

const ROOT = join(__dirname, '..', '..', '..');
const WORKFLOW = 'design-system.yml';
const CHECKS = ['brand', 'build', 'storybook'];
const OFF = { 'vars.OPTIONAL_CI': 'off' };

const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

/** A job's block of design-system.yml, from its `  id:` line to the next job. */
function jobText(id: string): string {
  const text = read(`.github/workflows/${WORKFLOW}`);
  const block = new RegExp(`^ {2}${id}:\\n([\\s\\S]*?)(?=^ {2}[\\w-]+:\\n|(?![\\s\\S]))`, 'm').exec(
    text
  );
  if (!block) throw new Error(`${WORKFLOW}: job ${id} not found`);
  return block[1];
}

describe('design-system.yml nightly', () => {
  it.each(CHECKS)('%s runs on the schedule with OPTIONAL_CI off', (id) => {
    expect(running(WORKFLOW, 'schedule', OFF).has(id)).toBe(true);
  });

  it('PR runs still follow OPTIONAL_CI (the simulation is live)', () => {
    expect(running(WORKFLOW, 'pull_request', OFF).size).toBe(0);
    for (const id of CHECKS) expect(running(WORKFLOW, 'pull_request').has(id)).toBe(true);
  });

  it('the schedule never publishes', () => {
    const ran = running(WORKFLOW, 'schedule');
    expect(ran.has('publish')).toBe(false);
    expect(ran.has('publish-vscode')).toBe(false);
    // live: a push to main tagged [publish] does publish
    const tagged = { 'github.event.head_commit.message': 'release [publish]' };
    expect(running(WORKFLOW, 'push', tagged).has('publish')).toBe(true);
  });

  it.each(CHECKS)('%s has no step that can fail without failing the job', (id) => {
    expect(jobText(id)).not.toMatch(/continue-on-error|\|\|\s*true|set \+e/);
  });

  it('runs brand:check and every package build', () => {
    expect(jobText('brand')).toContain('run: pnpm brand:check');
    const build = jobText('build');
    for (const dir of ['packages/ferni-react', 'apps/vscode-extension', 'apps/figma-plugin']) {
      expect(build).toContain(`working-directory: ${dir}`);
    }
    expect(jobText('storybook')).toContain('run: pnpm run build-storybook');
  });

  // The old script ended `cp src/ui.html dist/ui.html 2>/dev/null || echo ...`: by
  // shell precedence the `|| echo` caught an esbuild failure too and exited 0.
  it('the Figma plugin build fails when a step fails', () => {
    const pkg = JSON.parse(read('apps/figma-plugin/package.json')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.build).not.toMatch(/\|\||;/);
    expect(read('apps/figma-plugin/src/ui.html')).toContain('<script src="ui.js"></script>');
  });

  it('a failed nightly opens a ci-health issue', () => {
    expect(read('.github/workflows/design-system.yml')).toMatch(/^name: Design System$/m);
    expect(read('.github/workflows/nightly-health.yml')).toContain('      - Design System\n');
  });
});
