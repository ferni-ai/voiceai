/**
 * The family circle decision as identifyUser sees it. The decision lives in the
 * entry layer (voice-agent-entry/family-circle.ts), which this layer can't
 * import, so the entry layer registers it here
 * (voice-agent-entry/family-circle-register.ts, loaded by gce/job-executor.ts).
 * Until it does, nobody is in the family circle.
 *
 * @module voice-agent/family-circle-hook
 */
import type { Room } from '@livekit/rtc-node';
import type { FamilyCircleMember } from '../../services/family/index.js';
import { errorClass } from '../../utils/error-class.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'family-circle-hook' });

type FamilyCircleDecision = (room: Room, sessionId: string) => Promise<FamilyCircleMember | null>;

let decide: FamilyCircleDecision = async () => null;

export function registerFamilyCircleDecision(decision: FamilyCircleDecision): void {
  decide = decision;
}

/** The phone caller's family circle membership, or null (never throws; a failure is logged). */
export async function familyCircleMember(
  room: Room,
  sessionId: string
): Promise<FamilyCircleMember | null> {
  return decide(room, sessionId).catch((e: unknown) => {
    log.warn({ sessionId, reason: 'error', error: errorClass(e) }, 'family_circle refused');
    return null;
  });
}
