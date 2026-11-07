/**
 * The loop's import screen reads the vitest/jest forms that load a module in a test, not only
 * import/require/from. `vi.mock(path)` with no factory automocks the real module, a factory's
 * `importOriginal()` loads it, and `vi.importActual(path)` loads it outright. Before, none of
 * these was read, so a loop PR could load a crisis module in a test without the crisis approval.
 */
import { describe, expect, it } from 'vitest';
import {
  changedLinesOf,
  classify,
  importsOf,
  loadPolicy,
  loopOutsideAllowed,
  type Policy,
} from '../autonomy-lanes.js';

const policy = loadPolicy();
/** Every path allowed, so only the line and import screens can make a PR crisis. */
const screens: Policy = { ...policy, loopAllowed: { paths: ['**'], screenContent: [] } };
const TEST_FILE = 'src/agents/personas/__tests__/greeting.test.ts';
/** Resolves to src/agents/processors/turn-processor/process-turn.ts, a crisis path, with no crisis word. */
const TURN = '../../processors/turn-processor/process-turn.js';
/** A type argument with `>` inside it, so the skip must run to the `>` before the call's `(`. */
const NESTED = 'Record<string, Array<Map<string, number>>>';

/** A diff adding `text` to the test file. */
const diffOf = (text: string) =>
  [
    `diff --git a/${TEST_FILE} b/${TEST_FILE}`,
    `--- a/${TEST_FILE}`,
    `+++ b/${TEST_FILE}`,
    '@@ -0,0 +1 @@',
    ...text.split('\n').map((l) => `+${l}`),
  ].join('\n');

/** Lanes for adding `text` to the test file, as the loop and as ferni-agent, from the diff alone. */
function diffLanes(text: string, { withImports = true } = {}) {
  const diff = diffOf(text);
  const imports = withImports ? importsOf(diff) : [];
  const lines = changedLinesOf(diff);
  return ['ferni-loop[bot]', 'app/ferni-agent'].map((who) =>
    classify([TEST_FILE], lines, who, screens, { imports })
  );
}

/** Whether the default-deny content screen blocks the test file with this head content. */
const contentBlocks = (text: string) =>
  loopOutsideAllowed([TEST_FILE], policy, { [TEST_FILE]: text }).length > 0;

const LOADS = {
  'vi.mock with no factory': `vi.mock('${TURN}');`,
  'vi.doMock': `vi.doMock('${TURN}');`,
  'vi.importActual': `const real = await vi.importActual('${TURN}');`,
  'vi.importActual with a type argument': `const real = await vi.importActual<typeof M>('${TURN}');`,
  'vi.importActual with a nested type argument': `const real = await vi.importActual<${NESTED}>('${TURN}');`,
  'vi.importActual with an import type and a nested type argument': `const real = await vi.importActual<typeof import('x') & ${NESTED}>('${TURN}');`,
  'an import type inside a vi.importActual type argument': `const real = await vi.importActual<typeof import('${TURN}')>('../greet.js');`,
  'vi.importMock': `const m = await vi.importMock('${TURN}');`,
  'vi.importActual with a nested type argument, then a later generic call': `const real = await vi.importActual<Map<string, number>>('${TURN}'); const y = f<Bar>('../greet.js');`,
  'vi.importActual with a type argument over several lines': [
    'const real = await vi.importActual<{',
    '  greet: (name: string) => string;',
    `}>('${TURN}');`,
  ].join('\n'),
  'vi.mock with importOriginal, over several lines': [
    'vi.mock(',
    `  '${TURN}',`,
    '  async (importOriginal) => ({ ...(await importOriginal()) })',
    ');',
  ].join('\n'),
};

describe('test-file module loads are read by the loop screen', () => {
  it.each(Object.entries(LOADS))('%s of a crisis module blocks a loop test file', (_, text) => {
    expect(contentBlocks(text)).toBe(true);
  });

  it.each(Object.entries(LOADS).filter(([, t]) => !t.includes('\n')))(
    '%s on a changed line is crisis for the loop only',
    (_, text) => {
      expect(diffLanes(text)).toEqual([['crisis'], []]);
    }
  );

  it.each([
    "vi.mock('../../../services/human-transfer/index.js');",
    `vi.importActual<${NESTED}>('../../../services/human-transfer/index.js');`,
  ])('the policy line pattern reads %s with no import list', (line) => {
    expect(diffLanes(line, { withImports: false })).toEqual([['crisis'], []]);
  });

  it('mocking a module that is not crisis, a mock helper, or an empty file stays clear', () => {
    for (const text of [
      "vi.mock('../greet.js');",
      "const real = await vi.importActual<typeof G>('../greet.js');",
      `const real = await vi.importActual<${NESTED}>('../greet.js');`,
      "fetchMock.mockResolvedValue('ok');",
      '',
    ]) {
      expect(contentBlocks(text)).toBe(false);
      expect(diffLanes(text)).toEqual([[], []]);
    }
  });
});

