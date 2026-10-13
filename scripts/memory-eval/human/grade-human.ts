#!/usr/bin/env tsx
/**
 * Grades the human baseline (the "Friend Recall Test" artifact) with the
 * memory benchmark's own judge, on the same questions and gold answers, so
 * Ferni and people are compared like for like. Answers are real people's
 * words, so this runs only on Vertex AI (real-data.ts).
 *
 * Export answers first: ArtifactData list of collection "answers" with
 * out_dir, then:
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 pnpm tsx scripts/memory-eval/human/grade-human.ts <dir with answer JSON files>
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { callLLM } from '../../../src/services/llm-utils.js';
import { HUMAN_KEY } from '../fixtures/human-baseline-key.js';
import {
  failureCount,
  formatReport,
  judgePrompt,
  parseYesNo,
  type CaseResult,
} from '../longmem-lib.js';
import { assertVertexOnly } from '../real-data.js';

async function main(): Promise<void> {
  assertVertexOnly();
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: grade-human.ts <dir>');
  const files = readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.json'));
  const results: CaseResult[] = [];
  let people = 0;
  for (const f of files) {
    const doc = JSON.parse(readFileSync(join(dir, f), 'utf8')) as {
      answers?: Record<string, string>;
      data?: { answers?: Record<string, string> };
    };
    const answers = doc.answers ?? doc.data?.answers;
    if (!answers || typeof answers !== 'object') {
      console.log(`skipped ${f}: no answers object`);
      continue;
    }
    people++;
    for (const [id, k] of Object.entries(HUMAN_KEY)) {
      const response = answers[id] ?? '';
      // A blank answer is a failure; the judge is not asked to grade nothing.
      const noAnswer = response.trim() === '';
      const judgeReply = noAnswer
        ? null
        : await callLLM(judgePrompt(k.category, k.ask, k.gold, response), {
            temperature: 0,
            maxTokens: 10,
          });
      results.push({
        history: f,
        category: k.category,
        ask: k.ask,
        gold: k.gold,
        note: null,
        response,
        noAnswer,
        correct: parseYesNo(judgeReply),
        retrieved: null,
        judgeReply,
      });
    }
  }
  console.log(`${people} people\n${formatReport(results)}`);
  const failures = failureCount(results);
  if (failures > 0) {
    console.error(
      `${failures} answers with no answer or no judge verdict: see the Failures column`
    );
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(String(error));
  process.exitCode = 1;
});
