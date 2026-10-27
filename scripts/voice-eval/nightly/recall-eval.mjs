#!/usr/bin/env node
// Held-out recall eval (recall-ledger lane 6): seed what Ferni did for an eval owner, ask the
// questions through a real dev call (run.sh), grade the replies with a Gemini judge panel and
// score per ability bucket (recall-score.mjs).
//
// usage: recall-eval.mjs [--set FILE] [--out DIR] [--summary FILE] [--worlds N]
//                        [--plant no-records] [--env dev|local] [--rejudge] [--dry-run]
//   --set     default $RECALL_SET, else ~/Documents/voiceai-evidence/recall-eval/heldout/set.json.
//             The held-out set never enters the repo; the tests carry a public synthetic sample.
//   --out     transcripts and verdicts (question text: outside the repo; default
//             ~/Documents/voiceai-evidence/recall-eval/runs/<date>[-<plant>])
//   --summary numbers only (ids, buckets, counts) for the scorecard, e.g. OUT/recall.json
//   --worlds  N worlds, rotated by day so every world comes round (default all)
//   --plant no-records  the planted regression: contacts only, no record of anything done
//   --rejudge grade transcripts already in --out instead of calling
// Env: RECALL_JUDGE_K (panel size, default 3), JUDGE_MODEL (default pro), GCP_PROJECT.
// Exit 1 when a recall-ledger check or the invented-call gate (above its known gap) in
// capabilities.json FAILs; 2 harness error. Seeds a dev database only, never '(default)'.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { evalDatabase } from '../eval-database.mjs';
import { askGemini } from '../judge.mjs';
import { hashSeed, shuffled } from '../judge-stats.mjs';
import { judgeModel } from '../../lib/judge-model.mjs';
import { judgeCheck } from './scorecard.mjs';
import { docsFor } from './recall-world.mjs';
import * as score from './recall-score.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EVIDENCE = join(homedir(), 'Documents/voiceai-evidence/recall-eval');
const OPENER = 'Hey Ferni, I have a few quick questions about stuff you did for me.';
const DEV = 'johnb-2025';

/** The worlds tonight: all, or n of them from a day-rotated offset. */
export function pickWorlds(worlds, n, now) {
  if (!n || n >= worlds.length) return worlds;
  const start = (Math.floor(now.getTime() / 86_400_000) * n) % worlds.length;
  return Array.from({ length: n }, (_, i) => worlds[(start + i) % worlds.length]);
}

/** The recall-ledger checks and the invented-call gate, judged; exit 1 when one FAILs. */
export function verdicts(summary, caps) {
  const rows = ['recall-ledger', 'invented-call'].flatMap((cap) =>
    (caps.capabilities[cap]?.checks ?? []).map((c) => {
      const { value } = score.recallValue(summary, c.field);
      const k = judgeCheck(c, value);
      const fails = k.verdict === 'FAIL' && !(c.known && value <= c.known.max);
      return { cap, id: c.id, value, ...k, fails };
    })
  );
  return { rows, exit: rows.some((r) => r.fails) ? 1 : 0 };
}

/** The database an eval owner is seeded in; throws for prod's '(default)' or a real uid. */
export function seedTarget(env, uid, vars = process.env) {
  const database = evalDatabase(env, { vars });
  if (database === '(default)') throw new Error(`refusing to seed ${database} (prod's database)`);
  if (!/^voice-eval-./.test(uid)) throw new Error('seed: uid must start with voice-eval-');
  return database;
}

/** Seeds a long-time owner: a valid partner profile (seed-tier.ts) with 40 past calls, so
 *  isReturningUser holds and Ferni never greets them as a stranger, then the world's docs. */
export async function seed(uid, docs, env) {
  const database = seedTarget(env, uid);
  const args = `tsx ${join(HERE, '../seed-tier.ts')} --project ${DEV} --database ${database}`;
  const opts = { cwd: join(HERE, '../../..'), stdio: ['ignore', 'ignore', 'inherit'] };
  execFileSync('npx', [...args.split(' '), '--uid', uid, '--tier', 'partner'], opts);
  const { Firestore } = await import('@google-cloud/firestore');
  const db = new Firestore({ projectId: DEV, databaseId: database });
  const batch = db.batch();
  const past = { totalConversations: 40, totalMinutesTalked: 600 };
  batch.set(db.doc(`bogle_users/${uid}`), past, { merge: true });
  for (const d of docs) batch.set(db.doc(d.path), d.data);
  await batch.commit();
}

