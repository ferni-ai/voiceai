/**
 * The `grep -E` include for ci.yml's crisis-lane step: a pull request that changes any path in
 * autonomy-policy.json's crisis lane runs the whole unit suite on four shards. Read from the
 * policy, so the two can't drift (#3967: 258 crisis-lane files were outside the hand-kept
 * list, and #3956 went green on one shard with a red flag census).
 *
 * Fails closed: when the policy can't be read or lists no paths, the include is "." (every
 * path), so the full suite runs. A `!` glob is left out, which can only widen the match.
 *
 *   pnpm exec tsx scripts/ci/crisis-lane-include.ts           ci.yml's crisis-lane step
 *   node --experimental-strip-types scripts/ci/crisis-lane-include.ts --sweep   crisis-sweep.yml
 */
import { pathToFileURL } from 'url';

import { globPattern, loadPolicy, POLICY_PATH } from './autonomy-lanes.ts';

export const EVERY_PATH = '.';

/**
 * What decides this suite: a PR changing one runs the full suite whatever its own policy says,
 * so it can't drop a path from the lane and dodge the full run in the same change. All are
 * code-owner paths (CODEOWNERS), which is the guard against a PR that rewrites this list too.
 */
export const DECIDES_THE_SUITE = [
  'scripts/ci/autonomy-policy.json',
  'scripts/ci/autonomy-lanes.ts',
  'scripts/ci/crisis-lane-include.ts',
  '.github/workflows/ci.yml',
  '.github/actions/pr-changes/**',
];

/**
 * What decides crisis-sweep.yml's Detect step, the same way (`--sweep`). Its include is this
 * lane too: the sweep's hand-kept list missed heavy-moment.ts, which the crisis gate reads,
 * so a PR changing it skipped the sweep and reported green (#4332).
 */
export const DECIDES_THE_SWEEP = [
  'scripts/ci/autonomy-policy.json',
  'scripts/ci/autonomy-lanes.ts',
  'scripts/ci/crisis-lane-include.ts',
  'scripts/ci/queue-lowering-approved.sh',
  '.github/workflows/crisis-sweep.yml',
  '.github/actions/pr-changes/**',
];

export function crisisLaneInclude(
  policyPath: string = POLICY_PATH,
  decides: readonly string[] = DECIDES_THE_SUITE
): string {
  try {
    const lane = loadPolicy(policyPath).lanes.crisis.paths.filter((p) => !p.startsWith('!'));
    if (!lane.length) return EVERY_PATH;
    return `^(${[...decides, ...lane].map(globPattern).join('|')})$`;
  } catch {
    return EVERY_PATH;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const decides = process.argv.includes('--sweep') ? DECIDES_THE_SWEEP : DECIDES_THE_SUITE;
  process.stdout.write(`${crisisLaneInclude(POLICY_PATH, decides)}\n`);
}
