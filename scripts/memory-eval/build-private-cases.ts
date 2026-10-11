#!/usr/bin/env tsx
/**
 * Builds memory-benchmark cases from one consenting caller's real calls,
 * for longmem.ts --cases. Scripted histories are cleaner than real speech,
 * and real speech is where extraction breaks.
 *
 * Reads bogle_users/{uid}/conversations/{id}/turns for an allowlisted uid,
 * groups substantial calls into histories, and has the model that already
 * hears these calls (Gemini) write questions from the raw transcripts. A
 * case is kept only if its quoted evidence is really in what the caller
 * said. Output goes to a private directory outside the repo, never to a
 * fixture; a markdown copy is written for the caller to spot-check.
 *
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 pnpm tsx scripts/memory-eval/build-private-cases.ts \
 *     [--histories 4] [--calls 4] [--out ~/Documents/ferni-private-bench]
 */
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { getFirestoreDb } from '../../src/utils/firestore-utils.js';
import { callLLM } from '../../src/services/llm/llm-utils.js';
import {
  caseFile,
  generationPrompt,
  groupIntoHistories,
  verifiedCases,
  type GeneratedCase,
  type StoredCall,
} from './private-cases-lib.js';

/** Callers who agreed to their calls being used this way (Seth, 2026-10-11). */
const ALLOWED: Record<string, string> = { vdSfkCCXaiXpnVCvgKxHMYrNFr72: 'Seth' };
/** A call this short says too little to ask about. */
const MIN_USER_TURNS = 8;

function millis(v: unknown): number {
  if (v && typeof (v as { toDate?: unknown }).toDate === 'function') {
    return (v as { toDate(): Date }).toDate().getTime();
  }
  return Date.parse(String(v));
}

async function loadCalls(uid: string): Promise<StoredCall[]> {
  const db = getFirestoreDb();
  if (!db) throw new Error('no Firestore');
  const convs = await db.collection('bogle_users').doc(uid).collection('conversations').get();
  const calls: StoredCall[] = [];
  for (const c of convs.docs) {
    const turns = (await c.ref.collection('turns').get()).docs
      .map((d) => d.data())
      .map((t) => ({
        role: t.role,
        content: String(t.content ?? '').trim(),
        at: millis(t.timestamp),
      }))
      .filter((t) => Number.isFinite(t.at))
      .sort((a, b) => a.at - b.at);
    const user = turns.filter((t) => t.role === 'user' && t.content).map((t) => t.content);
    if (user.length >= MIN_USER_TURNS) calls.push({ id: c.id, at: turns[0]!.at, user });
  }
  return calls;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const uid = flag('--uid') ?? 'vdSfkCCXaiXpnVCvgKxHMYrNFr72';
  const name = ALLOWED[uid];
  if (!name) throw new Error(`${uid} has not agreed to this; add them to ALLOWED first`);
  const out = resolve(flag('--out') ?? join(homedir(), 'Documents', 'ferni-private-bench'));
  if (out.startsWith(resolve('.')))
    throw new Error(`refusing to write real calls inside the repo: ${out}`);
  const runDate = new Date().toISOString().slice(0, 10);

  const calls = await loadCalls(uid);
  const histories = groupIntoHistories(
    calls,
    Number(flag('--calls') ?? 4),
    Number(flag('--histories') ?? 4),
    runDate,
    name
  );
  const cases = new Map<string, GeneratedCase[]>();
  for (const h of histories) {
    const raw =
      (await callLLM(generationPrompt(h, runDate, 2), { temperature: 0.2, maxTokens: 4000 })) ?? '';
    const { kept, dropped } = verifiedCases(raw, h);
    cases.set(h.id, kept);
    console.log(
      `${h.id}: ${h.sessions.length} calls, ${kept.length} cases kept, ${dropped} dropped`
    );
  }

  mkdirSync(out, { recursive: true, mode: 0o700 });
  chmodSync(out, 0o700);
  const file = join(out, `cases-${runDate}.json`);
  writeFileSync(file, JSON.stringify(caseFile(runDate, histories, cases), null, 2), {
    mode: 0o600,
  });
  const review = [...cases].flatMap(([id, list]) => [
    `## ${id}`,
    ...list.map(
      (c) =>
        `- [${c.category}] ${c.ask}\n  - gold: ${c.gold}\n  - evidence: ${c.evidence.join(' | ') || '(none)'}`
    ),
  ]);
  writeFileSync(join(out, `cases-${runDate}.md`), review.join('\n') + '\n', { mode: 0o600 });
  console.log(`${calls.length} substantial calls; cases: ${file}`);
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(String(error));
  process.exit(1);
});
