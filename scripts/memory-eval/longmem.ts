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
 * The answerer and the judge are one model family. --judge2 <ollama model>
 * grades every answer again with a local model of another family (e.g.
 * qwen3:30b-a3b) and reports how far the two judges agree. --cases <file>
 * replaces the seeded histories with ones kept outside the repo, such as
 * real calls. Real calls reach only Vertex AI (the run refuses otherwise,
 * see real-data.ts), the memory code's info logs stay off the console
 * (quiet-logs.ts), and its outputs are written beside the cases file,
 * readable only by the owner.
 *
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 pnpm tsx scripts/memory-eval/longmem.ts \
 *     [--only maya] [--category opener] [--date YYYY-MM-DD] [--arms off,on] [--memory file.json]
 *     [--bq]
 *
 * --bq writes each arm's accuracy and evidence share to ferni_events.eval_results
 * (env dev, numbers only), and exits 1 if that insert fails.
 * The judge is the answerer's model family: cross-check with a second-family
 * judge before quoting a headline. The answer is at temperature 0, so the
 * headline is repeatable; the report records the model ids and prompt hashes.
 */
// First, so the log level is set before any module that logs is loaded.
import './quiet-logs.js';
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { getExtractionModel, getOpenAIFallbackModel } from '../../src/config/gemini-config.js';
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
import { callLLM, createSummarizationLLMCaller } from '../../src/services/llm-utils.js';
import { createMemoryRecall } from '../../src/agents/multi-agent/memory-recall-hook.js';
import type { RecallStore } from '../../src/memory/recall/session-recall.js';
import type { RetrievalEmbedder } from '../../src/memory/recall/semantic-recall.js';
import { embedForRetrieval } from '../../src/memory/vectors/retrieval-embeddings.js';
import { CASES, HISTORIES, callTurns } from './fixtures/longmem-cases.js';
import {
  CATEGORIES,
  RunDays,
  answerPrompt,
  callerZone,
  evidencePrompt,
  failureCount,
  formatAgreement,
  formatPaired,
  formatReport,
  hasEvidence,
  interimOf,
  judgePrompt,
  localDay,
  paired,
  tally,
  parseCaseFile,
  parseYesNo,
  promptHashes,
  type CaseResult,
  type MemoryCategory,
  type SecondOpinion,
  type MemoryHistory,
} from './longmem-lib.js';
import { assertVertexOnly, writePrivate } from './real-data.js';
import { longmemMetrics, newRunId, reportIfBq } from '../lib/eval-results-bq.js';

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

/**
 * A local model through Ollama, for a judge of another family. A reasoning
 * model (Qwen3) ignores think:false and reasons in its answer, so it thinks
 * in the separate field and only the answer is read; a model without
 * thinking (Qwen2.5) rejects think, and is asked without it.
 */
async function askLocal(model: string, prompt: string): Promise<string> {
  const request = (think: boolean) =>
    fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        ...(think && { think: true }),
        // Grading prompts are short; the default context window costs memory and speed.
        options: { temperature: 0, num_predict: think ? 2000 : 16, num_ctx: 8192 },
      }),
    });
  let res = await request(true);
  if (res.status === 400) res = await request(false);
  if (!res.ok) throw new Error(`ollama ${model}: HTTP ${res.status}`);
  const body = (await res.json()) as { message?: { content?: string } };
  return (body.message?.content ?? '').trim();
}

