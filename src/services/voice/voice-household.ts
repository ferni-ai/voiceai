/**
 * Voice Household Management
 *
 * Supports multiple voice-enrolled users per device/household.
 * Automatically identifies who's speaking at conversation start.
 *
 * FEATURES:
 * - Multiple voice profiles per device
 * - Automatic speaker identification
 * - User switching during sessions
 * - Household management (add/remove members)
 * - Per-user conversation history
 *
 * @module VoiceHousehold
 */

import pino from 'pino';
import * as admin from 'firebase-admin';
import { getGCPProjectId } from '../../config/environment.js';
import { removeUndefined } from '../../utils/firestore-utils.js';
import { identifySpeaker, type VoiceProfile } from './voice-enrollment.js';
import { loadVoiceProfile, saveVoiceProfile, deleteVoiceProfile } from './voice-profile-store.js';

const log = pino({ name: 'voice-household' });

// ============================================================================
// TYPES
// ============================================================================

export interface HouseholdMember {
  userId: string;
  displayName: string;
  role: 'owner' | 'adult' | 'child' | 'guest';
  enrolledAt: Date;
  lastSeen?: Date;
  preferences?: {
    greeting?: string;
    persona?: string;
    voiceEnrolled?: boolean;
  };
}

export interface Household {
  id: string;
  name: string;
  deviceId: string;
  ownerId: string;
  members: HouseholdMember[];
  createdAt: Date;
  updatedAt: Date;
  settings: {
    autoIdentify: boolean; // Auto-identify speaker at start
    requireReIdentification: boolean; // Re-identify if speaker changes
    guestMode: boolean; // Allow unidentified users
    childSafeMode: boolean; // Enable parental controls
  };
}

export interface SpeakerIdentificationResult {
  identified: boolean;
  member?: HouseholdMember;
  confidence: number;
  isNewSpeaker: boolean;
  suggestedAction?: 'enroll' | 'verify' | 'switch' | 'none';
}

// ============================================================================
// FIRESTORE
// ============================================================================

const COLLECTION_NAME = 'voice_households';

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
    log.warn({ error }, 'Firebase not available for households');
    return null;
  }
}

// In-memory cache
const householdsCache = new Map<string, Household>();

// ============================================================================
// HOUSEHOLD MANAGEMENT
// ============================================================================

/**
 * Create a new household.
 */
export async function createHousehold(
  deviceId: string,
  ownerId: string,
  name = 'My Home'
): Promise<Household> {
  const household: Household = {
    id: `household_${deviceId}`,
    name,
    deviceId,
    ownerId,
    members: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    settings: {
      autoIdentify: true,
      requireReIdentification: false,
      guestMode: true,
      childSafeMode: false,
    },
  };

  await saveHousehold(household);

  log.info({ householdId: household.id, ownerId }, 'Household created');
  return household;
}

/**
 * Get household by device ID.
 */
export async function getHousehold(deviceId: string): Promise<Household | null> {
  const householdId = `household_${deviceId}`;

  // Check cache first
  if (householdsCache.has(householdId)) {
    return householdsCache.get(householdId)!;
  }

  const db = getFirestore();
  if (!db) return null;

  try {
    const doc = await db.collection(COLLECTION_NAME).doc(householdId).get();
    if (!doc.exists) return null;

    const data = doc.data()!;
    const household: Household = {
      id: doc.id,
      name: data.name,
      deviceId: data.deviceId,
      ownerId: data.ownerId,
      members: data.members || [],
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
      settings: data.settings || {
        autoIdentify: true,
        requireReIdentification: false,
        guestMode: true,
        childSafeMode: false,
      },
    };

    householdsCache.set(householdId, household);
    return household;
  } catch (error) {
    log.error({ error, deviceId }, 'Failed to load household');
    return null;
  }
}

/**
 * Save household to Firestore.
 */
