/**
 * Final transcript turn bookkeeping (single-agent path).
 *
 * Runs synchronously, in order, for each final user transcript before the
 * transcript handler sees it: bump the turn count, log the pipeline choice,
 * run the per-turn observers (voice delivery, crisis shadow), record STT cost
 * and compute the semantic VAD duration.
 *
 * @module agents/voice-agent-entry/final-transcript-turn
 */

import {
  isPipelineSwitchingEnabled,
  selectPipeline,
  type PipelineSwitchContext,
} from '../shared/performance/pipeline-switcher.js';
import { computeDynamicVADDuration } from '../shared/performance/adaptive-timing.js';
import { finops } from '../../services/observability/finops.js';
import type { CrisisGuardMode } from '../safety/crisis-shadow.js';
import { observeFinalTranscript } from '../shared/final-transcript-observer.js';

export interface FinalTranscriptTurnInput {
  session: unknown;
  transcript: string | undefined;
  userData: Record<string, unknown>;
  sessionId: string;
  userId: string | null;
  crisisMode: CrisisGuardMode;
}

/** Bookkeeping for one final transcript. Mutates `userData.turnCount`. */
export function recordFinalTranscriptTurn(input: FinalTranscriptTurnInput): void {
  const { session, userData, sessionId, userId } = input;
  userData.turnCount = ((userData.turnCount as number) || 0) + 1;
  if (isPipelineSwitchingEnabled()) {
    const switchCtx: PipelineSwitchContext = {
      emotion: (userData.lastEmotionAnalysis as { primary?: string })?.primary,
      stressLevel: (userData.lastEmotionAnalysis as { distressLevel?: number })?.distressLevel,
      wasInterrupted: userData.wasInterrupted as boolean | undefined,
      turnCount: (userData.turnCount as number) ?? 0,
      userTranscriptLength: input.transcript?.length ?? 0,
      isFirstResponse: ((userData.turnCount as number) ?? 0) === 1,
      isQuestion: input.transcript?.includes('?'),
    };
    const pipelineResult = selectPipeline(switchCtx);
    process.stderr.write(
      `🔀 [TURN ${userData.turnCount}] Pipeline: ${pipelineResult.mode} (${pipelineResult.reason}, confidence=${pipelineResult.confidence})\n`
    );
  }
  const transcript = input.transcript || '';
  process.stderr.write(`\n📝 [TURN ${userData.turnCount}] FINAL: "${transcript}"\n`);
  observeFinalTranscript({
    session,
    transcript,
    userData,
    sessionId,
    crisisMode: input.crisisMode,
  });
  if (transcript) {
    const wordCount = transcript.split(/\s+/).filter((w: string) => w.length > 0).length;
    const estimatedDurationSeconds = (wordCount / 150) * 60;
    finops.recordSTTCost({
      durationSeconds: Math.max(1, estimatedDurationSeconds),
      userId: userId ?? undefined,
      sessionId,
    });
    const dynamicVAD = computeDynamicVADDuration(
      sessionId,
      transcript,
      undefined,
      userData.emotionalState as string | undefined
    );
    process.stderr.write(`[VAD] semantic=${dynamicVAD}ms for turn ${userData.turnCount}\n`);
  }
}
