import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  changedExports,
  embedAll,
  exportedFunctions,
  findDuplicates,
  jaccard,
  main,
  MARKER,
  MIN_TOKENS,
  related,
  report,
  shingles,
  THRESHOLDS,
  type Embed,
  type ExportedFn,
} from '../semantic-duplicates.js';
import { precisionRecall, scorePairs } from './semantic-duplicates-eval.js';

// A function long enough to pass the size floor; `name` and `seed` vary its identifiers and literals.
const body = (
  name: string,
  seed = 'a'
): string => `export function ${name}(items: string[], limit = 3): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (item.length === 0 || out.length >= limit) continue;
    const ${seed}trimmed = item.trim().toLowerCase();
    if (!out.includes(${seed}trimmed)) out.push(${seed}trimmed);
  }
  return out.length > 0 ? out : ['${seed}'];
}`;
// Same size, different steps: no shingle in common with body() beyond the signature.
const other = (
  name: string
): string => `export async function ${name}(userId: string): Promise<number> {
  try {
    const row = await fetchRow(userId);
    if (!row) return 0;
    return row.visits * 2 + (row.flags?.length ?? 0) - (row.muted ? 1 : 0);
  } catch (error) {
    log.warn({ error, userId }, 'count failed');
    return -1;
  }
}`;
const one = (file: string, text: string): ExportedFn => {
  const [fn] = exportedFunctions(file, text);
  if (!fn) throw new Error(`no export in ${file}`);
  return fn;
};

// Embeds by the first word of the function name: same word, same vector.
const byNameWord: Embed = async (texts) =>
  texts.map((t) => {
    const v = new Float32Array(4);
    const word = t.split(/[ :]/)[0] ?? '';
    v[['dedupe', 'count', 'unique'].indexOf(word) + 1] = 1;
    return v;
  });

describe('exportedFunctions', () => {
  it('reads exported declarations and exported const functions, with their lines', () => {
    const text = [
      'function hidden() { return 1; }',
      'export function shown(a: number) { return a; }',
      'export declare function overload(a: string): void;',
      'export const arrow = (a: number) => a + 1;',
      'export const expr = function (a: number) { return a; };',
      'export const value = 3;',
    ].join('\n');
    expect(exportedFunctions('src/x.ts', text).map((f) => [f.name, f.line])).toEqual([
      ['shown', 2],
      ['arrow', 4],
      ['expr', 5],
    ]);
  });

  it('blanks identifiers and literals: a renamed copy has the same tokens', () => {
    const a = one('src/a.ts', body('dedupe', 'a'));
    const b = one('src/b.ts', body('uniqueItems', 'zz'));
    expect(a.tokens.length).toBeGreaterThanOrEqual(MIN_TOKENS);
    expect(b.tokens).toEqual(a.tokens);
    expect(jaccard(shingles(a.tokens), shingles(b.tokens))).toBe(1);
    const c = one('src/c.ts', other('countVisits'));
    expect(jaccard(shingles(a.tokens), shingles(c.tokens))).toBeLessThan(0.2);
  });
});