async function saveHousehold(household: Household): Promise<void> {
  household.updatedAt = new Date();
  householdsCache.set(household.id, household);

  const db = getFirestore();
  if (!db) return;

  try {
    await db
      .collection(COLLECTION_NAME)
      .doc(household.id)
      .set(
        removeUndefined({
          ...household,
          createdAt: admin.firestore.Timestamp.fromDate(household.createdAt),
          updatedAt: admin.firestore.Timestamp.fromDate(household.updatedAt),
          members: household.members.map((m) =>
            removeUndefined({
              ...m,
              enrolledAt: admin.firestore.Timestamp.fromDate(m.enrolledAt),
              lastSeen: m.lastSeen ? admin.firestore.Timestamp.fromDate(m.lastSeen) : null,
            })
          ),
        })
      );
  } catch (error) {
    log.error({ error, householdId: household.id }, 'Failed to save household');
  }
}

// ============================================================================
// MEMBER MANAGEMENT
// ============================================================================

/**
 * Add a member to a household.
 * Voice profile is optional - member can be added first, then enrolled later.
 * Members without voice profiles won't be automatically recognized during conversations.
 */
export async function addHouseholdMember(
  deviceId: string,
  userId: string,
  displayName: string,
  role: HouseholdMember['role'] = 'adult'
): Promise<HouseholdMember | null> {
  // Get or create household
  let household = await getHousehold(deviceId);
  if (!household) {
    household = await createHousehold(deviceId, userId);
  }

  // Check if member already exists
  const existing = household.members.find((m) => m.userId === userId);
  if (existing) {
    log.info({ userId, householdId: household.id }, 'Member already in household');
    return existing;
  }

  // Check if voice profile exists (optional - for logging/status)
  const profile = await loadVoiceProfile(userId);
  const hasVoiceProfile = !!profile;

  const member: HouseholdMember = {
    userId,
    displayName,
    role,
    enrolledAt: new Date(),
    // Track voice enrollment status in preferences
    preferences: {
      voiceEnrolled: hasVoiceProfile,
    },
  };

  household.members.push(member);
  await saveHousehold(household);

  log.info(
    { userId, householdId: household.id, role, voiceEnrolled: hasVoiceProfile },
    'Member added to household'
  );
  return member;
}

/**
 * Remove a member from a household.
 */
export async function removeHouseholdMember(deviceId: string, userId: string): Promise<boolean> {
  const household = await getHousehold(deviceId);
  if (!household) return false;

  const memberIndex = household.members.findIndex((m) => m.userId === userId);
  if (memberIndex === -1) return false;

  // Don't allow removing the owner
  if (household.ownerId === userId) {
    log.warn({ userId, householdId: household.id }, 'Cannot remove owner');
    return false;
  }

  household.members.splice(memberIndex, 1);
  await saveHousehold(household);

  log.info({ userId, householdId: household.id }, 'Member removed from household');
  return true;
}

/**
 * Get all members of a household.
 */
export async function getHouseholdMembers(deviceId: string): Promise<HouseholdMember[]> {
  const household = await getHousehold(deviceId);
  return household?.members || [];
}

/**
 * Update member's last seen timestamp.
 */
export async function updateMemberLastSeen(deviceId: string, userId: string): Promise<void> {
  const household = await getHousehold(deviceId);
  if (!household) return;

  const member = household.members.find((m) => m.userId === userId);
  if (member) {
    member.lastSeen = new Date();
    await saveHousehold(household);
  }
}

// ============================================================================
// SPEAKER IDENTIFICATION
// ============================================================================

/**
 * Identify who is speaking from household members.
 */
