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

describe('no line can stall the screens', () => {
  /** Many `vi.mock<` openers, then many `>(` closers: an unbounded skip tries every pair, so it was cubic. */
  const stall = (n: number) => 'vi.mock<'.repeat(n) + '>('.repeat(n);
  /** Generous: the screens take well under it; the unbounded skip took seconds (minutes at 50 KB). */
  const BOUND_MS = 2000;
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

  it('150 lines of 4000 characters, the longest read, are read in bounded time', () => {
    const text = Array(150).fill(stall(400)).join('\n');
    const imports = timed(() => importsOf(diffOf(text)));
    const lanes = timed(() => diffLanes(text, { withImports: false }));
    expect(imports.out).toEqual([]);
    expect(lanes.out).toEqual([[], []]);
    expect(imports.ms).toBeLessThan(BOUND_MS);
    expect(lanes.ms).toBeLessThan(BOUND_MS);
  });
});
