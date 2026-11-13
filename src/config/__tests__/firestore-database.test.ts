/**
 * Two questions are asked of FIRESTORE_DATABASE, and a name nobody expected must fail each
 * to its own safe side:
 * - isNonProdDatabase(): "skip prod work?" An unknown name is not prod's, so work is skipped.
 * - isKnownDevDatabase(): "may this process do what only dev may, such as log words?" An
 *   unknown name is not dev's, so it may not.
 *
 * Every row asserts both. Before isKnownDevDatabase existed the logging sites asked the first
 * question, so a prod process with a misspelt name logged what callers said.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';

import {
  getFirestoreDatabase,
  isKnownDevDatabase,
  isNonProdDatabase,
} from '../firestore-database.js';

const ROOT = join(__dirname, '..', '..', '..');

interface Row {
  set: string | undefined;
  database: string;
  nonProd: boolean;
  knownDev: boolean;
}
const PROD = { database: '(default)', nonProd: false, knownDev: false };
// Written out, not imported: a change to dev's name in the code must be made here by hand too.
const DEV = { database: 'ferni-dev', nonProd: true, knownDev: true };
const unknown = (database: string) => ({ database, nonProd: true, knownDev: false });

const ROWS: Record<string, Row> = {
  unset: { set: undefined, ...PROD },
  empty: { set: '', ...PROD },
  'a single space': { set: ' ', ...PROD },
  'only space and a newline': { set: ' \n', ...PROD },
  "prod's name": { set: '(default)', ...PROD },
  "prod's name with space around it": { set: ' (default)\n', ...PROD },
  "dev's name": { set: 'ferni-dev', ...DEV },
  "dev's name with space around it": { set: ' ferni-dev\n', ...DEV },
  "prod's name in another case": { set: '(Default)', ...unknown('(Default)') },
  "prod's name without its brackets": { set: 'default', ...unknown('default') },
  "prod's name misspelt": { set: '(defualt)', ...unknown('(defualt)') },
  "dev's name in another case": { set: 'Ferni-Dev', ...unknown('Ferni-Dev') },
  "dev's name misspelt": { set: 'ferni-dve', ...unknown('ferni-dve') },
  "a longer name that starts with dev's": { set: 'ferni-dev-2', ...unknown('ferni-dev-2') },
  'a name that says prod': { set: 'ferni-prod', ...unknown('ferni-prod') },
  'some other database': { set: 'custom-db', ...unknown('custom-db') },
};

describe('which Firestore database, and what it allows', () => {
  it.each(Object.entries(ROWS))('%s', (_name, { set, database, nonProd, knownDev }) => {
    const env = set === undefined ? {} : { FIRESTORE_DATABASE: set };
    expect(getFirestoreDatabase(env)).toBe(database);
    expect(isNonProdDatabase(env)).toBe(nonProd);
    expect(isKnownDevDatabase(env)).toBe(knownDev);
  });

  it('no name is both prod and dev, and the rows cover all three kinds', () => {
    const rows = Object.values(ROWS);
    for (const { nonProd, knownDev } of rows) expect(knownDev && !nonProd).toBe(false);
    expect(rows.filter((r) => !r.nonProd).length).toBeGreaterThan(3);
    expect(rows.filter((r) => r.knownDev).length).toBeGreaterThan(1);
    expect(rows.filter((r) => r.nonProd && !r.knownDev).length).toBeGreaterThan(5);
  });

  it('reads process.env when called, not when loaded', () => {
    const saved = process.env.FIRESTORE_DATABASE;
    try {
      process.env.FIRESTORE_DATABASE = DEV.database;
      expect(isKnownDevDatabase()).toBe(true);
      process.env.FIRESTORE_DATABASE = 'ferni-dve';
      expect(isKnownDevDatabase()).toBe(false);
      expect(isNonProdDatabase()).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.FIRESTORE_DATABASE;
      else process.env.FIRESTORE_DATABASE = saved;
    }
  });
});

/** Every production .ts file under `dir` (no tests, mocks or type declarations). */
function productionFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return /^(__tests__|__mocks__|tests|node_modules)$/.test(entry.name)
        ? []
        : productionFiles(path);
    }
    return /\.ts$/.test(entry.name) && !/\.(test|spec|d)\.ts$/.test(entry.name) ? [path] : [];
  });
}

const PRODUCTION = productionFiles(join(ROOT, 'src')).map((file) => relative(ROOT, file));
/** A file's code lines (comment lines dropped), trimmed. */
const codeLines = (file: string): string[] =>
  readFileSync(join(ROOT, file), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^(\/\/|\/\*|\*)/.test(line));
/** Each production file with a code line that matches, and how many such lines it has. */
const filesWith = (pattern: RegExp): Record<string, number> =>
  Object.fromEntries(
    PRODUCTION.map((file) => [file, codeLines(file).filter((l) => pattern.test(l)).length] as const)
      .filter(([, count]) => count > 0)
      .sort()
  );

describe('isNonProdDatabase is only for skipping prod work', () => {
  // A new log line that asks it would bring the fail-open back. Each test below closes one
  // way of asking it: by name, through a wrapper, through the skip helper, or spelt out.
  it('is named by no production file but its own and config/environment.ts', () => {
    expect(Object.keys(filesWith(/\bisNonProdDatabase\b/))).toEqual([
      'src/config/environment.ts',
      'src/config/firestore-database.ts',
    ]);
  });

  it('is asked once, inside skipOnNonProdDatabase: no wrapper, alias or re-export', () => {
    const naming = (file: string): string[] =>
      codeLines(file).filter((line) => /\bisNonProdDatabase\b/.test(line));
    expect(naming('src/config/firestore-database.ts')).toEqual([
      'export function isNonProdDatabase(',
    ]);
    expect(naming('src/config/environment.ts')).toEqual([
      "import { getFirestoreDatabase, isNonProdDatabase } from './firestore-database.js';",
      'if (!isNonProdDatabase()) return false;',
    ]);
  });

  // The skip helper answers the same question, so it could carry it into a log line. Each
  // file below skips prod work with it, once: its import and its one call.
  it('skipOnNonProdDatabase is used by the publishers, the workers and the graph writer only', () => {
    expect(filesWith(/\bskipOnNonProdDatabase\b/)).toEqual({
      'src/config/environment.ts': 2,
      'src/memory/spanner-graph/graph-write-gate.ts': 2,
      'src/services/communication/intelligence-publisher.ts': 2,
      'src/services/pubsub/pubsub-client.ts': 2,
      'src/workers/base-worker.ts': 2,
    });
  });

  // The old question spelt out: the env key or the helper's answer compared with something,
  // or anything compared with prod's name. Binding a client to the name is not a comparison.
  it('no production file compares the database name for itself', () => {
    const compare = String.raw`(?:===?|!==?|\.startsWith\(|\.endsWith\(|\.includes\(|\.match\(|\.test\()`;
    const name = String.raw`(?:\bFIRESTORE_DATABASE\b['"\]]*|\bgetFirestoreDatabase\([^)]*\)|['"]\(default\)['"])`;
    const spelt = new RegExp(`${name}\\s*\\??${compare}|${compare}\\s*[\\w.?[]*${name}`);
    expect(filesWith(spelt)).toEqual({
      'src/config/firestore-database.ts': 2,
      // The cost label on a model call (dev or prod): a label, no caller words.
      'src/config/gemini-billing-labels.ts': 1,
      // The database pin: a client bound to another database than the process names.
      'src/utils/firestore-db-pin.ts': 1,
    });
  });
});
