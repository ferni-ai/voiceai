/**
 * Every step a test file takes around the outbound guard (src/tests/outbound-guard.ts)
 * is either counted on the list below or says why at the step itself.
 *
 * Four ways around it, all found by reading the text of each test file:
 *   1. allowOutbound('<reason>'), the guard's own opt-out;
 *   2. vi.unmock / vi.doUnmock of one of the four guarded packages;
 *   3. the real package fetched past the guard with importActual('<package>');
 *   4. a vi.mock / vi.doMock of the package whose factory takes the original.
 *
 * Ways 1 to 3 need an entry in NAMED. Way 4 replaces the guard's mock of that package
 * for the whole file, and a file may do that to put a refusing constructor of its own
 * there. Such a mock needs no entry when the line directly above it is the marker:
 *
 *   // outbound-guard: own-refusing-mock (<why no real client can come out of it>)
 *
 * One marker covers one mock. Only spaces or tabs may come before it, nothing may come
 * after the closing bracket, and the reason is at least ten characters. A marker with no
 * such mock on the next line is a failure too, so the printed set stays the true one.
 *
 * A file that stubs a package itself (vi.mock with its own fake, no original) is not
 * counted: no real client can come out of it.
 *
 * Limits: this reads text, not behaviour. It cannot tell a factory that refuses from one
 * that hands the real client back: the marker is the author's word, read by a reviewer
 * next to the factory. A package name built at run time, or a helper in another file
 * that does one of the four, is not seen.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const ROOTS = ['src', 'tests', 'scripts', 'apps', 'design-system'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.cache', 'coverage']);
const SELF = 'src/tests/__tests__/outbound-guard-census.test.ts';
const PACKAGE = String.raw`['"\`](?:@google-cloud/vertexai|openai|@google/genai|google-auth-library)['"\`]`;

/** Ways 1 to 3: only an entry on the list allows these. */
const LIST_ONLY: RegExp[] = [
  /\ballowOutbound\s*\(/g,
  new RegExp(String.raw`\bvi\.(?:unmock|doUnmock)\s*\(\s*${PACKAGE}`, 'g'),
  new RegExp(String.raw`\bimportActual\s*(?:<[^>]*>)?\s*\(\s*${PACKAGE}`, 'g'),
];

/** Way 4: a mock of a guarded package whose factory takes the original. */
const MOCK_WITH_ORIGINAL = new RegExp(
  String.raw`\bvi\.(?:mock|doMock)\s*\(\s*${PACKAGE}\s*,\s*(?:async\s*)?\(\s*[A-Za-z_]`,
  'g'
);

/** The marker line, whole. Its reason is the text between the outer brackets. */
const MARKER = /^[ \t]*\/\/ outbound-guard: own-refusing-mock \((.*)\)[ \t]*$/;
const SHORTEST_REASON = 10;

/**
 * The whole list. A new entry needs a reason a reviewer accepts and a new size in the
 * row below; an entry whose file is gone, or steps around the guard less, comes off.
 */
const NAMED: Record<string, number> = {
  // Its afterEach undoes the fake GoogleGenAI its rows install (vi.doUnmock), which also
  // drops the guard for the rest of the file. Every row there that imports the package
  // installs its fake first.
  'src/config/__tests__/gemini-billing-labels.test.ts': 1,
  // Builds real @google/genai clients to read the host they would send to; sends nothing.
  'src/config/__tests__/vertex-endpoint.test.ts': 1,
  // The guard's own rows: the opt-out is the thing under test.
  'src/tests/__tests__/outbound-guard.test.ts': 4,
  // The guard's probe for a file that says why it builds a client.
  'src/tests/__tests__/outbound-probes/says-why.test.ts': 1,
};

interface Steps {
  /** Opt-outs, unmocks and importActuals (ways 1 to 3). */
  listOnly: number;
  /** Way-4 mocks with no marker on the line above. */
  unmarkedMocks: number;
  /** The reason of each marked way-4 mock, in file order. */
  reasons: string[];
  /** Marker lines with no way-4 mock starting on the next line. */
  unusedMarkers: number;
}

/** The steps around the guard in one file's text, comments included. */
function stepsAround(text: string): Steps {
  const lines = text.split('\n');
  const reasonOn = (line: number): string | null => {
    const reason = MARKER.exec(lines[line] ?? '')?.[1]?.trim() ?? '';
    return reason.length >= SHORTEST_REASON ? reason : null;
  };
  const used = new Set<number>();
  const reasons: string[] = [];
  let unmarkedMocks = 0;
  for (const mock of text.matchAll(MOCK_WITH_ORIGINAL)) {
    const above = text.slice(0, mock.index).split('\n').length - 2;
    const reason = used.has(above) ? null : reasonOn(above);
    if (reason === null) {
      unmarkedMocks++;
    } else {
      used.add(above);
      reasons.push(reason);
    }
  }
  return {
    listOnly: LIST_ONLY.reduce((n, way) => n + (text.match(way)?.length ?? 0), 0),
    unmarkedMocks,
    reasons,
    unusedMarkers: lines.filter((_, line) => reasonOn(line) !== null && !used.has(line)).length,
  };
}

/** What is wrong, one line per file and kind, and the marked mocks' reasons by file. */
function census(
  texts: Record<string, string>,
  named: Record<string, number>
): { problems: string[]; marked: Record<string, string[]> } {
  const problems: string[] = [];
  const marked: Record<string, string[]> = {};
  for (const [file, text] of Object.entries(texts)) {
    const { listOnly, unmarkedMocks, reasons, unusedMarkers } = stepsAround(text);
    if (reasons.length > 0) marked[file] = reasons;
    if (unusedMarkers > 0) {
      problems.push(`${file}: ${unusedMarkers} marker line(s) with no client-package mock that keeps the original on the next line: remove`); // prettier-ignore
    }
    if (Object.hasOwn(named, file)) {
      const steps = listOnly + unmarkedMocks;
      if (steps !== named[file]) {
        problems.push(`${file}: on the list with ${named[file]} step(s), found ${steps}`);
      }
      continue;
    }
    if (listOnly > 0) {
      problems.push(`${file}: ${listOnly} opt-out, unmock or importActual step(s), and not on the list`); // prettier-ignore
    }
    if (unmarkedMocks > 0) {
      problems.push(`${file}: ${unmarkedMocks} client-package mock(s) that keep the original with no marker line directly above, and not on the list`); // prettier-ignore
    }
  }
  for (const file of Object.keys(named)) {
    if (!Object.hasOwn(texts, file)) {
      problems.push(`${file}: on the list but not a test file any more: remove its entry`);
    }
  }
  return { problems, marked };
}

/** The marked set as printed by the census: file, count, and each reason. */
function markedReport(marked: Record<string, string[]>): string {
  const files = Object.keys(marked).sort();
  const mocks = files.reduce((n, file) => n + marked[file]!.length, 0);
  return [
    `outbound guard census: ${mocks} marked mock(s) in ${files.length} file(s)`,
    ...files.map((file) => `  ${file}: ${marked[file]!.length} (${marked[file]!.join('; ')})`),
  ].join('\n');
}

function testFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIP_DIRS.has(name) ? [] : testFiles(path);
    const isTest = /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(name) || path.includes('/__tests__/');
    return isTest && /\.[cm]?[jt]sx?$/.test(name) ? [path] : [];
  });
}

