/**
 * What a music tool call came to, for the "Tool execution tracked" log line.
 *
 * The agent counts a tool error only when the tool throws, so "Spotify isn't
 * connected" counted as a success: 11 prod music calls in 7 days all read as
 * fine while every one fell back to a 30-second iTunes preview (integration
 * audit, 2026-10-29). `outcome` is `error` when the tool threw, `unavailable`
 * when its reply says Spotify or the audio system could not be used, `ok`
 * otherwise. Only music tools get an ok/unavailable verdict; for any other
 * tool a non-error call has no outcome, since nothing here checked it.
 *
 * A call that read a linked account's token also carries link_provider,
 * link_uid_tag and link_state (linkOutcome below).
 *
 * @module agents/voice-agent/tool-outcome
 */

import { bqHash } from '../../services/analytics/bq-events.js';
import { takeLinkedTokenUse, type LinkState } from '../../utils/linked-token-use.js';

export type ToolOutcome = 'ok' | 'unavailable' | 'error';

/** What music replies say when Spotify or the audio system could not be used (tools/domains/entertainment: music.ts, ambient-play.ts, music-honesty.ts). */
const UNAVAILABLE =
  /spotify isn't (connected|linked)|link your (spotify|account)|isn't available in this session|playback is currently disabled|audio system (isn't ready|didn't)/i;

function readable(result: unknown): string {
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result) ?? '';
  } catch {
    return '';
  }
}

export function toolOutcome(
  isMusicTool: boolean,
  result: unknown,
  hasError: boolean
): ToolOutcome | undefined {
  if (hasError) return 'error';
  if (!isMusicTool) return undefined;
  return UNAVAILABLE.test(readable(result)) ? 'unavailable' : 'ok';
}

/**
 * The link fields of a tool call that read a linked account's token
 * (utils/linked-token-use.ts records the read). WHOSE token is a keyed hash:
 * link_uid_tag is bqHash('user', owner uid), the same value as BigQuery's
 * user_hash, never the uid; null without LOG_HASH_SECRET. Undefined when the
 * call read no linked token, so the line simply has no link fields.
 */
export interface LinkOutcome {
  link_provider: string;
  link_uid_tag: string | null;
  link_state: LinkState;
}

export function linkOutcome(callId: string | undefined): LinkOutcome | undefined {
  const use = takeLinkedTokenUse(callId);
  if (!use) return undefined;
  return {
    link_provider: use.provider,
    link_uid_tag: use.ownerUid ? bqHash('user', use.ownerUid) : null,
    link_state: use.state,
  };
}

/**
 * What any tool call came to, for TURN_RECEIPT tools.outcomes (turn-receipt-tool-timing.ts), so
 * a lookup turn that answered from no data can be told from one that had data (2026-10-30 dev
 * sweep: 6 of 6 searches came back "No results" and the receipt said only called/errors). Read
 * from the output where it passes; only the enum is kept. A thrown tool is `error`; an
 * unlinked account `not_connected`; a missing key or disabled service `unconfigured`; an empty
 * or "no results" reply `no_data`; anything else `data`.
 */
export type ReceiptToolOutcome =
  'data' | 'no_data' | 'unconfigured' | 'error' | 'not_connected' | 'unknown'; // the call's output wasn't in the event (turn-receipt-tool-timing.ts)

const NOT_CONNECTED =
  /\b(?:isn't|is not|not|aren't) (?:connected|linked)\b|\b(?:link|connect) your (?:\w+ )?account\b|\blink your spotify\b/i;
const UNCONFIGURED =
  /\b(?:isn't|is not|not) (?:configured|set up)\b|\bisn't available in this session\b|\bplayback is currently disabled\b|\bno api key\b/i;
const NO_DATA =
  /\[status: no_results\]|\bno results\b|\b(?:couldn't|could not|didn't|did not) find\b|\bnothing (?:came|turned) up\b|\bno (?:matches|data)\b/i;

export function receiptToolOutcome(output: unknown, isError: boolean): ReceiptToolOutcome {
  if (isError) return 'error';
  const text = readable(output);
  if (/\[status: error\]|\baudio system (?:isn't ready|didn't)/i.test(text)) return 'error';
  if (NOT_CONNECTED.test(text)) return 'not_connected';
  if (UNCONFIGURED.test(text)) return 'unconfigured';
  if (!text.replace(/["\s[\]{}]|null/g, '') || NO_DATA.test(text)) return 'no_data';
  return 'data';
}
