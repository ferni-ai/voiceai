/**
 * Two questions are asked of FIRESTORE_DATABASE, and a name nobody expected must fail each
 * to its own safe side:
 * - isNonProdDatabase(): "skip prod work?" An unknown name is not prod's, so work is skipped.
 * - isKnownDevDatabase(): "may this process do what only dev may, such as log words?" An
 *   unknown name is not dev's, so it may not.
 *
 * Every row asserts both. Before isKnownDevDatabase existed the logging sites asked the first
 * question, so a prod process with a misspelt name logged what callers said.
 *
 * The name is taken as written. Space around it is part of it: such a name is bound as it is
 * (so prod work is skipped, as before), and it is never dev's.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
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
  'a single space': { set: ' ', ...unknown(' ') },
  'a tab': { set: '\t', ...unknown('\t') },
  'only space and a newline': { set: ' \n', ...unknown(' \n') },
  "prod's name": { set: '(default)', ...PROD },
  "prod's name with space before it": { set: ' (default)', ...unknown(' (default)') },
  "prod's name with a newline after it": { set: '(default)\n', ...unknown('(default)\n') },
  "dev's name": { set: 'ferni-dev', ...DEV },
  "dev's name with space before it": { set: ' ferni-dev', ...unknown(' ferni-dev') },
  "dev's name with a newline after it": { set: 'ferni-dev\n', ...unknown('ferni-dev\n') },
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

  it('no name is both prod and dev, and one name only is dev', () => {
    const rows = Object.values(ROWS);
    for (const { nonProd, knownDev } of rows) expect(knownDev && !nonProd).toBe(false);
    // Prod is unset, empty and its own name; dev is one name; every other row is neither.
    expect(rows.filter((r) => !r.nonProd).map((r) => r.set)).toEqual([undefined, '', '(default)']);
    expect(rows.filter((r) => r.knownDev).map((r) => r.set)).toEqual(['ferni-dev']);
    expect(rows.filter((r) => r.nonProd && !r.knownDev).length).toBeGreaterThan(10);
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
/** Each production file with a code line that matches, and those lines as written. */
const linesWith = (matches: (line: string) => boolean): Record<string, string[]> =>
  Object.fromEntries(
    PRODUCTION.map((file) => [file, codeLines(file).filter(matches)] as const)
      .filter(([, lines]) => lines.length > 0)
      .sort()
  );
/** Each production file with a code line that matches, and how many such lines it has. */
const filesWith = (pattern: RegExp): Record<string, number> =>
  Object.fromEntries(
    Object.entries(linesWith((line) => pattern.test(line))).map(([file, lines]) => [
      file,
      lines.length,
    ])
  );
/** The pin's refusal message, the line that names the env key (a template in the source). */
const PIN_MESSAGE_LINE =
  '`"${expected}" (FIRESTORE_DATABASE, FIRESTORE_DB_PIN=refuse; utils/firestore-db-pin.ts).`';

