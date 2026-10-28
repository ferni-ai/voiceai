/**
 * Which of a turn's candidate memories reach the prompt once a caller has
 * hundreds of them. TURN_MEMORY_RERANK, layered on TURN_MEMORY_RRF_SCALE.
 *
 * The cosine floor and cap (turn-memory-scale.ts) hold at 15-25 memories a
 * caller, but precision@injected falls to 44% at 300 and 33% at 1,000
 * (scripts/memory-eval/haystack-bench.ts, 0.55 / cap 3). What crowds in is the
 * same person, pet or place with a different fact ("cousin getting married"
 * for "my sister's big day") and shared words ("standup"). Their cosines sit
 * level with the right memory's, so no floor separates them.
 *
 * Two stages run between the vector search and the cap:
 *
 * 1. Runner-up margin, always, under a millisecond. Send only the best
 *    memory, and only when its cosine is at least 0.55 and at least 0.04 above
 *    the next candidate. Near misses come in clusters of near-equal cosines,
 *    so a memory that stands clear of the others is the one the turn is
 *    about. It sends one memory or none.
 * 2. Judge, when TURN_MEMORY_RERANK_TIMEOUT_MS is above 0. The extraction
 *    model gets the turn and every candidate at cosine 0.45 or more, each with
 *    the date it was saved when the store has one. It returns the candidates
 *    the turn is about and the older side of any updated fact. That answer
 *    replaces stage 1's if it arrives within the timeout. A late, failed or
 *    unreadable answer leaves stage 1's result.
 *
 * Haystack bench, 2026-10-22, precision / recall at 300 and 1,000 memories:
 * floor 0.55 / cap 3 44% / 59% and 33% / 55%; runner-up gate 89% / 36% and
 * 87% / 30%; judge (gemini-3.5-flash) 94% / 86% and 86% / 78%. The judge
 * took 1.1 s at p50 from a laptop and never answered inside 150 ms, so at
 * a 150 ms budget the turn gets the gate's answer. Superseded facts reached
 * 1 of 18 update turns with either stage, against 7 of 18 on the floor.
 *
 * Supersession happens only in the judge, which compares dates and wording.
 * Dropping the older of two memories without a model needs fields the write
 * path does not yet store: the subject, the attribute (slot), and validFrom
 * and validTo for each memory.
 *
 * With the flag on, the older cross-encoder stage (cross-encoder.ts) is
 * skipped. Its Gemini provider scores candidates one call at a time against a
 * 50 ms race it cannot win. Its heuristic provider drops on word overlap. Its
 * order is discarded anyway, because the cap re-sorts by cosine.
 *
 * TURN_MEMORY_JUDGE_ASYNC runs the judge in the background instead, and
 * carries its picks into the next turn (turn-memory-pending.ts).
 *
 * @module memory/retrieval/turn-memory-rerank
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { getExtractionModel } from '../../config/gemini-config.js';
import { getGenerativeModel } from '../../config/generative-model.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { HybridSearchResult } from './hybrid-search.js';
import {
  gateWithPendingRecall,
  turnMemoryJudgeAsyncOn,
  type JudgeVerdict,
} from './turn-memory-pending.js';
import {
  MIN_TURN_MEMORY_COSINE,
  scaleTurnMemories,
  turnMemoryRrfScaleOn,
} from './turn-memory-scale.js';

const log = createLogger({ module: 'TurnMemoryRerank' });

/** How far the best memory's cosine must clear the runner-up's for stage 1 to send it. */
export const MIN_RUNNER_UP_MARGIN = 0.04;

/** Lowest cosine a candidate needs to reach the judge. */
export const MIN_JUDGE_COSINE = 0.45;

/** Most candidates the judge reads. The per-turn search returns at most 10. */
export const MAX_JUDGE_CANDIDATES = 12;

/** Lowest judge confidence that keeps a memory. */
export const MIN_JUDGE_CONFIDENCE = 0.5;

/** Judge timeout when TURN_MEMORY_RERANK_TIMEOUT_MS is unset. 0 means no judge call. */
export const DEFAULT_JUDGE_TIMEOUT_MS = 0;

/** Asks the model one question and returns its raw reply. */
export type TurnMemoryJudge = (prompt: string) => Promise<string>;

/** The retrieval metrics this stage writes to. */
interface RerankMetrics {
  rerankMs: number;
  rerankingApplied: boolean;
}

/** TURN_MEMORY_RERANK, which needs TURN_MEMORY_RRF_SCALE on as well. */
export function turnMemoryRerankOn(env: Env = process.env): boolean {
  return turnMemoryRrfScaleOn(env) && flagOn('TURN_MEMORY_RERANK', env);
}

/** TURN_MEMORY_RERANK_TIMEOUT_MS as whole ms from 0 to 5000. Unset or not a number gives the default. */
export function turnMemoryJudgeTimeoutMs(env: Env = process.env): number {
  const raw = env.TURN_MEMORY_RERANK_TIMEOUT_MS?.trim();
  const n = raw ? Math.floor(Number(raw)) : NaN;
  return Number.isFinite(n) ? Math.min(5000, Math.max(0, n)) : DEFAULT_JUDGE_TIMEOUT_MS;
}

/** Stage 1: the best memory if it clears the floor and the runner-up, otherwise nothing. Input is best first. */
export function runnerUpGate<T extends { score: number }>(ranked: T[]): T[] {
  const [best, next] = ranked;
  if (!best || best.score < MIN_TURN_MEMORY_COSINE) return [];
  return best.score - (next?.score ?? 0) >= MIN_RUNNER_UP_MARGIN ? [best] : [];
}

