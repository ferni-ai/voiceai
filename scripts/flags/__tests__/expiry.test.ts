import { describe, expect, it } from 'vitest';
import {
  backfillProblems,
  editedExperiments,
  type Gh,
  githubIssues,
  ownerIssuesFrom,
  specsOf,
  touchedFlags,
} from '../expiry.js';

const legacy = (entries: string): string => `export const FLAGS_A = {\n${entries}\n} as const;\n`;
const flagFile = (name: string, body: string): string =>
  `import type { FlagSpec } from '../flag-spec.js';\n\nexport const ${name} = {\n${body}\n} as const satisfies FlagSpec;\n`;

describe('flags:expiry, the PR check', () => {
  const base = specsOf(
    new Map([
      [
        'src/config/flag-manifest-blocks.ts',
        legacy(
          "  OLD: { default: 'off', owner: 'voice', kind: 'experiment' },\n  KS: { default: 'on', owner: 'voice', kind: 'kill-switch' },"
        ),
      ],
    ])
  );

  it('reads specs from legacy blocks and flag files, lifecycle fields included', () => {
    const head = specsOf(
      new Map([
        [
          'src/config/flags/NEW.ts',
          flagFile(
            'NEW',
            "  default: 'off',\n  owner: 'tools',\n  kind: 'experiment',\n  expires: '2027-01-01',\n  issue: 'TBD',"
          ),
        ],
      ])
    );
    expect(head.get('NEW')).toEqual({
      default: 'off',
      owner: 'tools',
      kind: 'experiment',
      expires: '2027-01-01',
      issue: 'TBD',
    });
  });

  it('flags an added experiment, an edited one, and a flag turned into an experiment, not an untouched one', () => {
    const head = specsOf(
      new Map([
        [
          'src/config/flag-manifest-blocks.ts',
          legacy(
            "  OLD: { default: 'off', owner: 'voice', kind: 'experiment' },\n  KS: { default: 'off', owner: 'voice', kind: 'experiment' },"
          ),
        ],
        [
          'src/config/flags/NEW.ts',
          flagFile('NEW', "  default: 'off',\n  owner: 'tools',\n  kind: 'experiment',"),
        ],
      ])
    );
    expect(editedExperiments(head, base)).toEqual(['KS', 'NEW']);
  });

  it('treats a flag moved from a legacy block to its own file, unchanged, as not edited', () => {
    const head = specsOf(
      new Map([
        [
          'src/config/flags/OLD.ts',
          flagFile('OLD', "  default: 'off',\n  owner: 'voice',\n  kind: 'experiment',"),
        ],
      ])
    );
    expect(editedExperiments(head, base)).toEqual([]);
  });
});

describe('flags:expiry, the backfill may only shrink or move dates earlier', () => {
  const base = new Map([
    ['A', '2027-01-01'],
    ['B', '2027-01-05'],
  ]);

  it('passes a removed name and an earlier date', () => {
    expect(backfillProblems(base, new Map([['A', '2026-12-20']]))).toEqual([]);
  });

  it('fails an added name and a later date', () => {
    expect(backfillProblems(base, new Map([...base, ['C', '2027-01-01']]))).toEqual([
      'C: added to the backfill; a new or edited experiment carries expires in its own spec',
    ]);
    expect(
      backfillProblems(
        base,
        new Map([
          ['A', '2027-02-01'],
          ['B', '2027-01-05'],
        ])
      )
    ).toEqual([
      'A: backfill expiry moved later (2027-01-01 → 2027-02-01); the backfill may only move dates earlier',
    ]);
  });

  it('skips the check when the base has no backfill yet', () => {
    expect(backfillProblems(null, new Map([['A', '2027-01-01']]))).toEqual([]);
  });
});

describe('flags:expiry, a touched flag is one whose registry entry changed, comments included', () => {
  it('sees a comment-only edit, and not an untouched or moved-unchanged entry', () => {
    const entry = "  OLD: { default: 'off', owner: 'voice', kind: 'experiment' },";
    const base = new Map([['src/config/flag-manifest-blocks.ts', legacy(entry)]]);
    expect(touchedFlags(base, base)).toEqual([]);
    const commented = new Map([
      ['src/config/flag-manifest-blocks.ts', legacy(`  // on: does a thing\n${entry}`)],
    ]);
    expect(touchedFlags(commented, base)).toEqual(['OLD']);
  });
});

