/**
 * Call results as the server writes them, built by the real producers with GROUNDED_CLAIMS on
 * (pending-call-results.ts, call-recall.ts), so claim tests track the real status tag and fence.
 * Fictional people only.
 */
import { llm } from '@livekit/agents';

import { formatPendingCallResults } from '../../../intelligence/context-builders/external/pending-call-results.js';
import { recallLine } from '../../../services/outreach/call-recall.js';
import type { RecalledCall } from '../../../tools/domains/telephony/call-status-tool.js';

let n = 0;

/** `make()` with GROUNDED_CLAIMS on, as the producers read it from process.env. */
function flagged<T>(make: () => T): T {
  const before = process.env.GROUNDED_CLAIMS;
  process.env.GROUNDED_CLAIMS = 'on';
  try {
    return make();
  } finally {
    if (before === undefined) delete process.env.GROUNDED_CLAIMS;
    else process.env.GROUNDED_CLAIMS = before;
  }
}

/** The pending-call-results system note for one call: 'completed' got through, anything else didn't. */
export function pendingReport(
  name: string,
  status: 'completed' | 'busy' | 'no_answer' | 'failed',
  outcome: string
): llm.ChatMessage {
  const content = flagged(() =>
    formatPendingCallResults([
      {
        callId: `pending-${++n}`,
        contactName: name,
        status,
        connected: status === 'completed',
        outcome,
        objectiveAchieved: status === 'completed',
        callbackRequired: false,
        capturedAt: new Date().toISOString(),
      },
    ])
  );
  return llm.ChatMessage.create({ role: 'system', content });
}

/** A callStatus result for the caller's "did you call my mom?". */
export function callStatusResult(
  call: RecalledCall | undefined,
  who = 'mom'
): llm.FunctionCallOutput {
  const output = flagged(() => recallLine(call, who, Date.now()));
  return llm.FunctionCallOutput.create({
    callId: `status-${++n}`,
    name: 'callStatus',
    output,
    isError: false,
  });
}

const HOUR = 3_600_000;
/** Ferni called them and they answered, `hoursAgo` hours ago. */
export const answered = (name: string, hoursAgo = 24, said?: string): RecalledCall => ({
  state: 'done',
  name,
  at: Date.now() - hoursAgo * HOUR,
  detail: 'they answered',
  through: true,
  said,
});
/** Ferni tried and no one picked up. */
export const unanswered = (name: string, hoursAgo = 2): RecalledCall => ({
  state: 'failed',
  name,
  at: Date.now() - hoursAgo * HOUR,
  detail: 'no one picked up',
});
