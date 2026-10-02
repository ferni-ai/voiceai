/**
 * Personal insights in the live (multi-agent) path.
 *
 * Session start: the precomputed bundle is read in parallel with prompt
 * loading and waited on for at most a few hundred ms, so the first response
 * is never held up; a missing or day-old bundle is refreshed in the
 * background for next time.
 *
 * Per turn: when the user mentions someone, that person's profile is added to
 * the chat context in the same tick as the transcript (same mechanism and
 * timing rules as memory-recall-hook.ts).
 *
 * Kill switch: PERSONAL_INSIGHTS=off.
 *
 * @module agents/multi-agent/personal-insights-context
 */

import {
  createPersonRecall,
  formatSessionBlock,
  INSIGHTS_LIMITS,
  loadSessionInsights,
  personalInsightsEnabled,
  refreshPersonalInsights,
  type InsightBundle,
} from '../../services/personal-insights/index.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PersonalInsightsContext' });
const STALE_MS = 24 * 60 * 60 * 1000;

function isRealUser(userId: string | undefined): userId is string {
  return !!userId && userId !== 'anonymous';
}

/** Start reading the bundle now; await it later with `sessionInsightsSection`. */
export function startSessionInsightsLoad(
  userId: string | undefined
): Promise<InsightBundle | null> | null {
  if (!isRealUser(userId) || !personalInsightsEnabled()) return null;
  return loadSessionInsights(userId).then((bundle) => {
    if (!bundle || Date.now() - bundle.computedAt > STALE_MS) {
      void refreshPersonalInsights(userId).catch((error: unknown) =>
        log.debug({ error: String(error) }, 'Background insights refresh failed')
      );
    }
    return bundle;
  });
}

/** The "What's on their mind" section, or '' if not ready within the budget. */
export async function sessionInsightsSection(
  pending: Promise<InsightBundle | null> | null,
  personaName: string | undefined,
  timeoutMs: number = INSIGHTS_LIMITS.sessionLoadTimeoutMs
): Promise<string> {
  if (!pending) return '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    const bundle = await Promise.race([pending.catch(() => null), timeout]);
    const block = formatSessionBlock(bundle, { personaName });
    if (!block) return '';
    log.info(
      { chars: block.length, predictions: bundle?.predictions.length ?? 0 },
      'Personal insights injected'
    );
    return `\n---\n\n${block}\n`;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** The slice of the session event API used here. */
export interface TranscriptEvents {
  on?: (event: string, handler: (e: unknown) => void) => unknown;
  off?: (event: string, handler: (e: unknown) => void) => unknown;
}

/**
 * Add person notes as the user mentions people. Returns a cleanup function.
 * `addNote` is the same synchronous context update the memory recall uses.
 */
export function installPersonRecall(
  userId: string | undefined,
  events: TranscriptEvents,
  addNote: (note: string) => void
): (() => void) | null {
  if (!isRealUser(userId) || !personalInsightsEnabled() || !events.on) return null;
  const recall = createPersonRecall(userId);
  const onTranscript = (event: unknown) => {
    const transcript = (event as { transcript?: string }).transcript;
    if (!transcript) return;
    const note = recall.noteFor(transcript);
    if (note) addNote(note);
  };
  events.on('user_input_transcribed', onTranscript);
  return () => events.off?.('user_input_transcribed', onTranscript);
}
