/**
 * The LLM teacher: the turn reading from structured-output calls on the
 * per-turn model the agent already uses (the caller passes the client:
 * gemini-3.5-flash-lite via turn-understanding.ts). Shadow and offline
 * labelling only; it carries no per-field confidence. Its time phrases are
 * re-resolved by code (time-resolver.ts).
 *
 * mode "single": one call with every sub-question; "parallel": the focused
 * sub-questions as three calls at once (teacher-prompts.ts).
 *
 * @module understanding/llm-teacher
 */
import type { TurnReader } from './reader.js';
import { parseTurnReading } from './schema.js';
import { resolveTimes } from './time-resolver.js';
import { teacherCalls } from './teacher-prompts.js';

/** Sends one structured-output request; resolves to the model's raw JSON text. */
export type GenerateFn = (
  system: string,
  user: string,
  schema: Record<string, unknown>,
  signal: AbortSignal
) => Promise<string>;

export function llmTeacher(
  generate: GenerateFn,
  mode: 'single' | 'parallel' = 'single'
): TurnReader {
  const id = `llm-teacher-${mode}`;
  return {
    id,
    async read(input, signal) {
      const calls = teacherCalls(input, mode);
      const parts = await Promise.all(
        calls.map(async (c) => c.parse(await generate(c.system, c.user, c.schema, signal)))
      );
      if (parts.some((p) => p === null)) return null;
      const read = parseTurnReading(Object.assign({}, ...parts));
      if (!read) return null;
      const { reading } = resolveTimes(read, new Date(input.callTimestamp), input.callerTimezone);
      return { reading, confidence: {}, backend: id };
    },
  };
}
