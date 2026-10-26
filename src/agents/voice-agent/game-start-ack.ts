/**
 * The agent's answer to a Let's Play start (game_start_ack / text_game_start_ack).
 *
 * The app's picker sends a requestId with each tap; the ack echoes it so the app
 * can tell which tap it answers (apps/web src/app/agent-ack-handlers.ts). An older
 * app sends none and gets an ack without one, as before.
 *
 * @module voice-agent/game-start-ack
 */

import type { Room } from '@livekit/rtc-node';

/** What the picker sends: the request id is new, so an older app sends none. */
export interface GameStartRequest {
  gameType: string;
  requestId?: unknown;
}

/** Why a game didn't start, for the app (it shows the same toast for both). */
export type GameStartFailure = 'unknown_game' | 'start_failed';

/** The request id to echo: only a short string; anything else (an older app) gets none. */
export function requestIdOf(message: GameStartRequest): string | undefined {
  const { requestId } = message;
  return typeof requestId === 'string' && requestId.length > 0 && requestId.length <= 64
    ? requestId
    : undefined;
}

export async function publishGameAck(
  room: Room,
  type: 'game_start_ack' | 'text_game_start_ack',
  message: GameStartRequest,
  fields:
    { success: true; message: string } | { success: false; reason: GameStartFailure; error: string }
): Promise<void> {
  const ack = JSON.stringify({
    type,
    gameType: message.gameType,
    requestId: requestIdOf(message), // dropped by JSON.stringify when the app sent none
    ...fields,
    timestamp: Date.now(),
  });
  await room.localParticipant?.publishData(new TextEncoder().encode(ack), { reliable: true });
}