/** A stored timestamp as YYYY-MM-DD, or undefined when it is missing or unreadable. */
function savedOn(result: HybridSearchResult): string | undefined {
  const raw = result.metadata?.timestamp;
  const date = typeof raw === 'string' || typeof raw === 'number' ? new Date(raw) : undefined;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : undefined;
}

/** The judge's question: the turn, then each candidate numbered from 1, with its saved date when known. */
export function judgePrompt(turn: string, candidates: HybridSearchResult[]): string {
  const lines = candidates.map((c, i) => {
    const date = savedOn(c);
    return `${i + 1}. ${date ? `[${date}] ` : ''}${c.text.replace(/\s+/g, ' ').slice(0, 300)}`;
  });
  return `You are choosing which saved memories a caring friend should have in mind when replying.

They just said: ${JSON.stringify(turn.slice(0, 500))}

Saved memories (number, date saved when known, text). Memories can be about the speaker, the people and pets in their life, or the friend's own life; "you" in what they said means the friend.
${lines.join('\n')}

Keep a memory only if it is about the very thing they are talking about now: the same event, plan, problem, place or fact, or it says who the person or pet they are talking about is. Reject a memory that is only about the same person, pet or place but a different event or fact (a different illness, trip, day, project or hobby). Reject one that only shares a word. A question about the friend ("do you...", "your...") keeps only memories about the friend's own life. Greetings, sign-offs, small talk and anything not in the list keep nothing.
If two memories state the same fact at different times and the newer one replaces the older one, list the older one under "old" and do not keep it.
Reply with JSON only: {"keep":[[number, confidence 0-1]],"old":[number]}`;
}

/**
 * The 0-based indexes of the candidates the judge kept, minus any it called
 * old, and of those it called old; null when the reply is not the asked-for JSON.
 */
export function readVerdict(reply: string, count: number): JudgeVerdict | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return null;
  }
  const { keep, old } = (parsed ?? {}) as { keep?: unknown; old?: unknown };
  if (!Array.isArray(keep)) return null;
  const index = (n: unknown) => (Number.isInteger(n) && (n as number) >= 1 && (n as number) <= count ? (n as number) - 1 : -1); // prettier-ignore
  const stale = new Set((Array.isArray(old) ? old : []).map(index).filter((i) => i >= 0));
  const kept = new Set<number>();
  for (const entry of keep) {
    const [n, confidence] = Array.isArray(entry) ? entry : [entry, 1];
    const i = index(n);
    if (i >= 0 && !stale.has(i) && Number(confidence) >= MIN_JUDGE_CONFIDENCE) kept.add(i);
  }
  return { keep: kept, old: stale };
}

/** The extraction model (LLM_EXTRACTION_MODEL), through the shared Gemini client. */
const askExtractionModel: TurnMemoryJudge = async (prompt) => {
  const model = await getGenerativeModel({
    model: getExtractionModel(),
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 200,
      responseMimeType: 'application/json',
    },
  });
  if (!model) throw new Error('Gemini not configured');
  return (await model.generateContent(prompt)).response.text();
};

/** The turn being retrieved for: its text, and the session and turn number pending recall needs. */
interface GatedTurn {
  transcript: string;
  sessionId?: string;
  turnNumber?: number;
}

/**
 * The per-turn memories that go on to the cap, scored by cosine and best
 * first. With TURN_MEMORY_RRF_SCALE off: `results` unchanged. On without
 * TURN_MEMORY_RERANK: scaleTurnMemories. On with it: the two stages above,
 * or with TURN_MEMORY_JUDGE_ASYNC, the gate plus pending recall.
 */
export async function gateTurnMemories(
  results: HybridSearchResult[],
  turn: GatedTurn,
  rrfScale: boolean,
  metrics: RerankMetrics,
  env: Env = process.env,
  judge: TurnMemoryJudge = askExtractionModel
): Promise<HybridSearchResult[]> {
  if (!rrfScale) return results;
  if (!turnMemoryRerankOn(env)) return scaleTurnMemories(results);
  const ranked = scaleTurnMemories(results, 0);
  const gated = runnerUpGate(ranked);
  const timeoutMs = turnMemoryJudgeTimeoutMs(env);
  const candidates = ranked
    .filter((r) => r.score >= MIN_JUDGE_COSINE)
    .slice(0, MAX_JUDGE_CANDIDATES);
  const { transcript, sessionId, turnNumber } = turn;
  if (turnMemoryJudgeAsyncOn(env) && sessionId !== undefined && turnNumber !== undefined) {
    const ask = async (c: HybridSearchResult[]) => readVerdict(await judge(judgePrompt(transcript, c)), c.length); // prettier-ignore
    return gateWithPendingRecall(gated, candidates, ranked, { transcript, sessionId, turnNumber }, ask); // prettier-ignore
  }
  if (timeoutMs === 0 || candidates.length === 0) return gated;

  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const reply = await Promise.race([
      judge(judgePrompt(transcript, candidates)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`judge over ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
    const verdict = readVerdict(reply, candidates.length);
    if (!verdict) throw new Error(`unreadable verdict: ${reply.slice(0, 80)}`);
    metrics.rerankingApplied = true;
    return candidates.filter((_, i) => verdict.keep.has(i));
  } catch (error) {
    log.debug({ error: String(error), candidates: candidates.length }, 'Judge skipped, runner-up gate used'); // prettier-ignore
    return gated;
  } finally {
    clearTimeout(timer);
    metrics.rerankMs = Date.now() - startedAt;
  }
}
