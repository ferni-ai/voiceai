/**
 * No test file hand-writes replyForLog or repliesForLog. A hand-written stub that hands the
 * text back whole shows a test dev behaviour, so its "no words in the log" proves nothing
 * about prod. A safe-logger mock takes them from tests/helpers/real-reply-for-log.ts
 * (`...(await realReplyForLog())`): mock functions whose default is the real one. The global
 * mock in src/tests/setup.ts does the same (reply-for-log-setup-mock.test.ts).
 *
 * Two shapes are banned:
 * - a definition: `replyForLog: ...` or `repliesForLog(t) {` (a mock factory's own stub);
 * - a re-stub, `vi.mocked(replyForLog).mockX(...)` or `vi.spyOn(m, 'replyForLog').mockX(...)`,
 *   also through an alias (`const { replyForLog: stubbed } = await import(...)`), unless it
 *   re-points at the real function imported from reply-for-log.js, only clears or resets, or
 *   the file is in RESTUB_ALLOWED with its reason.
 *
 * Reads every test file under src/ (a __tests__, __mocks__ or tests directory, or a
 * .test/.spec file) like log-text-ratchet.test.ts reads production files.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const TEST_DIR = /^(__tests__|__mocks__|tests)$/;
const TEST_FILE = /\.(test|spec)\.ts$/;
const HELPER = join(ROOT, 'src', 'tests', 'helpers', 'real-reply-for-log.ts');
const NAMES = /^(?:replyForLog|repliesForLog)$/;
/** A property or method that defines one of them: `replyForLog: ...`, `repliesForLog(t) {`. */
const DEFINES = /\b(?:replyForLog|repliesForLog)\s*(?::|\([^)]*\)\s*\{)/g;
/** Names bound from a module: `const { a: b } = await import('m')` or `import { a as b } from 'm'`. */
const BINDINGS =
  /(?:(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:await\s+)?(?:import|vi\.importActual(?:<[^>]*>)?)\(\s*|import\s*\{([^}]*)\}\s*from\s*)['"]([^'"]+)['"]/g;
/** A re-stub: its target, the mock method and the first argument. */
const RESTUBS = [
  /vi\.mocked\(\s*([\w$.]+)\s*\)\s*\.(mock\w+)\(\s*([^,)]*)/g,
  /vi\.spyOn\([^,]+,\s*['"](\w+)['"]\s*\)\s*\.(mock\w+)\(\s*([^,)]*)/g,
];
const CLEARS = /^mock(?:Clear|Reset|Restore)$/;
const REPOINTS = /^mockImplementation(?:Once)?$/;

/** Files that may re-stub them by hand, one line each on why. */
const RESTUB_ALLOWED: Record<string, string> = {
  // Re-stubs on purpose, then resets, to prove a reset brings the real default back.
  'src/utils/__tests__/reply-for-log-setup-mock.test.ts': 'pins the reset behaviour',
};

interface Finding {
  line: number;
  kind: 'definition' | 'restub';
}

/** Hand-written replyForLog / repliesForLog in `source`, by line. */
function handWrittenReplyForLog(source: string): Finding[] {
  const lineOf = (index: number) => source.slice(0, index).split('\n').length;
  const real = new Set<string>();
  const aliases = new Set<string>();
  let rest = source;
  for (const m of source.matchAll(BINDINGS)) {
    rest = rest.replace(m[0], ' '.repeat(m[0].length)); // a binding is not a definition
    for (const entry of (m[1] ?? m[2] ?? '').split(',')) {
      const [name, bound] = entry.split(/\s*:\s*|\s+as\s+/).map((part) => part.trim());
      if (!name || !NAMES.test(name)) continue;
      (m[3]?.endsWith('/reply-for-log.js') ? real : aliases).add(bound || name);
    }
  }
  const found: Finding[] = [...rest.matchAll(DEFINES)].map((m) => ({
    line: lineOf(m.index ?? 0),
    kind: 'definition',
  }));
  for (const pattern of RESTUBS) {
    for (const m of source.matchAll(pattern)) {
      const target = m[1]?.split('.').pop() ?? '';
      if (!NAMES.test(target) && !aliases.has(target)) continue;
      const method = m[2] ?? '';
      if (CLEARS.test(method) || (REPOINTS.test(method) && real.has((m[3] ?? '').trim()))) continue;
      found.push({ line: lineOf(m.index ?? 0), kind: 'restub' });
    }
  }
  return found;
}

function testFiles(dir: string, inTests = false, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') {
        testFiles(join(dir, entry.name), inTests || TEST_DIR.test(entry.name), out);
      }
    } else if (entry.name.endsWith('.ts') && (inTests || TEST_FILE.test(entry.name))) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

const kinds = (code: string) => handWrittenReplyForLog(code).map((f) => f.kind);

describe('handWrittenReplyForLog', () => {
  it.each([
    ["replyForLog: (text: unknown) => String(text ?? ''),", 'definition'],
    ['replyForLog: vi.fn((v: unknown) => v),', 'definition'],
    ['repliesForLog: (values: string[]) => values,', 'definition'],
    ['replyForLog(text: string) { return text; },', 'definition'],
    ["vi.mocked(replyForLog).mockImplementation((t) => String(t ?? ''));", 'restub'],
    ["vi.mocked(log.repliesForLog).mockReturnValue(['a line']);", 'restub'],
    ["vi.spyOn(safeLogger, 'replyForLog').mockImplementation((t) => t);", 'restub'],
    [
      "const { replyForLog: stubbed } = await import('../safe-logger.js');\n" +
        'vi.mocked(stubbed).mockImplementation((t) => t);',
      'restub',
    ],
  ])('flags %s', (code, kind) => {
    expect(kinds(code)).toEqual([kind]);
  });

  it.each([
    '...(await realReplyForLog()),',
    "import { replyForLog } from '../safe-logger.js';",
    "expect(replyForLog('some words')).toBe('[10 chars]');",
    'vi.mocked(replyForLog).mockClear();',
    "const { replyForLog: stubbed } = await import('../../../utils/safe-logger.js');\n" +
      "const { replyForLog: real } = await import('../../../utils/reply-for-log.js');\n" +
      'vi.mocked(stubbed).mockImplementation(real);',
  ])('leaves %s alone', (code) => {
    expect(kinds(code)).toEqual([]);
  });
});

describe('test files in src/ take replyForLog from the helper', () => {
  it('has no hand-written replyForLog or repliesForLog outside RESTUB_ALLOWED', () => {
    // Left out: this file (its examples are the shapes it flags) and the helper, the one
    // place that defines them (as the real functions; reply-for-log-setup-mock pins that).
    const files = testFiles(join(ROOT, 'src')).filter(
      (file) => file !== __filename && file !== HELPER
    );
    expect(files.length).toBeGreaterThan(1000);
    const where: string[] = [];
    const allowedSeen = new Set<string>();
    for (const file of files) {
      const rel = relative(ROOT, file);
      for (const { line, kind } of handWrittenReplyForLog(readFileSync(file, 'utf8'))) {
        if (kind === 'restub' && rel in RESTUB_ALLOWED) allowedSeen.add(rel);
        else where.push(`${rel}:${line} (${kind})`);
      }
    }
    for (const rel of Object.keys(RESTUB_ALLOWED)) {
      if (!allowedSeen.has(rel)) where.push(`${rel}: prune from RESTUB_ALLOWED`);
    }
    expect(where).toEqual([]);
  });
});
