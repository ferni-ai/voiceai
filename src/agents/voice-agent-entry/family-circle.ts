/**
 * The family circle decision: whether a phone caller with no account of their
 * own is in the owner's family circle (SETH_FAMILY_CIRCLE, default off, and the
 * seth teammate's gate, sethTeammateOpen). Fails closed: anything short of every
 * proof below, a thrown error included, is null, the public circle.
 *
 * A member is a sponsored identity (services/identity/sponsored-identity.ts)
 * that the owner (sethOwnerUid) made for this exact number, with the family
 * relationship, active, its number proven by the holder (phoneVerifiedAt), on a
 * call carrying our webhook's signed attestation A for that number
 * (readSignedAttestation). Caller ID alone can be spoofed; the signed A is what
 * says the caller holds the number.
 *
 * The lookup and the attestation read run together whatever either finds, as
 * recognizeCaller does, so the call's start time says nothing about whether a
 * number has a sponsored identity. Logs carry the sponsored identity id and a
 * reason code, never the number, the token, the name or the family user id.
 *
 * @module agents/voice-agent-entry/family-circle
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { sethOwnerUid, sethTeammateOpen } from '../../config/seth-teammate.js';
import {
  forgetFamilyCircle,
  rememberFamilyCircle,
  type FamilyCircleMember,
} from '../../services/family/index.js';
import type {
  PhoneLookupResult,
  SponsoredIdentity,
} from '../../services/identity/sponsored-identity.js';
import { errorClass } from '../../utils/error-class.js';
import { createLogger } from '../../utils/safe-logger.js';
import { registerCleanup } from '../session/event-cleanup-registry.js';
import { firstParticipant, toE164, type RecognitionDeps } from './caller-recognition.js';
import { readSignedAttestation, type AttributeUpdates } from './sip-caller.js';

const log = createLogger({ module: 'family-circle' });

/** The sponsored relationship the family circle admits. */
const FAMILY_RELATIONSHIP = 'child';
/** How long to wait for the caller to join (they are usually in the room already). */
const PARTICIPANT_WAIT_MS = 3000;

export interface FamilyCircleDeps {
  /** The sponsored identity on an E.164 number (lookupByPhone). */
  lookup: (e164: string) => Promise<PhoneLookupResult>;
  /** The signed attestation for this caller and number, never a raw header. */
  signedAttestation: RecognitionDeps['signedAttestation'];
}

const productionFamilyCircleDeps: FamilyCircleDeps = {
  async lookup(e164) {
    const { lookupByPhone } = await import('../../services/identity/sponsored-identity.js');
    return lookupByPhone(e164);
  },
  signedAttestation: async (participant, e164, updates) =>
    readSignedAttestation(participant, e164, { updates }),
};

type RoomLike = Parameters<typeof firstParticipant>[0] & AttributeUpdates;

/** Why a found identity isn't in the circle, or null when it is. */
function refusal(identity: SponsoredIdentity, e164: string, owner: string): string | null {
  if (identity.sponsorUserId !== owner) return 'other-sponsor';
  if (identity.relationship !== FAMILY_RELATIONSHIP) return 'relationship';
  if (identity.status !== 'active') return 'inactive';
  if (!identity.phoneVerifiedAt) return 'unverified-number';
  if (toE164(identity.phoneNumber) !== e164) return 'other-number';
  if (!identity.familyUserId || !identity.displayName) return 'incomplete';
  return null;
}

async function decide(
  room: RoomLike,
  sessionId: string,
  deps: FamilyCircleDeps,
  owner: string
): Promise<FamilyCircleMember | null> {
  const participant = await firstParticipant(room, PARTICIPANT_WAIT_MS);
  const e164 = toE164(participant?.attributes?.['sip.phoneNumber']);
  if (!participant || !e164) return null;
  const [found, signed] = await Promise.all([
    deps.lookup(e164),
    deps.signedAttestation(participant, e164, room),
  ]);
  const identity = found.found ? found.identity : undefined;
  if (!identity) return null;
  const reason = signed === 'A' ? refusal(identity, e164, owner) : 'attestation';
  if (reason) {
    log.info({ sessionId, reason }, 'family_circle refused');
    return null;
  }
  return {
    sponsoredIdentityId: identity.id,
    familyUserId: identity.familyUserId,
    displayName: identity.displayName,
  };
}

/**
 * The caller's family circle membership, remembered for the session (and
 * forgotten when it ends), or null. With either gate closed or no owner set,
 * null before anything is looked up.
 */
export async function resolveFamilyCircle(
  room: RoomLike,
  sessionId: string,
  deps: FamilyCircleDeps = productionFamilyCircleDeps,
  env: Env = process.env
): Promise<FamilyCircleMember | null> {
  if (!sethTeammateOpen(env) || !flagOn('SETH_FAMILY_CIRCLE', env)) return null;
  const owner = sethOwnerUid(env);
  if (!owner) return null;
  try {
    const member = await decide(room, sessionId, deps, owner);
    if (!member) return null;
    rememberFamilyCircle(sessionId, member);
    registerCleanup(sessionId, 'resource', 'family circle', () => forgetFamilyCircle(sessionId));
    log.info({ sessionId, sponsoredIdentityId: member.sponsoredIdentityId }, 'family_circle');
    return member;
  } catch (e) {
    log.warn({ sessionId, reason: 'error', error: errorClass(e) }, 'family_circle refused');
    return null;
  }
}
