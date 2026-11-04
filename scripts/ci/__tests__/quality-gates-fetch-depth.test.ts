/**
 * The Quality Gates job checks out the head with a fixed depth, then fetches main with its own
 * depth (ci.yml). queueBase (merge-base.ts) and the Firestore database ratchet read origin/main
 * from that fetch. If main were fetched shallower than the head, a merge base the head's history
 * still reaches could be cut off on main's side, so the main fetch must go at least as deep.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const CI_YML = join(__dirname, '../../../.github/workflows/ci.yml');

/** One step's lines, from its `- name:`/`- uses:` line up to the next step or the job's end. */
function stepAt(lines: string[], at: number): string[] {
  const indent = lines[at]!.indexOf('- ');
  const end = lines.findIndex(
    (l, i) => i > at && l.trim() !== '' && (l.indexOf('- ') === indent || l.search(/\S/) < indent)
  );
  return lines.slice(at, end === -1 ? undefined : end);
}

/** The checkout depth and the main-fetch depth of the Quality Gates job. Throws if either is missing. */
export function qualityGatesDepths(yml: string): { checkout: number; main: number } {
  const lines = yml.split('\n');
  const job = lines.findIndex((l) => l.trim() === 'name: Quality Gates (Blocking)');
  if (job === -1) throw new Error('no Quality Gates (Blocking) job in ci.yml');
  const jobEnd = lines.findIndex((l, i) => i > job && /^ {2}[\w-]+:\s*$/.test(l));
  const body = lines.slice(job, jobEnd === -1 ? undefined : jobEnd);
  const find = (re: RegExp, what: string): string[] => {
    let at = body.findIndex((l) => re.test(l));
    if (at === -1) throw new Error(`no ${what} step in the Quality Gates job`);
    while (at > 0 && !body[at]!.trimStart().startsWith('- ')) at--; // back to the step's first line
    return stepAt(body, at);
  };
  const depth = (step: string[], re: RegExp, what: string): number => {
    const m = step.join('\n').match(re);
    if (!m) throw new Error(`the ${what} step has no explicit depth`);
    return Number(m[1]);
  };
  const checkout = find(/uses: actions\/checkout@/, 'checkout');
  const fetch = find(/name: Fetch main for the ratchets/, '"Fetch main for the ratchets"');
  return {
    checkout: depth(checkout, /fetch-depth:\s*(\d+)/, 'checkout'),
    main: depth(fetch, /git fetch\b[^\n]*--depth[= ](\d+)[^\n]*refs\/heads\/main/, 'main fetch'),
  };
}

describe('Quality Gates fetch depths (ci.yml)', () => {
  it('fetches main at least as deep as the checkout', () => {
    const { checkout, main } = qualityGatesDepths(readFileSync(CI_YML, 'utf8'));
    expect(checkout).toBeGreaterThan(0);
    expect(main).toBeGreaterThanOrEqual(checkout);
  });

  it('reads both depths, and fails when either is missing', () => {
    const yml = (checkoutDepth: string, fetchRun: string): string =>
      [
        'jobs:',
        '  quality-gates:',
        '    name: Quality Gates (Blocking)',
        '    steps:',
        '      - name: Checkout',
        '        uses: actions/checkout@v7',
        '        with:',
        `          ${checkoutDepth}`,
        '      - name: Fetch main for the ratchets',
        `        run: ${fetchRun}`,
        '      - name: Next',
        '        run: git fetch --depth=999 origin +refs/heads/main:refs/remotes/origin/main',
        '  other:',
        '    name: Other',
      ].join('\n');
    const fetch = (d: number): string =>
      `git fetch --no-tags --depth=${d} origin +refs/heads/main:refs/remotes/origin/main`;
    expect(qualityGatesDepths(yml('fetch-depth: 50', fetch(40)))).toEqual({
      checkout: 50,
      main: 40,
    });
    expect(() => qualityGatesDepths(yml('persist-credentials: false', fetch(50)))).toThrow(
      /checkout step has no explicit depth/
    );
    expect(() =>
      qualityGatesDepths(yml('fetch-depth: 50', 'git fetch origin +refs/heads/main:x'))
    ).toThrow(/main fetch step has no explicit depth/);
  });
});
