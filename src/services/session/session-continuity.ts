/**
 * Memory continuity at session end: memory threads and anchors in Spanner,
 * the memory capsule in Firestore (memory/dynamic/memory-continuity.ts).
 *
 * Off unless SESSION_CONTINUITY_WRITE=on. It adds Spanner and Firestore writes
 * to every call end and has never run in prod.
 *
 * @module services/session/session-continuity
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { VoiceSessionSummary } from './session-summary.js';

const log = createLogger({ module: 'SessionContinuity' });

export function isSessionContinuityWriteOn(): boolean {
  return process.env.SESSION_CONTINUITY_WRITE === 'on';
}

/** Write the summary's threads, anchors and capsule. Never throws. */
export async function writeSummaryContinuity(summary: VoiceSessionSummary): Promise<void> {
  if (!isSessionContinuityWriteOn()) return;
  try {
    const { writeSessionContinuity } = await import('../../memory/dynamic/memory-continuity.js');
    const arc = summary.emotionalArc ?? [];
    const result = await writeSessionContinuity({
      sessionId: summary.sessionId,
      userId: summary.userId,
      mainTopics: summary.mainTopics ?? [],
      naturalSummary: summary.naturalSummary,
      insights: (summary.insightsGenerated ?? []).map((i) => ({
        type: i.type,
        content: i.content,
        confidence: i.confidence,
      })),
      endingEmotionalState: summary.endingEmotionalState,
      emotionalArc:
        arc.length > 0
          ? `Started ${arc[0]?.emotion || 'neutral'}, ended ${summary.endingEmotionalState}`
          : undefined,
      unfinishedTopics: summary.unfinishedTopics ?? [],
      commitmentsMade: summary.commitmentsMade ?? [],
      wasSignificant: summary.wasSignificant,
      significanceScore: summary.significanceScore,
      durationSeconds: summary.durationSeconds,
    });
    log.debug(
      {
        sessionId: summary.sessionId,
        threadsUpdated: result.threadsUpdated,
        anchorsCreated: result.anchorsCreated,
        capsuleUpdated: result.capsuleUpdated,
      },
      '🔗 Memory continuity updated'
    );
  } catch (err) {
    log.warn(
      { error: String(err), sessionId: summary.sessionId },
      'Failed to write memory continuity'
    );
  }
}
