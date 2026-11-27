/**
 * TOOL_COVERAGE_SHADOW (off by default): log-only measurement behind #4399.
 *
 * Every session offers the same 13 always-on tool domains (BASE_ALWAYS_DOMAINS), about 250
 * tools, whatever the caller asked for. Shrinking that set is a choice between three options,
 * and the right one depends on how often a tool outside a smaller core is actually called.
 * With the flag on, each tool call logs
 *   { sessionId, domain, inCore, intentNamedDomain, userTextFound }
 * and the first selection of a session logs its schema token estimate. Booleans, a domain name
 * and the session id only: never the caller's words, arguments or results. Nothing is changed
 * or withheld: the tool runs exactly as without the flag, and a failure here never reaches
 * the turn.
 *
 * @module tools/orchestrator/coverage-shadow
 */
import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { detectToolIntent } from '../dynamic-tool-router.js';
import { toolRegistry } from '../registry/index.js';
import type { Tool } from '../registry/types.js';

const log = createLogger({ module: 'ToolCoverageShadow' });

/**
 * The candidate core: the smallest set that still covers a turn-one ask like "call my mom".
 * - telephony: callOnBehalf, callStatus
 * - calendar: manageContact, which finds "mom" in the address book (its domain is calendar)
 * - communication: texts and emails ("text her I'm late"), reachOut
 * - scheduling: the reminders and "call her tomorrow" that follow a call ask
 * - memory: "remember she likes..." and recall, the most-called non-handoff tools
 * - handoff: switching persona is the most-called tool in prod (handoffTo*)
 * Left out on purpose, so the shadow counts their calls: productivity, family, habits,
 * wellness, entertainment, information, games (the other seven always-on domains), and
 * human-transfer. A crisis tool outside the core would be a finding, not a decision.
 */
const CANDIDATE_CORE_DOMAINS: ReadonlySet<string> = new Set([
  'telephony',
  'calendar',
  'communication',
  'scheduling',
  'memory',
  'handoff',
]);

/** Marks a tool already wrapped, so a cached tool set picked again adds no layer. */
const SHADOWED = Symbol.for('ferni.tool-coverage-shadow');

/** Sessions whose schema size is logged: once each. Cleared when large, so it cannot grow. */
const sizeLogged = new Set<string>();
const MAX_TRACKED_SESSIONS = 1000;

type Execute = (args: unknown, opts?: unknown) => Promise<unknown>;

/** The registry's domain for a tool; a handoff tool is built outside the registry. */
function domainOf(name: string): string {
  const registered = toolRegistry.get(name)?.domain;
  if (registered) return registered;
  return /^handoffTo/.test(name) ? 'handoff' : 'unregistered';
}

/** The caller's latest message in the live session, read from the SDK's run context. */
function lastUserText(opts: unknown): string | undefined {
  const items = (opts as { ctx?: { session?: { history?: { items?: readonly unknown[] } } } })?.ctx
    ?.session?.history?.items;
  if (!items) return undefined;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i] as { type?: string; role?: string; textContent?: string };
    if (item?.type && item.type !== 'message') continue;
    if (item?.role === 'user') return item.textContent;
  }
  return undefined;
}

/** Same estimate as the orchestrator's budget check: 10 + description/4 + 50 per tool. */
function schemaTokenEstimate(tools: Record<string, Tool>): number {
  return Object.values(tools).reduce<number>((total, tool: { description?: string }) => {
    return total + 10 + Math.round((tool.description?.length ?? 0) / 4) + 50;
  }, 0);
}

function logCall(name: string, sessionId: string | undefined, opts: unknown): void {
  const domain = domainOf(name);
  const text = lastUserText(opts);
  log.info(
    {
      sessionId,
      domain,
      inCore: CANDIDATE_CORE_DOMAINS.has(domain),
      intentNamedDomain: text !== undefined && detectToolIntent(text).domains.includes(domain),
      userTextFound: text !== undefined,
    },
    'Tool coverage'
  );
}

function logSize(tools: Record<string, Tool>, sessionId: string | undefined): void {
  if (sessionId !== undefined) {
    if (sizeLogged.has(sessionId)) return;
    if (sizeLogged.size >= MAX_TRACKED_SESSIONS) sizeLogged.clear();
    sizeLogged.add(sessionId);
  }
  log.info(
    { sessionId, toolCount: Object.keys(tools).length, schemaTokens: schemaTokenEstimate(tools) },
    'Tool coverage schema size'
  );
}

function shadowed(name: string, tool: Tool, sessionId: string | undefined): Tool {
  const { execute } = tool as { execute?: Execute };
  if (typeof execute !== 'function' || SHADOWED in tool) return tool;
  const run: Execute = async (args, opts) => {
    try {
      logCall(name, sessionId, opts);
    } catch {
      // measurement only: the tool still runs
    }
    return execute.call(tool, args, opts);
  };
  const original: unknown = tool;
  return { ...(original as object), execute: run, [SHADOWED]: true };
}

/**
 * The same tool set with each tool's calls counted (above). Flag off, or anything failing
 * while wrapping: the very set that came in.
 */
function withCoverageShadow(
  tools: Record<string, Tool>,
  sessionId: string | undefined
): Record<string, Tool> {
  try {
    if (!flagOn('TOOL_COVERAGE_SHADOW')) return tools;
    logSize(tools, sessionId);
    return Object.fromEntries(
      Object.entries(tools).map(([name, tool]) => [name, shadowed(name, tool, sessionId)])
    );
  } catch {
    return tools;
  }
}

/** `withCoverageShadow` for a pending tool selection: a selection that fails still fails as before. */
export async function shadowSelection<T extends { tools: Record<string, Tool> }>(
  pending: Promise<T>,
  sessionId: string | undefined
): Promise<T> {
  const selection = await pending;
  return { ...selection, tools: withCoverageShadow(selection.tools, sessionId) };
}
