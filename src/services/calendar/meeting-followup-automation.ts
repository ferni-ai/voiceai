/**
 * Meeting Follow-up Automation Service
 *
 * Automatically creates tasks and reminders based on recorded meeting outcomes.
 * This is "Better Than Human" because:
 * - No human assistant consistently captures and tracks all commitments
 * - Automatically links follow-ups to people and original meetings
 * - Proactively reminds before deadlines
 *
 * @module calendar/meeting-followup-automation
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../superhuman/firestore-utils.js';
import { createEvent, type CreateEventInput } from './calendar-service.js';
import type { CalendarEvent } from './types.js';

const log = createLogger({ module: 'meeting-followup' });

// ============================================================================
// TYPES
// ============================================================================

export interface MeetingCommitment {
  id: string;
  meetingId: string;
  meetingTitle: string;
  personEmail: string;
  personName?: string;
  commitment: string;
  commitmentType: 'by-user' | 'by-other';
  dueDate?: Date;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in-progress' | 'completed' | 'overdue';
  reminderEventId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FollowUpTask {
  id: string;
  commitmentId: string;
  title: string;
  description: string;
  dueDate: Date;
  calendarEventId?: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  createdAt: Date;
}

export interface MeetingFollowUpSummary {
  meetingTitle: string;
  date: Date;
  attendeeEmail: string;
  attendeeName?: string;
  userCommitments: MeetingCommitment[];
  theirCommitments: MeetingCommitment[];
  scheduledFollowUps: FollowUpTask[];
}

// ============================================================================
// STORAGE
// ============================================================================

const COLLECTION_COMMITMENTS = 'meeting_commitments';
const COLLECTION_FOLLOWUPS = 'meeting_followup_tasks';

async function saveCommitment(
  userId: string,
  commitment: Omit<MeetingCommitment, 'id' | 'createdAt' | 'updatedAt'>
): Promise<MeetingCommitment> {
  const db = getFirestoreDb();
  if (!db) {
    log.warn('Firestore not available for saving commitment');
    throw new Error('Storage not available');
  }

  const now = new Date();
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const doc: MeetingCommitment = {
    ...commitment,
    id,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .collection('bogle_users')
    .doc(userId)
    .collection(COLLECTION_COMMITMENTS)
    .doc(id)
    .set(cleanForFirestore(doc));

  log.debug({ userId, commitmentId: id }, 'Saved meeting commitment');
  return doc;
}

async function getUserCommitments(
  userId: string,
  status?: MeetingCommitment['status']
): Promise<MeetingCommitment[]> {
  const db = getFirestoreDb();
  if (!db) {
    return [];
  }

  try {
    let query = db
      .collection('bogle_users')
      .doc(userId)
      .collection(COLLECTION_COMMITMENTS)
      .orderBy('createdAt', 'desc')
      .limit(50);

    if (status) {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        dueDate: data.dueDate?.toDate?.() || data.dueDate,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
      } as MeetingCommitment;
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to fetch commitments');
    return [];
  }
}

async function updateCommitmentStatus(
  userId: string,
  commitmentId: string,
  status: MeetingCommitment['status']
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  await db
    .collection('bogle_users')
    .doc(userId)
    .collection(COLLECTION_COMMITMENTS)
    .doc(commitmentId)
    .update(
      cleanForFirestore({
        status,
        updatedAt: new Date(),
      })
    );
}

async function saveFollowUpTask(
  userId: string,
  task: Omit<FollowUpTask, 'id' | 'createdAt'>
): Promise<FollowUpTask> {
  const db = getFirestoreDb();
  if (!db) {
    throw new Error('Storage not available');
  }

  const now = new Date();
  const id = `followup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const doc: FollowUpTask = {
    ...task,
    id,
    createdAt: now,
  };

  await db
    .collection('bogle_users')
    .doc(userId)
    .collection(COLLECTION_FOLLOWUPS)
    .doc(id)
    .set(cleanForFirestore(doc));

  return doc;
}

// ============================================================================
// COMMITMENT EXTRACTION
// ============================================================================

/**
 * Extract due date from commitment text using simple heuristics.
 * Examples: "by Friday", "next week", "in 3 days", "by EOD"
 */
function extractDueDate(commitment: string): Date | undefined {
  const now = new Date();
  const text = commitment.toLowerCase();

  // "by EOD" / "end of day"
  if (text.includes('eod') || text.includes('end of day') || text.includes('today')) {
    const eod = new Date(now);
    eod.setHours(17, 0, 0, 0);
    return eod;
  }

  // "by tomorrow"
  if (text.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(17, 0, 0, 0);
    return tomorrow;
  }

  // "by Friday", "by Monday", etc.
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < dayNames.length; i++) {
    if (text.includes(dayNames[i])) {
      const targetDay = i;
      const currentDay = now.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7;

      const date = new Date(now);
      date.setDate(date.getDate() + daysUntil);
      date.setHours(17, 0, 0, 0);
      return date;
    }
  }

  // "next week"
  if (text.includes('next week')) {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(17, 0, 0, 0);
    return nextWeek;
  }

  // "in X days"
  const inDaysMatch = text.match(/in (\d+) days?/);
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1], 10);
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    date.setHours(17, 0, 0, 0);
    return date;
  }

  return undefined;
}

