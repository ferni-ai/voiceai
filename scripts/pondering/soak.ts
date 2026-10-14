#!/usr/bin/env tsx
/**
 * Pondering soak: runs the real pondering pass for allowlisted callers (Seth
 * and the voice-eval seed users) so its output can be read before PONDERING
 * goes on anywhere. Dry run by default: it prints what would be stored and
 * writes nothing.
 *
 *   pnpm tsx scripts/pondering/soak.ts                     # Seth, dry run
 *   pnpm tsx scripts/pondering/soak.ts --eval-users        # the voice-eval seed users too
 *   pnpm tsx scripts/pondering/soak.ts --write             # store results (checks prod first)
 *   pnpm tsx scripts/pondering/soak.ts --purge             # delete what the soak stored
 *
 * --write refuses to run while PONDERING is set on a prod service (see
 * soak-lib.ts). Results go to stdout and to a JSON file for review.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { callLLM } from '../../src/services/llm/llm-utils.js';
import { ponder, type PonderLlm } from '../../src/intelligence/pondering/pondering.js';
import {
  SUMMARIES_READ,
  ponderUser,
  toPonderSummary,
} from '../../src/intelligence/pondering/ponder-user.js';
import { EVAL_PREFIX } from '../voice-eval/eval-users.js';
import {
  PROD_SERVICES,
  assertSoakAllowed,
  parseSoakArgs,
  serviceHasPondering,
} from './soak-lib.js';

const PROJECT = 'johnb-2025';
const REGION = 'us-central1';
const SOAK_ENV = { PONDERING: 'on' };

const llm: PonderLlm = (prompt) => callLLM(prompt, { maxTokens: 1500, temperature: 0.4 });

function assertProdPonderingOff(): void {
  for (const service of PROD_SERVICES) {
    const out = execFileSync(
      'gcloud',
      [
        'run',
        'services',
        'describe',
        service,
        '--region',
        REGION,
        '--project',
        PROJECT,
        '--format=json',
      ],
      { encoding: 'utf8' }
    );
    if (serviceHasPondering(JSON.parse(out)))
      throw new Error(
        `PONDERING is set on ${service}; the soak would race the real job. Not writing.`
      );
  }
}

async function evalUserIds(db: Firestore, limit: number): Promise<string[]> {
  const snap = await db
    .collection('bogle_users')
    .orderBy(FieldPath.documentId())
    .startAt(EVAL_PREFIX)
    .endAt(`${EVAL_PREFIX}`)
    .select()
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.id);
}

async function main(): Promise<void> {
  const args = parseSoakArgs(process.argv.slice(2));
  if (getApps().length === 0) initializeApp({ projectId: PROJECT });
  const db = getFirestore();
  const uids = [...args.uids, ...(args.evalUsers ? await evalUserIds(db, args.evalLimit) : [])];
  assertSoakAllowed(uids); // again, after the seed-user query

  if (args.purge) {
    for (const uid of uids) {
      const pi = db.collection('bogle_users').doc(uid).collection('predictive_intelligence');
      await pi.doc('pondering').delete();
    }
    console.log(`Purged pondering for ${uids.length} caller(s).`);
    return;
  }
  if (args.write) assertProdPonderingOff();

  const now = new Date();
  const report: Record<string, unknown> = {};
  for (const uid of uids) {
    const user = db.collection('bogle_users').doc(uid);
    const summarySnap = await user
      .collection('summaries')
      .orderBy('timestamp', 'desc')
      .limit(SUMMARIES_READ)
      .get();
    if (summarySnap.empty) {
      report[uid] = { status: 'no-calls' };
      continue;
    }
    if (args.write) {
      report[uid] = await ponderUser(db, uid, llm, { now, env: SOAK_ENV });
    } else {
      const summaries = summarySnap.docs.map((d) => toPonderSummary(d.id, d.data()));
      const pondering = await ponder(summaries, now.toISOString().slice(0, 10), llm);
      report[uid] = { status: 'dry-run', summaries: summaries.length, pondering };
    }
  }

  const dir = join(tmpdir(), 'pondering-soak');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `soak-${now.toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`\n${args.write ? 'Stored' : 'Dry run, nothing stored'}. Report: ${file}`);
}

main().catch((error: unknown) => {
  console.error(String(error));
  process.exitCode = 1;
});
