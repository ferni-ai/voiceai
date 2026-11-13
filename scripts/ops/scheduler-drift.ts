#!/usr/bin/env tsx
/**
 * Compares the jobs `infra/cloud-scheduler-*.yaml` defines with the jobs live in Cloud
 * Scheduler. Read-only: the only command it runs is `gcloud scheduler jobs list`. It never
 * creates, updates, pauses, resumes or deletes a job.
 *
 *   pnpm ops:scheduler-drift --project <gcp project> --location <region>
 *
 * Prints three lists (in yaml with no enabled live job; enabled live in no yaml; live but not
 * enabled). Exit 1 when a yaml job has no enabled live job, 0 otherwise, 2 on a usage or
 * gcloud error. Jobs are matched by uri path (scheduler-parity-lib.ts).
 *
 * @module scripts/ops/scheduler-drift
 */
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { diffScheduler, parseLiveJobs, readYamlJobs, renderDiff } from './scheduler-parity-lib.js';

const INFRA = fileURLToPath(new URL('../../infra', import.meta.url));

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { project: { type: 'string' }, location: { type: 'string' } },
  });
  if (!values.project || !values.location) {
    console.error('usage: scheduler-drift --project <gcp project> --location <region>');
    return 2;
  }
  const args = ['scheduler', 'jobs', 'list'];
  args.push('--project', values.project, '--location', values.location, '--format=json');
  const { stdout } = await promisify(execFile)('gcloud', args, { maxBuffer: 64 << 20 });
  const diff = diffScheduler(readYamlJobs(INFRA), parseLiveJobs(stdout));
  console.log(renderDiff(diff));
  return diff.inYamlNotEnabledLive.length > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(`scheduler-drift: ${err instanceof Error ? err.message : 'failed'}`);
    process.exit(2);
  }
);