describe('findDuplicates', () => {
  const a = one('src/a.ts', body('dedupe'));
  const copy = one('src/b.ts', body('uniqueItems', 'q'));
  const count = one('src/c.ts', other('countVisits'));
  const tiny = one('src/d.ts', 'export const dedupeTiny = (a: string) => a.trim();');

  it('names the renamed copy by shingles, and the same-meaning export by embedding', async () => {
    const twin = one('src/e.ts', other('dedupeRows')); // different code, same name word as `a`
    const pool = [a, copy, count, twin];
    const vectors = await embedAll(pool, byNameWord);
    const [finding] = findDuplicates([a], pool, vectors);
    expect(finding?.jaccard?.fn).toBe(copy);
    expect(finding?.cosine?.fn).toBe(twin);
    expect(finding?.cosine?.score).toBeCloseTo(1);
  });

  it('never matches the export itself, an unrelated export, or one under the size floor', async () => {
    const pool = [a, count, tiny];
    const vectors = await embedAll(pool, byNameWord);
    expect(tiny.tokens.length).toBeLessThan(MIN_TOKENS);
    expect(vectors.has(tiny)).toBe(false);
    expect(findDuplicates([a, count], pool, vectors)).toEqual([]);
    // The same export at the same path in the pool is the candidate's own head copy.
    expect(findDuplicates([a], [{ ...a }], vectors)).toEqual([]);
  });

  it('keeps a score only at or above its threshold', async () => {
    const pool = [a, copy];
    const vectors = await embedAll(pool, byNameWord);
    const strict = { cosine: 2, jaccard: 1.01 };
    expect(findDuplicates([a], pool, vectors, strict)).toEqual([]);
    expect(findDuplicates([a], pool, vectors, THRESHOLDS)).toHaveLength(1);
    // Cosine 0.8 between two unrelated bodies: under the threshold it names nothing.
    const half = new Map([
      [a, Float32Array.from([1, 0])],
      [count, Float32Array.from([0.8, 0.6])],
    ]);
    expect(findDuplicates([a], [count], half)).toEqual([]);
    const [low] = findDuplicates([a], [count], half, { cosine: 0.79, jaccard: 1.01 });
    expect(low?.cosine?.score).toBeCloseTo(0.8);
  });
});

describe('related pairs', () => {
  const a = one('src/a.ts', body('dedupe'));
  const copy = one('src/b.ts', body('uniqueItems', 'q'));
  it('skips a pair in one file, or where one calls the other, and nothing else', () => {
    expect(related(a, copy)).toBe(false);
    expect(related(a, { ...copy, file: 'src/a.ts' })).toBe(true);
    const wrapper = one('src/w.ts', `export function wrap(x: string[]) { return dedupe(x); }`);
    expect(related(wrapper, a)).toBe(true);
    expect(related(a, wrapper)).toBe(true);
    const mentions = one(
      'src/m.ts',
      `export function m() { return 'dedupe'.length + dedupeAll(); }`
    );
    expect(related(mentions, a)).toBe(false);
    // The real dev set's same-file and caller pairs would flag on scores alone.
    expect(findDuplicates([a], [{ ...copy, file: 'src/a.ts', name: 'x' }], new Map())).toEqual([]);
    expect(findDuplicates([a], [copy], new Map())).toHaveLength(1);
  });
});

describe('embedAll cache', () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reuses cached vectors and embeds only new code', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dups-cache-'));
    const cache = join(dir, 'vectors');
    const first = [one('src/a.ts', body('dedupe'))];
    const seen: string[] = [];
    const counting: Embed = async (texts) => (seen.push(...texts), byNameWord(texts));
    await embedAll(first, counting, cache);
    expect(seen).toHaveLength(1);
    const added = one('src/c.ts', other('countVisits'));
    const again = await embedAll([...first, added], counting, cache);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toContain('count visits');
    expect(again.size).toBe(2);
  });
});

