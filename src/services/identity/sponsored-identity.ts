/**
 * Sponsored Identity Service
 *
 * Enables users to create and manage identities for family members and friends
 * who call Ferni via phone. This allows phone callers to be recognized and
 * have their own conversation history without needing a web account.
 *
 * Features:
 * - Sponsor creates identity for family member (e.g., "Mom")
 * - Phone number linked to identity for automatic recognition
 * - Optional voice enrollment for additional verification
 * - Access controls per sponsored identity
 * - Call history tracking
 *
 * @module services/identity/sponsored-identity
 */

import admin from 'firebase-admin';
import { getGCPProjectId } from '../../config/environment.js';
import { removeUndefined, cleanForFirestore } from '../../utils/firestore-utils.js';
import { getLogger } from '../../utils/safe-logger.js';
import { normalizePhoneNumber, isValidPhoneNumber } from './user-identification.js';

const log = getLogger().child({ module: 'SponsoredIdentity' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Relationship types for sponsored identities
 */
export type RelationshipType =
  | 'mother'
  | 'father'
  | 'parent'
  | 'grandmother'
  | 'grandfather'
  | 'grandparent'
  | 'sibling'
  | 'child'
  | 'spouse'
  | 'partner'
  | 'friend'
  | 'other';

/**
 * Access level for sponsored identities
 */
export type AccessLevel =
  | 'full' // Full access to all personas and features
  | 'limited' // Limited to specific personas
  | 'supervised'; // Sponsor gets notifications

/**
 * Status of a sponsored identity
 */
export type SponsoredIdentityStatus =
  | 'active' // Normal active state
  | 'pending' // Awaiting sponsor approval (self-registered)
  | 'suspended' // Temporarily disabled
  | 'revoked'; // Permanently revoked

/**
 * Sponsored identity - represents a family member or friend who calls via phone
 */
export interface SponsoredIdentity {
  /** Unique identifier */
  id: string;

  /** Firebase UID of the sponsor (the person who created this identity) */
  sponsorUserId: string;

  /** Display name for this person */
  displayName: string;

  /** How Ferni should address them (may differ from displayName) */
  preferredName?: string;

  /** Relationship to sponsor */
  relationship: RelationshipType;

  /** Phone number in E.164 format */
  phoneNumber: string;

  /** Voice enrollment status */
  voiceEnrolled: boolean;

  /** Voice profile ID if enrolled */
  voiceProfileId?: string;

  /** Access level */
  accessLevel: AccessLevel;

  /** Allowed persona IDs, or ['*'] for all */
  allowedPersonas: string[];

  /** Status of this identity */
  status: SponsoredIdentityStatus;

  /** Notes for Ferni (e.g., "She prefers to be called Barbara, not Mom") */
  notes?: string;

  /** Timestamps */
  createdAt: Date;
  updatedAt: Date;
  lastCallAt?: Date;

  /** Usage stats */
  totalCalls: number;
  totalMinutes: number;

  /** Self-registration metadata (if applicable) */
  selfRegistered?: boolean;
  selfRegisteredName?: string;
  selfRegisteredAt?: Date;
}

/**
 * Data for creating a new sponsored identity
 */
export interface CreateSponsoredIdentityData {
  displayName: string;
  preferredName?: string;
  relationship: RelationshipType;
  phoneNumber: string;
  accessLevel?: AccessLevel;
  allowedPersonas?: string[];
  notes?: string;
}

/**
 * Data for updating a sponsored identity
 */
export interface UpdateSponsoredIdentityData {
  displayName?: string;
  preferredName?: string;
  relationship?: RelationshipType;
  phoneNumber?: string;
  accessLevel?: AccessLevel;
  allowedPersonas?: string[];
  notes?: string;
  status?: SponsoredIdentityStatus;
}

/**
 * Result of a phone lookup
 */
export interface PhoneLookupResult {
  found: boolean;
  identity?: SponsoredIdentity;
  sponsorProfile?: {
    userId: string;
    name?: string;
  };
}

// ============================================================================
// FIRESTORE
// ============================================================================

const COLLECTION_NAME = 'sponsored_identities';
const PHONE_INDEX_COLLECTION = 'sponsored_identity_phone_index';

let firestoreInstance: admin.firestore.Firestore | null = null;
let initAttempted = false;

function getFirestore(): admin.firestore.Firestore | null {
  if (firestoreInstance) return firestoreInstance;
  if (initAttempted) return null;

  initAttempted = true;

  try {
    if (admin.apps.length === 0) {
      const projectId = getGCPProjectId();
      if (projectId) {
        admin.initializeApp({ projectId });
      } else {
        admin.initializeApp();
      }
    }

    firestoreInstance = admin.firestore();
    return firestoreInstance;
  } catch (error) {
    log.warn({ error }, 'Firebase not available for sponsored identities');
    return null;
  }
}

// In-memory cache for fast lookups
const identitiesCache = new Map<string, SponsoredIdentity>();
const phoneToIdentityCache = new Map<string, string>(); // phone -> identity ID

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Create a new sponsored identity for a family member or friend.
 */
export async function createSponsoredIdentity(
  sponsorUserId: string,
  data: CreateSponsoredIdentityData
): Promise<SponsoredIdentity> {
  // Validate phone number
  if (!isValidPhoneNumber(data.phoneNumber)) {
    throw new Error(`Invalid phone number: ${data.phoneNumber}`);
  }

  const normalizedPhone = normalizePhoneNumber(data.phoneNumber);

  // Check if phone number is already registered
  const existing = await lookupByPhone(normalizedPhone);
  if (existing.found) {
    throw new Error(
      `Phone number ${normalizedPhone} is already registered to another identity`
    );
  }

  const id = `sponsored_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const identity: SponsoredIdentity = {
    id,
    sponsorUserId,
    displayName: data.displayName,
    preferredName: data.preferredName,
    relationship: data.relationship,
    phoneNumber: normalizedPhone,
    voiceEnrolled: false,
    accessLevel: data.accessLevel || 'full',
    allowedPersonas: data.allowedPersonas || ['*'],
    status: 'active',
    notes: data.notes,
    createdAt: new Date(),
    updatedAt: new Date(),
    totalCalls: 0,
    totalMinutes: 0,
  };

  await saveIdentity(identity);
  await savePhoneIndex(normalizedPhone, id);

  log.info(
    {
      id,
      sponsorUserId,
      displayName: data.displayName,
      relationship: data.relationship,
      phone: normalizedPhone,
    },
    '✅ Created sponsored identity'
  );

  return identity;
}

/**
 * Get a sponsored identity by ID.
 */
export async function getSponsoredIdentity(id: string): Promise<SponsoredIdentity | null> {
  // Check cache first
  if (identitiesCache.has(id)) {
    return identitiesCache.get(id)!;
  }

  const db = getFirestore();
  if (!db) return null;

  try {
    const doc = await db.collection(COLLECTION_NAME).doc(id).get();
    if (!doc.exists) return null;

    const identity = docToIdentity(doc);
    identitiesCache.set(id, identity);
    return identity;
  } catch (error) {
    log.error({ error, id }, 'Failed to get sponsored identity');
    return null;
  }
}

/**
 * Get all sponsored identities for a sponsor.
 */
export async function getSponsoredIdentities(
  sponsorUserId: string
): Promise<SponsoredIdentity[]> {
  const db = getFirestore();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection(COLLECTION_NAME)
      .where('sponsorUserId', '==', sponsorUserId)
      .orderBy('createdAt', 'desc')
      .get();

    const identities = snapshot.docs.map(docToIdentity);

    // Update cache
    for (const identity of identities) {
      identitiesCache.set(identity.id, identity);
      phoneToIdentityCache.set(identity.phoneNumber, identity.id);
    }

    return identities;
  } catch (error) {
    log.error({ error, sponsorUserId }, 'Failed to get sponsored identities');
    return [];
  }
}

/**
 * Update a sponsored identity.
 */
export async function updateSponsoredIdentity(
  id: string,
  sponsorUserId: string,
  updates: UpdateSponsoredIdentityData
): Promise<SponsoredIdentity | null> {
  const identity = await getSponsoredIdentity(id);
  if (!identity) {
    throw new Error(`Sponsored identity not found: ${id}`);
  }

  // Verify ownership
  if (identity.sponsorUserId !== sponsorUserId) {
    throw new Error('Not authorized to update this identity');
  }

  // If phone number is changing, validate and update index
  if (updates.phoneNumber && updates.phoneNumber !== identity.phoneNumber) {
    if (!isValidPhoneNumber(updates.phoneNumber)) {
      throw new Error(`Invalid phone number: ${updates.phoneNumber}`);
    }

    const normalizedPhone = normalizePhoneNumber(updates.phoneNumber);

    // Check if new phone is available
    const existing = await lookupByPhone(normalizedPhone);
    if (existing.found && existing.identity?.id !== id) {
      throw new Error(
        `Phone number ${normalizedPhone} is already registered to another identity`
      );
    }

    // Remove old phone index
    await deletePhoneIndex(identity.phoneNumber);

    // Add new phone index
    await savePhoneIndex(normalizedPhone, id);

    updates.phoneNumber = normalizedPhone;
  }

  // Apply updates
  const updatedIdentity: SponsoredIdentity = {
    ...identity,
    ...removeUndefined(updates),
    updatedAt: new Date(),
  };

  await saveIdentity(updatedIdentity);

  log.info({ id, updates: Object.keys(updates) }, 'Updated sponsored identity');

  return updatedIdentity;
}

/**
 * Revoke a sponsored identity (permanently disable).
 */
export async function revokeSponsoredIdentity(
  id: string,
  sponsorUserId: string
): Promise<boolean> {
  const identity = await getSponsoredIdentity(id);
  if (!identity) {
    return false;
  }

  // Verify ownership
  if (identity.sponsorUserId !== sponsorUserId) {
    throw new Error('Not authorized to revoke this identity');
  }

  identity.status = 'revoked';
  identity.updatedAt = new Date();

  await saveIdentity(identity);

  // Remove phone index
  await deletePhoneIndex(identity.phoneNumber);

  log.info({ id, displayName: identity.displayName }, 'Revoked sponsored identity');

  return true;
}

/**
 * Delete a sponsored identity completely.
 */
export async function deleteSponsoredIdentity(
  id: string,
  sponsorUserId: string
): Promise<boolean> {
  const identity = await getSponsoredIdentity(id);
  if (!identity) {
    return false;
  }

  // Verify ownership
  if (identity.sponsorUserId !== sponsorUserId) {
    throw new Error('Not authorized to delete this identity');
  }

  const db = getFirestore();
  if (!db) return false;

  try {
    // Delete phone index
    await deletePhoneIndex(identity.phoneNumber);

    // Delete identity document
    await db.collection(COLLECTION_NAME).doc(id).delete();

    // Clear caches
    identitiesCache.delete(id);
    phoneToIdentityCache.delete(identity.phoneNumber);

    log.info({ id, displayName: identity.displayName }, 'Deleted sponsored identity');

    return true;
  } catch (error) {
    log.error({ error, id }, 'Failed to delete sponsored identity');
    return false;
  }
}

// ============================================================================
// PHONE LOOKUP
// ============================================================================

/**
 * Look up a sponsored identity by phone number.
 * This is the primary lookup method for incoming calls.
 */
export async function lookupByPhone(phoneNumber: string): Promise<PhoneLookupResult> {
  const normalized = normalizePhoneNumber(phoneNumber);

  // Check cache first
  const cachedId = phoneToIdentityCache.get(normalized);
  if (cachedId) {
    const identity = await getSponsoredIdentity(cachedId);
    if (identity && identity.status === 'active') {
      return {
        found: true,
        identity,
        sponsorProfile: { userId: identity.sponsorUserId },
      };
    }
  }

  // Query phone index
  const db = getFirestore();
  if (!db) {
    return { found: false };
  }

  try {
    const indexDoc = await db.collection(PHONE_INDEX_COLLECTION).doc(normalized).get();

    if (!indexDoc.exists) {
      return { found: false };
    }

    const identityId = indexDoc.data()?.identityId;
    if (!identityId) {
      return { found: false };
    }

    const identity = await getSponsoredIdentity(identityId);
    if (!identity || identity.status !== 'active') {
      return { found: false };
    }

    // Update cache
    phoneToIdentityCache.set(normalized, identityId);

    return {
      found: true,
      identity,
      sponsorProfile: { userId: identity.sponsorUserId },
    };
  } catch (error) {
    log.error({ error, phone: normalized }, 'Failed to lookup by phone');
    return { found: false };
  }
}

// ============================================================================
// CALL TRACKING
// ============================================================================

/**
 * Record a call for a sponsored identity.
 */
export async function recordCall(
  identityId: string,
  durationMinutes: number
): Promise<void> {
  const identity = await getSponsoredIdentity(identityId);
  if (!identity) return;

  identity.lastCallAt = new Date();
  identity.totalCalls += 1;
  identity.totalMinutes += durationMinutes;
  identity.updatedAt = new Date();

  await saveIdentity(identity);

  log.debug(
    {
      identityId,
      displayName: identity.displayName,
      totalCalls: identity.totalCalls,
      durationMinutes,
    },
    'Recorded call for sponsored identity'
  );
}

// ============================================================================
// VOICE ENROLLMENT
// ============================================================================

/**
 * Mark a sponsored identity as voice enrolled.
 */
export async function markVoiceEnrolled(
  identityId: string,
  voiceProfileId: string
): Promise<void> {
  const identity = await getSponsoredIdentity(identityId);
  if (!identity) {
    throw new Error(`Sponsored identity not found: ${identityId}`);
  }

  identity.voiceEnrolled = true;
  identity.voiceProfileId = voiceProfileId;
  identity.updatedAt = new Date();

  await saveIdentity(identity);

  log.info({ identityId, voiceProfileId }, 'Marked sponsored identity as voice enrolled');
}

/**
 * Remove voice enrollment from a sponsored identity.
 */
export async function removeVoiceEnrollment(identityId: string): Promise<void> {
  const identity = await getSponsoredIdentity(identityId);
  if (!identity) return;

  identity.voiceEnrolled = false;
  identity.voiceProfileId = undefined;
  identity.updatedAt = new Date();

  await saveIdentity(identity);

  log.info({ identityId }, 'Removed voice enrollment from sponsored identity');
}

// ============================================================================
// SELF-REGISTRATION
// ============================================================================

/**
 * Create a pending sponsored identity from self-registration.
 * Requires sponsor approval before becoming active.
 */
export async function createSelfRegisteredIdentity(
  phoneNumber: string,
  name: string,
  claimedRelationship?: string,
  claimedSponsorName?: string
): Promise<SponsoredIdentity> {
  if (!isValidPhoneNumber(phoneNumber)) {
    throw new Error(`Invalid phone number: ${phoneNumber}`);
  }

  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  // Check if phone number is already registered
  const existing = await lookupByPhone(normalizedPhone);
  if (existing.found) {
    throw new Error('Phone number is already registered');
  }

  const id = `sponsored_self_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  // Create as pending - no sponsor yet
  const identity: SponsoredIdentity = {
    id,
    sponsorUserId: '', // Will be set when sponsor claims
    displayName: name,
    relationship: 'other',
    phoneNumber: normalizedPhone,
    voiceEnrolled: false,
    accessLevel: 'limited',
    allowedPersonas: ['ferni'], // Only Ferni until approved
    status: 'pending',
    notes: claimedRelationship
      ? `Self-registered. Claims to be ${claimedRelationship}${claimedSponsorName ? ` of ${claimedSponsorName}` : ''}`
      : 'Self-registered caller',
    createdAt: new Date(),
    updatedAt: new Date(),
    totalCalls: 1, // This is their first call
    totalMinutes: 0,
    selfRegistered: true,
    selfRegisteredName: name,
    selfRegisteredAt: new Date(),
  };

  await saveIdentity(identity);
  await savePhoneIndex(normalizedPhone, id);

  log.info(
    {
      id,
      name,
      phone: normalizedPhone,
      claimedRelationship,
    },
    '📝 Created self-registered identity (pending approval)'
  );

  return identity;
}

/**
 * Approve a self-registered identity and assign to sponsor.
 */
export async function approveSelfRegisteredIdentity(
  identityId: string,
  sponsorUserId: string,
  updates?: Partial<Pick<SponsoredIdentity, 'displayName' | 'relationship' | 'accessLevel' | 'allowedPersonas' | 'notes'>>
): Promise<SponsoredIdentity | null> {
  const identity = await getSponsoredIdentity(identityId);
  if (!identity) {
    throw new Error(`Identity not found: ${identityId}`);
  }

  if (identity.status !== 'pending') {
    throw new Error(`Identity is not pending approval: ${identity.status}`);
  }

  // Assign sponsor and activate
  identity.sponsorUserId = sponsorUserId;
  identity.status = 'active';
  identity.updatedAt = new Date();

  // Apply any updates from sponsor
  if (updates) {
    if (updates.displayName) identity.displayName = updates.displayName;
    if (updates.relationship) identity.relationship = updates.relationship;
    if (updates.accessLevel) identity.accessLevel = updates.accessLevel;
    if (updates.allowedPersonas) identity.allowedPersonas = updates.allowedPersonas;
    if (updates.notes) identity.notes = updates.notes;
  }

  await saveIdentity(identity);

  log.info(
    {
      identityId,
      sponsorUserId,
      displayName: identity.displayName,
    },
    '✅ Approved self-registered identity'
  );

  return identity;
}

/**
 * Get pending self-registered identities (for sponsor notification).
 */
export async function getPendingIdentities(): Promise<SponsoredIdentity[]> {
  const db = getFirestore();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection(COLLECTION_NAME)
      .where('status', '==', 'pending')
      .where('selfRegistered', '==', true)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map(docToIdentity);
  } catch (error) {
    log.error({ error }, 'Failed to get pending identities');
    return [];
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Save identity to Firestore and cache.
 */
async function saveIdentity(identity: SponsoredIdentity): Promise<void> {
  identitiesCache.set(identity.id, identity);
  phoneToIdentityCache.set(identity.phoneNumber, identity.id);

  const db = getFirestore();
  if (!db) return;

  try {
    const data = cleanForFirestore({
      ...identity,
      createdAt: admin.firestore.Timestamp.fromDate(identity.createdAt),
      updatedAt: admin.firestore.Timestamp.fromDate(identity.updatedAt),
      lastCallAt: identity.lastCallAt
        ? admin.firestore.Timestamp.fromDate(identity.lastCallAt)
        : null,
      selfRegisteredAt: identity.selfRegisteredAt
        ? admin.firestore.Timestamp.fromDate(identity.selfRegisteredAt)
        : null,
    });

    await db.collection(COLLECTION_NAME).doc(identity.id).set(data);
  } catch (error) {
    log.error({ error, id: identity.id }, 'Failed to save sponsored identity');
  }
}

/**
 * Save phone-to-identity index for fast lookups.
 */
async function savePhoneIndex(phoneNumber: string, identityId: string): Promise<void> {
  phoneToIdentityCache.set(phoneNumber, identityId);

  const db = getFirestore();
  if (!db) return;

  try {
    await db.collection(PHONE_INDEX_COLLECTION).doc(phoneNumber).set({
      identityId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    log.error({ error, phoneNumber, identityId }, 'Failed to save phone index');
  }
}

/**
 * Delete phone index.
 */
async function deletePhoneIndex(phoneNumber: string): Promise<void> {
  phoneToIdentityCache.delete(phoneNumber);

  const db = getFirestore();
  if (!db) return;

  try {
    await db.collection(PHONE_INDEX_COLLECTION).doc(phoneNumber).delete();
  } catch (error) {
    log.error({ error, phoneNumber }, 'Failed to delete phone index');
  }
}

/**
 * Convert Firestore document to SponsoredIdentity.
 */
function docToIdentity(doc: admin.firestore.DocumentSnapshot): SponsoredIdentity {
  const data = doc.data()!;
  return {
    id: doc.id,
    sponsorUserId: data.sponsorUserId,
    displayName: data.displayName,
    preferredName: data.preferredName,
    relationship: data.relationship,
    phoneNumber: data.phoneNumber,
    voiceEnrolled: data.voiceEnrolled || false,
    voiceProfileId: data.voiceProfileId,
    accessLevel: data.accessLevel || 'full',
    allowedPersonas: data.allowedPersonas || ['*'],
    status: data.status || 'active',
    notes: data.notes,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    lastCallAt: data.lastCallAt?.toDate(),
    totalCalls: data.totalCalls || 0,
    totalMinutes: data.totalMinutes || 0,
    selfRegistered: data.selfRegistered,
    selfRegisteredName: data.selfRegisteredName,
    selfRegisteredAt: data.selfRegisteredAt?.toDate(),
  };
}

/**
 * Clear caches (for testing).
 */
export function clearCaches(): void {
  identitiesCache.clear();
  phoneToIdentityCache.clear();
}

// ============================================================================
// VOICE ENROLLMENT FOR PHONE CALLERS
// ============================================================================

/**
 * Active voice enrollment sessions for phone callers.
 */
const activeEnrollmentSessions = new Map<
  string,
  {
    identityId: string;
    startedAt: Date;
    sampleCount: number;
    requiredSamples: number;
  }
>();

/**
 * Start voice enrollment for a sponsored identity during a phone call.
 * Returns prompts the agent should use to collect voice samples.
 */
export async function startPhoneVoiceEnrollment(
  identityId: string
): Promise<{
  success: boolean;
  prompts: string[];
  error?: string;
}> {
  const identity = await getSponsoredIdentity(identityId);
  if (!identity) {
    return {
      success: false,
      prompts: [],
      error: 'Identity not found',
    };
  }

  if (identity.voiceEnrolled) {
    return {
      success: false,
      prompts: [],
      error: 'Voice already enrolled',
    };
  }

  // Create enrollment session
  activeEnrollmentSessions.set(identityId, {
    identityId,
    startedAt: new Date(),
    sampleCount: 0,
    requiredSamples: 3, // Fewer samples needed for phone enrollment
  });

  log.info({ identityId, displayName: identity.displayName }, 'Started phone voice enrollment');

  // Return prompts the agent should use
  const name = identity.preferredName || identity.displayName;
  return {
    success: true,
    prompts: [
      `Great! I'm going to learn your voice, ${name}. Just speak normally and I'll remember how you sound.`,
      `Can you tell me a little about your day? Just a few sentences so I can learn your voice.`,
      `Perfect! Now, could you say something fun? Like what you're looking forward to this week.`,
      `One more! What's something that made you smile recently?`,
    ],
  };
}

/**
 * Record a voice sample during phone enrollment.
 * The agent captures audio during natural conversation.
 */
export async function recordPhoneVoiceSample(
  identityId: string,
  audio: Float32Array
): Promise<{
  success: boolean;
  complete: boolean;
  feedback: string;
  remainingSamples: number;
}> {
  const session = activeEnrollmentSessions.get(identityId);
  if (!session) {
    return {
      success: false,
      complete: false,
      feedback: 'No enrollment session active',
      remainingSamples: 0,
    };
  }

  // Import voice enrollment functions
  const { addEnrollmentSample, startEnrollmentSession, completeEnrollment } = await import(
    '../voice/voice-enrollment.js'
  );
  const { saveVoiceProfile } = await import('../voice/voice-profile-store.js');

  // Create or get the underlying enrollment session
  let enrollmentSession = (activeEnrollmentSessions as Map<string, unknown>).get(
    `session:${identityId}`
  ) as ReturnType<typeof startEnrollmentSession> | undefined;

  if (!enrollmentSession) {
    enrollmentSession = startEnrollmentSession(identityId, { requiredSamples: 3 });
    (activeEnrollmentSessions as Map<string, unknown>).set(`session:${identityId}`, enrollmentSession);
  }

  // Add the sample
  const result = await addEnrollmentSample(enrollmentSession, audio, {
    deviceType: 'phone',
    environment: 'phone_call',
  });

  if (!result.success) {
    return {
      success: false,
      complete: false,
      feedback: result.feedback || 'Failed to process voice sample',
      remainingSamples: session.requiredSamples - session.sampleCount,
    };
  }

  // Update session
  session.sampleCount++;

  // Check if enrollment is complete
  if (session.sampleCount >= session.requiredSamples) {
    // Complete the enrollment
    const completionResult = await completeEnrollment(enrollmentSession);

    if (completionResult.success && completionResult.profile) {
      // Save the voice profile
      await saveVoiceProfile(completionResult.profile);

      // Update sponsored identity to mark as voice enrolled
      await markVoiceEnrolled(identityId, completionResult.profile.userId);

      // Clean up sessions
      activeEnrollmentSessions.delete(identityId);
      activeEnrollmentSessions.delete(`session:${identityId}`);

      log.info({ identityId }, '✅ Phone voice enrollment complete');

      return {
        success: true,
        complete: true,
        feedback:
          "Perfect! I've learned your voice. From now on, I'll recognize you when you call.",
        remainingSamples: 0,
      };
    } else {
      return {
        success: false,
        complete: false,
        feedback: completionResult.error || 'Failed to complete voice enrollment',
        remainingSamples: 0,
      };
    }
  }

  return {
    success: true,
    complete: false,
    feedback: result.feedback || 'Voice sample recorded',
    remainingSamples: session.requiredSamples - session.sampleCount,
  };
}

/**
 * Cancel an active phone voice enrollment session.
 */
export function cancelPhoneVoiceEnrollment(identityId: string): void {
  activeEnrollmentSessions.delete(identityId);
  activeEnrollmentSessions.delete(`session:${identityId}`);
  log.debug({ identityId }, 'Cancelled phone voice enrollment');
}

/**
 * Check if there's an active voice enrollment session for an identity.
 */
export function hasActiveEnrollment(identityId: string): boolean {
  return activeEnrollmentSessions.has(identityId);
}
