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
 * Memory is written once and every question is asked under each recall arm
 * (word overlap "off", SEMANTIC_RECALL "on"), so arms differ only in recall;
 * extraction varies run to run and would otherwise swamp the difference. As
 * live, recall sees an interim transcript (the opening words) before the
 * final one. The interim is assumed embedded by the time the final lands;
 * the report gives the embedding times to check that against a call.
 * The written memory is saved; --memory reuses it, so a recall change can be
 * measured against the same memory without extracting again.
 *
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 pnpm tsx scripts/memory-eval/longmem.ts \
 *     [--only maya] [--date YYYY-MM-DD] [--arms off,on] [--memory file.json]
 *
 * The judge is the answerer's model family: cross-check with a second-family
 * judge before quoting a headline.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
import type { RetrievalEmbedder } from '../../src/memory/recall/semantic-recall.js';
import { embedForRetrieval } from '../../src/memory/vectors/retrieval-embeddings.js';
import { CASES, HISTORIES, callTurns } from './fixtures/longmem-cases.js';
import {
  RunDays,
  answerPrompt,
  evidencePrompt,
  formatPaired,
  formatReport,
  interimOf,
  judgePrompt,
  paired,
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

type Arm = 'off' | 'on';

/** The real embedder, counted: lets a question wait for embeddings in flight, and reports their times. */
function trackedEmbedder() {
  const inFlight = new Set<Promise<unknown>>();
  const queryMs: number[] = [];
  let failures = 0;
  const embed: RetrievalEmbedder = (texts, role) => {
    const started = Date.now();
    const job = embedForRetrieval(texts, role).then(
      (vectors) => {
        if (role === 'query') queryMs.push(Date.now() - started);
        return vectors;
      },
      (error: unknown) => {
        failures++;
        throw error;
      }
    );
    const tracked = job.finally(() => inFlight.delete(tracked)).catch(() => undefined);
    inFlight.add(tracked);
    return job;
  };
  const settled = async () => {
    while (inFlight.size > 0) await Promise.all([...inFlight]);
  };
  return { embed, settled, queryMs, failures: () => failures };
}

async function ask(prompt: string, temperature: number): Promise<string> {
  return (await callLLM(prompt, { temperature, maxTokens: 300 })) ?? '';
}

interface SavedMemory {
  runDate: string;
  histories: Record<
    string,
    { facts: Array<[string, Record<string, unknown>]>; summaries: Memory['summaries'] }
  >;
}

const quantile = (xs: number[], q: number) =>
  xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))] : 0;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const only = flag('--only');
  const memoryFile = flag('--memory');
  const saved = memoryFile
    ? (JSON.parse(readFileSync(memoryFile, 'utf8')) as SavedMemory)
    : undefined;
  // Saved memory holds dates relative to its own run date.
  const runDate = saved?.runDate ?? flag('--date') ?? new Date().toISOString().slice(0, 10);
  const arms = (flag('--arms') ?? 'off,on').split(',') as Arm[];
  if (arms.some((a) => a !== 'off' && a !== 'on')) throw new Error(`bad --arms: ${arms.join(',')}`);
  const days = new RunDays(runDate);
  const histories = HISTORIES.filter((h) => !only || h.id === only);
  const tracker = trackedEmbedder();

  const results: Record<Arm, CaseResult[]> = { off: [], on: [] };
  const written: Record<string, { facts: number; summaries: number }> = {};
  const stored: Record<string, string[]> = {};
  const toSave: SavedMemory = { runDate, histories: {} };
  for (const history of histories) {
    const kept = saved?.histories[history.id];
    const memory: Memory = kept
      ? { facts: new Map(kept.facts), summaries: kept.summaries }
      : await writeHistory(history, days);
    toSave.histories[history.id] = { facts: [...memory.facts], summaries: memory.summaries };
    written[history.id] = { facts: memory.facts.size, summaries: memory.summaries.length };
    stored[history.id] = [...memory.facts.values()].map(
      (f) => `${String(f.entityName)} | ${String(f.key)} = ${String(f.value)}`
    );
    const store = storeOf(memory);
    for (const c of CASES.filter((x) => x.history === history.id)) {
      const gold = c.gold(days);
      for (const arm of arms) {
        const recall = createMemoryRecall({
          userId: `memeval-${history.id}`,
          userName: history.name,
          store,
          ledgerStore: noLedger,
          checkIns: async () => [],
          semantic: arm === 'on',
          embed: tracker.embed,
        });
        await recall.ready;
        await tracker.settled(); // the call has been going a while before the question
        const interim = interimOf(c.ask);
        const early = interim ? recall.noteFor(interim) : null;
        await tracker.settled();
        const note = [early, recall.noteFor(c.ask)].filter(Boolean).join('\n\n') || null;
        const response = await ask(answerPrompt(history.name, days.today(), note, c.ask), 0.3);
        const correct = parseYesNo(await ask(judgePrompt(c.category, c.ask, gold, response), 0));
        const retrieved =
          c.category === 'abstention'
            ? null
            : parseYesNo(await ask(evidencePrompt(c.ask, gold, note), 0));
        results[arm].push({
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
          `${correct ? '✓' : correct === false ? '✗' : '?'} ${arm} [${c.category}] ${c.ask} → ${response}`
        );
      }
    }
  }
  if (arms.includes('on') && tracker.failures() > 0) {
    console.error(`${tracker.failures()} embedding calls failed: the "on" arm is not trustworthy`);
    process.exitCode = 1;
  }

  const dir = join(tmpdir(), 'longmem');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(dir, `longmem-${stamp}.json`);
  const memoryOut = memoryFile ?? join(dir, `memory-${stamp}.json`);
  if (!memoryFile) writeFileSync(memoryOut, JSON.stringify(toSave));
  writeFileSync(file, JSON.stringify({ runDate, arms, written, stored, results }, null, 2));
  const sections = arms.map((arm) => `== recall ${arm}\n${formatReport(results[arm])}`);
  if (arms.length === 2)
    sections.push(formatPaired(arms[0]!, arms[1]!, paired(results[arms[0]!], results[arms[1]!])));
  if (tracker.queryMs.length > 0) {
    sections.push(
      `Turn embeddings: p50 ${quantile(tracker.queryMs, 0.5)} ms, p90 ${quantile(tracker.queryMs, 0.9)} ms (${tracker.queryMs.length})`
    );
  }
  console.log(
    `\nWritten: ${JSON.stringify(written)}\n\n${sections.join('\n\n')}\n\nReport: ${file}\nMemory: ${memoryOut}`
  );
}

main().catch((error: unknown) => {
  console.error(String(error));
  process.exitCode = 1;
});
