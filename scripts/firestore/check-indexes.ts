#!/usr/bin/env tsx
/**
 * Are the composite indexes declared in firestore.indexes.json live in prod?
 *
 * Read-only: lists prod indexes with
 *   gcloud firestore indexes composite list --project <p> --format=json
 * and compares. Changes nothing. Exits 1 when a declared index is missing or
 * not READY in prod, 0 otherwise. Indexes in prod that the repo does not
 * declare are counted for information (--all lists them): johnb-2025 also
 * holds other apps' collections, so most of them are not ours.
 *
 * The unit test (scripts/firestore/__tests__/index-coverage.test.ts) checks
 * that every query in src has a declared index; this checks that declared
 * means deployed. Deploying indexes is a separate, deliberate step.
 *
 * Usage:
 *   npx tsx scripts/firestore/check-indexes.ts                     # johnb-2025
 *   npx tsx scripts/firestore/check-indexes.ts --project <id>
 *   npx tsx scripts/firestore/check-indexes.ts --prod-json <file>  # a saved listing
 *   npx tsx scripts/firestore/check-indexes.ts --all               # list undeclared too
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { diffIndexes, type ListedIndex } from './index-needs.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function prodIndexes(): ListedIndex[] {
  const saved = arg('--prod-json');
  if (saved) return JSON.parse(readFileSync(saved, 'utf8')) as ListedIndex[];
  const project = arg('--project') ?? 'johnb-2025';
  const out = execFileSync(
    'gcloud',
    ['firestore', 'indexes', 'composite', 'list', '--project', project, '--format=json'],
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
const diff = diffIndexes(declared, prod);

const section = (title: string, rows: string[]): void => {
  console.log(`\n${title}: ${rows.length}`);
  for (const r of rows) console.log(`  ${r}`);
};
console.log(`declared ${declared.length}, prod ${prod.length}`);
section('MISSING in prod (declared, not deployed)', diff.missing);
section('NOT READY in prod', diff.notReady);
if (process.argv.includes('--all')) section('in prod, not declared (info)', diff.undeclared);
else console.log(`\nin prod, not declared (info): ${diff.undeclared.length} (--all lists them)`);

process.exit(diff.missing.length + diff.notReady.length > 0 ? 1 : 0);
