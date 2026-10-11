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
import {
  RunDays,
  formatReport,
  judgePrompt,
  parseYesNo,
  type CaseResult,
  type MemoryCategory,
} from '../longmem-lib.js';

const days = new RunDays('2026-10-11'); // the page's "today"
/** Question id on the page -> benchmark category and gold answer. */
const KEY: Record<string, { category: MemoryCategory; ask: string; gold: string }> = {
  'maya-dog': {
    category: 'single-session',
    ask: 'What kind of dog does Maya have?',
    gold: 'a golden retriever (named Biscuit)',
  },
  'maya-hospitals': {
    category: 'multi-session',
    ask: 'Which hospital before, and where now?',
    gold: "St. Mary's before, Denver Health now",
  },
  'maya-surgery-date': {
    category: 'temporal',
    ask: "What date was Biscuit's surgery?",
    gold: days.weekdayBefore(6, 'Friday'),
  },
  'maya-work-now': {
    category: 'knowledge-update',
    ask: 'Where does Maya work these days?',
    gold: "Denver Health (not St. Mary's any more)",
  },
  'maya-sister': {
    category: 'abstention',
    ask: "What is Maya's sister's name?",
    gold: 'never said',
  },
  'maya-remark': {
    category: 'unprompted',
    ask: 'Ugh, another run of night shifts this week.',
    gold: 'her new job at Denver Health (or that its night shifts were meant to be better)',
  },
  'eli-company-now': {
    category: 'knowledge-update',
    ask: 'Which company does Eli work for now?',
    gold: 'Northwind (which acquired Lumen Labs)',
  },
  'eli-bakery': {
    category: 'single-session',
    ask: 'What was the bakery called?',
    gold: 'Rise and Grind',
  },
  'eli-acquirer': {
    category: 'multi-session',
    ask: 'Who bought the startup Eli joined?',
    gold: 'Northwind bought Lumen Labs',
  },
  'eli-still-bakery': {
    category: 'knowledge-update',
    ask: 'Is Eli still working at the bakery?',
    gold: 'no: he left Rise and Grind for Lumen Labs, which Northwind bought',
  },
  'eli-remark': {
    category: 'unprompted',
    ask: 'Big day, I shipped my first feature at work!',
    gold: 'his developer job (Lumen Labs, now Northwind) or his switch from baking',
  },
  'ruth-marcus': {
    category: 'single-session',
    ask: 'Which university is Marcus at?',
    gold: 'Purdue',
  },
  'ruth-book-now': {
    category: 'knowledge-update',
    ask: "What is Ruth's book club reading now?",
    gold: 'The Covenant of Water (not Lessons in Chemistry)',
  },
  'ruth-walt': {
    category: 'multi-session',
    ask: "How is Ruth's husband recovering?",
    gold: "well: Walt's hip replacement went well and he's walking with a cane",
  },
  'ruth-aerobics': {
    category: 'single-session',
    ask: 'What day does Ruth go to water aerobics?',
    gold: 'Tuesdays',
  },
  'ruth-brother-joan': {
    category: 'false-premise',
    ask: "How is Ruth's brother Joan doing?",
    gold: 'Joan is her sister, not her brother',
  },
  'ruth-daughter': {
    category: 'abstention',
    ask: "What is Ruth's daughter's name?",
    gold: 'never said',
  },
};

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
    for (const [id, k] of Object.entries(KEY)) {
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
