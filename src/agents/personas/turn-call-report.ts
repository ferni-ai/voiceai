/**
 * The call report on a turn's request (CALL_REPORT_REACHES_YOU, #3080): a crisis-guided request
 * never carries it, and any other request marks it delivered once its reply is released.
 *
 * @module agents/personas/turn-call-report
 */
import type { llm } from '@livekit/agents';
import {
  confirmCallReportReached,
  withoutCallReport,
} from '../../intelligence/context-builders/external/call-report.js';

/** The request, without the call report when crisis guidance shapes the reply. */
export function withoutReportInCrisis(chatCtx: llm.ChatContext, crisis: boolean): llm.ChatContext {
  return crisis ? withoutCallReport(chatCtx) : chatCtx;
}

/** A report this request carries is delivered once its reply is released (crisis-gate.ts). */
export function noteCallReportReached(
  sessionId: string | undefined,
  chatCtx: llm.ChatContext,
  turn: { latest: string; held?: PromiseLike<unknown> | null; crisis: boolean }
): void {
  if (!turn.crisis) void confirmCallReportReached(sessionId, chatCtx.items, turn);
}
