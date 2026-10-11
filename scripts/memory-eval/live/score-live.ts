#!/usr/bin/env tsx
/**
 * Scores the live memory eval (run-live.sh): Ferni's first line of each quiz
 * call is graded as the opener, and his reply to each quiz line against the
 * persona's gold answer, with the benchmark's judge. Two labels compare runs
 * (e.g. flags off and on), paired by question.
 *
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 pnpm tsx scripts/memory-eval/live/score-live.ts <label> [label2]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { callLLM } from '../../../src/services/llm/llm-utils.js';
import {
  RunDays,
  formatPaired,
  formatReport,
  judgePrompt,
  paired,
  parseYesNo,
  type CaseResult,
} from '../longmem-lib.js';
import { PERSONAS } from '../fixtures/live-personas.js';
import { agentLines, repliesAfter, type EvalRun } from './transcript.js';

const OUT = join(import.meta.dirname, '../../voice-eval/out');

async function judge(prompt: string): Promise<boolean | null> {
  return parseYesNo(await callLLM(prompt, { temperature: 0, maxTokens: 10 }));
}

async function score(label: string): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const p of PERSONAS) {
    const file = join(OUT, `memlive-${p.id}-quiz-${label}.json`);
    if (!existsSync(file)) {
      console.log(`missing ${file}`);
      continue;
    }
    const run = JSON.parse(readFileSync(file, 'utf8')) as EvalRun;
    // The calls happened on the run's own day: relative dates are as of it.
    const days = new RunDays(
      // The caller's day, in run.sh's caller timezone (EVAL_TZ), not UTC.
      new Date(run.wallT0 ?? Date.now()).toLocaleDateString('en-CA', {
        timeZone: process.env.EVAL_TZ ?? 'America/New_York',
      })
    );
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
      const correct = await judge(judgePrompt(category, ask, gold, response));
      results.push({
        history: p.id,
        category,
        ask,
        gold,
        note: null,
        response,
        correct,
        retrieved: null,
      });
      console.log(
        `${correct ? '✓' : correct === false ? '✗' : '?'} ${label} ${p.id} [${category}] ${ask} → ${response}`
      );
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
  const labels = process.argv.slice(2);
  if (labels.length === 0) throw new Error('usage: score-live.ts <label> [label2]');
  const runs: CaseResult[][] = [];
  for (const label of labels) runs.push(await score(label));
  const sections = labels.map((l, i) => `== ${l}\n${formatReport(runs[i]!)}`);
  if (runs.length === 2)
    sections.push(formatPaired(labels[0]!, labels[1]!, paired(runs[0]!, runs[1]!)));
  const dir = join(tmpdir(), 'longmem');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `live-${labels.join('-vs-')}.json`);
  writeFileSync(file, JSON.stringify({ labels, runs }, null, 2));
  console.log(`\n${sections.join('\n\n')}\n\nReport: ${file}`);
}

main().catch((error: unknown) => {
  console.error(String(error));
  process.exitCode = 1;
});