describe('a quote far from its keyword is still read', () => {
  /** A comment of `n` characters with no quote in it. */
  const gap = (n: number) => `/* ${'x'.repeat(n)} */`;
  /** More than the 1024 characters the whole-file pattern reads before a quote. */
  const FAR = 1100;
  const far = (target: string) => ({
    'from, past a long comment': `import { a } from ${gap(FAR)} '${target}';`,
    'from, past many blank lines': `import { a } from${'\n'.repeat(FAR)}'${target}';`,
    'a dynamic import, past a long comment': `await import(${gap(FAR)} '${target}');`,
    'require, past a long comment': `require(${gap(FAR)} '${target}');`,
    'a mock, past a long comment': `vi.mock(${gap(FAR)} '${target}');`,
    'a mock, past many comment lines': [
      'vi.mock(',
      ...Array<string>(50).fill(`  // ${'y'.repeat(20)}`),
      `  '${target}'`,
      ');',
    ].join('\n'),
    'a typed importActual, past a long comment': `await vi.importActual<typeof M>(${gap(FAR)} '${target}');`,
  });

  it.each(Object.entries(far(TURN)))(
    '%s, of a crisis module, blocks a loop test file',
    (_, text) => {
      expect(contentBlocks(text)).toBe(true);
    }
  );

  it.each(Object.entries(far('../greet.js')))(
    '%s, of a module that is not crisis, stays clear',
    (_, text) => {
      expect(contentBlocks(text)).toBe(false);
    }
  );

  it('a keyword with no quote after it, or a word like from in prose, stays clear', () => {
    for (const text of [
      `// taken from${' '.repeat(FAR)}`,
      `// values from the table\nconst t = [${Array<string>(600).fill('1').join(', ')}];\nexpect(f()).toBe('ok');`,
    ]) {
      expect(contentBlocks(text)).toBe(false);
    }
  });
});

describe('a type argument the line pattern cannot read is refused on a changed line', () => {
  it.each([
    ['opens and closes on a later line', 'const real = await vi.importActual<{'],
    [
      'runs past 256 characters',
      `const real = await vi.importActual<${'A'.repeat(300)}>('../greet.js');`,
    ],
    ['opens a mock and closes on a later line', 'vi.mock<'],
  ])('a type argument that %s is crisis for the loop only', (_, line) => {
    expect(diffLanes(line)).toEqual([['crisis'], []]);
  });

  it('a type argument that closes within 256 characters is read, not refused', () => {
    expect(
      diffLanes(`const real = await vi.importActual<${'A'.repeat(200)}>('../greet.js');`)
    ).toEqual([[], []]);
  });
});

describe('no line can stall the screens', () => {
  /** Many `vi.mock<` openers, then many `>(` closers: an unbounded skip tries every pair, so it was cubic. */
  const stall = (n: number) => 'vi.mock<'.repeat(n) + '>('.repeat(n);
  /** Generous: the screens take well under it; the unbounded skip took seconds (minutes at 50 KB). */
  const BOUND_MS = 2000;
  /** Generous for a whole 200 KB file on a slow runner; it takes a few seconds, and took minutes. */
  const WHOLE_FILE_BOUND_MS = 30_000;
  const timed = <T>(run: () => T) => {
    const start = performance.now();
    const out = run();
    return { out, ms: performance.now() - start };
  };

  it('a 50 KB line is refused unread for the loop and loads nothing', () => {
    const line = stall(5000);
    const imports = timed(() => importsOf(diffOf(line)));
    const lanes = timed(() => diffLanes(line, { withImports: false }));
    expect(imports.out).toEqual([]);
    expect(lanes.out).toEqual([['crisis'], []]);
    expect(imports.ms).toBeLessThan(BOUND_MS);
    expect(lanes.ms).toBeLessThan(BOUND_MS);
  });

  it('a line is read up to 4000 characters and refused unread past that', () => {
    expect(diffLanes('x'.repeat(4000))).toEqual([[], []]);
    expect(diffLanes('x'.repeat(4001))).toEqual([['crisis'], []]);
  });

  it(
    'a 200 KB test file of crafted lines is read whole in bounded time',
    () => {
      // Each line is under the 4000-character cap, so it is read, not refused unread. An
      // unbounded whole-file pattern tries every keyword against every later quote-free run, so
      // this took about two minutes; the bounded one reads it in seconds.
      const text = Array<string>(52).fill('mock<>(>('.repeat(444)).join('\n');
      expect(text.length).toBeGreaterThan(200 * 1024);
      const content = timed(() => contentBlocks(text));
      expect(content.out).toBe(false);
      expect(content.ms).toBeLessThan(WHOLE_FILE_BOUND_MS);
    },
    2 * WHOLE_FILE_BOUND_MS
  );

  it('150 lines of 4000 characters, the longest read, are read in bounded time', () => {
    const text = Array(150).fill(stall(400)).join('\n');
    const imports = timed(() => importsOf(diffOf(text)));
    const lanes = timed(() => diffLanes(text, { withImports: false }));
    expect(imports.out).toEqual([]);
    // Each line opens a type argument that doesn't close within 256 characters, so the loop
    // is refused; the line screen still reads every line first, so the time is still bounded.
    expect(lanes.out).toEqual([['crisis'], []]);
    expect(imports.ms).toBeLessThan(BOUND_MS);
    expect(lanes.ms).toBeLessThan(BOUND_MS);
  });
});
