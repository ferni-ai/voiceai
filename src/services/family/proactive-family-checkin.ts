/**
 * Proactive Family Check-in Service
 *
 * Enables Ferni to proactively call family members to check on their wellbeing.
 * This is a "Better Than Human" capability - no friend consistently remembers
 * to call your mom every Sunday.
 *
 * FLOW:
 * 1. User schedules check-in: "Call mom every Sunday at 2pm"
 * 2. Scheduler triggers at scheduled time
 * 3. Context builder gathers: recent events, health concerns, last topics
 * 4. Outbound call agent places call with warm, personalized opening
 * 5. Natural conversation (5-15 min)
 * 6. Post-call summary stored for sponsor
 * 7. Sponsor gets briefed: "Your mom sounded good when I called..."
 *
 * @module services/family/proactive-family-checkin
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import type { SponsoredIdentity } from '../identity/sponsored-identity.js';

const log = createLogger({ module: 'ProactiveFamilyCheckin' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Frequency options for recurring check-ins
 */
export type CheckinFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';

/**
 * Days of the week for scheduling
 */
export type DayOfWeek =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday';

/**
 * Status of a check-in call
 */
export type CheckinCallStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'no_answer'
  | 'voicemail'
  | 'cancelled'
  | 'rescheduled';

/**
 * Mood detected from the call
 */
export type DetectedMood =
  | 'happy'
  | 'content'
  | 'neutral'
  | 'tired'
  | 'worried'
  | 'sad'
  | 'unwell'
  | 'unknown';

/**
 * Urgency level for flagged concerns
 */
export type ConcernUrgency = 'low' | 'medium' | 'high' | 'urgent';

/**
 * A scheduled family check-in
 */
export interface FamilyCheckinSchedule {
  /** Unique identifier */
  id: string;

  /** Sponsor's user ID */
  sponsorUserId: string;

  /** The sponsored identity to call */
  sponsoredIdentityId: string;

  /** Display name for easy reference */
  familyMemberName: string;

  /** Relationship type */
  relationship: string;

  /** Phone number to call */
  phoneNumber: string;

  /** Frequency of check-ins */
  frequency: CheckinFrequency;

  /** Days to call (for weekly/custom) */
  daysOfWeek?: DayOfWeek[];

  /** Time to call (24h format, e.g., "14:00") */
  preferredTime: string;

  /** Timezone for the family member */
  timezone: string;

  /** Whether this schedule is active */
  isActive: boolean;

  /** Custom interval in days (for custom frequency) */
  customIntervalDays?: number;

  /** Special topics to always ask about */
  topicsOfInterest?: string[];

  /** Health conditions to be aware of */
  healthConcerns?: string[];

  /** Things to avoid discussing */
  topicsToAvoid?: string[];

  /** Maximum call duration in minutes */
  maxDurationMinutes: number;

  /** Whether to leave voicemail if no answer */
  leaveVoicemailIfNoAnswer: boolean;

  /** Next scheduled call time */
  nextScheduledCall: string;

  /** Last successful call */
  lastSuccessfulCall?: string;

  /** Total calls made */
  totalCallsMade: number;

  /** Created timestamp */
  createdAt: string;

  /** Updated timestamp */
  updatedAt: string;
}

/**
 * A completed check-in call record
 */
export interface CheckinCallRecord {
  /** Unique identifier */
  id: string;

  /** Reference to the schedule */
  scheduleId: string;

  /** Sponsor's user ID */
  sponsorUserId: string;

  /** The sponsored identity called */
  sponsoredIdentityId: string;

  /** Family member name */
  familyMemberName: string;

  /** Call status */
  status: CheckinCallStatus;

  /** When the call was placed */
  callStartedAt: string;

  /** When the call ended */
  callEndedAt?: string;

  /** Duration in seconds */
  durationSeconds?: number;

  /** Twilio call SID */
  twilioCallSid?: string;

  /** Detected mood of family member */
  detectedMood?: DetectedMood;

  /** Confidence in mood detection (0-1) */
  moodConfidence?: number;

  /** Summary of the conversation */
  conversationSummary?: string;

  /** Key topics discussed */
  topicsDiscussed?: string[];

