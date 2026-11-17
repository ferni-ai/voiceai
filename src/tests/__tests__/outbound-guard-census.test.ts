/**
 * Every step a file takes around the outbound guard (src/tests/outbound-guard.ts) is counted on
 * the list below, or says why at the step itself.
 *
 * A step is any of these, found by reading the text of every source file under the roots (test
 * files, shared helpers and scripts alike, not only the files vitest runs):
 *   1. allowOutbound('<reason>'), the guard's own opt-out, under any name a file imports it as;
 *   2. a vi.mock, vi.doMock, vi.unmock or vi.doUnmock of a guarded package or of a path inside
 *      one ('openai/resources'), named as a string or as import('<package>'), whatever its
 *      factory looks like, and with no factory at all;
 *   3. the real package fetched past the guard with importActual('<package>').
 *
 * Any mock of a guarded package replaces the guard's for the whole file, so the census does not
 * try to tell a factory that keeps the original from one that does not: a list of factory shapes
 * always has a next miss. Steps of a file on the list need nothing more. Anywhere else, a vi.mock
 * or vi.doMock needs the marker on the line directly above it:
 *
 *   // outbound-guard: own-refusing-mock (<why no real client can come out of it>)
 *
 * One marker covers one mock. Only spaces or tabs may come before it, nothing may come after the
 * closing bracket, and the reason holds no brackets of its own and is at least ten characters. A
 * marker with no mock of a guarded package on the next line is a failure too, so the printed set
 * stays the true one. Unmocks, importActuals and opt-outs need the list.
 *
 * Where it runs: the integration config. A pull request runs only the tests related to its
 * changed files, and this file imports nothing it reads, so a pull request that adds an unmarked
 * mock elsewhere is first red in the merge queue.
 *
 * Limits: this reads text, not behaviour. The marker is the author's word, read by a reviewer
 * next to the factory. A package name built at run time, and vi under another name, are not seen.
 * The sealed eval folders are not read (SEALED).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const ROOT = process.cwd();
const ROOTS = ['src', 'tests', 'scripts', 'apps', 'design-system'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', '.cache', 'coverage']);
/** Builders and verifiers never read the sealed eval sets, and neither does this census. */
const SEALED = /fixtures|heldout|held-out|blind|sealed|corpus/;
const SEALED_PATHS = new Set(['scripts/crisis-eval', 'scripts/voice-eval']);
/** The guard itself: it mocks every package and defines the opt-out. */
const GUARD_FILES = new Set([
  'src/tests/__tests__/outbound-guard-census.test.ts',
  'src/tests/outbound-guard.ts',
  'src/tests/setup.ts',
]);

const PACKAGE = String.raw`['"\`](?:@google-cloud/vertexai|openai|@google/genai|@google/generative-ai|google-auth-library)(?:/[^'"\`]*)?['"\`]`;
const TARGET = String.raw`(?:import\s*\(\s*)?${PACKAGE}`;

/** Any mock of a guarded package: a marker or the list allows it. */
const MOCK = new RegExp(String.raw`\bvi\s*\.\s*(?:mock|doMock)\s*\(\s*${TARGET}`, 'g');
/** Only an entry on the list allows these, with the opt-out. */
const UNMOCK = new RegExp(String.raw`\bvi\s*\.\s*(?:unmock|doUnmock)\s*\(\s*${TARGET}`, 'g');
const ACTUAL = new RegExp(String.raw`\bimportActual\s*(?:<.*?>)?\s*\(\s*${TARGET}`, 'g');

/** The marker line, whole. Its reason is the text between the brackets. */
const MARKER = /^[ \t]*\/\/ outbound-guard: own-refusing-mock \(([^()]*)\)[ \t]*$/;
const SHORTEST_REASON = 10;

/**
 * The whole list. A new entry needs a reason a reviewer accepts and a new size in the row below;
 * an entry whose file is gone, or steps around the guard less, comes off.
 */
