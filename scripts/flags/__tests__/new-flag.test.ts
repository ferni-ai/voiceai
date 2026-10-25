import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flagFileSource, parseNewFlag, writeNewFlag } from '../new-flag.js';

const args = ['ZZ_PROBE', '--default', 'off', '--owner', 'platform', '--kind', 'experiment'];

function fakeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'new-flag-'));
  mkdirSync(join(root, 'src', 'config', 'flags'), { recursive: true });
  writeFileSync(
    join(root, 'src', 'config', 'flag-manifest-blocks.ts'),
    "  TAKEN: { default: 'on', owner: 'voice', kind: 'kill-switch' },\n"
  );
  return root;
}

describe('flags:new', () => {
  it('parses a flag and rejects bad input', () => {
    expect(parseNewFlag([...args, '--note', 'on: probe'])).toEqual({
      name: 'ZZ_PROBE',
      default: 'off',
      owner: 'platform',
      kind: 'experiment',
      note: 'on: probe',
    });
    expect(() => parseNewFlag(['zz_probe', ...args.slice(1)])).toThrow(/UPPER_SNAKE_CASE/);
    expect(() =>
      parseNewFlag(['ZZ', '--default', 'off', '--owner', 'nobody', '--kind', 'config'])
    ).toThrow(/--owner voice\|/);
    expect(() => parseNewFlag(['ZZ', '--owner', 'voice', '--kind', 'config'])).toThrow(/--default/);
    expect(() => parseNewFlag([...args.slice(0, 5), '--kind', 'nope'])).toThrow(/--kind/);
    expect(() => parseNewFlag([...args, '--default', "o'ff"])).toThrow(/--default/);
  });

  it('writes the one-file-per-flag shape', () => {
    expect(flagFileSource({ ...parseNewFlag(args), note: 'on: a\n  probe line two ' })).toBe(
      "import type { FlagSpec } from '../flag-spec.js';\n\n" +
        '// on: a\n// probe line two\n' +
        'export const ZZ_PROBE = {\n' +
        "  default: 'off',\n" +
        "  owner: 'platform',\n" +
        "  kind: 'experiment',\n" +
        '} as const satisfies FlagSpec;\n'
    );
  });

  it('writes src/config/flags/NAME.ts and refuses a name that exists', () => {
    const root = fakeRoot();
    const file = writeNewFlag(root, parseNewFlag(args));
    expect(file).toBe(join(root, 'src', 'config', 'flags', 'ZZ_PROBE.ts'));
    expect(readFileSync(file, 'utf8')).toContain('export const ZZ_PROBE = {');
    expect(() => writeNewFlag(root, parseNewFlag(args))).toThrow(/already has/);
    expect(() => writeNewFlag(root, parseNewFlag(['TAKEN', ...args.slice(1)]))).toThrow(
      /already in src\/config\/flag-manifest-blocks\.ts/
    );
  });
});
