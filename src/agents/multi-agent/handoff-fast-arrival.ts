/**
 * HANDOFF_FAST_ARRIVAL (off by default): the teammate arrives as the goodbye ends.
 *
 * Prod, real calls 2026-10-15..22 (n=38 handoffs), from the handoff tool call:
 * - goodbye audio at ~0.13 s, then a fixed wait for the goodbye's estimated length
 *   (p50 2.5 s);
 * - only then the teammate is set up: p50 0.43 s, p90 1.55 s, max 8.3 s (the slow
 *   ones load tool domains);
 * - its greeting then waits in the speech coordinator, p50 0.82 s, behind the
 *   goodbye and the coordinator's post-speech echo cooldown (750 ms to 2 s);
 * - the gateway's first byte comes ~0.13 s after that.
 *
 * In all, the teammate's first audio comes at p50 4.2 s. After the goodbye wait it
 * takes another p50 1.5 s, p90 2.6 s. In dev recordings the audible gap between the
 * two voices is p50 1.12 s.
 *
 * With the flag on, on single-session handoffs (the call's session is swapped, not
 * replaced):
 * - the teammate is set up while the goodbye plays, so the swap no longer waits for
 *   it after the goodbye;
 * - while the handoff runs, the coordinator waits ARRIVAL_GAP_MS after a speech ends,
 *   not its echo cooldown (speech/coordination/arrival-cooldown.ts), so the greeting
 *   follows the goodbye like a turn between two people.
 *
 * @module agents/multi-agent/handoff-fast-arrival
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { getPreBriefing, type PreBriefing } from '../../services/automation/predictive-handoff.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

/** The pause between the goodbye's end and the teammate's first line (a human turn gap). */
export const ARRIVAL_GAP_MS = 150;

export function handoffFastArrival(env: Env = process.env): boolean {
  return flagOn('HANDOFF_FAST_ARRIVAL', env);
}

/**
 * Start `work` now and settle it later: a failure while the goodbye plays is not an
 * unhandled rejection, and it is rethrown where the result is awaited.
 */
export function startEarly<T>(work: () => Promise<T>): Promise<T> {
  const p = work();
  p.catch(() => undefined);
  return p;
}

/** The teammate's pre-briefing (predictive handoff) folded into the handoff summary. */
export async function preBriefSpecialist(
  userId: string | undefined,
  targetPersonaId: string,
  summary: string | undefined
): Promise<{ preBriefing: PreBriefing | null; summary: string | undefined }> {
  if (!userId) return { preBriefing: null, summary };
  try {
    const preBriefing = await getPreBriefing(
      userId,
      targetPersonaId as Parameters<typeof getPreBriefing>[1]
    );
    if (!preBriefing) return { preBriefing: null, summary };
    const context = [
      `[PRE-BRIEFING FROM FERNI TEAM]`,
      preBriefing.context,
      preBriefing.suggestedApproach ? `Suggested approach: ${preBriefing.suggestedApproach}` : '',
      preBriefing.relevantHistory.length > 0
        ? `Relevant history: ${preBriefing.relevantHistory.join('; ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
    log.info(
      { userId, targetPersona: targetPersonaId, briefingId: preBriefing.id },
      '🧠 [PREDICTIVE] Pre-briefing applied to handoff context'
    );
    return { preBriefing, summary: summary ? `${context}\n\n${summary}` : context };
  } catch (err) {
    // Non-critical - continue without pre-briefing
    log.debug({ error: String(err) }, 'Pre-briefing fetch skipped');
    return { preBriefing: null, summary };
  }
}
