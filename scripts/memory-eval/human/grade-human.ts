#!/usr/bin/env tsx
/**
 * Grades the human baseline (the "Friend Recall Test" artifact) with the
 * memory benchmark's own judge, on the same questions and gold answers, so
 * Ferni and people are compared like for like.
 *
 * Export answers first: ArtifactData list of collection "answers" with
 * out_dir, then:
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 pnpm tsx scripts/memory-eval/human/grade-human.ts <dir with answer JSON files>
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { callLLM } from '../../../src/services/llm/llm-utils.js';
import { HUMAN_KEY } from '../fixtures/human-baseline-key.js';
import { formatReport, judgePrompt, parseYesNo, type CaseResult } from '../longmem-lib.js';

async function main(): Promise<void> {
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: grade-human.ts <dir>');
  const files = readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.json'));
  const results: CaseResult[] = [];
  for (const f of files) {
    const doc = JSON.parse(readFileSync(join(dir, f), 'utf8')) as {
      answers?: Record<string, string>;
      data?: { answers?: Record<string, string> };
    };
    const answers = doc.answers ?? doc.data?.answers ?? {};
    for (const [id, k] of Object.entries(HUMAN_KEY)) {
      const response = answers[id] ?? '';
      const correct = parseYesNo(
        await callLLM(judgePrompt(k.category, k.ask, k.gold, response), {
          temperature: 0,
          maxTokens: 10,
        })
      );
      results.push({
        history: f,
        category: k.category,
        ask: k.ask,
        gold: k.gold,
        note: null,
        response,
        correct,
        retrieved: null,
      });
    }
  }
  console.log(`${files.length} people\n${formatReport(results)}`);
}

main().catch((error: unknown) => {
  console.error(String(error));
  process.exitCode = 1;
});
