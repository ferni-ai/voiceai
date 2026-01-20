/**
 * Meetings Service - Meeting Notes & Action Items
 *
 * Track meetings, notes, and action items for personal productivity.
 * Stored in Firestore under users/{userId}/meetings/{meetingId}
 *
 * @module services/ceo/meetings
 */

import { Timestamp } from '@google-cloud/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import {
  getFirestoreDb,
  cleanForFirestore,
  recordDegradation,
  toSafeDate,
} from '../../utils/firestore-utils.js';
import { generateId } from '../../utils/id-generator.js';

const log = createLogger({ module: 'ceo-meetings' });

// ============================================================================
// TYPES
// ============================================================================

export interface ActionItem {
  id: string;
  description: string;
  assignee?: string;
  completed: boolean;
  completedAt?: Date;
}

export interface Meeting {
  id: string;
  userId: string;
  title: string;
  attendees: string[];
  notes?: string;
  actionItems: ActionItem[];
  meetingDate: Date;
  createdAt: Date;
}

interface FirestoreActionItem {
  id: string;
  description: string;
  assignee?: string;
  completed: boolean;
  completedAt?: Timestamp;
}

interface FirestoreMeeting {
  id: string;
  userId: string;
  title: string;
  attendees: string[];
  notes?: string;
  actionItems: FirestoreActionItem[];
  meetingDate: Timestamp;
  createdAt: Timestamp;
}

export type MeetingPeriod = 'today' | 'week' | 'month' | 'all';

// ============================================================================
// COLLECTION PATHS
// ============================================================================

const MEETINGS_COLLECTION = 'meetings';

function getMeetingsPath(userId: string): string {
  return `users/${userId}/${MEETINGS_COLLECTION}`;
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * Add a new meeting.
 */
export async function addMeeting(
  userId: string,
  title: string,
  attendees?: string[],
  notes?: string,
  actionItems?: Array<{ description: string; assignee?: string }>
): Promise<Meeting> {
  const db = getFirestoreDb();

  const meeting: Meeting = {
    id: generateId('mtg'),
    userId,
    title,
    attendees: attendees ?? [],
    notes,
    actionItems: (actionItems ?? []).map((item) => ({
      id: generateId('act'),
      description: item.description,
      assignee: item.assignee,
      completed: false,
    })),
    meetingDate: new Date(),
    createdAt: new Date(),
  };

  if (!db) {
    recordDegradation('ceo-meetings', 'addMeeting');
    log.warn({ userId }, 'Firestore unavailable, meeting not persisted');
    return meeting;
  }

  try {
    const firestoreMeeting: FirestoreMeeting = {
      ...meeting,
      actionItems: meeting.actionItems.map((item) => ({
        ...item,
        completedAt: item.completedAt ? Timestamp.fromDate(item.completedAt) : undefined,
      })),
      meetingDate: Timestamp.fromDate(meeting.meetingDate),
      createdAt: Timestamp.fromDate(meeting.createdAt),
    };

    const docRef = db.collection(getMeetingsPath(userId)).doc(meeting.id);
    await docRef.set(cleanForFirestore(firestoreMeeting));

    log.info({ userId, meetingId: meeting.id, title }, 'Meeting added');
    return meeting;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to add meeting');
    return meeting;
  }
}

/**
 * Get meetings for a specific time period.
 */
export async function getMeetings(userId: string, period: MeetingPeriod): Promise<Meeting[]> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-meetings', 'getMeetings');
    return [];
  }

  try {
    const meetingsRef = db.collection(getMeetingsPath(userId));
    let query = meetingsRef.orderBy('meetingDate', 'desc');

    // Add time filter based on period
    if (period !== 'all') {
      const cutoff = getPeriodCutoff(period);
      query = meetingsRef
        .where('meetingDate', '>=', Timestamp.fromDate(cutoff))
        .orderBy('meetingDate', 'desc');
    }

    const snapshot = await query.limit(100).get();

    return snapshot.docs.map((doc) => firestoreToMeeting(doc.data() as FirestoreMeeting));
  } catch (error) {
    log.error({ error: String(error), userId, period }, 'Failed to get meetings');
    return [];
  }
}

/**
 * Get a single meeting by ID.
 */
export async function getMeeting(userId: string, meetingId: string): Promise<Meeting | null> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-meetings', 'getMeeting');
    return null;
  }

  try {
    const docRef = db.collection(getMeetingsPath(userId)).doc(meetingId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return null;
    }

    return firestoreToMeeting(doc.data() as FirestoreMeeting);
  } catch (error) {
    log.error({ error: String(error), userId, meetingId }, 'Failed to get meeting');
    return null;
  }
}

/**
 * Update meeting notes.
 */
export async function updateNotes(
  userId: string,
  meetingId: string,
  notes: string
): Promise<Meeting | null> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-meetings', 'updateNotes');
    return null;
  }

  try {
    const docRef = db.collection(getMeetingsPath(userId)).doc(meetingId);
    const doc = await docRef.get();

    if (!doc.exists) {
      log.warn({ userId, meetingId }, 'Meeting not found for notes update');
      return null;
    }

    await docRef.update({ notes });

    const updated = await docRef.get();
    log.info({ userId, meetingId }, 'Meeting notes updated');
    return firestoreToMeeting(updated.data() as FirestoreMeeting);
  } catch (error) {
    log.error({ error: String(error), userId, meetingId }, 'Failed to update meeting notes');
    return null;
  }
}

/**
 * Add an action item to a meeting.
 */
