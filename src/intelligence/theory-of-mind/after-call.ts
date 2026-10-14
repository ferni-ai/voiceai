/**
 * After a call ends, update what Ferni understands about the person.
 *
 * Runs as the 'theory-of-mind' after-call task (agents/theory-of-mind-register.ts): endSession starts
 * it once the summary is saved and never waits on it. Off unless
 * THEORY_OF_MIND=on. Bounded by its own timeout and never throws.
 *
 * @module intelligence/theory-of-mind/after-call
 */

import { withTimeout } from '../../utils/async.js';
import { createLogger } from '../../utils/safe-logger.js';
import { type CallSummaryView, type CallTurn, parseReading, readingPrompt } from './extract.js';
import type { MindStore } from './store.js';
import {
  emptyMindModel,
  nothingForgotten,
  withoutForgotten,
  type IsForgotten,
  type MindModel,
} from './types.js';
import { applyCallReading } from './update.js';

const log = createLogger({ module: 'TheoryOfMind' });

export function theoryOfMindMode(env: Record<string, string | undefined> = process.env): boolean {
  return env.THEORY_OF_MIND === 'on';
}

/** Too little of the caller to read anything from. */
const MIN_CALLER_TURNS = 2;
const AFTER_CALL_TIMEOUT_MS = 15_000;

export interface AfterCallInput {
  userId: string;
  sessionId: string;
  turns: CallTurn[];
  summary: CallSummaryView | null;
}

export interface AfterCallDeps {
  /** Where the model lives; the register hands in the Firestore adapter. */
  store: MindStore;
  /**
   * What the caller asked Ferni to forget. Nothing about it is sent to the
   * reading model or saved; null (unreadable) skips the update. Absent:
   * nothing is forgotten (tests).
   */
  forgotten?: () => Promise<IsForgotten | null>;
  /** Prompt in, raw reply out. Defaults to the background LLM used for summaries. */
  llm?: (prompt: string) => Promise<string>;
  now?: () => Date;
  env?: Record<string, string | undefined>;
}

async function defaultLlm(prompt: string): Promise<string> {
  const { callLLM } = await import('../../services/llm-utils.js');
  return (await callLLM(prompt, { maxTokens: 1200, temperature: 0.2, timeout: 12_000 })) ?? '';
}

async function update(input: AfterCallInput, deps: AfterCallDeps): Promise<MindModel | null> {
  const { store } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const forgotten = deps.forgotten ? await deps.forgotten() : nothingForgotten;
  if (!forgotten) {
    log.warn({ sessionId: input.sessionId }, 'Theory of mind skipped: forgotten topics unreadable');
    return null;
  }
  const stored = (await store.load(input.userId)) ?? emptyMindModel(input.userId, now);
  const model = withoutForgotten(stored, forgotten);
  const raw = await (deps.llm ?? defaultLlm)(readingPrompt(input.turns, input.summary, model));
  const reading = parseReading(raw);
  if (!reading) {
    log.warn({ sessionId: input.sessionId }, 'Theory of mind: no usable reading');
    return null;
  }
  const next = withoutForgotten(applyCallReading(model, reading, input.sessionId, now), forgotten);
  await store.save(next);
  log.info(
    {
      sessionId: input.sessionId,
      told: reading.told.length,
      observations: reading.observations.length,
      contradicted: reading.contradicted.length,
      patterns: next.patterns.length,
    },
    'Theory of mind updated'
  );
  return next;
}

/** The updated model, or null when off, skipped, or failed. */
export async function updateTheoryOfMindAfterCall(
  input: AfterCallInput,
  deps: AfterCallDeps
): Promise<MindModel | null> {
  if (!theoryOfMindMode(deps.env)) return null;
  const callerTurns = input.turns.filter((t) => t.role === 'user').length;
  if (!input.userId || callerTurns < MIN_CALLER_TURNS) return null;
  try {
    return await withTimeout(update(input, deps), AFTER_CALL_TIMEOUT_MS, 'theory-of-mind');
  } catch (error) {
    log.warn({ sessionId: input.sessionId, error: String(error) }, 'Theory of mind not updated');
    return null;
  }
}