const NAMED: Record<string, number> = {
  // Its rows install their own fake GoogleGenAI (vi.doMock), and its afterEach undoes it
  // (vi.doUnmock), which also drops the guard for the rest of the file. Every row there that
  // imports the package installs its fake first.
  'src/config/__tests__/gemini-billing-labels.test.ts': 2,
  // Builds real @google/genai clients to read the host they would send to; sends nothing.
  'src/config/__tests__/vertex-endpoint.test.ts': 1,
  // The guard's own rows: the opt-out is the thing under test.
  'src/tests/__tests__/outbound-guard.test.ts': 4,
  // The guard's probe for a file that says why it builds a client.
  'src/tests/__tests__/outbound-probes/says-why.test.ts': 1,
  // Their own GoogleAuth: building it throws ('network must not be touched in tests').
  'scripts/lib/__tests__/eval-results-bq.test.ts': 1,
  'src/agents/shared/__tests__/turn-receipt-bq.test.ts': 1,
  'src/services/analytics/__tests__/bq-events.test.ts': 1,
  'src/services/analytics/__tests__/eval-results.test.ts': 1,
  // Its own GoogleAuth hands back a client whose request is the row's spy.
  'src/services/analytics/__tests__/bq-rows-land.test.ts': 1,
  // Their own VertexAI: a class whose model answers from the row's spy.
  'src/services/custom-agent/__tests__/transcribe-budget.test.ts': 1,
  'src/services/custom-agent/__tests__/vertex-transcribe.test.ts': 1,
  'src/services/llm/__tests__/call-llm-claude-route.test.ts': 1,
  // Its own VertexAI (the row's model) and an empty OpenAI class.
  'src/services/__tests__/llm-utils-retry.test.ts': 2,
  // Their own @google/genai: no client class (phases), or a bare vi.fn (emotion analysis).
  'src/agents/voice-agent/phases/__tests__/phases.test.ts': 1,
  'src/services/emotion-analysis/__tests__/emotion-analysis.test.ts': 1,
  // Their own @google/generative-ai: a model that answers from a spy.
  'src/memory/knowledge-graph/__tests__/knowledge-graph-e2e.test.ts': 1,
  'src/tests/phase5-deep-dive-features.test.ts': 1,
  // Its own OpenAI: the constructor throws.
  'tests/performance/e2e-performance.test.ts': 1,
  // A shared helper, not a test: its Gemini mock puts a fake model in @google/genai (vi.doMock).
  'src/agents/__tests__/mocks/llm-mock.ts': 1,
};

/**
 * The guard does not reach a client a LiveKit plugin builds from inside node_modules: the Google
 * plugin loads its own @google/genai, and the OpenAI plugin imports root's openai from inside its
 * package. These test files name a plugin and build through it. The list makes a new one visible
 * in review; it does not guard it.
 */
