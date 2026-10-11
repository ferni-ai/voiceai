#!/usr/bin/env tsx
/**
 * Long-term memory benchmark through Ferni's real write and recall paths,
 * offline (seeded histories, no dev calls, no Firestore). Write: fastCapture's
 * gate and hints, then the extraction worker's own processJob, stored as
 * dynamic_facts would be; per call, summarizeWithLLM. (Jobs run one by one,
 * skipping the event bus and batcher, which only merge turns.) Recall: the
 * live createMemoryRecall hook over that store; each question opens a new
 * call. Ferni answers from the note alone; a judge grades the answer and,
 * separately, whether the note held the evidence (retrieval vs answering).
 *
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 pnpm tsx scripts/memory-eval/longmem.ts [--only maya] [--date YYYY-MM-DD]
 *
 * The judge is the answerer's model family: cross-check with a second-family
 * judge before quoting a headline.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fastCapture } from '../../src/memory/dynamic/fast-capture.js';
import {
  DeepExtractionWorker,
  type DeepExtractionJob,
  type ExtractionResult,
} from '../../src/memory/dynamic/deep-extraction-worker.js';
import {
  buildExtractionFirestoreWritePayloads,
  factDocId,
} from '../../src/memory/dynamic/extraction-firestore-docs.js';
import { summarizeWithLLM } from '../../src/memory/operations/summarizer.js';
import { createSummarizationLLMCaller } from '../../src/services/llm-utils.js';
import { callLLM } from '../../src/services/llm/llm-utils.js';
import { createMemoryRecall } from '../../src/agents/multi-agent/memory-recall-hook.js';
import type { RecallStore } from '../../src/memory/recall/session-recall.js';
import { CASES, HISTORIES, callTurns } from './fixtures/longmem-cases.js';
import {
  RunDays,
  answerPrompt,
  evidencePrompt,
  formatReport,
  judgePrompt,
  parseYesNo,
  type CaseResult,
  type MemoryHistory,
} from './longmem-lib.js';

const quiet = { debug: () => undefined };

interface Memory {
  facts: Map<string, Record<string, unknown>>;
  summaries: Array<Record<string, unknown>>;
}

/** A session at noon Mountain time (18:00 UTC, so the UTC and local dates agree). */
function sessionTime(days: RunDays, daysAgo: number): Date {
  return new Date(`${days.sessionDay(daysAgo)}T18:00:00Z`);
}

async function writeHistory(history: MemoryHistory, days: RunDays): Promise<Memory> {
  const userId = `memeval-${history.id}`;
  const memory: Memory = { facts: new Map(), summaries: [] };
  const worker = new DeepExtractionWorker();
  const internals = worker as unknown as {
    processJob(job: DeepExtractionJob): Promise<void>;
    persistExtraction(
      userId: string,
      result: ExtractionResult,
      job: DeepExtractionJob
    ): Promise<void>;
  };
  internals.persistExtraction = async (uid, result, job) => {
    const at = new Date(job.timestamp).toISOString();
    const { facts } = buildExtractionFirestoreWritePayloads(uid, result, job, at, quiet);
    for (const f of facts) {
      memory.facts.set(factDocId(String(f.entityName), String(f.key), String(f.value)), f);
    }
  };
  const summarize = createSummarizationLLMCaller();

  for (const [i, session] of history.sessions.entries()) {
    const sessionId = `memeval-${history.id}-s${i + 1}`;
    const timestamp = sessionTime(days, session.daysAgo);
    for (const [turnNumber, transcript] of session.user.entries()) {
      const hints = await fastCapture({ userId, sessionId, turnNumber, transcript, timestamp });
      if (!hints.asyncJobId) continue; // the live gate said nothing worth extracting
      await internals.processJob({
        jobId: hints.asyncJobId,
        userId,
        sessionId,
        turnNumber,
        transcript,
        timestamp,
        priority: 'normal',
        fastCaptureHints: {
          mentionedEntities: hints.mentionedEntities,
          emotionSignals: hints.emotionSignals,
          topicHints: hints.topicHints,
          dateSignals: hints.dateSignals,
          relationshipSignals: hints.relationshipSignals,
        },
      });
    }
    const turns = callTurns(session.user).map((t) => ({ ...t, timestamp }));
    const summary = await summarizeWithLLM(sessionId, turns, summarize, {
      generateEmbedding: false,
    });
    memory.summaries.push({ ...summary, timestamp: timestamp.toISOString() });
  }
  return memory;
}

function storeOf(memory: Memory): RecallStore {
  return {
    facts: async () =>
      [...memory.facts.values()].sort((a, b) =>
        String(b.extractedAt ?? '').localeCompare(String(a.extractedAt ?? ''))
      ),
    summaries: async () =>
      [...memory.summaries]
        .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
        .slice(0, 5),
  };
}

const noLedger = { save: async () => undefined, recent: async () => [] };

async function ask(prompt: string, temperature: number): Promise<string> {
  return (await callLLM(prompt, { temperature, maxTokens: 300 })) ?? '';
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const only = flag('--only');
  const runDate = flag('--date') ?? new Date().toISOString().slice(0, 10);
  const days = new RunDays(runDate);
  const histories = HISTORIES.filter((h) => !only || h.id === only);

  const results: CaseResult[] = [];
  const written: Record<string, { facts: number; summaries: number }> = {};
  const stored: Record<string, string[]> = {};
  for (const history of histories) {
    const memory = await writeHistory(history, days);
    written[history.id] = { facts: memory.facts.size, summaries: memory.summaries.length };
    stored[history.id] = [...memory.facts.values()].map(
      (f) => `${String(f.entityName)} | ${String(f.key)} = ${String(f.value)}`
    );
    const store = storeOf(memory);
    for (const c of CASES.filter((x) => x.history === history.id)) {
      const recall = createMemoryRecall({
        userId: `memeval-${history.id}`,
        userName: history.name,
        store,
        ledgerStore: noLedger,
      });
      await recall.ready;
      const note = recall.noteFor(c.ask);
      const gold = c.gold(days);
      const response = await ask(answerPrompt(history.name, days.today(), note, c.ask), 0.3);
      const correct = parseYesNo(await ask(judgePrompt(c.category, c.ask, gold, response), 0));
      const retrieved =
        c.category === 'abstention'
          ? null
          : parseYesNo(await ask(evidencePrompt(c.ask, gold, note), 0));
      results.push({
        history: history.id,
        category: c.category,
        ask: c.ask,
        gold,
        note,
        response,
        correct,
        retrieved,
      });
      console.log(
        `${correct ? '✓' : correct === false ? '✗' : '?'} [${c.category}] ${c.ask} → ${response}`
      );
    }
  }

  const dir = join(tmpdir(), 'longmem');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `longmem-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify({ runDate, written, stored, results }, null, 2));
  console.log(
    `\nWritten: ${JSON.stringify(written)}\n\n${formatReport(results)}\n\nReport: ${file}`
  );
}

main().catch((error: unknown) => {
  console.error(String(error));
  process.exitCode = 1;
});
