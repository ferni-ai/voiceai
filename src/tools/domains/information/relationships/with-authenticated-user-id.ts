/**
 * User ID Guard for Relationship Tools
 *
 * The relationship tools below accept `userId` as an LLM-supplied tool
 * argument rather than reading it from the session's `ToolContext`. In
 * practice the LLM can pass the speaker's display name (e.g. "Sam") instead
 * of their authenticated user id (e.g. "voice-eval-sam"), which would save
 * and read relationship data under the wrong Firestore path.
 *
 * Wrapping each tool with `withAuthenticatedUserId` discards whatever
 * `userId` the LLM supplied and substitutes the real one from `ctx.userId`,
 * which the session already resolved and verified. The generic keeps the
 * wrapped tool's real type (rather than this project's `Tool = any` alias),
 * so callers don't pick up new `no-unsafe-return`-style lint findings.
 */
import type { ToolContext } from '../../../registry/types.js';

export function withAuthenticatedUserId<T extends { execute: (...args: never[]) => unknown }>(
  tool: T,
  ctx: ToolContext
): T {
  const originalExecute = tool.execute as (
    args: Record<string, unknown>,
    ...rest: unknown[]
  ) => unknown;
  const execute = ((args: Record<string, unknown>, ...rest: unknown[]) =>
    originalExecute({ ...args, userId: ctx.userId }, ...rest)) as T['execute'];
  return { ...tool, execute };
}