const PLUGIN_BUILDERS = [
  'src/agents/model-provider/__tests__/cache-warm-prefix.test.ts',
  'src/agents/model-provider/__tests__/cartesia-cascade.test.ts',
  'src/agents/model-provider/__tests__/gemini-declarations.test.ts',
  'src/agents/model-provider/__tests__/gemini-native-audio.test.ts',
  'src/agents/model-provider/__tests__/prompt-prefix.test.ts',
  'src/agents/shared/__tests__/append-only-tools.test.ts',
  'src/agents/shared/__tests__/static-core-tools.test.ts',
];
const PLUGIN = new RegExp(
  String.raw`['"\`]@livekit/agents-plugin-(?:google|openai)(?:/[^'"\`]*)?['"\`]`
);
const PLUGIN_BUILD = /\bnew\s+[\w$.]*\b(?:LLM|RealtimeModel)\s*\(|\bcreateLLMModel\s*\(/;

interface Steps {
  /** Opt-outs, unmocks and importActuals. */
  listOnly: number;
  /** Mocks with no marker on the line above. */
  unmarkedMocks: number;
  /** The reason of each marked mock, in file order. */
  reasons: string[];
  /** Marker lines with no mock starting on the next line. */
  unusedMarkers: number;
}

const count = (text: string, way: RegExp): number => text.match(way)?.length ?? 0;

/** Calls of the opt-out, under its own name and any name the file imports it as. */
function optOuts(text: string): number {
  const aliases = [...text.matchAll(/\ballowOutbound\s+as\s+([A-Za-z_$][\w$]*)/g)];
  const names = ['allowOutbound', ...aliases.flatMap((alias) => (alias[1] ? [alias[1]] : []))];
  return names.reduce((n, name) => {
    const call = new RegExp(String.raw`(?<![\w$])${name.replace(/\$/g, '\\$')}\s*\(`, 'g');
    return n + count(text, call);
  }, 0);
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
  for (const mock of text.matchAll(MOCK)) {
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
    listOnly: optOuts(text) + count(text, UNMOCK) + count(text, ACTUAL),
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
      problems.push(`${file}: ${unusedMarkers} marker line(s) with no mock of a guarded package on the next line: remove`); // prettier-ignore
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
      problems.push(`${file}: ${unmarkedMocks} mock(s) of a guarded package with no marker line directly above, and not on the list`); // prettier-ignore
    }
  }
  for (const file of Object.keys(named)) {
    if (!Object.hasOwn(texts, file)) {
      problems.push(`${file}: on the list but not a source file any more: remove its entry`);
    }
  }
  return { problems, marked };
}

/** The listed and the marked sets, as the census prints them. */
function censusReport(named: Record<string, number>, marked: Record<string, string[]>): string {
  const byFile = ([a]: [string, unknown], [b]: [string, unknown]): number =>
    a < b ? -1 : a > b ? 1 : 0;
  const listed = Object.entries(named).sort(byFile);
  const steps = listed.reduce((n, [, size]) => n + size, 0);
  const files = Object.entries(marked).sort(byFile);
  const mocks = files.reduce((n, [, reasons]) => n + reasons.length, 0);
  return [
    `outbound guard census: ${steps} listed step(s) in ${listed.length} file(s), ${mocks} marked mock(s) in ${files.length} file(s)`, // prettier-ignore
    ...listed.map(([file, size]) => `  listed ${file}: ${size}`),
    ...files.map(([file, reasons]) => `  marked ${file}: ${reasons.length} (${reasons.join('; ')})`), // prettier-ignore
  ].join('\n');
}

/** The report, both where a reviewer reads it: the console, and the row's annotation. */
async function printCensus(
  report: string,
  annotate: (message: string) => Promise<unknown>
): Promise<void> {
  console.info(report);
  await annotate(report);
}

const isTestFile = (file: string): boolean =>
  /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) || file.includes('/__tests__/');

/** Test files that name a LiveKit plugin and build through it, against the list. */
function pluginProblems(texts: Record<string, string>, listed: readonly string[]): string[] {
  const found = Object.entries(texts)
    .filter(([file, text]) => isTestFile(file) && PLUGIN.test(text) && PLUGIN_BUILD.test(text))
    .map(([file]) => file)
    .sort();
  return [
    ...found.filter((file) => !listed.includes(file)).map((file) => `${file}: builds through a LiveKit plugin, which the guard does not reach: add it to PLUGIN_BUILDERS`), // prettier-ignore
    ...listed.filter((file) => !found.includes(file)).map((file) => `${file}: on PLUGIN_BUILDERS but builds through no plugin: remove`), // prettier-ignore
  ];
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SEALED.test(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      const skip = SKIP_DIRS.has(name) || SEALED_PATHS.has(relative(ROOT, path));
      return skip ? [] : sourceFiles(path);
    }
    return /\.[cm]?[jt]sx?$/.test(name) ? [path] : [];
  });
}

const MARK = '// outbound-guard: own-refusing-mock (the constructor counts and throws)';
const MOCK_LINE = "vi.mock('openai', async (original) => ({ ...(await original()), OpenAI: No }));";