export async function addActionItem(
  userId: string,
  meetingId: string,
  actionItem: { description: string; assignee?: string }
): Promise<Meeting | null> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-meetings', 'addActionItem');
    return null;
  }

  try {
    const docRef = db.collection(getMeetingsPath(userId)).doc(meetingId);
    const doc = await docRef.get();

    if (!doc.exists) {
      log.warn({ userId, meetingId }, 'Meeting not found for action item');
      return null;
    }

    const meeting = doc.data() as FirestoreMeeting;
    const newActionItem: FirestoreActionItem = {
      id: generateId('act'),
      description: actionItem.description,
      assignee: actionItem.assignee,
      completed: false,
    };

    const updatedActionItems = [...meeting.actionItems, newActionItem];
    await docRef.update({ actionItems: cleanForFirestore(updatedActionItems) });

    const updated = await docRef.get();
    log.info({ userId, meetingId, actionItemId: newActionItem.id }, 'Action item added');
    return firestoreToMeeting(updated.data() as FirestoreMeeting);
  } catch (error) {
    log.error({ error: String(error), userId, meetingId }, 'Failed to add action item');
    return null;
  }
}

/**
 * Complete an action item.
 */
export async function completeActionItem(
  userId: string,
  meetingId: string,
  actionItemId: string
): Promise<Meeting | null> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-meetings', 'completeActionItem');
    return null;
  }

  try {
    const docRef = db.collection(getMeetingsPath(userId)).doc(meetingId);
    const doc = await docRef.get();

    if (!doc.exists) {
      log.warn({ userId, meetingId }, 'Meeting not found for action item completion');
      return null;
    }

    const meeting = doc.data() as FirestoreMeeting;
    const actionItemIndex = meeting.actionItems.findIndex((item) => item.id === actionItemId);

    if (actionItemIndex === -1) {
      log.warn({ userId, meetingId, actionItemId }, 'Action item not found');
      return null;
    }

    meeting.actionItems[actionItemIndex] = {
      ...meeting.actionItems[actionItemIndex],
      completed: true,
      completedAt: Timestamp.now(),
    };

    await docRef.update({ actionItems: cleanForFirestore(meeting.actionItems) });

    const updated = await docRef.get();
    log.info({ userId, meetingId, actionItemId }, 'Action item completed');
    return firestoreToMeeting(updated.data() as FirestoreMeeting);
  } catch (error) {
    log.error(
      { error: String(error), userId, meetingId, actionItemId },
      'Failed to complete action item'
    );
    return null;
  }
}

/**
 * Get all action items across meetings.
 */
export async function getActionItems(
  userId: string,
  completed?: boolean
): Promise<Array<ActionItem & { meetingId: string; meetingTitle: string }>> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-meetings', 'getActionItems');
    return [];
  }

  try {
    const meetingsRef = db.collection(getMeetingsPath(userId));
    const snapshot = await meetingsRef.orderBy('meetingDate', 'desc').limit(500).get();

    const actionItems: Array<ActionItem & { meetingId: string; meetingTitle: string }> = [];

    for (const doc of snapshot.docs) {
      const meeting = doc.data() as FirestoreMeeting;
      for (const item of meeting.actionItems) {
        // Filter by completed status if specified
        if (completed === undefined || item.completed === completed) {
          actionItems.push({
            ...firestoreToActionItem(item),
            meetingId: meeting.id,
            meetingTitle: meeting.title,
          });
        }
      }
    }

    return actionItems;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get action items');
    return [];
  }
}

/**
 * Search meetings by title or notes.
 */
export async function searchMeetings(userId: string, query: string): Promise<Meeting[]> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-meetings', 'searchMeetings');
    return [];
  }

  try {
    // Firestore doesn't support full-text search, so we fetch recent meetings
    // and filter client-side. For production, consider Algolia or similar.
    const meetingsRef = db.collection(getMeetingsPath(userId));
    const snapshot = await meetingsRef.orderBy('meetingDate', 'desc').limit(500).get();

    const lowerQuery = query.toLowerCase();

    return snapshot.docs
      .map((doc) => firestoreToMeeting(doc.data() as FirestoreMeeting))
      .filter(
        (meeting) =>
          meeting.title.toLowerCase().includes(lowerQuery) ||
          (meeting.notes && meeting.notes.toLowerCase().includes(lowerQuery)) ||
          meeting.attendees.some((attendee) => attendee.toLowerCase().includes(lowerQuery))
      );
  } catch (error) {
    log.error({ error: String(error), userId, query }, 'Failed to search meetings');
    return [];
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function getPeriodCutoff(period: MeetingPeriod): Date {
  const now = new Date();

  switch (period) {
    case 'today': {
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      return today;
    }
    case 'week': {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      weekAgo.setHours(0, 0, 0, 0);
      return weekAgo;
    }
    case 'month': {
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      monthAgo.setHours(0, 0, 0, 0);
      return monthAgo;
    }
    default:
      return new Date(0);
  }
}

function firestoreToActionItem(data: FirestoreActionItem): ActionItem {
  return {
    id: data.id,
    description: data.description,
    assignee: data.assignee,
    completed: data.completed,
    completedAt: data.completedAt ? toSafeDate(data.completedAt) : undefined,
  };
}

function firestoreToMeeting(data: FirestoreMeeting): Meeting {
  return {
    id: data.id,
    userId: data.userId,
    title: data.title,
    attendees: data.attendees ?? [],
    notes: data.notes,
    actionItems: (data.actionItems ?? []).map(firestoreToActionItem),
    meetingDate: toSafeDate(data.meetingDate),
    createdAt: toSafeDate(data.createdAt),
  };
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const meetingsService = {
  addMeeting,
  getMeetings,
  getMeeting,
  updateNotes,
  addActionItem,
  completeActionItem,
  getActionItems,
  searchMeetings,
};
