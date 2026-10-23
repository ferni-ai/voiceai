import { describe, expect, it } from 'vitest';
import { editedExperiments, specsOf } from '../expiry.js';

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
