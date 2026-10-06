/**
 * build-fast transpiles file by file, so JSON a source file imports must be
 * copied into dist. #355 added `import enUS from './locales/en-US.json'` to
 * src/i18n/index.ts, the hand-kept copy list missed it, and the UI image crashed
 * at start with ERR_MODULE_NOT_FOUND. copyImportedJson finds the imports instead.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { copyImportedJson } from '../../../apps/cli/src/commands/build/copy-imported-json.js';

const SRC = resolve(__dirname, '../..');

describe('copyImportedJson', () => {
  it('copies every JSON the real src imports, including the i18n locale', () => {
    const out = mkdtempSync(join(tmpdir(), 'dist-'));
    const copied = copyImportedJson(SRC, out);
    expect(copied).toContain(join('i18n', 'locales', 'en-US.json'));
    for (const rel of copied) expect(existsSync(join(out, rel))).toBe(true);
  });

  it('mirrors paths, skips tests, and ignores non-relative or out-of-tree imports', () => {
    const src = mkdtempSync(join(tmpdir(), 'src-'));
    mkdirSync(join(src, 'a', 'data'), { recursive: true });
    mkdirSync(join(src, 'a', '__tests__'), { recursive: true });
    writeFileSync(join(src, 'a', 'data', 'x.json'), '{}');
    writeFileSync(join(src, 'a', 'data', 'only-in-test.json'), '{}');
    writeFileSync(
      join(src, 'a', 'm.ts'),
      "import x from './data/x.json' with { type: 'json' };\nimport p from 'pkg/thing.json';\n"
    );
    writeFileSync(
      join(src, 'a', '__tests__', 't.test.ts'),
      "import y from '../data/only-in-test.json';\n"
    );
    const out = mkdtempSync(join(tmpdir(), 'out-'));
    expect(copyImportedJson(src, out)).toEqual([join('a', 'data', 'x.json')]);
    expect(existsSync(join(out, 'a', 'data', 'x.json'))).toBe(true);
    expect(existsSync(join(out, 'a', 'data', 'only-in-test.json'))).toBe(false);
  });

  it('fails the build when a source imports a JSON file that does not exist', () => {
    const src = mkdtempSync(join(tmpdir(), 'src-'));
    writeFileSync(join(src, 'm.ts'), "import x from './gone.json';\n");
    expect(() => copyImportedJson(src, mkdtempSync(join(tmpdir(), 'out-')))).toThrow(
      /imports missing/
    );
  });
});