describe('isNonProdDatabase is only for skipping prod work', () => {
  // A new log line that asks it would bring the fail-open back. Each test below closes one
  // way of asking it: by name, through a wrapper, through the skip helper, spelt out, or
  // through any new line that mentions the database name at all. Not closed, and left to
  // review: the env key or the helper's name built from pieces, the name read back from
  // a client or an options object a plain bind line made (its databaseId, on a later line),
  // a new comparison of a variable that already holds the name in a file whose lines are
  // written out below, and a walk over the whole environment (Object.entries) that never
  // names the key.
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
  // file below skips prod work with it, once: its import and its one call. The graph writer's
  // gate is deleted with the Spanner graph (#3711, in the merge queue as this is written), so
  // it is listed for as long as the file is there: this holds whichever of the two merges first.
  it('skipOnNonProdDatabase is used by the publishers, the workers and the graph writer only', () => {
    const graphGate = 'src/memory/spanner-graph/graph-write-gate.ts';
    expect(filesWith(/\bskipOnNonProdDatabase\b/)).toEqual({
      'src/config/environment.ts': 2,
      ...(existsSync(join(ROOT, graphGate)) ? { [graphGate]: 2 } : {}),
      'src/services/communication/intelligence-publisher.ts': 2,
      'src/services/pubsub/pubsub-client.ts': 2,
      'src/workers/base-worker.ts': 2,
    });
  });

  /** The database's name in code: the env key, the helper's answer, or prod's name written out. */
  const name = String.raw`(?:\bFIRESTORE_DATABASE\b['"\]]*|\bgetFirestoreDatabase\([^)]*\)|['"]\(default\)['"])`;

  // The old question spelt out: the env key or the helper's answer compared with something,
  // or anything compared with prod's name. Binding a client to the name is not a comparison.
  it('no production file compares the database name for itself', () => {
    const compare = String.raw`(?:===?|!==?|\.startsWith\(|\.endsWith\(|\.includes\(|\.match\(|\.test\()`;
    const spelt = new RegExp(`${name}\\s*\\??${compare}|${compare}\\s*[\\w.?[]*${name}`);
    expect(filesWith(spelt)).toEqual({
      'src/config/firestore-database.ts': 2,
      // The cost label on a model call (dev or prod): a label, no caller words.
      'src/config/gemini-billing-labels.ts': 1,
      // The database pin: a client bound to another database than the process names.
      'src/utils/firestore-db-pin.ts': 1,
    });
  });

  // Every other way of asking goes through the name itself: a method on it (trim, lower case),
  // its length, a template literal, a negation, a ternary, a switch, a lookup, a helper of
  // one's own, a destructured or spread read, the name kept in a variable. So every production
  // line that mentions the name (the env key, the helper, or prod's name written out) is
  // accounted for, as a whole line. It is the helper imported under its own name, or a client
  // bound to the name and nothing else on the line, or it is written out below with why. A new
  // line of any other shape is red until someone reads it and writes it here: it must not
  // decide what is logged. A line below that changes is red too.
  it('mentions the database name only on a plain import or bind line, or on a line written out here', () => {
    const mention = /\bFIRESTORE_DATABASE\b|\bgetFirestoreDatabase\b|['"`]\(default\)['"`]/;
    // The name as a client takes it: the helper's answer, or the env read with prod's for unset.
    const bound = String.raw`(?:getFirestoreDatabase\(\)|process\.env\.FIRESTORE_DATABASE \|\| '\(default\)')`;
    const option = String.raw`databaseId: (?:[\w?.]+ \|\| )?${bound}`;
    const plain = [
      // The helper imported under its own name (no alias, no rename).
      /^import \{(?![^}]*\bas\b)[^}]*\} from '[^']*\/config\/(?:environment|firestore-database|index)\.js';$/,
      /^const \{(?![^}]*:)[^}]*\} = await import\('[^']*\/config\/environment\.js'\);$/,
      // A client bound to the name: the option on a line of its own,
      new RegExp(`^${option},$`),
      // a client made on one line,
      new RegExp(
        String.raw`^(?:(?:this\.)?\w+ = (?:\w+ \|\| )?)?(?:new Firestore|sharedFirestore)\(\{ (?:\w+: [\w()]+, )?${option} \}\);$`
      ),
      // or the name handed to getFirestore.
      new RegExp(
        String.raw`^(?:return |\w+ = )(?:getFirestore|getDefaultFirestore)\((?:\w+\(\), )?${bound}\);$`
      ),
    ];
    const other = (line: string): boolean =>
      mention.test(line) && !plain.some((form) => form.test(line));
    expect(linesWith(other)).toEqual({
      // The child's warm-up read: a client bound inline, then one fixed document read.
      'src/agents/gce/child-firestore-warm.ts': [
        'await sharedFirestore({ databaseId: getFirestoreDatabase() }).doc(STRICT_WARMUP_DOC).get();',
      ],
      // The generated list of every env name the code reads.
      'src/config/env-read-names.generated.ts': ['FIRESTORE_DATABASE'],
      // The import from the module, the re-export of the helper, and the config object's entry.
      'src/config/environment.ts': [
        "import { getFirestoreDatabase, isNonProdDatabase } from './firestore-database.js';",
        'export { getFirestoreDatabase };',
        'getFirestoreDatabase,',
      ],
      // The helper and the two questions.
      'src/config/firestore-database.ts': [
        'export function getFirestoreDatabase(',
        "return env.FIRESTORE_DATABASE || '(default)';",
        "return getFirestoreDatabase(env) !== '(default)';",
        'return getFirestoreDatabase(env) === DEV_FIRESTORE_DATABASE;',
      ],
      // The cost label on a model call (dev or prod): a label, no caller words.
      'src/config/gemini-billing-labels.ts': [
        'const db = env.FIRESTORE_DATABASE;',
        "return nodeEnv === 'staging' || (db && db !== '(default)') ? 'dev' : 'prod';",
      ],
      // The helper in the config package's export list.
      'src/config/index.ts': ['getFirestoreDatabase,'],
      // The database pin: a client bound to another database than the process names.
      'src/utils/firestore-db-pin.ts': [
        PIN_MESSAGE_LINE,
        'const expected = getFirestoreDatabase(env);',
        "const actual = databaseOf(this) ?? '(default)';",
        "if (firestoreDbPinMode(env) === 'off' || actual === getFirestoreDatabase(env)) {",
        "const database = this.databaseId ?? '(default)';",
      ],
      // A client with no database named is prod's.
      'src/utils/shared-firestore.ts': [
        "return { databaseId: settings.databaseId ?? '(default)', projectId, ignoreUndefinedProperties };",
      ],
      // Prod's name as a constant, for the synthetic test user's guard.
      'src/utils/synthetic-user.ts': ["export const PROD_FIRESTORE_DATABASE = '(default)';"],
    });
  });
});