/** The panel's verdicts on one world's answers: k samples, each in its own item order. */
export async function gradeAnswers(world, answers, now, k = 3) {
  const ctx = { model: judgeModel(process.env, 'pro'), project: process.env.GCP_PROJECT ?? DEV };
  const samples = [];
  for (let i = 0; i < k; i++) {
    const order = shuffled([...world.items.keys()], hashSeed(`${world.id}#${i}`));
    const prompt = score.judgePrompt(world, world.items, answers, now, order);
    try {
      samples.push(await askGemini(prompt, ctx));
    } catch (e) {
      console.error(`recall-eval: ${world.id} judge sample ${i}: ${e.message.slice(0, 120)}`);
    }
  }
  return { answers, samples, graded: score.combinePanel(world.items, samples) };
}

/** Summary, verdicts and the printed table for graded items; returns the exit code. */
export function report(graded, meta, file) {
  const summary = score.summarize(graded);
  const v = verdicts(summary, JSON.parse(readFileSync(join(HERE, 'capabilities.json'), 'utf8')));
  const result = { ...meta, ...summary, items: graded, verdicts: v.rows, exit: v.exit };
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  console.log(score.renderTable(summary, meta.plant ? `recall (${meta.plant})` : 'recall'));
  for (const r of v.rows) console.log(`${r.verdict.padEnd(4)} ${r.cap}.${r.id}=${r.value ?? '-'}`);
  return v.exit;
}

async function main(argv) {
  const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
  const [now, plant, env, dry] = [
    new Date(),
    opt('--plant'),
    opt('--env', 'dev'),
    argv.includes('--dry-run'),
  ];
  if (plant && plant !== 'no-records') throw new Error('--plant takes no-records');
  const setFile = opt('--set', process.env.RECALL_SET ?? join(EVIDENCE, 'heldout/set.json'));
  if (!existsSync(setFile)) throw new Error(`no question set at ${setFile}`);
  const set = JSON.parse(readFileSync(setFile, 'utf8'));
  const worlds = pickWorlds(set.worlds, Number(opt('--worlds', 0)), now);
  const date = now.toISOString().slice(0, 10);
  const out = opt('--out', join(EVIDENCE, 'runs', `${date}${plant ? `-${plant}` : ''}`));
  const stamp = now.toISOString().replace(/\D/g, '').slice(0, 14);
  const graded = [];
  for (const world of worlds) {
    const sc = `recall-${world.id}`;
    const uid = `voice-eval-${sc}-${stamp}-${Math.random().toString(16).slice(2, 6)}`;
    const [docs, json] = [docsFor(world, uid, now, { plant }), join(out, `${sc}-r.json`)];
    if (dry) {
      console.log(`PLAN ${world.id}: ${docs.length} docs, ${world.items.length} questions`);
      continue;
    }
    const seeded = join(out, `${sc}.seeded.json`); // when it was seeded: --rejudge grades as of then
    if (!argv.includes('--rejudge') || !existsSync(json)) {
      await seed(uid, docs, env);
      writeFileSync(seeded, JSON.stringify({ now: now.toISOString(), uid, docs: docs.length }));
      mkdirSync(join(out, 'scenarios'), { recursive: true });
      const lines = [OPENER, ...world.items.map((it) => it.q)];
      writeFileSync(join(out, 'scenarios', `${sc}.txt`), `${lines.join('\n')}\n`);
      const vars = { EVAL_SCENARIO_DIR: join(out, 'scenarios'), EVAL_OUT_DIR: out };
      const opts = { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, ...vars } };
      opts.env.EVAL_TZ = world.tz ?? 'America/New_York';
      execFileSync('zsh', [join(HERE, '../run.sh'), env, sc, 'r', uid], opts);
    }
    const run = JSON.parse(readFileSync(json, 'utf8'));
    const answers = score.answersOf(run, world.items.length, 1);
    const asOf = existsSync(seeded) ? new Date(JSON.parse(readFileSync(seeded, 'utf8')).now) : now;
    const g = await gradeAnswers(world, answers, asOf, Number(process.env.RECALL_JUDGE_K ?? 3));
    const verdict = JSON.stringify({ world: world.id, plant, ...g }, null, 2);
    writeFileSync(join(out, `${sc}.graded.json`), verdict);
    graded.push(...g.graded);
    const right = g.graded.filter((x) => x.correct).length;
    console.error(`recall-eval: ${world.id} ${right}/${g.graded.length} correct`);
  }
  if (dry) return 0;
  const meta = {
    date,
    set: basename(setFile),
    plant: plant ?? null,
    worlds: worlds.map((w) => w.id),
  };
  return report(graded, meta, opt('--summary', join(out, 'recall.json')));
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(`recall-eval: ${e.message}`);
      process.exit(2);
    }
  );
}
