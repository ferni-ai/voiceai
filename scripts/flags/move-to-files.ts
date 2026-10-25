/**
 * pnpm flags:move --file flag-manifest-blocks.ts [--range A-F | --names X,Y] [--batch NAME]
 *
 * Moves legacy flag-manifest*.ts entries to src/config/flags/NAME.ts in the shape
 * `pnpm flags:new` writes, comments verbatim above the export. Splices them out by
 * AST position, drops emptied blocks with their spreads and imports (and the file
 * once nothing is left), regenerates the barrel, and freezes the moved specs, read
 * from the legacy source before the move, in __tests__/fixtures/flag-move-<batch>.json
 * for flag-manifest-contract.test.ts to hold FLAG_MANIFEST to.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as prettier from 'prettier';
import ts from 'typescript';
import { writeFlagBarrel } from '../../src/config/generated-lists.js';
import { commentsOf, parseLegacy, type Entry } from './legacy-parse.js';
import { flagFileText, isMain } from './new-flag.js';

const MANIFEST = 'flag-manifest.ts';
export const configDir = (root: string): string => join(root, 'src', 'config');

/** Writes text to path in this repo's prettier style (wherever path is, so tests match). */
export async function writeFormatted(path: string, text: string): Promise<void> {
  const options = (await prettier.resolveConfig(fileURLToPath(import.meta.url))) ?? {};
  writeFileSync(path, await prettier.format(text, { ...options, filepath: path }));
}

interface Splice {
  start: number;
  end: number;
  text: string;
}
const splice = (text: string, edits: Splice[]): string =>
  [...edits]
    .sort((a, b) => b.start - a.start)
    .reduce((t, e) => t.slice(0, e.start) + e.text + t.slice(e.end), text);

/** Drops the given named imports of ./<file>.js from flag-manifest.ts source; all of them if `all`. */
function dropImports(text: string, file: string, names: Set<string>, all: boolean): string {
  const sf = ts.createSourceFile(MANIFEST, text, ts.ScriptTarget.Latest, true);
  const from = `./${file.replace(/\.ts$/, '.js')}`;
  for (const imp of sf.statements.filter(ts.isImportDeclaration)) {
    const bindings = imp.importClause?.namedBindings;
    if (
      (imp.moduleSpecifier as ts.StringLiteral).text !== from ||
      !bindings ||
      !ts.isNamedImports(bindings)
    ) {
      continue;
    }
    const keep = bindings.elements.filter((el) => !all && !names.has(el.name.text));
    const rest = keep.length
      ? `import { ${keep.map((el) => el.getText(sf)).join(', ')} } from '${from}';`
      : '';
    return splice(text, [{ start: imp.getStart(sf), end: imp.end, text: rest }]);
  }
  return text;
}

/**
 * Replaces (string) or removes (null) entries of one legacy file by AST position.
 * Exported blocks left empty go, with their spreads and imports in flag-manifest.ts,
 * and a file left with no exports is deleted.
 */
