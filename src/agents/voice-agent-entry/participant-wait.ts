/**
 * Waiting for the caller to join a LiveKit room, and deciding what to do when
 * the room closed before they did.
 */
import type { JobContext } from '@livekit/agents';
import type { RemoteParticipant } from '@livekit/rtc-node';

export interface ParticipantWaitResult {
  participant: RemoteParticipant | null;
  startedAt: number;
  endedAt: number;
  source: 'existing' | 'wait' | 'timeout' | 'error';
}

/**
 * True when the room went away before a caller joined, so the job must end
 * instead of falling back to a single-agent session. `waitForParticipant`
 * only fails when the room is disconnected, and a fallback session on a dead
 * room throws "room is not connected". LiveKit re-dispatches a job after a
 * worker restart, often into a room the caller has already left.
 */
export function roomClosedBeforeParticipant(
  result: Pick<ParticipantWaitResult, 'participant' | 'source'>,
  roomConnected: boolean
): boolean {
  return result.participant === null && (result.source === 'error' || !roomConnected);
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
        `[voice-agent-entry] 👤 Participant wait timed out after ${timeoutMs}ms\n`
      );
      finish(null, 'timeout');
    }, timeoutMs);

    ctx
      .waitForParticipant()
      .then((participant) => finish(participant, 'wait'))
      .catch((err: unknown) => {
        process.stderr.write(
          `[voice-agent-entry] 👤 Participant wait failed: ${String(err)}\n`
        );
        finish(null, 'error');
      });
  });
}
