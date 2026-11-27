/**
 * actions/checkout writes the job token into .git/config unless the step sets
 * persist-credentials: false. Every later step in the job, third-party actions
 * and scripts included, can then read it from there (#4167). Steps that need the
 * token get it as GH_TOKEN; git fetches here are anonymous reads of a public repo.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const ROOT = join(__dirname, '..', '..', '..');
const DIR = '.github/workflows';

interface Step {
  uses?: string;
  with?: Record<string, unknown>;
}

/** One entry per actions/checkout step: its job, and whether it leaves the token in .git/config. */
export function checkouts(
  workflow: string,
  dir = join(ROOT, DIR)
): Array<{ job: string; persists: boolean }> {
  const doc = parse(readFileSync(join(dir, workflow), 'utf8')) as {
    jobs?: Record<string, { steps?: Step[] }>;
  };
  return Object.entries(doc.jobs ?? {}).flatMap(([job, { steps = [] }]) =>
    steps
      .filter((step) => step.uses?.startsWith('actions/checkout@'))
      // Action inputs are strings, so a quoted "false" counts as off too.
      .map((step) => ({ job, persists: String(step.with?.['persist-credentials']) !== 'false' }))
  );
}