const MARK = '// outbound-guard: own-refusing-mock (the constructor counts and throws)';
const MOCK = "vi.mock('openai', async (original) => ({ ...(await original()), OpenAI: No }));";

describe('test files that step around the outbound guard', () => {
  const texts: Record<string, string> = {};
  for (const root of ROOTS) {
    for (const file of testFiles(join(ROOT, root))) {
      const rel = relative(ROOT, file);
      // This file names the four ways and the marker in its own text.
      if (rel !== SELF) texts[rel] = readFileSync(file, 'utf8');
    }
  }
  const { problems, marked } = census(texts, NAMED);

  it('are on the list with their number of steps, or marked at each mock', async ({ annotate }) => {
    // The marked set, where a reviewer can see it grow: a notice on the CI run (the github-actions
    // reporter prints annotations), and the console for a local run with --silent=false. A plain
    // local pass shows neither: vitest hides the output of passing rows.
    const report = markedReport(marked);
    console.info(report);
    await annotate(report);
    expect(problems).toEqual([]);
  });

  it('the list has four entries: one more is a decision, made here as well', () => {
    expect(Object.keys(NAMED)).toHaveLength(4);
  });
});

describe('what counts as a step around the guard', () => {
  it.each([
    ["allowOutbound('a reason');", 1],
    ["vi.unmock('openai');", 1],
    ['vi.doUnmock("@google/genai");', 1],
    ["await vi.importActual<typeof import('openai')>('openai');", 1],
    ["// allowOutbound('in a comment') still counts", 1],
    ["allowOutbound('one'); allowOutbound('two');", 2],
    // Another package.
    ["vi.unmock('firebase-admin/app');", 0],
    ["await vi.importActual('../llm-utils.js');", 0],
  ])('%s is %i list-only step(s)', (text, listOnly) => {
    expect(stepsAround(text)).toEqual({ listOnly, unmarkedMocks: 0, reasons: [], unusedMarkers: 0 }); // prettier-ignore
  });

  it.each([
    ["vi.mock('google-auth-library', async (importOriginal) => importOriginal());", 1],
    ["vi.mock('@google-cloud/vertexai', (original) => original());", 1],
    ["vi.doMock('@google/genai', async (actual) => actual());", 1],
    [`${MOCK}\n${MOCK}`, 2],
    // Its own fake: no real client can come out of it.
    ["vi.mock('openai', () => ({ default: class {} }));", 0],
    ["vi.mock('openai');", 0],
    // Another package.
    ["vi.mock('firebase-admin/app', async (original) => original());", 0],
  ])('%s is %i unmarked mock(s) that keep the original', (text, unmarkedMocks) => {
    expect(stepsAround(text)).toEqual({ listOnly: 0, unmarkedMocks, reasons: [], unusedMarkers: 0 }); // prettier-ignore
  });
});

