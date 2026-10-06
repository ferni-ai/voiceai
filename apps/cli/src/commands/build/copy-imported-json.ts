/**
 * Copy every JSON file the source imports into the build output.
 *
 * build-fast transpiles file by file (esbuild, bundle: false), so a TS file that
 * does `import x from './locales/en-US.json' with { type: 'json' }` compiles to a
 * dist/*.js that still imports the .json, which only exists if something copies
 * it. The hand-kept list in build-fast missed src/i18n/locales, and the UI image
 * crashed at start with ERR_MODULE_NOT_FOUND (2026-10-05, #355). This finds the
 * imports instead of relying on the list.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const JSON_IMPORT = /\bfrom\s+['"](\.{1,2}\/[^'"]+\.json)['"]/g;

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      yield* sourceFiles(path);
    } else if (/\.(ts|mts|cts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      yield path;
    }
  }
}

/** Copies each relatively imported .json under srcDir to the same path under outDir. */
export function copyImportedJson(srcDir: string, outDir: string): string[] {
  const copied = new Set<string>();
  for (const file of sourceFiles(srcDir)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(JSON_IMPORT)) {
      const source = resolve(dirname(file), match[1]);
      const rel = relative(srcDir, source);
      if (rel.startsWith('..') || copied.has(rel)) continue;
      if (!existsSync(source))
        throw new Error(`${relative(srcDir, file)} imports missing ${match[1]}`);
      const dest = join(outDir, rel);
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(source, dest);
      copied.add(rel);
    }
  }
  return [...copied].sort();
}
