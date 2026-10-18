/**
 * Whether a data-channel message comes from the session's own user.
 *
 * The token server issues a join token whose identity is the signed-in
 * user's verified uid, so the session's user is the participant with that
 * identity. A message that acts on the user's account (approving an action)
 * counts only from that participant, only when it is a person (not an agent
 * or a phone line), and only when the entrypoint proved the session's user at
 * dispatch (CallerChecks, from caller-recognition.ts). Without the checks,
 * nothing counts.
 *
 * @module agents/voice-agent/data-sender
 */
import { ParticipantKind } from '@livekit/rtc-node';

/** What the entrypoint knows about who is on the call (caller-recognition.ts). */
export interface CallerChecks {
  verifiedOwner: (sessionId: string) => boolean;
  phoneOnly: (sessionId: string) => boolean;
}

export interface SenderRoom {
  remoteParticipants?: Map<string, { kind?: ParticipantKind }>;
}

export function fromSessionUser(
  room: SenderRoom,
  senderIdentity: string | undefined,
  session: { userId: string | undefined; sessionId: string; callerChecks?: CallerChecks }
): boolean {
  const { userId, sessionId, callerChecks } = session;
  if (!userId || !senderIdentity || senderIdentity !== userId || !callerChecks) return false;
  if (room.remoteParticipants?.get(senderIdentity)?.kind !== ParticipantKind.STANDARD) return false;
  return !callerChecks.phoneOnly(sessionId) && callerChecks.verifiedOwner(sessionId);
}