/** The model's reply, trimmed; '' when every provider failed (the caller counts that as no answer). */
async function ask(prompt: string, temperature: number): Promise<string> {
  return ((await callLLM(prompt, { temperature, maxTokens: 300 })) ?? '').trim();
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
  const casesFile = flag('--cases');
  // Before any file is read: a saved memory from a run on real calls holds them too.
  if (casesFile) assertVertexOnly();
  // Saved memory holds dates relative to its own run date.
  const saved = memoryFile
    ? (JSON.parse(readFileSync(memoryFile, 'utf8')) as SavedMemory)
    : undefined;
  const external = casesFile
    ? parseCaseFile(JSON.parse(readFileSync(casesFile, 'utf8')))
    : undefined;
  const allHistories = external?.histories ?? HISTORIES;
  if (only && !allHistories.some((h) => h.id === only)) {
    throw new Error(`unknown --only: ${only} (have ${allHistories.map((h) => h.id).join(', ')})`);
  }
  const onlyCategory = flag('--category');
  if (onlyCategory && !CATEGORIES.includes(onlyCategory as MemoryCategory)) {
    throw new Error(`unknown --category: ${onlyCategory}`);
  }
  const allCases = (external?.cases ?? CASES).filter(
    (c) => !onlyCategory || c.category === onlyCategory
  );
  const judge2 = flag('--judge2');
  // Every source of the run date must agree: a saved memory, a cases file and --date.
  const dates = [saved?.runDate, external?.runDate, flag('--date')].filter((d): d is string =>
    Boolean(d)
  );
  if (new Set(dates).size > 1) {
    throw new Error(
      `dates disagree: ${dates.join(', ')} (--memory, --cases and --date must match)`
    );
  }
  const runDate = dates[0] ?? localDay(Date.now(), callerZone());
  const arms = (flag('--arms') ?? 'off,on').split(',') as Arm[];
  if (arms.some((a) => a !== 'off' && a !== 'on')) throw new Error(`bad --arms: ${arms.join(',')}`);
  if (new Set(arms).size !== arms.length) throw new Error(`duplicate --arms: ${arms.join(',')}`);
  const days = new RunDays(runDate);
  const histories = allHistories.filter((h) => !only || h.id === only);
  const tracker = trackedEmbedder();

  type Judged = CaseResult & { second?: SecondOpinion };
  const results: Record<Arm, Judged[]> = { off: [], on: [] };
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
    for (const c of allCases.filter((x) => x.history === history.id)) {
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
        const response = await ask(
          answerPrompt(history.name, days.today(), note, c.ask, c.category),
          0
        );
        // No answer is a failure: the judge is not asked to grade nothing.
        const noAnswer = response === '';
        const judgeReply = noAnswer
          ? null
          : await ask(judgePrompt(c.category, c.ask, gold, response), 0);
        const correct = parseYesNo(judgeReply);
        const evidenceReply = hasEvidence(c.category)
          ? await ask(evidencePrompt(c.ask, gold, note), 0)
          : null;
        const retrieved = parseYesNo(evidenceReply);
        const second: SecondOpinion | undefined =
          judge2 && !noAnswer
            ? {
                judge: judge2,
                correct: parseYesNo(
                  await askLocal(judge2, judgePrompt(c.category, c.ask, gold, response))
                ),
                retrieved: !hasEvidence(c.category)
                  ? null
                  : parseYesNo(await askLocal(judge2, evidencePrompt(c.ask, gold, note))),
              }
            : undefined;
        results[arm].push({
          ...(second && { second }),
          history: history.id,
          category: c.category,
          ask: c.ask,
          gold,
          note,
          response,
          noAnswer,
          correct,
          retrieved,
          judgeReply,
          evidenceReply,
        });
        // Real calls: the question and answer stay out of the console (only the mark and category).
        const mark = noAnswer ? '!' : correct ? '✓' : correct === false ? '✗' : '?';
        console.log(
          casesFile
            ? `${mark} ${arm} [${c.category}]`
            : `${mark} ${arm} [${c.category}] ${c.ask} → ${response}`
        );
      }
    }
  }
  if (arms.includes('on') && tracker.failures() > 0) {
    console.error(`${tracker.failures()} embedding calls failed: the "on" arm is not trustworthy`);
    process.exitCode = 1;
  }

  // Real calls stay beside their cases file; seeded runs go to the temp dir.
  const dir = casesFile ? dirname(resolve(casesFile)) : join(tmpdir(), 'longmem');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(dir, `longmem-${stamp}.json`);
  const memoryOut = memoryFile ?? join(dir, `memory-${stamp}.json`);
  if (!memoryFile) writePrivate(memoryOut, JSON.stringify(toSave));
  const models = { answerer: getExtractionModel(), fallback: getOpenAIFallbackModel() };
  writePrivate(
    file,
    JSON.stringify(
      { runDate, arms, models, prompts: promptHashes(), judge2, written, stored, results },
      null,
      2
    )
  );
  const failures = arms.reduce((sum, arm) => sum + failureCount(results[arm]), 0);
  if (failures > 0) {
    console.error(`${failures} cases with no answer or no judge verdict: see the Failures column`);
    process.exitCode = 1;
  }
  const sections = arms.map((arm) =>
    [`== recall ${arm}`, formatReport(results[arm]), formatAgreement(results[arm])]
      .filter(Boolean)
      .join('\n')
  );
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
  const runId = newRunId('longmem');
  const scenario = casesFile ? 'longmem_cases' : 'longmem';
  await reportIfBq(
    argv.includes('--bq'),
    arms.map((arm) => ({
      runId,
      arm,
      scenario,
      metrics: longmemMetrics(tally(results[arm])),
      flags: arm === 'on' ? ['SEMANTIC_RECALL'] : [],
    }))
  );
}

// Exit explicitly: the memory modules leave timers and gRPC channels open, so
// the process would otherwise never end, even after an error.
main().then(
  () => process.exit(),
  (error: unknown) => {
    console.error(String(error));
    process.exit(1);
  }
);
