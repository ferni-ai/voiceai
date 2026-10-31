/**
 * The session's user_input_transcribed listener on the live voice path: a final
 * transcript steps userData.turnCount, then goes to the transcript handler, which
 * steps it again in processFinalTranscript. One utterance counts twice; other
 * readers depend on that, so the crisis note's fade counts caller turns instead
 * (shared/caller-turn-count.ts).
 *
 * @module agents/voice-agent-entry/user-input-transcribed
 */

import { computeDynamicVADDuration } from '../shared/performance/adaptive-timing.js';
import { finops } from '../../services/observability/finops.js';
import type { resolveCrisisGuardMode } from '../safety/crisis-shadow.js';
import { observeFinalTranscript } from '../shared/final-transcript-observer.js';
import type { TranscriptEvent } from '../voice-agent/transcript-handler.js';

export function createUserInputTranscribedHandler(input: {
  userData: Record<string, unknown>;
  userId: string | null;
  sessionId: string;
  crisisGuardMode: ReturnType<typeof resolveCrisisGuardMode>;
  transcriptHandler: { handler: (event: TranscriptEvent) => void };
}): (event: unknown) => void {
  const { userData, userId, sessionId, crisisGuardMode, transcriptHandler } = input;
  return (event) => {
    const evt = event as { transcript?: string; isFinal?: boolean };
    if (evt.isFinal) {
      userData.turnCount = ((userData.turnCount as number) || 0) + 1;
      const transcript = evt.transcript || '';
      process.stderr.write(`\n📝 [TURN ${userData.turnCount}] FINAL: ${transcript.length} chars\n`); // never the words
      observeFinalTranscript({ transcript, userData, sessionId, crisisMode: crisisGuardMode });
      if (transcript) {
        const wordCount = transcript.split(/\s+/).filter((w: string) => w.length > 0).length;
        const estimatedDurationSeconds = (wordCount / 150) * 60;
        finops.recordSTTCost({ durationSeconds: Math.max(1, estimatedDurationSeconds), userId: userId ?? undefined, sessionId });
        const dynamicVAD = computeDynamicVADDuration(sessionId, transcript, undefined, userData.emotionalState as string | undefined);
        process.stderr.write(`[VAD] semantic=${dynamicVAD}ms for turn ${userData.turnCount}\n`);
      }
    }
    transcriptHandler.handler(event as TranscriptEvent);
  };
}
