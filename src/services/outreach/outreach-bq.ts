/**
 * outreach_events rows (analytics/bq-events.ts) for texts and proactive check-ins:
 * what happened, on which channel, of which kind, and a short reason code. Never the
 * words, the number or a name. The member is a keyed hash, so rows are pseudonymous.
 *
 * @module services/outreach/outreach-bq
 */
import { emitEvent } from '../analytics/bq-events.js';
import type { BqEnum } from '../analytics/bq-fields.js';
import type { TextKind } from './checkin-replies.js';
import type { OnBehalfSkip, TextSkip } from './guarded-text.js';
import type { OutreachLogEntry, OutreachOutcome } from './proactive-channels/outreach-log.js';
import type { ProactiveChannel, ProactiveTrigger } from './proactive-channels/types.js';

type TextResult = { sent: boolean; reason?: TextSkip | OnBehalfSkip };

// Compile-time: every code these producers can send is on its BigQuery allowlist (bq-fields.ts).
type Covers<T, U> = [T] extends [U] ? true : never;
export const ALLOWLIST_COVERS: true[] = [
  true satisfies Covers<TextSkip | OnBehalfSkip, BqEnum<'reason'>>,
  true satisfies Covers<TextKind | ProactiveTrigger['kind'], BqEnum<'kind'>>,
  true satisfies Covers<ProactiveChannel, BqEnum<'channel'>>,
  true satisfies Covers<OutreachOutcome, BqEnum<'outcome'>>,
];
const NOT_SENT: Record<string, string> = {
  'send-failed': 'fail',
  'quiet-hours': 'hold',
  'focus-held': 'hold',
};

/**
 * Records a guarded text's outcome and hands it back: sent, held (quiet hours, a Focus), skipped or
 * failed. An on-behalf text goes to someone other than the member (third_party).
 */
export function reportText<const O extends TextResult>(userId: string, kind: TextKind, o: O): O {
  const type = o.sent ? 'send' : (NOT_SENT[o.reason ?? ''] ?? 'skip');
  const thirdParty = kind === 'on-behalf';
  emitEvent(
    'outreach_events',
    { event_type: type, channel: 'sms', kind, reason: o.reason ?? null, third_party: thirdParty },
    { userId }
  );
  return o;
}

/** A proactive check-in's log entry. entry.reason is a sentence, so only enum fields go out. */
export function reportOutreachLog(userId: string, entry: OutreachLogEntry): void {
  emitEvent(
    'outreach_events',
    {
      event_type: entry.outcome === 'failed' ? 'fail' : 'send',
      channel: entry.channel,
      kind: entry.kind,
      outcome: entry.outcome,
      reason: entry.fallbackFrom ? `fallback_from_${entry.fallbackFrom}` : null,
      third_party: false,
    },
    { userId }
  );
}
