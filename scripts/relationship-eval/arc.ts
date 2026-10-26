#!/usr/bin/env tsx
/**
 * Relationship-arc eval: does call 20 feel closer than call 2?
 *
 * A scripted caller (fixtures/arc-life.ts) makes 20 calls over ten weeks, each
 * on its own frozen clock. Every call goes through Ferni's real per-call
 * inputs: the character prompt, the "Who You're Talking To" block built from
 * the profile (buildUserAwareness), the live greeting direction, and per-turn
 * memory recall (createMemoryRecall). After each call the real write path
 * runs (fastCapture + the extraction worker, summarizeWithLLM with inside
 * jokes, updateProfileFromSession), into memory here, never Firestore.
 * Replies come from Gemini Flash as text: no voice, tools or director, so
 * this measures what the model is told about the relationship, not the audio.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:9 GOOGLE_CLOUD_PROJECT=johnb-2025 \
 *     pnpm tsx scripts/relationship-eval/arc.ts [--calls 20] [--qwen 2,8,14,20] [--label base]
 *     ... arc.ts --rejudge run.json          score a saved run again
 *     ... arc.ts --pairwise on.json off.json  arm against arm, call by call
 *
 * The emulator host is a dead port on purpose: anything that tries Firestore
 * fails instead of writing the shared database. Flags under test come from
 * the environment (e.g. RELATIONSHIP_ARC=on).
 */
import '../../src/config/refuse-production-data.js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { minimalThinkingFor } from '../../src/config/thinking-defaults.js';
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
import { createMemoryRecall } from '../../src/agents/multi-agent/memory-recall-hook.js';
import type { RecallStore } from '../../src/memory/recall/session-recall.js';
import { loadSystemPrompt } from '../../src/agents/personas/prompt-loader.js';
import { buildUserAwareness } from '../../src/agents/voice-agent/phases/user-awareness.js';
import { callerHour, timeContext } from '../../src/agents/shared/time-context.js';
import {
  GREETING_DIRECTION,
  callerHistory,
  greetingFacts,
  partOfDayFor,
} from '../../src/agents/multi-agent/greeting-direction.js';
import { createUserProfile, updateProfileFromSession } from '../../src/types/user-profile.js';
import { ARC, CALLER } from './fixtures/arc-life.js';
import {
  blindPrompt,
  codeMarkers,
  pairwiseOutcome,
  pairwisePrompt,
  parseBlind,
  signTest,
  curve,
  formatCurve,
  judgePrompt,
  knownBefore,
  parseVerdict,
  type CallResult,
  type CallTranscript,
} from './arc-lib.js';
import { judgeModel } from '../lib/judge-model.mjs';

// ---- frozen clock: each call happens at 18:00 UTC on its own day ----------
const RealDate = Date;
let offsetMs: number | null = null;
class CallDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(RealDate.now() + (offsetMs ?? 0));
    else super(...(args as [string]));
  }
  static override now(): number {
    return RealDate.now() + (offsetMs ?? 0);
  }
}
globalThis.Date = CallDate as DateConstructor;
/** Only ever moves forward, so cached auth tokens never look fresher than they are. */
function setClock(at: Date): void {
  const shift = at.getTime() - RealDate.now();
  offsetMs = offsetMs === null ? shift : Math.max(offsetMs, shift);
}

const quiet = { debug: () => undefined };
const project = process.env.GOOGLE_CLOUD_PROJECT ?? 'johnb-2025';
const ai = new GoogleGenAI({ vertexai: true, project, location: 'global' });
const MODEL = process.env.ARC_MODEL ?? 'gemini-3.5-flash';
const JUDGE = judgeModel();

type Content = { role: 'user' | 'model'; parts: Array<{ text: string }> };

class TruncatedReply extends Error {
  constructor(role: string, model: string, maxOutputTokens: number) {
    super(
      `${role} reply hit MAX_TOKENS (${model}, ${maxOutputTokens} tokens): fix the budget or thinking`
    );
  }
}

async function generate(
  model: string,
  system: string | undefined,
  contents: Content[],
  maxOutputTokens: number,
  temperature: number,
  judging = false
): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents,
        config: {
          ...(system ? { systemInstruction: system } : {}),
          maxOutputTokens,
          temperature,
          // The judge thinks at its model's default, the setting the Flash/Pro check measured.
          // Chosen by role: the judge and the simulated Ferni can share a model id.
          ...(judging || model.includes('pro')
            ? {}
            : { thinkingConfig: minimalThinkingFor(model) }),
        },
      });
      // A reply cut off by the token budget is not a call to score: stop the run, don't retry.
      if (String(res.candidates?.[0]?.finishReason) === 'MAX_TOKENS')
        throw new TruncatedReply(judging ? 'judge' : 'ferni', model, maxOutputTokens);
      return (res.text ?? '').trim();
    } catch (error) {
      if (error instanceof TruncatedReply || attempt >= 3) throw error;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}