describe("flags:expiry, the nightly owner issue counts as a TBD flag's issue", () => {
  const open = [
    { number: 3001, title: 'Flag expiry: voice' },
    { number: 3002, title: 'Flag expiry: memory' },
    { number: 3003, title: 'Something else: voice' },
  ];

  it("maps 'Flag expiry: <owner>' titles to '#N', ignoring other titles", () => {
    expect(Object.fromEntries(ownerIssuesFrom(open))).toEqual({ voice: '#3001', memory: '#3002' });
  });

  /** A fake gh: routes the three calls githubIssues makes; `canRead: false` is a token without issues: read. */
  function fakeGh(canRead = true): { gh: Gh; calls: string[] } {
    const calls: string[] = [];
    const issues: Record<string, object> = {
      '12': { state: 'open' },
      '13': { state: 'closed' },
      '2577': { state: 'open', pull_request: { url: 'x' } }, // a PR, not an issue
    };
    const gh: Gh = (args) => {
      const call = args.join(' ');
      calls.push(call);
      if (call.startsWith('api repos/{owner}/{repo}/issues?state=all'))
        return JSON.stringify(
          canRead ? [{ repository_url: 'https://api.github.com/repos/ferni-ai/voiceai' }] : []
        );
      if (call.startsWith('issue list')) return JSON.stringify(canRead ? open : []);
      const n = /^api repos\/\{owner\}\/\{repo\}\/issues\/(\d+)$/.exec(call)?.[1];
      if (n && canRead && issues[n]) return JSON.stringify(issues[n]);
      throw new Error('gh: HTTP 404: Not Found');
    };
    return { gh, calls };
  }

  it('asks nothing until asked, then probes and lists once', () => {
    const { gh, calls } = fakeGh();
    const lookup = githubIssues(gh);
    expect(calls).toEqual([]);
    expect(lookup.ownerIssue('voice')).toBe('#3001');
    expect(lookup.ownerIssue('tools')).toBeUndefined();
    expect(calls.filter((c) => c.startsWith('api repos/{owner}/{repo}/issues?'))).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith('issue list'))).toHaveLength(1);
  });

  it('counts only an OPEN issue in this repo: not closed, not a PR, not missing, not another repo', () => {
    const lookup = githubIssues(fakeGh().gh);
    expect(lookup.isOpenIssue('#12')).toBe(true);
    expect(lookup.isOpenIssue('https://github.com/ferni-ai/voiceai/issues/12')).toBe(true);
    expect(lookup.isOpenIssue('#13')).toBe(false); // closed
    expect(lookup.isOpenIssue('#2577')).toBe(false); // a pull request
    expect(lookup.isOpenIssue('#999999')).toBe(false); // 404
    expect(lookup.isOpenIssue('https://github.com/someone/else/issues/12')).toBe(false);
  });

  it('tells a token without issues: read from "no owner issue open", and fails closed loudly', () => {
    const logs: string[] = [];
    const log = console.log;
    console.log = (m: string): void => void logs.push(m);
    try {
      const lookup = githubIssues(fakeGh(false).gh);
      expect(lookup.ownerIssue('voice')).toBeUndefined();
      expect(lookup.isOpenIssue('#12')).toBe(false);
      const broken = githubIssues(() => {
        throw new Error('gh: not authenticated');
      });
      expect(broken.ownerIssue('voice')).toBeUndefined();
    } finally {
      console.log = log;
    }
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatch(/Cannot read this repo's issues.*lacks issues: read.*permissions: issues: read/);
    expect(logs[1]).toMatch(/Cannot read this repo's issues.*not authenticated/);
    // a token that CAN read issues, with no owner issue open, is quiet: that is a real answer
    const quiet: string[] = [];
    console.log = (m: string): void => void quiet.push(m);
    try {
      expect(githubIssues(fakeGh().gh).ownerIssue('tools')).toBeUndefined();
    } finally {
      console.log = log;
    }
    expect(quiet).toEqual([]);
  });
});