/**
 * Determine priority from commitment text
 */
function extractPriority(commitment: string): MeetingCommitment['priority'] {
  const text = commitment.toLowerCase();

  if (
    text.includes('urgent') ||
    text.includes('asap') ||
    text.includes('critical') ||
    text.includes('blocker')
  ) {
    return 'high';
  }

  if (text.includes('important') || text.includes('priority') || text.includes('key')) {
    return 'medium';
  }

  return 'low';
}

// ============================================================================
// AUTOMATION FUNCTIONS
// ============================================================================

/**
 * Process a recorded meeting outcome and create commitments + follow-ups.
 */
export async function processMeetingOutcome(
  userId: string,
  outcome: {
    meetingId?: string;
    meetingTitle: string;
    personEmail: string;
    personName?: string;
    userCommitments: string[];
    theirCommitments: string[];
  }
): Promise<{
  commitments: MeetingCommitment[];
  followUpTasks: FollowUpTask[];
}> {
  const commitments: MeetingCommitment[] = [];
  const followUpTasks: FollowUpTask[] = [];

  const meetingId = outcome.meetingId || `manual_${Date.now()}`;

  // Process user commitments
  for (const commitmentText of outcome.userCommitments) {
    const commitment = await saveCommitment(userId, {
      meetingId,
      meetingTitle: outcome.meetingTitle,
      personEmail: outcome.personEmail,
      personName: outcome.personName,
      commitment: commitmentText,
      commitmentType: 'by-user',
      dueDate: extractDueDate(commitmentText),
      priority: extractPriority(commitmentText),
      status: 'pending',
    });
    commitments.push(commitment);

    // Create calendar reminder if due date detected
    if (commitment.dueDate) {
      try {
        const task = await createFollowUpReminder(userId, commitment);
        if (task) {
          followUpTasks.push(task);
        }
      } catch (error) {
        log.warn({ error: String(error) }, 'Failed to create follow-up reminder');
      }
    }
  }

  // Process their commitments (we track but don't create reminders by default)
  for (const commitmentText of outcome.theirCommitments) {
    const commitment = await saveCommitment(userId, {
      meetingId,
      meetingTitle: outcome.meetingTitle,
      personEmail: outcome.personEmail,
      personName: outcome.personName,
      commitment: commitmentText,
      commitmentType: 'by-other',
      dueDate: extractDueDate(commitmentText),
      priority: extractPriority(commitmentText),
      status: 'pending',
    });
    commitments.push(commitment);
  }

  log.info(
    {
      userId,
      meetingTitle: outcome.meetingTitle,
      userCommitments: outcome.userCommitments.length,
      theirCommitments: outcome.theirCommitments.length,
      followUps: followUpTasks.length,
    },
    'Processed meeting outcome'
  );

  return { commitments, followUpTasks };
}

/**
 * Create a calendar reminder for a commitment.
 */
async function createFollowUpReminder(
  userId: string,
  commitment: MeetingCommitment
): Promise<FollowUpTask | null> {
  if (!commitment.dueDate) return null;

  // Create reminder 1 day before due date (or same day if due today)
  const reminderDate = new Date(commitment.dueDate);
  const now = new Date();
  const oneDayMs = 24 * 60 * 60 * 1000;

  if (reminderDate.getTime() - now.getTime() > oneDayMs) {
    reminderDate.setDate(reminderDate.getDate() - 1);
  }

  // Set to 9 AM
  reminderDate.setHours(9, 0, 0, 0);

  const eventInput: CreateEventInput = {
    title: `Follow up: ${commitment.commitment.slice(0, 50)}...`,
    description: `Commitment from meeting "${commitment.meetingTitle}" with ${commitment.personName || commitment.personEmail}.\n\nOriginal commitment: ${commitment.commitment}`,
    startTime: reminderDate,
    endTime: new Date(reminderDate.getTime() + 15 * 60 * 1000), // 15 min
    location: undefined,
    reminders: [{ minutes: 15, method: 'popup' }],
  };

  try {
    const event = await createEvent(userId, eventInput);

    const task = await saveFollowUpTask(userId, {
      commitmentId: commitment.id,
      title: eventInput.title,
      description: eventInput.description || '',
      dueDate: commitment.dueDate,
      calendarEventId: event?.id,
      status: 'scheduled',
    });

    // Update commitment with reminder event ID
    if (event?.id) {
      await updateCommitmentStatus(userId, commitment.id, 'pending');
    }

    return task;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to create follow-up calendar event');
    return null;
  }
}

