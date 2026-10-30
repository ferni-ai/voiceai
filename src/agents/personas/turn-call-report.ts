/**
 * The call report on a turn's request (CALL_REPORT_REACHES_YOU, #3080): it never rides a request
 * with any safety signal, and any other request marks it delivered once its reply is released.
 *
 * One check, at the one place every model request passes (withTurnReminder), decided from the
 * signals themselves rather than from each crisis path: a crisis-shaped request, any safety
 * guidance in it (a marked note, or a pushed note holding some), or crisis risk noted on the
 * call. Each crisis path found its own way past a per-path strip (#3080 r1-r7); a new path is
 * covered as long as it marks its guidance, which the injection filter and pusher already do.
 *
 * @module agents/personas/turn-call-report
 */
import type { llm } from '@livekit/agents';
import {
  confirmCallReportReached,
  withoutCallReport,
} from '../../intelligence/context-builders/external/call-report.js';
import { crisisRiskNoted } from '../../services/safety/crisis-call-risk.js';
import { TURN_CONTEXT_SAFETY } from '../multi-agent/pushed-notes.js';
import { carriesSafety } from '../processors/turn-processor/safety-note.js';

/** Any safety signal on this request or call. Fails safe: an error holds the report. */
function reportMustWait(
  chatCtx: llm.ChatContext,
  sessionId: string | undefined,
  crisis: boolean
): boolean {
  try {
    if (crisis || (sessionId !== undefined && crisisRiskNoted(sessionId))) return true;
    return chatCtx.items.some((item) => {
      const extra = (item as { extra?: Record<string, unknown> }).extra;
      return carriesSafety({ extra }) || Boolean(extra?.[TURN_CONTEXT_SAFETY]);
    });
  } catch {
    return true;
  }
}

/** The request, without the call report when any safety signal is on it, and whether it waits. */
export function turnRequestFor(
  chatCtx: llm.ChatContext,
  sessionId: string | undefined,
  crisis: boolean
): [request: llm.ChatContext, waits: boolean] {
  const waits = reportMustWait(chatCtx, sessionId, crisis);
  return [waits ? withoutCallReport(chatCtx) : chatCtx, waits];
}

/** A report this request carries is delivered once its reply is released (crisis-gate.ts). */
export function noteCallReportReached(
  sessionId: string | undefined,
  chatCtx: llm.ChatContext,
  turn: { latest: string; held?: PromiseLike<unknown> | null; crisis: boolean }
): void {
  if (!turn.crisis) void confirmCallReportReached(sessionId, chatCtx.items, turn);
}