async function askQwen(prompt: string): Promise<string> {
  const res = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      model: 'qwen3:30b-a3b',
      think: true,
      stream: false,
      options: { temperature: 0 },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const body = (await res.json()) as { message?: { content?: string } };
  return body.message?.content ?? '';
}

// ---- the caller's memory, as the live pipeline would store it -------------
const facts = new Map<string, Record<string, unknown>>();
const summaries: Array<Record<string, unknown>> = [];
const store: RecallStore = {
  facts: async () =>
    [...facts.values()].sort((a, b) =>
      String(b.extractedAt ?? '').localeCompare(String(a.extractedAt ?? ''))
    ),
  summaries: async () =>
    [...summaries]
      .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
      .slice(0, 5),
};
const worker = new DeepExtractionWorker() as unknown as {
  processJob(job: DeepExtractionJob): Promise<void>;
  persistExtraction(u: string, r: ExtractionResult, j: DeepExtractionJob): Promise<void>;
};
worker.persistExtraction = async (uid, result, job) => {
  const at = new Date(job.timestamp).toISOString();
  for (const f of buildExtractionFirestoreWritePayloads(uid, result, job, at, quiet).facts) {
    facts.set(factDocId(String(f.entityName), String(f.key), String(f.value)), f);
  }
};
const summarize = createSummarizationLLMCaller();

