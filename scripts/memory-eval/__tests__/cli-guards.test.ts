import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HUMAN_KEY } from '../fixtures/human-baseline-key.js';

const dir = join(import.meta.dirname, '..');
// spawnSync blocks the worker, so vitest's own timeout can't stop a hung CLI,
// and the Spanner client swallows SIGTERM: only SIGKILL ends it at the timeout.
const bounded = { timeout: 30_000, killSignal: 'SIGKILL' } as const;

/** Runs a memory-eval script as a CLI and returns its exit code and stderr. */
function run(script: string, args: string[], env: Record<string, string>) {
  const clean = { ...process.env };
  delete clean.OPENAI_API_KEY;
  delete clean.GOOGLE_CLOUD_PROJECT;
  delete clean.USE_VERTEX_AI;
  const res = spawnSync(process.execPath, ['--import', 'tsx', join(dir, script), ...args], {
    env: { ...clean, ...env },
    encoding: 'utf8',
    ...bounded,
  });
  return { status: res.status, stderr: res.stderr };
}

describe('real-call CLIs check before reading anything', () => {
  it('build-private-cases rejects a bad --calls before reading any call', () => {
    // GOOGLE_CLOUD_PROJECT is unset too: the argument error must come first.
    const { status, stderr } = run('build-private-cases.ts', ['--calls', '0'], {});
    expect(status).toBe(1);
    expect(stderr).toContain('--calls must be a positive integer: 0');
    expect(stderr).not.toContain('refusing to run on real calls');
  }, 30_000);

  it('longmem --cases refuses a non-Vertex setup before reading --memory', () => {
    const { status, stderr } = run(
      'longmem.ts',
      ['--cases', '/nonexistent/cases.json', '--memory', '/nonexistent/memory.json'],
      { OPENAI_API_KEY: 'sk-test' }
    );
    expect(status).toBe(1);
    expect(stderr).toContain('refusing to run on real calls');
    expect(stderr).not.toContain('ENOENT');
  }, 30_000);
});

describe('grade-human', () => {
  it('counts an answer that is not text as no answer, says so, and does not crash', () => {
    const answers = mkdtempSync(join(tmpdir(), 'grade-human-'));
    const [id] = Object.keys(HUMAN_KEY);
    // Every other answer is missing, so no judge is called.
    writeFileSync(join(answers, 'p1.json'), JSON.stringify({ answers: { [id!]: 42 } }));
    const res = spawnSync(
      process.execPath,
      ['--import', 'tsx', join(dir, 'human', 'grade-human.ts'), answers],
      {
        env: { ...process.env, OPENAI_API_KEY: '', GOOGLE_CLOUD_PROJECT: 'test-project' },
        encoding: 'utf8',
        ...bounded,
      }
    );
    expect(res.stderr).not.toContain('TypeError');
    expect(res.stdout).toContain(`skipped p1.json ${id}: answer is not text`);
    expect(res.stdout).toContain('1 people');
    expect(res.stderr).toContain(
      `${Object.keys(HUMAN_KEY).length} answers with no answer or no judge verdict`
    );
  }, 30_000);
});

describe('score-live', () => {
  it('records the judge model and prompt hashes in its report', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'score-live-'));
    // No quiz files for this label: nothing is judged, only the report is written.
    const res = spawnSync(
      process.execPath,
      ['--import', 'tsx', join(dir, 'live', 'score-live.ts'), 'nolabel', '--allow-missing'],
      { env: { ...process.env, TMPDIR: tmp }, encoding: 'utf8', ...bounded }
    );
    expect(res.status).toBe(0);
    const report = JSON.parse(readFileSync(join(tmp, 'longmem', 'live-nolabel.json'), 'utf8'));
    expect(report.models.judge).toMatch(/\S/);
    expect(report.models.fallback).toMatch(/\S/);
    expect(report.prompts.judge).toMatch(/^[0-9a-f]{12}$/);
    expect(report.prompts.live).toMatch(/^[0-9a-f]{12}$/);
    expect(report.prompts.live).not.toBe(report.prompts.judge);
  }, 30_000);
});
