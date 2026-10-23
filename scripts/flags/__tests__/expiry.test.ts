import { describe, expect, it } from 'vitest';
import { backfillProblems, editedExperiments, specsOf, touchedFlags } from '../expiry.js';

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