describe('the marker', () => {
  const REASON = 'the constructor counts and throws';

  it.each([
    ['directly above the mock', `${MARK}\n${MOCK}`],
    ['indented with the mock', `  ${MARK}\n  ${MOCK}`],
    ['above a mock written over several lines', `${MARK}\nvi.mock(\n  'openai',\n  async (original) => original()\n);`], // prettier-ignore
    ['with spaces after the closing bracket', `${MARK}  \n${MOCK}`],
  ])('covers the mock when it is %s', (_where, text) => {
    expect(stepsAround(text)).toEqual({ listOnly: 0, unmarkedMocks: 0, reasons: [REASON], unusedMarkers: 0 }); // prettier-ignore
  });

  it('covers one mock each: two mocks need two markers', () => {
    expect(stepsAround(`${MARK}\n${MOCK}\n${MOCK}`)).toMatchObject({ unmarkedMocks: 1, reasons: [REASON] }); // prettier-ignore
    expect(stepsAround(`${MARK}\n${MOCK}\n${MARK}\n${MOCK}`)).toMatchObject({ unmarkedMocks: 0, reasons: [REASON, REASON] }); // prettier-ignore
    // Two mocks on one line share the line above: the marker there covers the first only.
    expect(stepsAround(`${MARK}\n${MOCK} ${MOCK}`)).toMatchObject({ unmarkedMocks: 1, reasons: [REASON] }); // prettier-ignore
  });

  it('does not cover an opt-out in the same file', () => {
    expect(stepsAround(`${MARK}\n${MOCK}\nallowOutbound('why');`)).toMatchObject({ listOnly: 1, unmarkedMocks: 0 }); // prettier-ignore
  });

  it.each([
    ['has no reason', '// outbound-guard: own-refusing-mock'],
    ['has an empty reason', '// outbound-guard: own-refusing-mock ()'],
    ['has a reason of spaces', '// outbound-guard: own-refusing-mock (            )'],
    ['has a reason under ten characters', '// outbound-guard: own-refusing-mock (it is ok)'],
    ['sits inside a longer comment', `// see ${MARK.slice(3)}`],
    ['lacks the guard name', `// own-refusing-mock (${REASON})`],
    ['is a block comment', `/* outbound-guard: own-refusing-mock (${REASON}) */`],
    ['has text after the closing bracket', `${MARK} and more`],
    ['is spelled another way', `// outbound-guard: own refusing mock (${REASON})`],
  ])('is not a marker when it %s: the mock below stays unmarked', (_why, line) => {
    expect(stepsAround(`${line}\n${MOCK}`)).toEqual({ listOnly: 0, unmarkedMocks: 1, reasons: [], unusedMarkers: 0 }); // prettier-ignore
  });

  it.each([
    ['a blank line above the mock', `${MARK}\n\n${MOCK}`, 1],
    ['the top of the file, the mock further down', `${MARK}\nimport { vi } from 'vitest';\n${MOCK}`, 1], // prettier-ignore
    ['the same line, after the mock', `${MOCK} ${MARK}`, 0],
    ['the line below the mock', `${MOCK}\n${MARK}`, 1],
  ])('does not cover the mock from %s', (_where, text, unusedMarkers) => {
    expect(stepsAround(text)).toEqual({ listOnly: 0, unmarkedMocks: 1, reasons: [], unusedMarkers }); // prettier-ignore
  });

  it.each([
    ['a mock of another package', "vi.mock('firebase-admin/app', async (original) => original());"],
    ['a mock with its own fake', "vi.mock('openai', () => ({ default: class {} }));"],
    ['a line that is not a mock', 'const answer = 42;'],
    ['a second marker', `${MARK}\n${MOCK}`],
    ['nothing', ''],
  ])('is unused above %s', (_what, below) => {
    expect(stepsAround(`${MARK}\n${below}`).unusedMarkers).toBe(1);
  });
});