describe('files that step around the outbound guard', () => {
  const texts: Record<string, string> = {};
  for (const root of ROOTS) {
    for (const file of sourceFiles(join(ROOT, root))) {
      const rel = relative(ROOT, file);
      if (!GUARD_FILES.has(rel)) texts[rel] = readFileSync(file, 'utf8');
    }
  }
  const { problems, marked } = census(texts, NAMED);

  it('are on the list with their number of steps, or marked at each mock', async ({ annotate }) => {
    // The console is what CI shows: its integration steps use the verbose reporter, which prints
    // it. The annotation becomes a notice only under the github-actions reporter, which those
    // steps do not use. A local pass in a shell where vitest picks its minimal reporter shows
    // neither.
    await printCensus(censusReport(NAMED, marked), annotate);
    expect(problems).toEqual([]);
  });

  it('the list has 19 entries: one more is a decision, made here as well', () => {
    expect(Object.keys(NAMED)).toHaveLength(19);
  });

  it('the test files that build through a LiveKit plugin are the list', () => {
    expect(pluginProblems(texts, PLUGIN_BUILDERS)).toEqual([]);
  });
});

describe('what counts as a step around the guard', () => {
  it.each([
    ["allowOutbound('a reason');", 1],
    ["import { allowOutbound as ok } from '../outbound-guard.js';\nok('a reason');", 1],
    ["guard.allowOutbound('a reason');", 1],
    ["vi.unmock('openai');", 1],
    ['vi.doUnmock("@google/genai");', 1],
    ["vi.unmock(import('openai'));", 1],
    ["await vi.importActual<typeof import('openai')>('openai');", 1],
    ["await vi.importActual<Awaited<typeof import('openai')>>('openai');", 1],
    ["await vi.importActual('openai/resources');", 1],
    ["// allowOutbound('in a comment') still counts", 1],
    ["allowOutbound('one'); allowOutbound('two');", 2],
    // Another package, or another opt-out name nobody imported.
    ["vi.unmock('firebase-admin/app');", 0],
    ["await vi.importActual('../llm-utils.js');", 0],
    ["ok('not the opt-out');", 0],
  ])('%s is %i list-only step(s)', (text, listOnly) => {
    expect(stepsAround(text)).toEqual({ listOnly, unmarkedMocks: 0, reasons: [], unusedMarkers: 0 }); // prettier-ignore
  });

  it.each([
    // Whatever the factory looks like.
    ["vi.mock('google-auth-library', async (importOriginal) => importOriginal());", 1],
    ["vi.mock('openai', () => ({ default: class {} }));", 1],
    ["vi.mock('openai');", 1],
    ["vi.mock('openai', factory);", 1],
    ["vi.mock('openai', async (...args) => args[0]());", 1],
    ["vi.mock('openai', { spy: true });", 1],
    ["vi.doMock('@google/genai', async (actual) => actual());", 1],
    ["vi.mock('@google/generative-ai', () => ({}));", 1],
    // However the package is named.
    ["vi.mock(import('openai'), async (original) => original());", 1],
    ["vi.mock('openai/resources/chat', () => ({}));", 1],
    ['vi.mock(`@google-cloud/vertexai`);', 1],
    ["vi.mock(\n  'openai',\n  async (original) => original()\n);", 1],
    [`${MOCK_LINE}\n${MOCK_LINE}`, 2],
    // Another package.
    ["vi.mock('firebase-admin/app', async (original) => original());", 0],
    ["vi.mock('openai-compatible', () => ({}));", 0],
  ])('%s is %i unmarked mock(s)', (text, unmarkedMocks) => {
    expect(stepsAround(text)).toEqual({ listOnly: 0, unmarkedMocks, reasons: [], unusedMarkers: 0 }); // prettier-ignore
  });
});