export async function editLegacy(
  root: string,
  file: string,
  edits: Map<string, string | null>
): Promise<void> {
  const path = join(configDir(root), file);
  let text = readFileSync(path, 'utf8');
  const hits = parseLegacy(file, text).entries.filter((e) => edits.has(e.name));
  const missing = [...edits.keys()].filter((name) => !hits.some((e) => e.name === name));
  if (missing.length) throw new Error(`${file} has no entry ${missing.join(', ')}`);
  text = splice(
    text,
    hits.map((e) => ({ start: e.start, end: e.end, text: edits.get(e.name) ?? '' }))
  );

  const after = parseLegacy(file, text);
  const used = new Set([...after.entries, ...after.spreads].map((x) => x.block));
  const emptied = after.blocks.filter((b) => b.exported && !used.has(b.name));
  const manifestPath = join(configDir(root), MANIFEST);
  const names = new Set(emptied.map((b) => b.name));
  const manifestNow = readFileSync(manifestPath, 'utf8');
  const spreads = parseLegacy(MANIFEST, manifestNow).spreads.filter((s) => names.has(s.name));
  // Check before writing anything: a comment here would be lost with its block or spread.
  const lost = [
    ...emptied
      .map((b) => text.slice(b.start, b.end))
      .filter((x) => /\/[/*]/.test(x.slice(x.indexOf('{')))),
    ...spreads.filter((s) => s.comments.length > 0).map((s) => s.comments.join('\n')),
  ];
  if (lost.length) throw new Error(`move these comments by hand first:\n${lost.join('\n')}`);
  text = splice(
    text,
    emptied.map((b) => ({ ...b, text: '' }))
  );
  const gone = file !== MANIFEST && !/^export /m.test(text);
  if (gone) rmSync(path);
  else await writeFormatted(path, text);
  if (emptied.length === 0 && !gone) return;
  const manifest = splice(
    manifestNow,
    spreads.map((s) => ({ ...s, text: '' }))
  );
  await writeFormatted(manifestPath, dropImports(manifest, file, names, gone));
}

export interface MoveOptions {
  root: string;
  /** A legacy file in src/config, e.g. flag-manifest-blocks.ts. */
  file: string;
  /** First letters, inclusive, e.g. ['A', 'F']. */
  range?: [string, string];
  names?: string[];
  batch?: string;
}

export function selectEntries(entries: Entry[], o: Pick<MoveOptions, 'range' | 'names'>): Entry[] {
  if (o.names) {
    const unknown = o.names.filter((n) => !entries.some((e) => e.name === n));
    if (unknown.length) throw new Error(`not in the file: ${unknown.join(', ')}`);
    return entries.filter((e) => o.names?.includes(e.name));
  }
  const [from, to] = o.range ?? ['A', 'Z'];
  return entries.filter((e) => e.name[0] >= from && e.name[0] <= to);
}

/** Moves the selected entries; returns the moved names and the fixture path. */
export async function moveToFiles(o: MoveOptions): Promise<{ moved: string[]; fixture: string }> {
  const config = configDir(o.root);
  const chosen = selectEntries(
    parseLegacy(o.file, readFileSync(join(config, o.file), 'utf8')).entries,
    o
  );
  if (chosen.length === 0) throw new Error(`nothing to move from ${o.file}`);
  const taken = chosen.filter((e) => existsSync(join(config, 'flags', `${e.name}.ts`)));
  if (taken.length) throw new Error(`already in flags/: ${taken.map((e) => e.name).join(', ')}`);

  const frozen = Object.fromEntries(
    [...chosen].sort((a, b) => (a.name < b.name ? -1 : 1)).map((e) => [e.name, e.spec])
  );
  const batch =
    o.batch ??
    `${o.file.replace(/\.ts$/, '')}-${o.names ? 'names' : (o.range ?? ['A', 'Z']).join('-')}`;
  const fixture = join(config, '__tests__', 'fixtures', `flag-move-${batch}.json`);
  if (existsSync(fixture)) {
    throw new Error(`${fixture} already exists: give this move its own --batch NAME`);
  }
  // The fixture goes first, so a run that fails part-way still leaves the specs it froze.
  mkdirSync(join(fixture, '..'), { recursive: true });
  await writeFormatted(fixture, JSON.stringify(frozen, null, 2));
  const manifestPath = join(config, MANIFEST);
  const before = [readFileSync(join(config, o.file), 'utf8'), readFileSync(manifestPath, 'utf8')];
  try {
    // editLegacy checks everything before it writes, so a refusal leaves no flag file behind.
    await editLegacy(o.root, o.file, new Map(chosen.map((e) => [e.name, null])));
  } catch (error) {
    const untouched = [join(config, o.file), manifestPath].every(
      (p, i) => existsSync(p) && readFileSync(p, 'utf8') === before[i]
    );
    if (untouched) rmSync(fixture); // refused before writing anything: leave no trace
    throw error;
  }
  for (const e of chosen) {
    await writeFormatted(
      join(config, 'flags', `${e.name}.ts`),
      flagFileText(e.name, e.spec, commentsOf(e))
    );
  }
  writeFlagBarrel(join(config, 'flags'));
  return { moved: chosen.map((e) => e.name), fixture };
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      file: { type: 'string' },
      range: { type: 'string' },
      names: { type: 'string' },
      batch: { type: 'string' },
    },
  });
  const range = values.range?.toUpperCase().split('-') as [string, string] | undefined;
  moveToFiles({
    root: process.cwd(),
    file: basename(values.file ?? ''),
    range,
    names: values.names?.split(','),
    batch: values.batch,
  })
    .then(({ moved, fixture }) =>
      console.log(`Moved ${moved.length} flags to src/config/flags/; froze ${fixture}`)
    )
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