/**
 * Get upcoming follow-ups for a user.
 */
export async function getUpcomingFollowUps(
  userId: string,
  daysAhead = 7
): Promise<MeetingCommitment[]> {
  const commitments = await getUserCommitments(userId, 'pending');

  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + daysAhead);

  return commitments.filter((c) => {
    if (!c.dueDate) return false;
    const dueDate = c.dueDate instanceof Date ? c.dueDate : new Date(c.dueDate);
    return dueDate >= now && dueDate <= cutoff;
  });
}

/**
 * Get overdue commitments for a user.
 */
export async function getOverdueCommitments(userId: string): Promise<MeetingCommitment[]> {
  const commitments = await getUserCommitments(userId, 'pending');

  const now = new Date();

  return commitments.filter((c) => {
    if (!c.dueDate) return false;
    const dueDate = c.dueDate instanceof Date ? c.dueDate : new Date(c.dueDate);
    return dueDate < now;
  });
}

/**
 * Mark a commitment as completed.
 */
export async function completeCommitment(userId: string, commitmentId: string): Promise<void> {
  await updateCommitmentStatus(userId, commitmentId, 'completed');
  log.info({ userId, commitmentId }, 'Commitment marked as completed');
}

/**
 * Get a summary of follow-ups by person.
 */
export async function getFollowUpSummaryByPerson(
  userId: string
): Promise<Map<string, MeetingCommitment[]>> {
  const commitments = await getUserCommitments(userId);
  const byPerson = new Map<string, MeetingCommitment[]>();

  for (const commitment of commitments) {
    const key = commitment.personEmail;
    const existing = byPerson.get(key) || [];
    existing.push(commitment);
    byPerson.set(key, existing);
  }

  return byPerson;
}

/**
 * Process recent meetings for follow-up opportunities.
 * Called by the scheduled job to identify meetings that ended
 * and may need follow-up actions.
 */
export async function processRecentMeetingsForFollowUp(
  userId: string,
  lookBackHours: number
): Promise<number> {
  const db = getFirestoreDb();
  if (!db) {
    log.warn('Firestore not available for processing follow-ups');
    return 0;
  }

  try {
    // Get recently ended meetings
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - lookBackHours);

    // Check for meetings with recorded outcomes that haven't been processed
    const pendingSnapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('meeting_outcomes')
      .where('processedAt', '==', null)
      .where('endTime', '>=', cutoff)
      .limit(20)
      .get();

    let processedCount = 0;

    for (const doc of pendingSnapshot.docs) {
      const data = doc.data();
      try {
        // Process the meeting outcome
        await processMeetingOutcome(userId, {
          meetingId: data.meetingId,
          meetingTitle: data.title,
          personEmail: data.attendees?.[0] || 'unknown@email.com',
          personName: data.attendeeName,
          userCommitments: data.userCommitments || [],
          theirCommitments: data.theirCommitments || [],
        });

        // Mark as processed
        await doc.ref.update(
          cleanForFirestore({
            processedAt: new Date(),
          })
        );

        processedCount++;
      } catch (error) {
        log.error({ error: String(error), meetingId: doc.id }, 'Failed to process meeting outcome');
      }
    }

    log.info({ userId, processedCount, lookBackHours }, 'Processed recent meetings for follow-up');
    return processedCount;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to process recent meetings');
    return 0;
  }
}

/**
 * Generate a brief for upcoming follow-ups to inject into context.
 */
export async function buildFollowUpContextInjection(userId: string): Promise<string | null> {
  const [upcoming, overdue] = await Promise.all([
    getUpcomingFollowUps(userId, 3),
    getOverdueCommitments(userId),
  ]);

  if (upcoming.length === 0 && overdue.length === 0) {
    return null;
  }

  const sections: string[] = ['[MEETING FOLLOW-UPS - Better Than Human Accountability]'];

  if (overdue.length > 0) {
    sections.push(`\n**Overdue (${overdue.length}):**`);
    for (const c of overdue.slice(0, 3)) {
      const person = c.personName || c.personEmail.split('@')[0];
      sections.push(`- "${c.commitment}" (promised to ${person})`);
    }
  }

  if (upcoming.length > 0) {
    sections.push(`\n**Due Soon (${upcoming.length}):**`);
    for (const c of upcoming.slice(0, 3)) {
      const person = c.personName || c.personEmail.split('@')[0];
      const dueStr = c.dueDate
        ? new Date(c.dueDate).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })
        : 'soon';
      sections.push(`- "${c.commitment}" → ${person} (due ${dueStr})`);
    }
  }

  return sections.join('\n');
}
