/**
 * TOOL_RESULT_ERRORS=on: a tool that returns `{ success: false, ... }` reaches the model as an
 * error result, not a success. Today the SDK sends any returned value with isError false
 * (@livekit/agents voice/generation.js createToolOutput), so a failed booking, lookup or save
 * reads to the model, and to every isError reader (action claims, turn receipts, tool tracking),
 * as a tool that worked.
 *
 * On the SDK's own tool call (opts.ctx is the voice RunContext), the result is RETURNED as an
 * llm.ToolError whose message is the same JSON the model read before (JSON.stringify of the
 * result). The SDK sends a returned ToolError's message as the output with isError true, so the
 * model reads the same words, now marked as a failure, and still gets a reply turn. Returned, not
 * thrown: the SDK logs a thrown error's message at error level, and the result can hold caller
 * words. Code that runs a tool itself (the semantic router, the tool executors) has no RunContext
 * and gets the result as before.
 *
 * Tools (L3) may not import the SDK, so every live call installs those two SDK pieces through
 * ToolErrorPort (agents/multi-agent/tool-error-adapter.ts). Not installed: nothing changes.
 *
 * Exempt, always byte-identical: every tool of the safety set's domains (crisis, human transfer,
 * presence, trauma support; the set persona-toolsets.ts SAFETY_TOOLS holds) and sendSupportCall.
 * Their results reach the model exactly as they do on main.
 *
 * ToolRegistry.register() runs every definition through this. Off: create() returns the very tool
 * it built before, so nothing changes.
 *
 * @module tools/registry/result-errors
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { Tool, ToolContext, ToolDefinition } from './types.js';

const log = createLogger({ module: 'tool-registry' });

/** What this needs from the SDK, installed by the call session. */
export interface ToolErrorPort {
  /** True when the SDK runs the tool for the model: `opts.ctx` is its voice RunContext. */
  sdkRun: (opts: unknown) => boolean;
  /** The SDK's error result (an llm.ToolError) carrying `text`, for the tool to return. */
  error: (text: string) => unknown;
}

let port: ToolErrorPort | undefined;

export function setToolErrorPort(next: ToolErrorPort | undefined): void {
  port = next;
}

/** Domains whose results are never changed: the crisis lane's tools. */
const EXEMPT_DOMAINS: ReadonlySet<string> = new Set([
  'crisis',
  'human-transfer',
  'presence',
  'trauma-support',
]);

/** Support tools outside those domains (referral rings a support person). */
const EXEMPT_IDS: ReadonlySet<string> = new Set(['sendSupportCall']);

const exempt = (def: ToolDefinition): boolean =>
  EXEMPT_IDS.has(def.id) ||
  EXEMPT_DOMAINS.has(def.domain) ||
  (def.additionalDomains ?? []).some((d) => EXEMPT_DOMAINS.has(d));

/**
 * A create() that register() already built carries this layer: user-id-guard.ts marks it with this
 * symbol. Re-registering the stored definition (parallel init) must not stack a second wrapper.
 */
const REGISTERED = Symbol.for('ferni.tools.userIdGuardApplied');
const builtByRegister = (def: ToolDefinition): boolean =>
  Reflect.get(def.create, REGISTERED) === true;

/** The JSON the model would read for a `{ success: false }` result, or undefined for any other. */
function failureText(result: unknown): string | undefined {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) return undefined;
  if ((result as { success?: unknown }).success !== false) return undefined;
  try {
    return JSON.stringify(result);
  } catch {
    return undefined; // not serialisable: leave it to the SDK, as on main
  }
}

interface Runnable {
  execute: (...args: unknown[]) => Promise<unknown>;
}
const runnable = (t: unknown): t is Runnable =>
  typeof t === 'object' && t !== null && typeof (t as Partial<Runnable>).execute === 'function';

function wrapTool(t: unknown, toolId: string): unknown {
  if (!runnable(t)) return t;
  const execute = t.execute.bind(t);
  const asError = async (...args: unknown[]): Promise<unknown> => {
    const result = await execute(...args);
    const sdk = port;
    if (!sdk?.sdkRun(args[1])) return result; // no live call, or code running the tool itself
    const text = failureText(result);
    if (text === undefined) return result;
    log.info({ toolId, reason: 'tool_result_error', length: text.length }, 'TOOL_RESULT_ERRORS');
    return sdk.error(text);
  };
  return { ...t, execute: asError }; // a second layer passes a ToolError through
}

/**
 * The definition with `{ success: false }` results sent as errors when TOOL_RESULT_ERRORS is on
 * (read each time a tool is built). An exempt definition comes back as the same object.
 */
export function withToolResultErrors(definition: ToolDefinition, env?: Env): ToolDefinition {
  if (exempt(definition) || builtByRegister(definition)) return definition;
  const build = definition.create;
  const create = (ctx: ToolContext): Tool => {
    const tool: unknown = build(ctx);
    return flagOn('TOOL_RESULT_ERRORS', env) ? wrapTool(tool, definition.id) : tool;
  };
  return { ...definition, create };
}