async function afterCall(sessionId: string, t: CallTranscript, at: Date): Promise<string[]> {
  for (const [turnNumber, { user: transcript }] of t.turns.entries()) {
    const hints = await fastCapture({
      userId: CALLER.id,
      sessionId,
      turnNumber,
      transcript,
      timestamp: at,
    });
    if (!hints.asyncJobId) continue;
    await worker.processJob({
      jobId: hints.asyncJobId,
      userId: CALLER.id,
      sessionId,
      turnNumber,
      transcript,
      timestamp: at,
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
  const turns = [
    { role: 'assistant' as const, content: t.greeting, timestamp: at },
    ...t.turns.flatMap((x) => [
      { role: 'user' as const, content: x.user, timestamp: at },
      { role: 'assistant' as const, content: x.ferni, timestamp: at },
    ]),
  ];
  const summary = await summarizeWithLLM(sessionId, turns, summarize, { generateEmbedding: false });
  summaries.push({ ...summary, timestamp: at.toISOString() });
  return summary.keyPoints ?? [];
}

const ask = (model: string, prompt: string) =>
  generate(model, undefined, [{ role: 'user', parts: [{ text: prompt }] }], 4000, 0, true);

/** Code markers, the marker judge (with what a friend knows) and the blind judge. */
async function judgeCall(t: CallTranscript): Promise<CallResult> {
  const [gemini, blind] = await Promise.all([
    ask(JUDGE, judgePrompt(t.call, knownBefore(ARC, t.call), t)).then(parseVerdict),
    ask(JUDGE, blindPrompt(t)).then(parseBlind),
  ]);
  return {
    call: t.call,
    code: codeMarkers(t.call, ARC[t.call - 1]!, t),
    ...(gemini ? { gemini } : {}),
    ...(blind ? { blind } : {}),
  };
}

/** The second-family check, on the headline (blind) measure, for a sample of calls. */
async function qwenCheck(transcripts: CallTranscript[], results: CallResult[], sample: number[]) {
  const pairs: string[] = [];
  for (const n of sample) {
    const t = transcripts.find((x) => x.call === n);
    const r = results.find((x) => x.call === n);
    if (!t || !r) continue;
    // The local GPU is shared: a busy runner skips the sample instead of losing the run.
    const v = parseBlind(await askQwen(blindPrompt(t)).catch(() => ''));
    pairs.push(
      `call ${n}: qwen ${v?.familiarity ?? '?'}/${v?.priorCalls ?? '?'} gemini ${r.blind?.familiarity ?? '?'}/${r.blind?.priorCalls ?? '?'}`
    );
  }
  return pairs;
}

function save(label: string, body: Record<string, unknown>): string {
  const dir = join(tmpdir(), 'relationship-arc');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `arc-${label}-${new RealDate().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(body, null, 2));
  return file;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string) => argv[argv.indexOf(name) + 1] ?? undefined;
  const calls = argv.includes('--calls') ? Number(flag('--calls')) : ARC.length;
  const qwenCalls = argv.includes('--qwen') ? flag('--qwen')!.split(',').map(Number) : [];
  const label = argv.includes('--label') ? flag('--label')! : 'run';
  if (argv.includes('--pairwise')) {
    // Arm A against arm B, call by call from call 6 (saved runs, no new calls).
    const [a, b] = argv
      .slice(argv.indexOf('--pairwise') + 1, argv.indexOf('--pairwise') + 3)
      .map(
        (f) =>
          (JSON.parse(readFileSync(f, 'utf8')) as { transcripts: CallTranscript[] }).transcripts
      );
    const outcomes = await Promise.all(
      a!
        .filter((t) => t.call >= 6)
        .map(async (t) => {
          const other = b!.find((x) => x.call === t.call)!;
          const known = knownBefore(ARC, t.call);
          const [x, y] = await Promise.all([
            ask(JUDGE, pairwisePrompt(t.call, known, t, other)),
            ask(JUDGE, pairwisePrompt(t.call, known, other, t)),
          ]);
          return pairwiseOutcome(x, y);
        })
    );
    const wins = outcomes.filter((o) => o > 0).length;
    const losses = outcomes.filter((o) => o < 0).length;
    console.log(
      `A wins ${wins}, loses ${losses}, ties ${outcomes.length - wins - losses}; sign test p=${signTest(wins, losses).toFixed(2)}`
    );
    return;
  }
  if (argv.includes('--rejudge')) {
    // Score saved transcripts again (new judges, no new calls).
    const saved = JSON.parse(readFileSync(flag('--rejudge')!, 'utf8')) as {
      transcripts: CallTranscript[];
    };
    const results = await Promise.all(saved.transcripts.map(judgeCall));
    const qwen = await qwenCheck(saved.transcripts, results, qwenCalls);
    const file = save(`${label}-rejudged`, { ...saved, judge: JUDGE, results, qwen });
    console.log(`${qwen.join('\n')}\n\n${formatCurve(curve(results))}\n\nReport: ${file}`);
    return;
  }
  const lastDay = new RealDate(RealDate.now() - 86_400_000).toISOString().slice(0, 10);
  const character = await loadSystemPrompt('ferni');
  let profile = createUserProfile(CALLER.id, CALLER.name);

  const transcripts: CallTranscript[] = [];
  const results: CallResult[] = [];
  for (const [i, call] of ARC.slice(0, calls).entries()) {
    const n = i + 1;
    const at = new RealDate(
      new RealDate(`${lastDay}T18:00:00Z`).getTime() - call.daysAgo * 86_400_000
    );
    setClock(at);
    const sessionId = `${CALLER.id}-c${n}`;
    const returning = profile.totalConversations > 0;
    const awareness = buildUserAwareness({
      sessionId,
      userProfile: profile,
      isReturningUser: returning,
      userName: CALLER.name,
      sessionStartTime: new Date(),
    });
    const system =
      character + timeContext(new Date(), CALLER.timezone) + awareness.instructionsBlock;
    const facts0 = greetingFacts(
      partOfDayFor(callerHour(new Date(), CALLER.timezone) ?? 12),
      CALLER.name,
      callerHistory(profile, new Date())
    );
    const greeting = await generate(
      MODEL,
      system,
      [
        {
          role: 'user',
          parts: [
            {
              text: `[director] ${GREETING_DIRECTION}\nFacts: ${JSON.stringify(facts0)}\nSay only your greeting.`,
            },
          ],
        },
      ],
      200,
      0.8
    );
    const recall = createMemoryRecall({
      userId: CALLER.id,
      userName: CALLER.name,
      store,
      ledgerStore: { save: async () => undefined, recent: async () => [] },
      checkIns: async () => [],
    });
    await recall.ready;
    const contents: Content[] = [
      { role: 'user', parts: [{ text: '[the call connects]' }] },
      { role: 'model', parts: [{ text: greeting }] },
    ];
    const t: CallTranscript = { call: n, greeting, turns: [] };
    for (const line of call.user) {
      const note = recall.noteFor(line);
      contents.push({ role: 'user', parts: [{ text: note ? `${note}\n\n${line}` : line }] });
      const ferni = await generate(MODEL, system, contents, 300, 0.8);
      contents.push({ role: 'model', parts: [{ text: ferni }] });
      recall.newTurn();
      t.turns.push({ user: line, ferni });
    }
    transcripts.push(t);
    const keyPoints = await afterCall(sessionId, t, at);
    profile = updateProfileFromSession(profile, { sessionDurationMinutes: 12 });
    // As the live end of call does (session-manager.ts).
    if (keyPoints.length) profile.lastConversationSummary = keyPoints.slice(0, 2).join('; ');

    const result = await judgeCall(t);
    results.push(result);
    console.log(
      `call ${n} [${profile.relationshipStage}] closeness=${result.gemini?.closeness ?? '?'} blind=${result.blind?.familiarity ?? '?'}/${result.blind?.priorCalls ?? '?'} ${JSON.stringify(result.code)}\n  ${greeting}\n  ${t.turns.map((x) => x.ferni.replace(/\s+/g, ' ')).join('\n  ')}`
    );
  }

  const body = { label, model: MODEL, judge: JUDGE, transcripts, results, facts: facts.size };
  save(label, body);
  const qwen = await qwenCheck(transcripts, results, qwenCalls);
  const file = save(label, { ...body, qwen });
  console.log(
    `${qwen.join('\n')}\n\n${formatCurve(curve(results))}\n\nFacts stored: ${facts.size}. Report: ${file}`
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