describe('what the census fails on', () => {
  const NAMED_ONE = { 'a/__tests__/listed.test.ts': 1 };
  const LISTED = { 'a/__tests__/listed.test.ts': "allowOutbound('a reason');" };

  it('passes a listed file with its number, and files that take no step', () => {
    const texts = { ...LISTED, 'a/__tests__/plain.test.ts': "vi.mock('openai');" };
    expect(census(texts, NAMED_ONE)).toEqual({ problems: [], marked: {} });
  });

  it('fails an unlisted file whose mock keeps the original with no marker, by name', () => {
    const { problems } = census({ ...LISTED, 'b/__tests__/new.test.ts': MOCK }, NAMED_ONE);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^b\/__tests__\/new\.test\.ts: 1 client-package mock\(s\).*no marker/); // prettier-ignore
  });

  it('passes a marked file and names it with its reasons', () => {
    const texts = { ...LISTED, 'b/__tests__/new.test.ts': `${MARK}\n${MOCK}\n${MARK}\n${MOCK}` };
    const { problems, marked } = census(texts, NAMED_ONE);
    expect(problems).toEqual([]);
    expect(markedReport(marked)).toBe(
      'outbound guard census: 2 marked mock(s) in 1 file(s)\n' +
        '  b/__tests__/new.test.ts: 2 (the constructor counts and throws; the constructor counts and throws)'
    );
  });

  it('fails an unlisted opt-out, marker or not', () => {
    const texts = {
      ...LISTED,
      'b/__tests__/new.test.ts': `${MARK}\n${MOCK}\nallowOutbound('why');`,
    };
    expect(census(texts, NAMED_ONE).problems).toEqual([
      'b/__tests__/new.test.ts: 1 opt-out, unmock or importActual step(s), and not on the list',
    ]);
  });

  it('fails a marker nothing uses, by name', () => {
    const texts = { ...LISTED, 'b/__tests__/new.test.ts': `${MARK}\nconst answer = 42;` };
    const { problems, marked } = census(texts, NAMED_ONE);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^b\/__tests__\/new\.test\.ts: 1 marker line\(s\).*remove$/);
    expect(marked).toEqual({});
  });

  it('fails a listed file that is gone, by name', () => {
    expect(census({ 'a/__tests__/plain.test.ts': '' }, NAMED_ONE).problems).toEqual([
      'a/__tests__/listed.test.ts: on the list but not a test file any more: remove its entry',
    ]);
  });

  it.each([
    ['more', "allowOutbound('a reason'); allowOutbound('another');", 2],
    ['more, by an unmarked mock', `allowOutbound('a reason');\n${MOCK}`, 2],
    ['fewer', "vi.mock('openai');", 0],
  ])('fails a listed file that takes %s steps than its number', (_which, text, found) => {
    expect(census({ 'a/__tests__/listed.test.ts': text }, NAMED_ONE).problems).toEqual([
      `a/__tests__/listed.test.ts: on the list with 1 step(s), found ${found}`,
    ]);
  });
});
