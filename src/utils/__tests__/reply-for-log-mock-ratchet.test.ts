/**
 * No test file hand-writes replyForLog or repliesForLog. A hand-written stub that hands the
 * text back whole shows a test dev behaviour, so its "no words in the log" proves nothing
 * about prod. A safe-logger mock takes them from tests/helpers/real-reply-for-log.ts
 * (`...(await realReplyForLog())`), which carries the real functions; the global mock in
 * src/tests/setup.ts does the same (reply-for-log-setup-mock.test.ts).
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
/** A property or method that defines one of them: `replyForLog: ...`, `repliesForLog(t) {`. */
const DEFINES = /\b(?:replyForLog|repliesForLog)\s*(?::|\([^)]*\)\s*\{)/g;

/** Line numbers in `source` that define replyForLog or repliesForLog by hand. */
function handWrittenReplyForLog(source: string): number[] {
  return [...source.matchAll(DEFINES)].map((m) => source.slice(0, m.index ?? 0).split('\n').length);
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

describe('handWrittenReplyForLog', () => {
  it.each([
    "replyForLog: (text: unknown) => String(text ?? ''),",
    'replyForLog: vi.fn((v: unknown) => v),',
    'repliesForLog: (values: string[]) => values,',
    'replyForLog(text: string) { return text; },',
  ])('flags %s', (code) => {
    expect(handWrittenReplyForLog(code)).toEqual([1]);
  });

  it.each([
    '...(await realReplyForLog()),',
    "import { replyForLog } from '../safe-logger.js';",
    "expect(replyForLog('some words')).toBe('[10 chars]');",
  ])('leaves %s alone', (code) => {
    expect(handWrittenReplyForLog(code)).toEqual([]);
  });
});

describe('test files in src/ take replyForLog from the helper', () => {
  it('has no hand-written replyForLog or repliesForLog', () => {
    // This file is left out: its examples above are the shapes it flags.
    const files = testFiles(join(ROOT, 'src')).filter((file) => file !== __filename);
    expect(files.length).toBeGreaterThan(1000);
    const where = files.flatMap((file) =>
      handWrittenReplyForLog(readFileSync(file, 'utf8')).map(
        (line) => `${relative(ROOT, file)}:${line}`
      )
    );
    expect(where).toEqual([]);
  });
});