describe('the marker', () => {
  const REASON = 'the constructor counts and throws';

  it.each([
    ['directly above the mock', `${MARK}\n${MOCK_LINE}`],
    ['indented with the mock', `  ${MARK}\n  ${MOCK_LINE}`],
    ['above a mock written over several lines', `${MARK}\nvi.mock(\n  'openai',\n  async (original) => original()\n);`], // prettier-ignore
    ['with spaces after the closing bracket', `${MARK}  \n${MOCK_LINE}`],
    [
      'above a mock with its own fake',
      `${MARK}\nvi.mock('openai', () => ({ default: class {} }));`,
    ],
  ])('covers the mock when it is %s', (_where, text) => {
    expect(stepsAround(text)).toEqual({ listOnly: 0, unmarkedMocks: 0, reasons: [REASON], unusedMarkers: 0 }); // prettier-ignore
  });

  it('covers one mock each: two mocks need two markers', () => {
    expect(stepsAround(`${MARK}\n${MOCK_LINE}\n${MOCK_LINE}`)).toMatchObject({ unmarkedMocks: 1, reasons: [REASON] }); // prettier-ignore
    expect(stepsAround(`${MARK}\n${MOCK_LINE}\n${MARK}\n${MOCK_LINE}`)).toMatchObject({ unmarkedMocks: 0, reasons: [REASON, REASON] }); // prettier-ignore
    // Two mocks on one line share the line above: the marker there covers the first only.
    expect(stepsAround(`${MARK}\n${MOCK_LINE} ${MOCK_LINE}`)).toMatchObject({ unmarkedMocks: 1, reasons: [REASON] }); // prettier-ignore
  });

  it('does not cover an opt-out in the same file', () => {
    expect(stepsAround(`${MARK}\n${MOCK_LINE}\nallowOutbound('why');`)).toMatchObject({ listOnly: 1, unmarkedMocks: 0 }); // prettier-ignore
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
    ['has a second bracket after the reason', `${MARK} (see the factory)`],
    [
      'has brackets inside the reason',
      '// outbound-guard: own-refusing-mock (it throws (always) on new)',
    ],
    ['is spelled another way', `// outbound-guard: own refusing mock (${REASON})`],
  ])('is not a marker when it %s: the mock below stays unmarked', (_why, line) => {
    expect(stepsAround(`${line}\n${MOCK_LINE}`)).toEqual({ listOnly: 0, unmarkedMocks: 1, reasons: [], unusedMarkers: 0 }); // prettier-ignore
  });

  it.each([
    ['a blank line above the mock', `${MARK}\n\n${MOCK_LINE}`, 1],
    ['the top of the file, the mock further down', `${MARK}\nimport { vi } from 'vitest';\n${MOCK_LINE}`, 1], // prettier-ignore
    ['the same line, after the mock', `${MOCK_LINE} ${MARK}`, 0],
    ['the line below the mock', `${MOCK_LINE}\n${MARK}`, 1],
  ])('does not cover the mock from %s', (_where, text, unusedMarkers) => {
    expect(stepsAround(text)).toEqual({ listOnly: 0, unmarkedMocks: 1, reasons: [], unusedMarkers }); // prettier-ignore
  });

  it.each([
    ['a mock of another package', "vi.mock('firebase-admin/app', async (original) => original());"],
    ['an unmock', "vi.unmock('openai');"],
    ['a line that is not a mock', 'const answer = 42;'],
    ['a second marker', `${MARK}\n${MOCK_LINE}`],
    ['nothing', ''],
  ])('is unused above %s', (_what, below) => {
    expect(stepsAround(`${MARK}\n${below}`).unusedMarkers).toBe(1);
  });
});

