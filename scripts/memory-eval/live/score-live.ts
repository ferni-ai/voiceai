#!/usr/bin/env tsx
/**
 * Scores the live memory eval (run-live.sh): Ferni's first line of each quiz
 * call is graded as the opener, and his reply to each quiz line against the
 * persona's gold answer, with the benchmark's judge. Two labels compare runs
 * (e.g. flags off and on), paired by question. A missing quiz file or start
 * time fails the run unless --allow-missing is passed.
 *
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 pnpm tsx scripts/memory-eval/live/score-live.ts <label> [label2] [--allow-missing]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { callLLM } from '../../../src/services/llm/llm-utils.js';
import {
  RunDays,
  callerZone,
  failureCount,
  formatPaired,
  formatReport,
  judgePrompt,
  localDay,
  paired,
  parseYesNo,
  type CaseResult,
} from '../longmem-lib.js';
import { PERSONAS } from '../fixtures/live-personas.js';
import { agentLines, repliesAfter, type EvalRun } from './transcript.js';

const OUT = join(import.meta.dirname, '../../voice-eval/out');

async function score(label: string, allowMissing: boolean): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const p of PERSONAS) {
    const file = join(OUT, `memlive-${p.id}-quiz-${label}.json`);
    const missing = (what: string) => {
      if (!allowMissing) throw new Error(`${what} (pass --allow-missing to score without it)`);
      console.log(`skipped ${p.id}: ${what}`);
    };
    if (!existsSync(file)) {
      missing(`missing ${file}`);
      continue;
    }
    const run = JSON.parse(readFileSync(file, 'utf8')) as EvalRun;
    if (run.wallT0 === undefined) {
      missing(`${file} has no wallT0, so relative dates cannot be resolved`);
      continue;
    }
    // The calls happened on the run's own day: relative dates are as of it.
    // The caller's day in run.sh's zone (EVAL_TZ), not UTC.
    const days = new RunDays(localDay(run.wallT0, callerZone()));
    const opener = agentLines(
      run,
      -Infinity,
      run.events.find((e) => e.who === 'user')?.t ?? Infinity
    );
    const push = async (
      category: CaseResult['category'],
      ask: string,
      gold: string,
      response: string
    ) => {
      // A blank reply is a failure; the judge is not asked to grade nothing.
      const noAnswer = response.trim() === '';
      const judgeReply = noAnswer
        ? null
        : await callLLM(judgePrompt(category, ask, gold, response), {
            temperature: 0,
            maxTokens: 10,
          });
      const correct = parseYesNo(judgeReply);
      results.push({
        history: p.id,
        category,
        ask,
        gold,
        note: null,
        response,
        noAnswer,
        correct,
        retrieved: null,
        judgeReply,
      });
      const mark = noAnswer ? '!' : correct ? '✓' : correct === false ? '✗' : '?';
      console.log(`${mark} ${label} ${p.id} [${category}] ${ask} → ${response}`);
    };
    await push('opener', '(Ferni opens the call)', p.opener, opener);
    const replies = repliesAfter(run);
    // results[0] is the caller's hello; quiz lines follow in order.
    for (const [i, q] of p.quiz.entries())
      await push(q.category, q.line, q.gold(days), replies[i + 1] ?? '');
  }
  return results;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const allowMissing = argv.includes('--allow-missing');
  const labels = argv.filter((a) => a !== '--allow-missing');
  if (labels.length === 0)
    throw new Error('usage: score-live.ts <label> [label2] [--allow-missing]');
  const runs: CaseResult[][] = [];
  for (const label of labels) runs.push(await score(label, allowMissing));
  const sections = labels.map((l, i) => `== ${l}\n${formatReport(runs[i]!)}`);
  if (runs.length === 2)
    sections.push(formatPaired(labels[0]!, labels[1]!, paired(runs[0]!, runs[1]!)));
  const dir = join(tmpdir(), 'longmem');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `live-${labels.join('-vs-')}.json`);
  writeFileSync(file, JSON.stringify({ labels, runs }, null, 2));
  console.log(`\n${sections.join('\n\n')}\n\nReport: ${file}`);
  const failures = runs.reduce((sum, run) => sum + failureCount(run), 0);
  if (failures > 0) {
    console.error(
      `${failures} replies with no answer or no judge verdict: see the Failures column`
    );
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(String(error));
  process.exitCode = 1;
});
