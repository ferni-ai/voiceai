/**
 * The crisis lane has to cover every crisis file, not only the ones someone remembered to
 * list. On 2026-10-31 the policy missed 18, among them the crisis gate itself
 * (src/agents/personas/crisis-gate.ts), the CRISIS_* flag files, the SMS crisis screen and
 * minor-care modules,
 * so a change to any of them could have taken the autonomous path. This derives the
 * expected set from the tree (crisis-named sources and flag files) and fails on any file
 * the policy's crisis paths leave out.
 */
import { execFileSync } from 'child_process';
import { describe, expect, it } from 'vitest';
import { inPaths, loadPolicy } from '../autonomy-lanes.js';

// Crisis, 988 and referral, and minor protections (minor-care holds, the sexual-content boundary).
const CRISIS_NAME = /crisis|988|suicid|self-harm|minor-care|sexual/i;

describe('crisis lane covers every crisis file', () => {
  it('every crisis-named file under src and apps is in the crisis lane', () => {
    const crisis = loadPolicy().lanes.crisis.paths;
    const files = execFileSync('git', ['ls-files', 'src', 'apps'], { encoding: 'utf8' })
      .split('\n')
      .filter((f) => f && CRISIS_NAME.test(f.split('/').pop() ?? ''));
    expect(files.length).toBeGreaterThan(20);
    expect(files.filter((f) => !inPaths(f, crisis))).toEqual([]);
  });

  it('the check is not vacuous: a crisis file outside the lane is caught', () => {
    const crisis = loadPolicy().lanes.crisis.paths;
    expect(inPaths('src/agents/personas/crisis-gate.ts', crisis)).toBe(true);
    expect(inPaths('src/config/flags/CRISIS_NEW_FLAG.ts', crisis)).toBe(true);
    expect(inPaths('src/agents/personas/crisis-gate.ts', ['src/services/safety/**'])).toBe(false);
  });
});
