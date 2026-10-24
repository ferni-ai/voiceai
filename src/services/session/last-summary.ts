/**
 * A call with nothing to summarize keeps the last real summary.
 *
 * Prod call 2026-10-24 (#2744): the owner said "Uh," and left. The LLM summary
 * had no key points, but it carried callerProvenance (every summary has since
 * #1469), so endSession wrote '' to lastConversationSummary and
 * lastCallerSummary. The save safeguard (session-manager.ts saveProfile) then
 * stored "Had a 1-minute conversation" over the earlier call's summary, and
 * the next call lost "last time you talked about".
 *
 * KEEP_LAST_SUMMARY=on leaves both summaries as they were when the call has no
 * key points. The kept summary was provenance-checked when it was written.
 * Off by default: off writes exactly what it did before.
 *
 * @module services/session/last-summary
 */
import { flagOn, type Env } from '../../config/env-flag.js';

interface LastSummaryProfile {
  lastConversationSummary?: string;
  lastCallerSummary?: string;
}

interface CallSummary {
  keyPoints: string[];
  callerProvenance?: number;
}

/** Write the call's key points as the profile's last summaries, or keep the old ones. */
export function applyLastSummary(
  profile: LastSummaryProfile,
  summary: CallSummary,
  env: Env = process.env
): void {
  const points = summary.keyPoints.slice(0, 2);
  if (points.length === 0 && flagOn('KEEP_LAST_SUMMARY', env)) return;
  profile.lastConversationSummary = points.join('; ');
  if ((summary.callerProvenance ?? 0) > 0)
    profile.lastCallerSummary = profile.lastConversationSummary;
}
