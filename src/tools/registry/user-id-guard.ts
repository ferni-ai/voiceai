/**
 * Tool Registry — userId Guard
 *
 * SECURITY: ~70 domain tools declare `userId: z.string()` as an LLM-supplied
 * tool argument and use that value to read/write the user's data. Nothing
 * previously stopped a confused or prompt-injected model from sending a
 * DIFFERENT user's id, letting it act on another user's records.
 *
 * This module wraps a tool's `create()` factory so that, at the single
 * choke point every live tool-call path shares (`ToolRegistry.register()`),
 * the real session identity (`ctx.userId`) always wins over whatever the
 * model put in `args.userId` — never the other way around.
 *
 * Several existing tool definitions use `create: (_ctx) => legacyTool`,
 * which DISCARDS ctx entirely. Overriding has to happen at the `execute(args)`
 * boundary of the tool `create(ctx)` returns, not by editing ctx, since the
 * legacy factories never look at it.
 *
 * USAGE: `ToolRegistry.register()` calls `wrapCreateWithUserIdGuard(definition)`
 * and stores the result as `definition.create`. Nothing else needs to change.
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { Tool, ToolContext, ToolDefinition } from './types.js';

const log = createLogger({ module: 'tool-registry' });

// ============================================================================
// PLACEHOLDER IDS
// ============================================================================

/**
 * ctx.userId values that are NOT a real, individual user identity.
 *
 * These show up for shared/system contexts (e.g. the shared essential-tools
 * cache uses ctx.userId === 'shared'). When ctx.userId is one of these, we
 * leave whatever the model sent untouched so today's behavior holds.
 */
export const PLACEHOLDER_USER_IDS: ReadonlySet<string> = new Set([
  'anonymous',
  'shared',
  'default',
  '',
  'unknown',
]);

/**
 * True when `userId` is a real, individual user identity — a non-empty
 * string that isn't one of the known placeholder values.
 */
export function isRealUserId(userId: unknown): userId is string {
  return typeof userId === 'string' && !PLACEHOLDER_USER_IDS.has(userId);
}

// ============================================================================
// SCHEMA INSPECTION
// ============================================================================

function hasOwnKey(value: unknown, key: string): boolean {
  return (
    value !== null && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key)
  );
}

/**
 * Does a tool's parameter schema declare a `userId` field?
 *
 * Handles both a Zod object schema (`z.object({...}).shape.userId`, what
 * `@livekit/agents`' `llm.tool()` stores verbatim as `tool.parameters`) and a
 * raw JSON Schema (`{ type: 'object', properties: { userId: {...} } }`).
 */
function parametersDeclareUserId(parameters: unknown): boolean {
  if (parameters === null || typeof parameters !== 'object') {
    return false;
  }

  const { shape } = parameters as { shape?: unknown };
  if (hasOwnKey(shape, 'userId')) {
    return true;
  }

  const { properties } = parameters as { properties?: unknown };
  return hasOwnKey(properties, 'userId');
}

function isPlainArgsObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ============================================================================
// GUARD APPLICATION
// ============================================================================

/**
 * Marks a `create` function (or the `Tool` it returns) as already guarded,
 * so re-registering an already-wrapped definition — or calling this module
 * twice on the same input — never stacks a second wrapper layer.
 */
const GUARD_APPLIED = Symbol.for('ferni.tools.userIdGuardApplied');

type UnknownRecord = Record<PropertyKey, unknown>;

/**
 * Wrap a single created `Tool` instance's `execute` so the session's real
 * `ctx.userId` overrides whatever the model supplied, logging once per call
 * when the two differ.
 */
function applyUserIdGuardToTool(toolValue: Tool, toolId: string, ctx: ToolContext): Tool {
  const tool = toolValue as UnknownRecord | null | undefined;

  if (tool === null || tool === undefined || typeof tool.execute !== 'function') {
    return toolValue;
  }
  if (tool[GUARD_APPLIED] === true) {
    return toolValue;
  }

  // Preserve `this` binding: call the original execute as a method of the
  // original tool object, exactly as it would have been invoked directly.
  const originalExecute = (
    tool.execute as (args: unknown, ...rest: unknown[]) => Promise<unknown>
  ).bind(tool);
  const declaresUserId = parametersDeclareUserId(tool.parameters);

  const guardedExecute = async (args: unknown, ...rest: unknown[]): Promise<unknown> => {
    const argsIsObject = isPlainArgsObject(args);
    const argsHasUserIdKey = argsIsObject && Object.prototype.hasOwnProperty.call(args, 'userId');
    const appliesToThisTool = declaresUserId || argsHasUserIdKey;

    let finalArgs: unknown = args;

    if (appliesToThisTool && isRealUserId(ctx.userId)) {
      const base: Record<string, unknown> = argsIsObject ? args : {};
      const modelSuppliedUserId = base.userId;

      if (modelSuppliedUserId !== ctx.userId) {
        if (modelSuppliedUserId !== undefined) {
          log.warn(
            { toolId, userIdOverridden: true },
            'Tool-supplied userId did not match session identity; overriding with session userId'
          );
        }
        finalArgs = { ...base, userId: ctx.userId };
      }
    }

    const result = await originalExecute(finalArgs, ...rest);
    return result;
  };

  const guardedTool: Tool = { ...tool, execute: guardedExecute, [GUARD_APPLIED]: true };
  return guardedTool;
}

/**
 * Wrap a `ToolDefinition.create` factory so every `Tool` it produces has the
 * userId guard applied, using whatever `ctx` the factory is actually called
 * with (not the ctx captured by any legacy closure).
 *
 * Idempotent: if `definition.create` was already wrapped by this function
 * (e.g. the definition came back out of the registry and is being
 * re-registered), the SAME function reference is returned rather than
 * stacking another layer.
 */
export function wrapCreateWithUserIdGuard(definition: ToolDefinition): ToolDefinition['create'] {
  const originalCreate = definition.create;
  const originalCreateMarker = originalCreate as unknown as UnknownRecord;

  if (originalCreateMarker[GUARD_APPLIED] === true) {
    return originalCreate;
  }

  const toolId = definition.id;
  const guardedCreate = (ctx: ToolContext): Tool =>
    applyUserIdGuardToTool(originalCreate(ctx), toolId, ctx);

  (guardedCreate as unknown as UnknownRecord)[GUARD_APPLIED] = true;
  return guardedCreate;
}