  /** Any concerns flagged */
  concernsIdentified?: FlaggedConcern[];

  /** Positive moments to share */
  positiveHighlights?: string[];

  /** Follow-up items mentioned */
  followUpItems?: FollowUpItem[];

  /** Full transcript (optional, for debugging) */
  transcript?: string;

  /** Whether sponsor has been briefed */
  sponsorBriefed: boolean;

  /** When sponsor was briefed */
  briefedAt?: string;

  /** Error message if failed */
  errorMessage?: string;
}

/**
 * A concern flagged during the call
 */
export interface FlaggedConcern {
  /** Description of the concern */
  description: string;

  /** Urgency level */
  urgency: ConcernUrgency;

  /** Category (health, safety, emotional, financial) */
  category: 'health' | 'safety' | 'emotional' | 'financial' | 'other';

  /** Direct quote if available */
  quote?: string;

  /** Recommended action */
  recommendedAction?: string;
}

/**
 * A follow-up item from the call
 */
export interface FollowUpItem {
  /** What to follow up on */
  item: string;

  /** When to follow up */
  suggestedFollowUp?: string;

  /** Who should follow up */
  responsibleParty: 'sponsor' | 'ferni' | 'family_member';
}

/**
 * Context for placing a family check-in call
 */
export interface CheckinCallContext {
  /** The schedule being executed */
  schedule: FamilyCheckinSchedule;

  /** The sponsored identity */
  identity: SponsoredIdentity;

  /** Previous call records (last 5) */
  recentCalls: CheckinCallRecord[];

  /** Conversation starters based on context */
  suggestedTopics: string[];

  /** Recent events to mention */
  recentEvents?: string[];

  /** Health check questions */
  healthQuestions?: string[];

  /** Opening line for the call */
  openingLine: string;

  /** Sponsor's name for reference */
  sponsorName: string;

  /** Sponsor's relationship term (e.g., "your son Seth") */
  sponsorRelationship: string;
}

// ============================================================================
// FIRESTORE PATHS
// ============================================================================

const CHECKIN_SCHEDULES_COLLECTION = 'family_checkin_schedules';
const CHECKIN_CALLS_COLLECTION = 'family_checkin_calls';

// ============================================================================
// SCHEDULE MANAGEMENT
// ============================================================================

/**
 * Create a new family check-in schedule
 */