describe('in a git repo', () => {
  let root: string;
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });
  const git = (...args: string[]): string =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  const write = (files: Record<string, string>): void => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
  };

  it('lists the exports a change adds or edits, not the ones it leaves alone', () => {
    root = mkdtempSync(join(tmpdir(), 'dups-git-'));
    git('init', '-q', '-b', 'main');
    write({
      'src/a.ts': `${body('kept')}\n${body('edited')}\n`,
      'src/__tests__/t.ts': body('inTest'),
    });
    git('add', '.');
    git('commit', '-q', '-m', 'base');
    const base = git('rev-parse', 'HEAD');
    write({
      'src/a.ts': `${body('kept')}\n${body('edited', 'b')}\n`,
      'src/new.ts': other('added'),
      'src/__tests__/t.ts': body('inTest', 'c'),
    });
    expect(
      changedExports(base, root)
        .map((f) => `${f.file}#${f.name}`)
        .sort()
    ).toEqual(['src/a.ts#edited', 'src/new.ts#added']);
  });

  it('is advisory: the command reports a duplicate and leaves the exit code alone', async () => {
    root = mkdtempSync(join(tmpdir(), 'dups-main-'));
    git('init', '-q', '-b', 'main');
    write({ 'src/a.ts': body('original') });
    git('add', '.');
    git('commit', '-q', '-m', 'base');
    vi.stubEnv('GITHUB_ACTIONS', '');
    vi.stubEnv('GITHUB_EVENT_PATH', '');
    vi.stubEnv('QUALITY_BASE', git('rev-parse', 'HEAD'));
    write({ 'src/b.ts': body('copy', 'b') });
    git('add', '.');
    git('commit', '-q', '-m', 'copy');
    const exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { exitCode } = process;
    const out = join(root, 'dups.md');

    const findings = await main(['--out', out], root, async () => byNameWord);

    expect(findings.map((f) => f.fn.name)).toEqual(['copy']);
    expect(readFileSync(out, 'utf8')).toContain('shingles 1.00 with `original` (src/a.ts:1)');
    expect(exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(exitCode);
  });
});

describe('dev-set scoring and the comment', () => {
  it('counts precision and recall from the flagged pairs', async () => {
    const scores = await scorePairs(
      [
        { a: body('dedupe'), b: body('uniqueItems', 'q'), dup: true },
        { a: body('dedupe'), b: other('countVisits'), dup: false },
        { a: other('countVisits'), b: other('countRows'), dup: false },
        { a: body('dedupeMore'), b: body('dedupeLess'), dup: true, sameFile: true },
      ].map(({ sameFile, ...p }, i) => ({
        ...p,
        fileA: `src/a${i}.ts`,
        fileB: `src/${sameFile ? 'a' : 'b'}${i}.ts`,
      })),
      byNameWord
    );
    expect(scores.map((s) => s.flagged)).toEqual([true, false, true, false]);
    expect(precisionRecall(scores)).toEqual({ precision: 0.5, recall: 0.5, tp: 1, fp: 1, fn: 1 });
  });

  it('names each match with its file and line, under the marker', () => {
    const a = one('src/a.ts', body('dedupe'));
    const copy = one('src/b.ts', `\n\n${body('uniqueItems')}`);
    const text = report([{ fn: a, jaccard: { fn: copy, score: 1 } }], 4);
    expect(text.startsWith(MARKER)).toBe(true);
    expect(text).toContain('1 of 4');
    expect(text).toContain('`dedupe` (src/a.ts:1): shingles 1.00 with `uniqueItems` (src/b.ts:3)');
    expect(report([], 2)).toBe(
      `${MARKER}\nNo likely duplicates in 2 new or changed exported functions (advisory, #3523).`
    );
  });
});

describe('the dev set', () => {
  it('holds at least 30 labelled pairs, each one sized export per side, both labels present', () => {
    const pairs = JSON.parse(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), 'fixtures/semantic-duplicates-dev.json'),
        'utf8'
      )
    ) as Array<{ a: string; b: string; fileA: string; fileB: string; dup: boolean }>;
    expect(pairs.length).toBeGreaterThanOrEqual(30);
    expect(pairs.filter((p) => p.dup).length).toBeGreaterThanOrEqual(10);
    expect(pairs.filter((p) => !p.dup).length).toBeGreaterThanOrEqual(10);
    for (const p of pairs) {
      for (const [file, code] of [
        [p.fileA, p.a],
        [p.fileB, p.b],
      ] as const) {
        const fns = exportedFunctions(file, code);
        expect(fns).toHaveLength(1);
        expect(fns[0]?.tokens.length).toBeGreaterThanOrEqual(MIN_TOKENS);
      }
    }
  });
});
