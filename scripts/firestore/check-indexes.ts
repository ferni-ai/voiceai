#!/usr/bin/env tsx
/**
 * Are the composite indexes declared in firestore.indexes.json live in prod
 * (the '(default)' database), or in another database with --database?
 *
 * Read-only: lists the database's indexes with
 *   gcloud firestore indexes composite list --project <p> --database <db> --format=json
 * and compares, both ways. Changes nothing. Exits 1 when:
 *   - a declared index is missing or not READY in prod (code would throw
 *     FAILED_PRECONDITION), or
 *   - prod holds an index the repo does not declare (drift: someone created it
 *     by hand, so a fresh environment would lack it). --allow-undeclared turns
 *     this half back into information.
 *
 * firestore.indexes.json declares every live composite index in johnb-2025,
 * other apps' included, so a fresh environment matches prod and indexes can be
 * deployed before the code that needs them.
 *
 * The unit test (scripts/firestore/__tests__/index-coverage.test.ts) checks
 * that every query in src has a declared index; this checks that declared
 * means deployed. Deploying indexes is a separate, deliberate step.
 *
 * Usage:
 *   npx tsx scripts/firestore/check-indexes.ts                     # johnb-2025
 *   npx tsx scripts/firestore/check-indexes.ts --project <id>
 *   npx tsx scripts/firestore/check-indexes.ts --database ferni-dev   # dev; default '(default)'
 *   npx tsx scripts/firestore/check-indexes.ts --prod-json <file>  # a saved listing
 *   npx tsx scripts/firestore/check-indexes.ts --allow-undeclared  # prod-only indexes don't fail
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { databaseOf, diffIndexes, type ListedIndex } from './index-needs.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const database = arg('--database') ?? '(default)';

function prodIndexes(): ListedIndex[] {
  const saved = arg('--prod-json');
  if (saved) return JSON.parse(readFileSync(saved, 'utf8')) as ListedIndex[];
  const project = arg('--project') ?? 'johnb-2025';
  const out = execFileSync(
    'gcloud',
    [
      'firestore',
      'indexes',
      'composite',
      'list',
      '--project',
      project,
      `--database=${database}`,
      '--format=json',
    ],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
  return JSON.parse(out) as ListedIndex[];
}

const declared = (
  JSON.parse(readFileSync(join(process.cwd(), 'firestore.indexes.json'), 'utf8')) as {
    indexes: ListedIndex[];
  }
).indexes;
const prod = prodIndexes();
// A saved listing from another database would compare the wrong environment.
const foreign = prod.filter((i) => databaseOf(i) && databaseOf(i) !== database);
if (foreign.length) {
  console.error(`${foreign.length} listed index(es) are not in database ${database}; refusing`);
  process.exit(2);
}
const diff = diffIndexes(declared, prod);

const section = (title: string, rows: string[]): void => {
  console.log(`\n${title}: ${rows.length}`);
  for (const r of rows) console.log(`  ${r}`);
};
console.log(`declared ${declared.length}, ${database} ${prod.length}`);
section(`MISSING in ${database} (declared, not deployed)`, diff.missing);
section(`NOT READY in ${database}`, diff.notReady);
section(`in ${database}, NOT DECLARED (add them to firestore.indexes.json)`, diff.undeclared);

const allowUndeclared = process.argv.includes('--allow-undeclared');
const failures =
  diff.missing.length + diff.notReady.length + (allowUndeclared ? 0 : diff.undeclared.length);
process.exit(failures > 0 ? 1 : 0);
