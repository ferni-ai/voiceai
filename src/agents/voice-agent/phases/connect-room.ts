/**
 * Voice Agent Phase: Connect to Room
 *
 * Handles room connection with timeout and retry logic.
 *
 * @module voice-agent/phases/connect-room
 */

import type { JobContext } from '@livekit/agents';

/**
 * Connect to LiveKit room with timeout.
 */
export async function connectToRoom(ctx: JobContext, timeoutMs = 30000): Promise<void> {
  process.stderr.write(`[connect-room] Connecting to room...\n`);
  const connectStart = Date.now();

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(`Room connection timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });

  await Promise.race([ctx.connect(), timeout]);

  process.stderr.write(
    `[connect-room] Connected to ${ctx.room.name} in ${Date.now() - connectStart}ms\n`
  );
}

/**
 * Wait for first participant with timeout.
 */
export async function waitForParticipant(
  ctx: JobContext,
  timeoutMs = 2000
): Promise<{ identity: string; name?: string; metadata?: string } | null> {
  process.stderr.write(`[connect-room] 👤 Waiting for participant...\n`);

  const participant = await Promise.race([
    ctx.waitForParticipant(),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs);
    }),
  ]);

  if (participant) {
    process.stderr.write(`[connect-room] 👤 Participant joined: ${participant.identity}\n`);
  }

  return participant
    ? {
        identity: participant.identity,
        name: participant.name,
        metadata: participant.metadata,
      }
    : null;
}

/**
 * Detect if this is a phone call vs web connection.
 */
export function detectConnectionType(
  ctx: JobContext,
  participant: { identity: string } | null
): { isPhoneCall: boolean; isWebConnection: boolean } {
  const jobMetadata = ctx.job?.metadata || '';
  const isWebConnection = jobMetadata.includes('"source":"web"');
  const isPhoneCall =
    !isWebConnection &&
    (participant?.identity?.includes('phone') ||
      participant?.identity?.includes('sip') ||
      jobMetadata.includes('"source":"phone"'));

  return { isPhoneCall, isWebConnection };
}