export async function identifyHouseholdSpeaker(
  deviceId: string,
  audio: Float32Array
): Promise<SpeakerIdentificationResult> {
  const household = await getHousehold(deviceId);

  if (!household || household.members.length === 0) {
    return {
      identified: false,
      confidence: 0,
      isNewSpeaker: true,
      suggestedAction: 'enroll',
    };
  }

  // Load voice profiles for all members
  const profiles: VoiceProfile[] = [];
  for (const member of household.members) {
    const profile = await loadVoiceProfile(member.userId);
    if (profile) {
      profiles.push(profile);
    }
  }

  if (profiles.length === 0) {
    return {
      identified: false,
      confidence: 0,
      isNewSpeaker: true,
      suggestedAction: 'enroll',
    };
  }

  // Run identification
  const result = await identifySpeaker(audio, profiles, { minThreshold: 0.6 });

  if (result.identified && result.userId) {
    const member = household.members.find((m) => m.userId === result.userId);

    // Update last seen
    await updateMemberLastSeen(deviceId, result.userId);

    log.info(
      {
        householdId: household.id,
        userId: result.userId,
        confidence: result.confidence,
      },
      'Speaker identified'
    );

    return {
      identified: true,
      member,
      confidence: result.confidence,
      isNewSpeaker: false,
      suggestedAction: 'none',
    };
  }

  // Check if this might be a known member with low confidence
  if (result.candidates.length > 0 && result.candidates[0].similarity > 0.5) {
    return {
      identified: false,
      confidence: result.candidates[0].similarity,
      isNewSpeaker: false,
      suggestedAction: 'verify',
    };
  }

  return {
    identified: false,
    confidence: result.confidence,
    isNewSpeaker: true,
    suggestedAction: household.settings.guestMode ? 'none' : 'enroll',
  };
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

interface ActiveSession {
  deviceId: string;
  currentUserId: string | null;
  startedAt: Date;
  lastActivity: Date;
  speakerChanges: Array<{
    fromUserId: string | null;
    toUserId: string | null;
    timestamp: Date;
    confidence: number;
  }>;
}

const activeSessions = new Map<string, ActiveSession>();

/**
 * Start a household session.
 */
export function startHouseholdSession(
  deviceId: string,
  initialUserId: string | null = null
): ActiveSession {
  const session: ActiveSession = {
    deviceId,
    currentUserId: initialUserId,
    startedAt: new Date(),
    lastActivity: new Date(),
    speakerChanges: [],
  };

  activeSessions.set(deviceId, session);

  log.info({ deviceId, userId: initialUserId }, 'Household session started');
  return session;
}

/**
 * Get active session for a device.
 */
export function getActiveSession(deviceId: string): ActiveSession | null {
  const session = activeSessions.get(deviceId);
  return session ?? null;
}

/**
 * Update current speaker in session.
 */
export async function updateSessionSpeaker(
  deviceId: string,
  newUserId: string | null,
  confidence: number
): Promise<void> {
  let session = activeSessions.get(deviceId);

  if (!session) {
    session = startHouseholdSession(deviceId, newUserId);
  }

  const previousUserId = session.currentUserId;

  if (previousUserId !== newUserId) {
    session.speakerChanges.push({
      fromUserId: previousUserId,
      toUserId: newUserId,
      timestamp: new Date(),
      confidence,
    });

    session.currentUserId = newUserId;

    log.info(
      {
        deviceId,
        fromUserId: previousUserId,
        toUserId: newUserId,
        confidence,
      },
      'Speaker changed'
    );
  }

  session.lastActivity = new Date();
}

/**
 * End a household session.
 */
export function endHouseholdSession(deviceId: string): ActiveSession | null {
  const session = activeSessions.get(deviceId);
  activeSessions.delete(deviceId);

  if (session) {
    log.info(
      {
        deviceId,
        duration: Date.now() - session.startedAt.getTime(),
        speakerChanges: session.speakerChanges.length,
      },
      'Household session ended'
    );
    return session;
  }

  return null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createHousehold,
  getHousehold,
  addHouseholdMember,
  removeHouseholdMember,
  getHouseholdMembers,
  identifyHouseholdSpeaker,
  startHouseholdSession,
  getActiveSession,
  updateSessionSpeaker,
  endHouseholdSession,
};
