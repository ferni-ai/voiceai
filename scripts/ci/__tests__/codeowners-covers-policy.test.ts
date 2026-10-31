/**
 * CODEOWNERS covers every crisis and evaluator path in autonomy-policy.json, so GitHub
 * requests the owner's review on them for every author, not only the loop.
 */
import { execFileSync } from 'child_process';
import { describe, expect, it } from 'vitest';
import { inPaths, loadPolicy } from '../autonomy-lanes.js';
import { OWNER, ownersOf, ROOT, rules } from './codeowners-rules.js';

const policy = loadPolicy();
const globs = [...policy.lanes.crisis.paths, ...policy.lanes.evaluator.paths];

describe('CODEOWNERS', () => {
  it('CODEOWNERS covers every crisis and evaluator path in autonomy-policy.json', () => {
    // A policy glob `x` needs the line `/x @sethdford`; an excluded `!x` needs `/x` with no
    // owner, so the files it carves out of a lane aren't owned on the lane's behalf.
    const missing = globs.filter((g) => {
      const excluded = g.startsWith('!');
      const pattern = `/${excluded ? g.slice(1) : g}`;
      return !rules.some(
        (r) =>
          r.pattern === pattern && (excluded ? r.owners.length === 0 : r.owners.includes(OWNER))
      );
    });
    expect(missing).toEqual([]);
  });

  it('every tracked file in a crisis or evaluator lane is owned by the owner', () => {
    const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    const inLane = tracked.filter(
      (f) => inPaths(f, policy.lanes.crisis.paths) || inPaths(f, policy.lanes.evaluator.paths)
    );
    expect(inLane.length).toBeGreaterThan(50);
    expect(inLane.filter((f) => !ownersOf(f).includes(OWNER))).toEqual([]);
  });
});