describe('what the census fails on', () => {
  const NAMED_ONE = { 'a/__tests__/listed.test.ts': 1 };
  const LISTED = { 'a/__tests__/listed.test.ts': "allowOutbound('a reason');" };

  it('passes a listed file with its number, and files that take no step', () => {
    const texts = { ...LISTED, 'a/__tests__/plain.test.ts': "vi.mock('firebase-admin/app');" };
    expect(census(texts, NAMED_ONE)).toEqual({ problems: [], marked: {} });
  });

  it('fails an unlisted file with an unmarked mock, by name, test file or not', () => {
    const texts = { ...LISTED, 'b/__tests__/new.test.ts': MOCK_LINE, 'src/b/helper.ts': MOCK_LINE };
    const { problems } = census(texts, NAMED_ONE);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/^b\/__tests__\/new\.test\.ts: 1 mock\(s\).*no marker/);
    expect(problems[1]).toMatch(/^src\/b\/helper\.ts: 1 mock\(s\).*no marker/);
  });

  it('passes a marked file and prints it with its reasons, beside the listed set', () => {
    const texts = { ...LISTED, 'b/__tests__/new.test.ts': `${MARK}\n${MOCK_LINE}\n${MARK}\n${MOCK_LINE}` }; // prettier-ignore
    const { problems, marked } = census(texts, NAMED_ONE);
    expect(problems).toEqual([]);
    expect(censusReport(NAMED_ONE, marked)).toBe(
      'outbound guard census: 1 listed step(s) in 1 file(s), 2 marked mock(s) in 1 file(s)\n' +
        '  listed a/__tests__/listed.test.ts: 1\n' +
        '  marked b/__tests__/new.test.ts: 2 (the constructor counts and throws; the constructor counts and throws)'
    );
  });

  it('fails an unlisted opt-out, marker or not', () => {
    const texts = {
      ...LISTED,
      'b/__tests__/new.test.ts': `${MARK}\n${MOCK_LINE}\nallowOutbound('why');`,
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
      'a/__tests__/listed.test.ts: on the list but not a source file any more: remove its entry',
    ]);
  });

  it.each([
    ['more', "allowOutbound('a reason'); allowOutbound('another');", 2],
    ['more, by an unmarked mock', `allowOutbound('a reason');\n${MOCK_LINE}`, 2],
    ['fewer', "vi.mock('firebase-admin/app');", 0],
  ])('fails a listed file that takes %s steps than its number', (_which, text, found) => {
    expect(census({ 'a/__tests__/listed.test.ts': text }, NAMED_ONE).problems).toEqual([
      `a/__tests__/listed.test.ts: on the list with 1 step(s), found ${found}`,
    ]);
  });
});

describe('what the census prints', () => {
  it('prints the report to the console and to the row annotation, both', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const annotate = vi.fn(async (_message: string) => undefined);
    try {
      await printCensus('the report', annotate);
      expect(info).toHaveBeenCalledWith('the report');
      expect(annotate).toHaveBeenCalledWith('the report');
    } finally {
      info.mockRestore();
    }
  });
});

describe('test files that build through a LiveKit plugin', () => {
  const LISTED = ['a/__tests__/listed.test.ts'];
  const BUILDS = "import * as google from '@livekit/agents-plugin-google';\nnew google.LLM({});";

  it.each([
    [BUILDS, true],
    ["const e = require.resolve('@livekit/agents-plugin-google');\nawait new P().createLLMModel({});", true], // prettier-ignore
    ["import { realtime } from '@livekit/agents-plugin-openai';\nnew realtime.RealtimeModel({});", true], // prettier-ignore
    ["import * as beta from '@livekit/agents-plugin-google/beta';\nnew beta.LLM();", true],
    // A plugin named and nothing built, something built and no plugin named, another plugin.
    ["import * as google from '@livekit/agents-plugin-google';", false],
    ['new google.LLM({});', false],
    ["import * as c from '@livekit/agents-plugin-cartesia';\nnew c.LLM();", false],
  ])('%s builds through a plugin: %s', (text, builds) => {
    const found = pluginProblems({ 'a/__tests__/listed.test.ts': text }, LISTED);
    const gone =
      'a/__tests__/listed.test.ts: on PLUGIN_BUILDERS but builds through no plugin: remove';
    expect(found).toEqual(builds ? [] : [gone]);
  });

  it('names a new test file that builds through a plugin, and skips a source file that does', () => {
    const texts = {
      'a/__tests__/listed.test.ts': BUILDS,
      'b/__tests__/new.test.ts': BUILDS,
      'src/b/provider.ts': BUILDS,
    };
    expect(pluginProblems(texts, LISTED)).toEqual([
      'b/__tests__/new.test.ts: builds through a LiveKit plugin, which the guard does not reach: add it to PLUGIN_BUILDERS',
    ]);
  });
});
