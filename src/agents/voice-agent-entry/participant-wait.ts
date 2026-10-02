/**
 * Participant wait — resolves the room's remote participant, waiting up to a
 * timeout when no one has joined yet.
 *
 * Extracted from voice-agent-entry/index.ts.
 *
 * @module agents/voice-agent-entry/participant-wait
 */

import type { JobContext } from '@livekit/agents';
import type { RemoteParticipant } from '@livekit/rtc-node';

export interface ParticipantWaitResult {
  participant: RemoteParticipant | null;
  startedAt: number;
  endedAt: number;
  source: 'existing' | 'wait' | 'timeout' | 'error';
}

function getExistingRemoteParticipant(ctx: JobContext): RemoteParticipant | null {
  const iterator = ctx.room?.remoteParticipants?.values().next();
  return iterator && !iterator.done ? iterator.value : null;
}

export function waitForParticipantWithTimeout(
  ctx: JobContext,
  timeoutMs: number
): Promise<ParticipantWaitResult> {
  const startedAt = Date.now();
  const existingParticipant = getExistingRemoteParticipant(ctx);
  if (existingParticipant) {
    return Promise.resolve({
      participant: existingParticipant,
      startedAt,
      endedAt: Date.now(),
      source: 'existing',
    });
  }

  return new Promise<ParticipantWaitResult>((resolve) => {
    let settled = false;
    const finish = (
      participant: RemoteParticipant | null,
      source: ParticipantWaitResult['source']
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        participant,
        startedAt,
        endedAt: Date.now(),
        source,
      });
    };

    const timeout = setTimeout(() => {
      process.stderr.write(
        `[voice-agent-entry] 👤 Participant wait timed out after ${timeoutMs}ms (early path)\n`
      );
      finish(null, 'timeout');
    }, timeoutMs);

    ctx
      .waitForParticipant()
      .then((participant) => finish(participant, 'wait'))
      .catch((err: unknown) => {
        process.stderr.write(
          `[voice-agent-entry] 👤 Participant wait failed (early path): ${String(err)}\n`
        );
        finish(null, 'error');
      });
  });
}