export async function createCheckinSchedule(
  input: Omit<
    FamilyCheckinSchedule,
    'id' | 'createdAt' | 'updatedAt' | 'nextScheduledCall' | 'totalCallsMade'
  >
): Promise<FamilyCheckinSchedule> {
  const db = getFirestoreDb();
  if (!db) {
    throw new Error('Firestore not available');
  }

  const now = new Date().toISOString();
  const nextCall = calculateNextCallTime(input);

  const schedule: FamilyCheckinSchedule = {
    ...input,
    id: `checkin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    nextScheduledCall: nextCall,
    totalCallsMade: 0,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .collection('bogle_users')
    .doc(input.sponsorUserId)
    .collection(CHECKIN_SCHEDULES_COLLECTION)
    .doc(schedule.id)
    .set(schedule);

  log.info(
    {
      scheduleId: schedule.id,
      sponsorUserId: input.sponsorUserId,
      familyMemberName: input.familyMemberName,
      frequency: input.frequency,
      nextCall,
    },
    'Created family check-in schedule'
  );

  return schedule;
}

/**
 * Get all check-in schedules for a user
 */
export async function getCheckinSchedules(
  sponsorUserId: string,
  activeOnly = true
): Promise<FamilyCheckinSchedule[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  let query = db
    .collection('bogle_users')
    .doc(sponsorUserId)
    .collection(CHECKIN_SCHEDULES_COLLECTION);

  if (activeOnly) {
    query = query.where('isActive', '==', true) as typeof query;
  }

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => doc.data() as FamilyCheckinSchedule);
}

/**
 * Get a specific check-in schedule
 */
export async function getCheckinSchedule(
  sponsorUserId: string,
  scheduleId: string
): Promise<FamilyCheckinSchedule | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  const doc = await db
    .collection('bogle_users')
    .doc(sponsorUserId)
    .collection(CHECKIN_SCHEDULES_COLLECTION)
    .doc(scheduleId)
    .get();

  return doc.exists ? (doc.data() as FamilyCheckinSchedule) : null;
}

/**
 * Update a check-in schedule
 */
export async function updateCheckinSchedule(
  sponsorUserId: string,
  scheduleId: string,
  updates: Partial<FamilyCheckinSchedule>
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  const updateData = {
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  // Recalculate next call if schedule changed
  if (updates.frequency || updates.preferredTime || updates.daysOfWeek) {
    const current = await getCheckinSchedule(sponsorUserId, scheduleId);
    if (current) {
      const merged = { ...current, ...updates };
      updateData.nextScheduledCall = calculateNextCallTime(merged);
    }
  }

  await db
    .collection('bogle_users')
    .doc(sponsorUserId)
    .collection(CHECKIN_SCHEDULES_COLLECTION)
    .doc(scheduleId)
    .update(updateData);

  log.info({ sponsorUserId, scheduleId }, 'Updated check-in schedule');
}

/**
 * Pause or resume a check-in schedule
 */
export async function toggleCheckinSchedule(
  sponsorUserId: string,
  scheduleId: string,
  isActive: boolean
): Promise<void> {
  await updateCheckinSchedule(sponsorUserId, scheduleId, { isActive });
  log.info(
    { sponsorUserId, scheduleId, isActive },
    `Check-in schedule ${isActive ? 'resumed' : 'paused'}`
  );
}

/**
 * Delete a check-in schedule
 */
export async function deleteCheckinSchedule(
  sponsorUserId: string,
  scheduleId: string
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  await db
    .collection('bogle_users')
    .doc(sponsorUserId)
    .collection(CHECKIN_SCHEDULES_COLLECTION)
    .doc(scheduleId)
    .delete();

  log.info({ sponsorUserId, scheduleId }, 'Deleted check-in schedule');
}

// ============================================================================
// CALL RECORD MANAGEMENT
// ============================================================================

/**
 * Create a call record when a check-in call starts
 */
export async function createCallRecord(
  schedule: FamilyCheckinSchedule,
  twilioCallSid?: string
): Promise<CheckinCallRecord> {
  const db = getFirestoreDb();
  if (!db) {
    throw new Error('Firestore not available');
  }

  const record: CheckinCallRecord = {
    id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    scheduleId: schedule.id,
    sponsorUserId: schedule.sponsorUserId,
    sponsoredIdentityId: schedule.sponsoredIdentityId,
    familyMemberName: schedule.familyMemberName,
    status: 'in_progress',
    callStartedAt: new Date().toISOString(),
    twilioCallSid,
    sponsorBriefed: false,
  };

  await db
    .collection('bogle_users')
    .doc(schedule.sponsorUserId)
    .collection(CHECKIN_CALLS_COLLECTION)
    .doc(record.id)
    .set(record);

  log.info(
    {
      recordId: record.id,
      scheduleId: schedule.id,
      familyMemberName: schedule.familyMemberName,
    },
    'Created check-in call record'
  );

  return record;
}

/**
 * Update a call record when the call completes
 */
export async function completeCallRecord(
  sponsorUserId: string,
  recordId: string,
  result: {
    status: CheckinCallStatus;
    durationSeconds?: number;
    detectedMood?: DetectedMood;
    moodConfidence?: number;
    conversationSummary?: string;
    topicsDiscussed?: string[];
    concernsIdentified?: FlaggedConcern[];
    positiveHighlights?: string[];
    followUpItems?: FollowUpItem[];
    transcript?: string;
    errorMessage?: string;
  }
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  const updateData = {
    ...result,
    callEndedAt: new Date().toISOString(),
  };

  await db
    .collection('bogle_users')
    .doc(sponsorUserId)
    .collection(CHECKIN_CALLS_COLLECTION)
    .doc(recordId)
    .update(updateData);

  log.info(
    {
      recordId,
      status: result.status,
      durationSeconds: result.durationSeconds,
      detectedMood: result.detectedMood,
      hasConcerns: (result.concernsIdentified?.length ?? 0) > 0,
    },
    'Completed check-in call record'
  );

  // If call was successful, update the schedule
  if (result.status === 'completed') {
    await updateScheduleAfterCall(sponsorUserId, recordId);
  }
}

/**
 * Get recent call records for a schedule
 */
export async function getRecentCallRecords(
  sponsorUserId: string,
  scheduleId: string,
  limit = 5
): Promise<CheckinCallRecord[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  const snapshot = await db
    .collection('bogle_users')
    .doc(sponsorUserId)
    .collection(CHECKIN_CALLS_COLLECTION)
    .where('scheduleId', '==', scheduleId)
    .orderBy('callStartedAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data() as CheckinCallRecord);
}

/**
 * Get a call record by ID (searches across all users)
 * Uses collection group query to find the record without knowing the sponsorUserId
 */
export async function getCallRecordById(callId: string): Promise<CheckinCallRecord | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    // Use collection group query to search across all users' checkin_calls
    const snapshot = await db
      .collectionGroup(CHECKIN_CALLS_COLLECTION)
      .where('id', '==', callId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      log.debug({ callId }, 'Call record not found');
      return null;
    }

    return snapshot.docs[0].data() as CheckinCallRecord;
  } catch (error) {
    log.error({ callId, error: String(error) }, 'Error fetching call record');
    return null;
  }
}

/**
 * Get unbriefed call records (calls sponsor hasn't heard about yet)
 */
export async function getUnbriefedCallRecords(sponsorUserId: string): Promise<CheckinCallRecord[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  const snapshot = await db
    .collection('bogle_users')
    .doc(sponsorUserId)
    .collection(CHECKIN_CALLS_COLLECTION)
    .where('sponsorBriefed', '==', false)
    .where('status', '==', 'completed')
    .orderBy('callStartedAt', 'desc')
    .get();

  return snapshot.docs.map((doc) => doc.data() as CheckinCallRecord);
}

/**
 * Mark a call record as briefed (sponsor has been told about it)
 */
export async function markCallBriefed(sponsorUserId: string, recordId: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  await db
    .collection('bogle_users')
    .doc(sponsorUserId)
    .collection(CHECKIN_CALLS_COLLECTION)
    .doc(recordId)
    .update({
      sponsorBriefed: true,
      briefedAt: new Date().toISOString(),
    });
}

// ============================================================================
// SCHEDULING HELPERS
// ============================================================================

/**
 * Calculate the next call time based on schedule settings
 */
function calculateNextCallTime(
  schedule: Pick<
    FamilyCheckinSchedule,
    'frequency' | 'preferredTime' | 'daysOfWeek' | 'customIntervalDays' | 'timezone'
  >
): string {
  const now = new Date();
  const [hours, minutes] = schedule.preferredTime.split(':').map(Number);

  // Start from tomorrow at preferred time
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(hours, minutes, 0, 0);

  switch (schedule.frequency) {
    case 'daily':
      // Already set to tomorrow
      break;

    case 'weekly':
      if (schedule.daysOfWeek && schedule.daysOfWeek.length > 0) {
        const targetDay = dayOfWeekToNumber(schedule.daysOfWeek[0]);
        while (next.getDay() !== targetDay) {
          next.setDate(next.getDate() + 1);
        }
      }
      break;

    case 'biweekly':
      if (schedule.daysOfWeek && schedule.daysOfWeek.length > 0) {
        const targetDay = dayOfWeekToNumber(schedule.daysOfWeek[0]);
        while (next.getDay() !== targetDay) {
          next.setDate(next.getDate() + 1);
        }
        // Add another week for biweekly
        next.setDate(next.getDate() + 7);
      }
      break;

    case 'monthly':
      // Same day next month
      next.setMonth(next.getMonth() + 1);
      break;

    case 'custom':
      if (schedule.customIntervalDays) {
        next.setDate(next.getDate() + schedule.customIntervalDays - 1);
      }
      break;
  }

  return next.toISOString();
}

/**
 * Convert day of week string to number (0 = Sunday)
 */
function dayOfWeekToNumber(day: DayOfWeek): number {
  const map: Record<DayOfWeek, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  return map[day];
}

/**
 * Update schedule after a successful call
 */
async function updateScheduleAfterCall(sponsorUserId: string, callRecordId: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  // Get the call record to find the schedule
  const callDoc = await db
    .collection('bogle_users')
    .doc(sponsorUserId)
    .collection(CHECKIN_CALLS_COLLECTION)
    .doc(callRecordId)
    .get();

  if (!callDoc.exists) return;

  const callRecord = callDoc.data() as CheckinCallRecord;
  const schedule = await getCheckinSchedule(sponsorUserId, callRecord.scheduleId);
  if (!schedule) return;

  // Calculate next call time
  const nextCall = calculateNextCallTime(schedule);

  await db
    .collection('bogle_users')
    .doc(sponsorUserId)
    .collection(CHECKIN_SCHEDULES_COLLECTION)
    .doc(schedule.id)
    .update({
      lastSuccessfulCall: callRecord.callStartedAt,
      nextScheduledCall: nextCall,
      totalCallsMade: (schedule.totalCallsMade || 0) + 1,
      updatedAt: new Date().toISOString(),
    });

  log.info(
    {
      scheduleId: schedule.id,
      nextCall,
      totalCalls: schedule.totalCallsMade + 1,
    },
    'Updated schedule after successful call'
  );
}

// ============================================================================
// DUE SCHEDULES (for scheduler polling)
// ============================================================================

/**
 * Get all schedules that are due for a call
 */
export async function getDueSchedules(): Promise<FamilyCheckinSchedule[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  const now = new Date().toISOString();

  // Query across all users using collection group
  const snapshot = await db
    .collectionGroup(CHECKIN_SCHEDULES_COLLECTION)
    .where('isActive', '==', true)
    .where('nextScheduledCall', '<=', now)
    .limit(10) // Process in batches
    .get();

  return snapshot.docs.map((doc) => doc.data() as FamilyCheckinSchedule);
}

// ============================================================================
// BRIEFING HELPERS
// ============================================================================

/**
 * Generate a natural briefing summary for the sponsor
 */
export function generateBriefingSummary(record: CheckinCallRecord): string {
  const parts: string[] = [];

  // Opening
  const timeAgo = getRelativeTime(new Date(record.callStartedAt));
  parts.push(`I called ${record.familyMemberName} ${timeAgo}.`);

  // Mood
  if (record.detectedMood && record.detectedMood !== 'unknown') {
    const moodDescriptions: Record<DetectedMood, string> = {
      happy: 'She sounded really happy',
      content: 'She seemed content and relaxed',
      neutral: 'She seemed to be doing fine',
      tired: 'She sounded a bit tired',
      worried: 'She seemed a little worried about something',
      sad: 'She sounded a bit down',
      unwell: "She mentioned she wasn't feeling her best",
      unknown: '',
    };
    if (moodDescriptions[record.detectedMood]) {
      parts.push(moodDescriptions[record.detectedMood] + '.');
    }
  }

  // Summary
  if (record.conversationSummary) {
    parts.push(record.conversationSummary);
  }

  // Positive highlights
  if (record.positiveHighlights && record.positiveHighlights.length > 0) {
    const highlight = record.positiveHighlights[0];
    parts.push(`Good news: ${highlight}`);
  }

  // Concerns (only mention if sponsor should know)
  if (record.concernsIdentified && record.concernsIdentified.length > 0) {
    const highPriority = record.concernsIdentified.filter(
      (c) => c.urgency === 'high' || c.urgency === 'urgent'
    );
    if (highPriority.length > 0) {
      parts.push(`Something you might want to know: ${highPriority[0].description}`);
    }
  }

  // Follow-ups for sponsor
  if (record.followUpItems && record.followUpItems.length > 0) {
    const sponsorItems = record.followUpItems.filter((item) => item.responsibleParty === 'sponsor');
    if (sponsorItems.length > 0) {
      parts.push(`She mentioned ${sponsorItems[0].item}.`);
    }
  }

  return parts.join(' ');
}

/**
 * Get relative time string (e.g., "2 hours ago", "yesterday")
 */
function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) {
    return 'just now';
  } else if (diffHours < 24) {
    return diffHours === 1 ? 'an hour ago' : `${diffHours} hours ago`;
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return `on ${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  calculateNextCallTime,
  // Note: generateBriefingSummary is exported at declaration
};
