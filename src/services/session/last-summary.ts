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
 * Neither summary carries what the caller asked Ferni to forget (#2767): the
 * next call's prompt (agent-setup lastTalkedAbout) and greeting
 * (greeting-direction callerHistory) read them unchecked. A forgotten key
 * point is not written, here or by the call-end summary pass (forget-key-points.ts);
 * a summary already on the profile that is about a forgotten topic is cleared
 * on every save (keptSummaries), and when the forget is recorded (forget.ts). If the topics can't be read, the save
 * leaves both stored summaries as they were rather than write an unchecked one.
 *
 * @module services/session/last-summary
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import type { ForgottenCheck } from '../../memory/recall/forget-every-reader.js';
import { summaryCheck } from '../../memory/recall/forget-key-points.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'last-summary' });

interface LastSummaryProfile {
  lastConversationSummary?: string;
  lastCallerSummary?: string;
}

interface CallSummary {
  keyPoints: string[];
  callerProvenance?: number;
}

/**
 * Write the call's key points as the profile's last summaries, or keep the old ones.
 * `forgotten` (lastSummaryCheck) drops key points about a forgotten topic; null, when
 * the topics couldn't be read, writes nothing.
 */
export function applyLastSummary(
  profile: LastSummaryProfile,
  summary: CallSummary,
  env: Env = process.env,
  forgotten: ForgottenCheck | null = () => false
): void {
  if (!forgotten) return;
  const points = summary.keyPoints.filter((p) => !forgotten(p)).slice(0, 2);
  if (points.length === 0 && flagOn('KEEP_LAST_SUMMARY', env)) return;
  profile.lastConversationSummary = points.join('; ');
  if ((summary.callerProvenance ?? 0) > 0)
    profile.lastCallerSummary = profile.lastConversationSummary;
}

/** The check for the caller's forgotten topics (memory/recall/forget-key-points.ts). */
export const lastSummaryCheck = summaryCheck;

/**
 * The profile as it may be saved: a last summary about a forgotten topic is
 * cleared. With no check (topics unreadable) both are left out, so the save
 * (a merge) keeps the stored ones and writes no unchecked summary.
 */
export function keptSummaries<P extends LastSummaryProfile>(
  profile: P,
  forgotten: ForgottenCheck | null
): P {
  if (!forgotten) {
    log.warn('Forgotten topics unreadable: last summaries not saved');
    const { lastConversationSummary: _c, lastCallerSummary: _l, ...rest } = profile;
    return rest as P;
  }
  const kept = { ...profile };
  for (const k of ['lastConversationSummary', 'lastCallerSummary'] as const) {
    if (kept[k] && forgotten(kept[k])) kept[k] = '';
  }
  return kept;
}

/** applyLastSummary with the caller's forgotten topics checked (session-manager endSession). */
export async function applyCheckedSummary(
  profile: LastSummaryProfile,
  summary: CallSummary,
  userId: string | null | undefined
): Promise<void> {
  applyLastSummary(profile, summary, process.env, await lastSummaryCheck(userId));
}

/** A profile save with keptSummaries applied (session-manager's save paths). */
export async function saveKept<P extends LastSummaryProfile>(
  store: { saveProfile: (profile: P) => Promise<void> },
  profile: P,
  userId: string | null | undefined
): Promise<void> {
  await store.saveProfile(keptSummaries(profile, await lastSummaryCheck(userId)));
}
