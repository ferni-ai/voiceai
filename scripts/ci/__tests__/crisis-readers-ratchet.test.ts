/**
 * The crisis readers ratchet must fail a NEW crisis regex or resource literal
 * outside src/services/safety/, pass the allowlisted ones, and skip the kernel,
 * tests and comments. Runs measure() over a throwaway tree laid out like the repo.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  countByKey,
  lowered,
  measure,
  readsCrisis,
  regressions,
  sitesIn,
  stale,
} from '../crisis-readers-ratchet.js';

let root: string | undefined;

function tree(files: Record<string, string>): string {
  root = mkdtempSync(join(tmpdir(), 'crisis-ratchet-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

const READER = `
// A comment that says 988, suicide and hotline is not a site.
export const RISK = /\\b(?:suicid\\w*|kill\\s+(?:myself|me)|want(?:ed)? to die)\\b/i;
export const built = new RegExp('self-harm|overdose', 'i');
export const LINE = 'You can call or text 988 any time.';
export const card = \`Text HOME to 741741, \${'friend'}.\`;
`;

const CLEAN = `
import { detectCrisis } from '../services/safety/crisis-guard.js';
export { HOTLINE_CARD } from './hotline-card.js';
export const GREETING = /\\b(?:hi|hello|hey)\\b/i;
export const room = 'Room 9880 is down the hall.';
export const read = (t: string) => detectCrisis(t);
`;

describe('sitesIn', () => {
  it('counts a crisis regex, a RegExp on a literal and resource strings, not comments', () => {
    const kinds = sitesIn('src/x.ts', READER).map((s) => `${s.kind}:${s.line}`);
    expect(kinds).toEqual(['regex:3', 'regex:4', 'resource:5', 'resource:6']);
  });

  it('leaves everyday regexes, imports and longer numbers alone', () => {
    expect(sitesIn('src/x.ts', CLEAN)).toEqual([]);
  });

  it('reads a pattern through its escapes, classes, optional parts and groups', () => {
    for (const p of [
      'kill\\s+(?:myself|me)',
      'self[- ]harm',
      'self.?harm',
      'want(s|ed)?\\s+to\\s+die',
      'kill\\s*(my|your)self',
      's[uU]icid',
      '\\bend it all\\b',
      'end\\s+my\\s+(?:own\\s+)?life',
      '(?:hi|hello|suicide)',
      'unalive',
      'over\\s?dos(?:e|ing)',
      'kill(?!\\s+time)\\s+myself',
      '(want|ready)\\s+to\\s+die',
    ])
      expect([p, readsCrisis(p)]).toEqual([p, true]);
    for (const p of [
      '\\b(?:send|end)\\b',
      'kill(?:ed)? the (?:process|task)',
      'best (?:of|in) life',
    ])
      expect([p, readsCrisis(p)]).toEqual([p, false]);
  });

  it('counts a crisis regex in a file with no other crisis word', () => {
    expect(sitesIn('src/x.ts', 'const r = /unalive/;').map((s) => s.kind)).toEqual(['regex']);
    expect(sitesIn('src/x.ts', 'const r = /s[uU]icid/;').map((s) => s.kind)).toEqual(['regex']);
  });

  it('counts crisis words in string lists, the form keyword readers use', () => {
    const lists = [
      "const CRISIS = ['suicide'];",
      "const WORDS = ['kill myself', 'self-harm', 'party'];",
      "export const r = new RegExp(['want to die'].join('|'), 'i');",
      'const t = (n: string) => `${n} talked about ending my life`;',
      "const u = (x: boolean) => `${x ? 'suicide' : ''}`;",
    ].join('\n');
    expect(sitesIn('src/x.ts', lists).map((s) => `${s.kind}:${s.line}`)).toEqual([
      'word:1',
      'word:2',
      'word:2',
      'word:3',
      'word:4',
      'word:5',
    ]);
    expect(sitesIn('src/x.ts', "const s = 'a fun party, to die for';")).toEqual([]);
  });
});

describe('measure + regressions', () => {
  it('fails a new reader outside the kernel, and skips the kernel and tests', () => {
    const dir = tree({
      'src/agents/new-reader.ts': READER,
      'src/services/safety/kernel-reader.ts': READER,
      'src/agents/__tests__/reader.test.ts': READER,
      'src/agents/clean.ts': CLEAN,
    });
    const sites = measure(dir);
    expect([...new Set(sites.map((s) => s.file))]).toEqual(['src/agents/new-reader.ts']);
    const worse = regressions({}, sites);
    expect(worse).toHaveLength(2);
    expect(worse.join('\n')).toContain('src/agents/new-reader.ts#regex: 0 → 2');
  });

  it('passes the allowlisted sites and fails one more', () => {
    const dir = tree({ 'src/agents/old-reader.ts': READER });
    const allow = countByKey(measure(dir));
    expect(regressions(allow, measure(dir))).toEqual([]);
    writeFileSync(
      join(dir, 'src/agents/old-reader.ts'),
      `${READER}\nexport const MORE = /hotline/i;\n`
    );
    expect(regressions(allow, measure(dir))).toEqual([
      expect.stringContaining('src/agents/old-reader.ts#regex: 2 → 3'),
    ]);
  });

  it('fails a new file with a crisis keyword list', () => {
    const dir = tree({ 'src/agents/tone.ts': "export const CRISIS = ['suicide'];\n" });
    expect(regressions({}, measure(dir))).toEqual([
      expect.stringContaining('src/agents/tone.ts#word: 0 → 1'),
    ]);
  });

  it('flags an allowlist above today, so a removed reader cannot quietly come back', () => {
    const dir = tree({ 'src/agents/old-reader.ts': READER });
    const sites = measure(dir);
    const allow = countByKey(sites);
    expect(stale(allow, sites)).toEqual([]);
    const more = { ...allow, 'src/agents/old-reader.ts#regex': 3, 'src/gone.ts#word': 1 };
    expect(stale(more, sites)).toEqual([
      'src/agents/old-reader.ts#regex: allowlist 3, now 2',
      'src/gone.ts#word: allowlist 1, now 0',
    ]);
  });

  it('only ever lowers the allowlist', () => {
    const dir = tree({ 'src/agents/old-reader.ts': READER });
    const sites = measure(dir);
    const allow = { 'src/agents/old-reader.ts#regex': 5, 'src/gone.ts#resource': 3 };
    expect(lowered(allow, sites)).toEqual({ 'src/agents/old-reader.ts#regex': 2 });
    expect(lowered({}, sites)).toEqual({});
  });
});
