/**
 * CODEOWNERS covers every crisis and evaluator path in autonomy-policy.json, so GitHub
 * requests the owner's review on them for every author, not only the loop.
 */
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { inPaths, loadPolicy, matchesGlob } from '../autonomy-lanes.js';

const ROOT = join(__dirname, '../../..');
const OWNER = '@sethdford';
const policy = loadPolicy();
const globs = [...policy.lanes.crisis.paths, ...policy.lanes.evaluator.paths];

type Rule = { pattern: string; owners: string[] };
const rules: Rule[] = readFileSync(join(ROOT, '.github/CODEOWNERS'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => {
    const [pattern, ...owners] = l.split(/\s+/);
    return { pattern, owners };
  });

/** The owners GitHub picks: the last rule matching the path (this file anchors every rule). */
function ownersOf(path: string): string[] {
  const match = (p: string) => {
    const glob = p.replace(/^\//, '');
    return glob.endsWith('/') ? path.startsWith(glob) : matchesGlob(path, glob);
  };
  return rules.filter((r) => match(r.pattern)).at(-1)?.owners ?? [];
}

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
