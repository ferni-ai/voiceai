import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFlagFile } from '../legacy-parse.js';
import {
  DEFAULT_EXPERIMENT_DAYS,
  isRealIssue,
  REAL_ISSUE as LIFECYCLE_REAL_ISSUE,
} from '../../../src/config/flag-lifecycle.js';
import {
  EXPERIMENT_DAYS,
  flagFileSource,
  parseNewFlag,
  REAL_ISSUE,
  writeNewFlag,
} from '../new-flag.js';

/** An experiment without --issue: flags:new refuses it. */
const bare = ['ZZ_PROBE', '--default', 'off', '--owner', 'platform', '--kind', 'experiment'];
const args = [...bare, '--issue', '#2555'];
const TODAY = new Date('2026-10-23T12:00:00Z');

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
    expect(parseNewFlag([...args, '--note', 'on: probe'], TODAY)).toEqual({
      name: 'ZZ_PROBE',
      default: 'off',
      owner: 'platform',
      kind: 'experiment',
      note: 'on: probe',
      expires: '2027-01-21',
      issue: '#2555',
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
    expect(flagFileSource({ ...parseNewFlag(args, TODAY), note: 'on: a\n  probe line two ' })).toBe(
      "import type { FlagSpec } from '../flag-spec.js';\n\n" +
        '// on: a\n// probe line two\n' +
        'export const ZZ_PROBE = {\n' +
        "  default: 'off',\n" +
        "  owner: 'platform',\n" +
        "  kind: 'experiment',\n" +
        "  expires: '2027-01-21',\n" +
        "  issue: '#2555',\n" +
        '} as const satisfies FlagSpec;\n'
    );
  });

  it("uses flag-lifecycle.ts's defaults and its idea of a real issue", () => {
    expect(EXPERIMENT_DAYS).toBe(DEFAULT_EXPERIMENT_DAYS);
    expect(REAL_ISSUE.source).toBe(LIFECYCLE_REAL_ISSUE.source);
  });

  it("refuses an experiment with issue 'TBD', a non-issue, or no --issue (the header's promise)", () => {
    for (const bad of [[], ['--issue', 'TBD'], ['--issue', 'later'], ['--issue', '2555'], ['--issue', '']]) {
      expect(() => parseNewFlag([...bare, ...bad], TODAY), JSON.stringify(bad)).toThrow(
        /--issue '#123'/
      );
    }
    // what it does accept is exactly what the Flag expiry check calls a real issue
    for (const good of ['#2555', 'https://github.com/ferni-ai/voiceai/issues/2555']) {
      expect(parseNewFlag([...bare, '--issue', good], TODAY).issue).toBe(good);
      expect(isRealIssue(good)).toBe(true);
    }
    // config and kill-switch flags still need none
    expect(() =>
      parseNewFlag(['ZZ_KS', '--default', 'on', '--owner', 'voice', '--kind', 'kill-switch'], TODAY)
    ).not.toThrow();
  });

  it('gives only experiments an expiry, takes explicit lifecycle values, and parses them back', () => {
    const config = parseNewFlag(
      ['ZZ_MODE', '--default', 'stt', '--owner', 'voice', '--kind', 'config'],
      TODAY
    );
    expect(config.expires).toBeUndefined();
    expect(config.issue).toBeUndefined();
    const flag = parseNewFlag(
      [...args, '--expires', '2026-12-01', '--context', "the caller's call"],
      TODAY
    );
    expect(flag).toMatchObject({
      expires: '2026-12-01',
      issue: '#2555',
      context: "the caller's call",
    });
    expect(() => parseNewFlag([...args, '--expires', 'next week'], TODAY)).toThrow(
      /--expires YYYY-MM-DD/
    );
    const text = flagFileSource(flag);
    expect(text).toContain("  context: 'the caller\\'s call',\n");
    expect(parseFlagFile('ZZ_PROBE.ts', text).spec).toEqual({
      default: 'off',
      owner: 'platform',
      kind: 'experiment',
      expires: '2026-12-01',
      issue: '#2555',
      context: "the caller's call",
    });
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
