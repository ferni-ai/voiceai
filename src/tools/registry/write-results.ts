/**
 * LATE_WRITE_RESULT_KEPT (off by default): a write tool that finishes after the caller's
 * barge-in aborted its reply still gets its result into the model's context.
 *
 * On an abort, LiveKit 1.9.3 stops waiting for a running tool (`_waitForToolExecutionResult`
 * in voice/generation.js returns `isAborted`) and records no output for it, while the tool's
 * execute() runs on and usually finishes the write. The model's context keeps the bare call,
 * which the provider drops as unpaired, so the model never learns the write happened and a
 * re-ask runs it again (tool-calling audit, unit U2). A tool that finished before the abort is
 * fine: the SDK commits its output itself (`_commitInterruptedToolOutputs`).
 *
 * With the flag on, a listed tool's result that arrives after its run was aborted is handed to
 * the live call's port (agents/multi-agent/late-write-result.ts), which puts it in the agent's
 * chat context right after its call. Nothing waits: the barge-in still stops the reply at once.
 * The SDK lives outside this layer, so the port is installed by each live call.
 *
 * @module tools/registry/write-results
 */
import { flagOn } from '../../config/env-flag.js';
import type { Tool, ToolContext, ToolDefinition } from './types.js';

/**
 * Tools that change something the caller would not want done twice. Crisis, support and
 * human-transfer tools are never listed (write-results.test.ts pins it).
 */
const WRITE_RESULT_TOOLS: ReadonlySet<string> = new Set([
  // reminders
  ...['setReminder', 'cancelReminder', 'cancelRecurringReminder', 'scheduleReminder'],
  ...['createCoordinatedReminder', 'scheduleProactiveReminder'],
  // calendar
  ...['createCalendarEvent', 'updateCalendarEvent', 'deleteCalendarEvent', 'blockRecoveryTime'],
  ...['scheduleEventNatural', 'scheduleAtBestTime'],
  // calls, texts and emails, now or later
  ...['callOnBehalf', 'reachOut', 'sendMessageNow', 'sendImmediateOutreach', 'sendBatchMessages'],
  ...['callUser', 'scheduleCall', 'scheduleMessage', 'scheduleEmail', 'scheduleFollowUp'],
  'cancelScheduled',
  // alarms, timers, lists, tasks, contacts
  ...['setAlarm', 'deleteAlarm', 'snoozeAlarm', 'setTimer', 'cancelTimer'],
  ...['addToList', 'removeFromList', 'createList', 'deleteList'],
  ...['addProjectTask', 'completeProjectTask', 'saveContact', 'saveContactInfo'],
]);

/**
 * Puts a result that arrived after its run was aborted into the call's chat context. `opts`
 * is the SDK's second execute() argument ({ ctx, toolCallId, abortSignal }).
 */
type LateWriteResultPort = (opts: unknown, result: unknown) => void;

let port: LateWriteResultPort | undefined;

/** Installed by each live call (agents/multi-agent/late-write-result.ts); undefined clears it. */
export function setLateWriteResultPort(next: LateWriteResultPort | undefined): void {
  port = next;
}

/** Marks a tool already wrapped here, so re-registering a stored definition adds no layer. */
const KEPT = Symbol.for('ferni.late-write-result');

const aborted = (opts: unknown): boolean =>
  (opts as { abortSignal?: { aborted?: unknown } } | undefined)?.abortSignal?.aborted === true;

/** The definition, with a listed tool's late result kept (above); any other is returned as is. */
export function keepLateWriteResults(def: ToolDefinition): ToolDefinition {
  if (!WRITE_RESULT_TOOLS.has(def.id)) return def;
  return {
    ...def,
    create: (ctx: ToolContext): Tool => {
      const tool: Tool = def.create(ctx);
      if (typeof tool === 'object' && tool !== null && KEPT in tool) return tool;
      type Execute = (a: unknown, o?: unknown) => Promise<unknown>;
      const execute = (tool as { execute: Execute }).execute.bind(tool);
      const run = async (args: unknown, opts?: unknown): Promise<unknown> => {
        const result = await execute(args, opts);
        // Checked as the result arrives: not aborted yet means the SDK records it itself.
        if (aborted(opts) && flagOn('LATE_WRITE_RESULT_KEPT')) port?.(opts, result);
        return result;
      };
      return { ...tool, execute: run, [KEPT]: true } as Tool;
    },
  };
}
