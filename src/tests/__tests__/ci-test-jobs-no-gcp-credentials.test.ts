/**
 * No CI job that runs vitest holds Google Cloud credentials.
 *
 * The test setup isolates credentials (src/tests/gcp-test-guard.ts), but a job
 * that authenticates to GCP before running tests hands every unguarded path a
 * production login. That is how fixture data ends up in production Firestore
 * (marketplace_installations, 2025-12; user_contacts, 2026-10). Jobs that test
 * may carry a project id (the guard swaps it for a fake), never credentials.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKFLOWS = join(__dirname, '..', '..', '..', '.github', 'workflows');

const RUNS_VITEST = /\bvitest\b|\bpnpm (run )?test\b|\bnpm (run )?test\b|\bpnpm test:/;
const GCP_CREDENTIALS =
  /google-github-actions\/auth|credentials_json|workload_identity_provider|GCP_SA_KEY|GOOGLE_APPLICATION_CREDENTIALS|ALLOW_PRODUCTION_DATA/;

/**
 * Each top-level job of a workflow file, by name, as raw text without its
 * whole-line comments: a comment runs nothing and holds nothing, and a deploy
 * job's comment mentioning "pnpm test" made it look like a test job (#2082).
 */
function jobsOf(text: string): Map<string, string> {
  const jobs = new Map<string, string>();
  const body = text.split(/^jobs:\s*$/m)[1] ?? '';
  let name: string | null = null;
  let lines: string[] = [];
  for (const line of body.split('\n')) {
    if (/^\s*#/.test(line)) continue; // a column-0 comment would otherwise end the scan
    const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (header || /^\S/.test(line)) {
      if (name) jobs.set(name, lines.join('\n'));
      name = header ? header[1] : null;
      lines = [];
      if (!header) break;
      continue;
    }
    lines.push(line);
  }
  if (name) jobs.set(name, lines.join('\n'));
  return jobs;
}

const testJobs: Array<[string, string]> = [];
for (const file of readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))) {
  for (const [job, text] of jobsOf(readFileSync(join(WORKFLOWS, file), 'utf8'))) {
    if (RUNS_VITEST.test(text)) testJobs.push([`${file} › ${job}`, text]);
  }
}

describe('CI test jobs have no Google Cloud credentials', () => {
  it('finds the unit and integration test jobs (the scan is not empty)', () => {
    const names = testJobs.map(([name]) => name);
    expect(names).toContain('ci.yml › test-unit-shard');
    expect(names).toContain('ci.yml › test-integration');
  });

  it.each(testJobs)('%s', (_name, text) => {
    expect(text).not.toMatch(GCP_CREDENTIALS);
  });
});
