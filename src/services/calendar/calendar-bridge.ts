/**
 * Calendar Bridge Service
 *
 * Unified bridge that ensures ALL schedulable items appear on the user's calendar.
 * This is a "Better than Human" capability - no human assistant could consistently
 * sync reminders, tasks, appointments, and scheduled messages to a single calendar view.
 *
 * Supported item types:
 * - Reminders (from reminder-scheduler)
 * - Scheduled messages (text, email, call)
 * - Appointments (doctor, dentist, salon, etc.)
 * - Tasks (high-priority only)
 *
 * Each item creates a calendar event with appropriate:
 * - Title prefix (🔔 Reminder, 📱 Text, 📧 Email, 📞 Call, 🩺 Appointment, ✅ Task)
 * - Description with context
 * - Appropriate duration
 * - Category for filtering
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  createEvent,
  deleteEvent,
  updateEvent,
  findFreeTimeSlots,
  getEventsForDay,
  type CreateEventInput,
  type CalendarEvent,
  type TimeSlot,
} from './calendar-service.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Schedulable item types that should sync to calendar
 */
export type SchedulableItemType =
  | 'reminder'
  | 'scheduled_text'
  | 'scheduled_email'
  | 'scheduled_call'
  | 'appointment'
  | 'task'
  | 'medication'
  | 'bill_due'
  | 'goal_deadline'
  | 'milestone'
  | 'commitment'
  | 'travel'
  | 'habit';

/**
 * Input for creating a calendar-synced item
 */
export interface CalendarBridgeInput {
  /** User ID */
  userId: string;

  /** Type of schedulable item */
  type: SchedulableItemType;

  /** Title/message of the item */
  title: string;

  /** When the item is scheduled for */
  scheduledFor: Date;

  /** Duration in minutes (default: 15 for reminders/messages, 60 for appointments) */
  durationMinutes?: number;

  /** Additional context/description */
  description?: string;

  /** Contact name if applicable */
  contactName?: string;

  /** Location for appointments */
  location?: string;

  /** External reference ID (e.g., reminder ID, appointment ID) */
  externalId?: string;

  /** Which persona created this */
  createdBy?: string;

  /** Whether to check for conflicts first */
  checkConflicts?: boolean;
}

/**
 * Result of creating a calendar-bridged item
 */
export interface CalendarBridgeResult {
  success: boolean;
  calendarEventId?: string;
  externalId?: string;
  conflicts?: ConflictInfo[];
  error?: string;
}

/**
 * Information about a scheduling conflict
 */
export interface ConflictInfo {
  eventId: string;
  eventTitle: string;
  startTime: Date;
  endTime: Date;
  conflictType: 'overlap' | 'back_to_back' | 'busy_slot';
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Default durations by item type (in minutes)
 */
const DEFAULT_DURATIONS: Record<SchedulableItemType, number> = {
  reminder: 15,
  scheduled_text: 5,
  scheduled_email: 10,
  scheduled_call: 15,
  appointment: 60,
  task: 30,
  medication: 5,
  bill_due: 15,
  goal_deadline: 30,
  milestone: 60,
  commitment: 30,
  travel: 480, // 8 hours default for travel
  habit: 15,
};

/**
 * Icon prefixes for calendar event titles
 */
const TITLE_PREFIXES: Record<SchedulableItemType, string> = {
  reminder: '[Reminder]',
  scheduled_text: '[Text]',
  scheduled_email: '[Email]',
  scheduled_call: '[Call]',
  appointment: '[Appt]',
  task: '[Task]',
  medication: '[Meds]',
  bill_due: '[Bill]',
  goal_deadline: '[Goal]',
  milestone: '[Milestone]',
  commitment: '[Commitment]',
  travel: '[Travel]',
  habit: '[Habit]',
};

/**
 * Human-readable type labels
 */
const TYPE_LABELS: Record<SchedulableItemType, string> = {
  reminder: 'Reminder',
  scheduled_text: 'Text',
  scheduled_email: 'Email',
  scheduled_call: 'Call',
  appointment: 'Appointment',
  task: 'Task',
  medication: 'Medication',
  bill_due: 'Bill Due',
  goal_deadline: 'Goal Deadline',
  milestone: 'Milestone',
  commitment: 'Commitment',
  travel: 'Travel',
  habit: 'Habit',
};

// ============================================================================
// MAP: External ID → Calendar Event ID
// For cleanup when external items are cancelled/deleted
// ============================================================================

const externalToCalendarMap = new Map<string, string>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Create a schedulable item and sync it to the calendar
 *
 * This is the main entry point for the calendar bridge.
 * Call this whenever creating a reminder, scheduled message, appointment, or task.
 */
export async function createCalendarSyncedItem(
  input: CalendarBridgeInput
): Promise<CalendarBridgeResult> {
  const {
    userId,
    type,
    title,
    scheduledFor,
    durationMinutes = DEFAULT_DURATIONS[type],
    description,
    contactName,
    location,
    externalId,
    createdBy,
    checkConflicts = true,
  } = input;

  log.info(
    {
      userId,
      type,
      title,
      scheduledFor: scheduledFor.toISOString(),
      externalId,
    },
    '🌉 Calendar bridge: creating synced item'
  );

  try {
    // Calculate end time
    const endTime = new Date(scheduledFor.getTime() + durationMinutes * 60000);

    // Check for conflicts if requested
    let conflicts: ConflictInfo[] = [];
    if (checkConflicts) {
      conflicts = await detectConflicts(userId, scheduledFor, endTime);
      if (conflicts.length > 0) {
        log.warn(
          { userId, conflicts: conflicts.length, type },
          '⚠️ Calendar bridge: conflicts detected'
        );
        // We don't block on conflicts, just report them
      }
    }

    // Build calendar event title
    const prefix = TITLE_PREFIXES[type];
    const typeLabel = TYPE_LABELS[type];
    let eventTitle = `${prefix} ${typeLabel}`;

    // Add contact name or title
    if (contactName) {
      if (type === 'scheduled_text' || type === 'scheduled_call' || type === 'scheduled_email') {
        eventTitle += ` ${contactName}`;
      } else {
        eventTitle += `: ${title}`;
      }
    } else {
      eventTitle += `: ${title}`;
    }

    // Build description
    let eventDescription = '';
    if (description) {
      eventDescription = description;
    }
    if (contactName && type !== 'reminder') {
      eventDescription += `\n\nContact: ${contactName}`;
    }
    if (createdBy) {
      eventDescription += `\n\nCreated by: ${createdBy}`;
    }
    if (externalId) {
      eventDescription += `\n\n[Ferni ID: ${externalId}]`;
    }

    // Create the calendar event
    const eventInput: CreateEventInput = {
      title: eventTitle,
      description: eventDescription.trim(),
      location,
      startTime: scheduledFor,
      endTime,
      durationMinutes,
      reminders: [
        { method: 'popup', minutes: 15 },
        { method: 'popup', minutes: 5 },
      ],
    };

    const calendarEvent = await createEvent(userId, eventInput);

    if (!calendarEvent) {
      log.error({ userId, type, title }, '❌ Calendar bridge: failed to create calendar event');
      return {
        success: false,
        externalId,
        error: 'Failed to create calendar event',
      };
    }

    // Store mapping for later cleanup
    if (externalId) {
      externalToCalendarMap.set(externalId, calendarEvent.id);
    }

    log.info(
      {
        userId,
        type,
        calendarEventId: calendarEvent.id,
        externalId,
      },
      '✅ Calendar bridge: item synced to calendar'
    );

    return {
      success: true,
      calendarEventId: calendarEvent.id,
      externalId,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error({ error: errorMsg, userId, type, title }, '❌ Calendar bridge: error');
    return {
      success: false,
      externalId,
      error: errorMsg,
    };
  }
}

/**
 * Remove a calendar event when the external item is cancelled/deleted
 */
export async function removeCalendarSyncedItem(
  userId: string,
  externalId: string
): Promise<boolean> {
  const calendarEventId = externalToCalendarMap.get(externalId);

  if (!calendarEventId) {
    log.debug({ userId, externalId }, 'Calendar bridge: no calendar event found for external ID');
    return true; // Not an error - item might not have been synced
  }

  try {
    const deleted = await deleteEvent(userId, calendarEventId);

    if (deleted) {
      externalToCalendarMap.delete(externalId);
      log.info({ userId, externalId, calendarEventId }, '🗑️ Calendar bridge: removed synced event');
    }

    return deleted;
  } catch (error) {
    log.error({ error: String(error), userId, externalId }, 'Calendar bridge: failed to remove event');
    return false;
  }
}

/**
 * Update a calendar event when the external item is modified
 */
export async function updateCalendarSyncedItem(
  userId: string,
  externalId: string,
  updates: {
    title?: string;
    scheduledFor?: Date;
    durationMinutes?: number;
    description?: string;
    location?: string;
  }
): Promise<boolean> {
  const calendarEventId = externalToCalendarMap.get(externalId);

  if (!calendarEventId) {
    log.debug({ userId, externalId }, 'Calendar bridge: no calendar event found for external ID');
    return false;
  }

  try {
    const updateInput: Partial<CreateEventInput> = {};

    if (updates.title) updateInput.title = updates.title;
    if (updates.description) updateInput.description = updates.description;
    if (updates.location) updateInput.location = updates.location;
    if (updates.scheduledFor) {
      updateInput.startTime = updates.scheduledFor;
      if (updates.durationMinutes) {
        updateInput.endTime = new Date(
          updates.scheduledFor.getTime() + updates.durationMinutes * 60000
        );
      }
    }

    const updated = await updateEvent(userId, calendarEventId, updateInput);

    if (updated) {
      log.info({ userId, externalId, calendarEventId }, '📝 Calendar bridge: updated synced event');
      return true;
    }

    return false;
  } catch (error) {
    log.error({ error: String(error), userId, externalId }, 'Calendar bridge: failed to update event');
    return false;
  }
}

// ============================================================================
// CONFLICT DETECTION
// ============================================================================

/**
 * Detect scheduling conflicts for a proposed time slot
 */
export async function detectConflicts(
  userId: string,
  startTime: Date,
  endTime: Date
): Promise<ConflictInfo[]> {
  const conflicts: ConflictInfo[] = [];

  try {
    // Get events for the day
    const dayEvents = await getEventsForDay(userId, startTime);

    for (const event of dayEvents) {
      // Skip all-day events
      if (event.isAllDay) continue;

      // Check for overlap
      const eventStart = event.startTime.getTime();
      const eventEnd = event.endTime.getTime();
      const proposedStart = startTime.getTime();
      const proposedEnd = endTime.getTime();

      // Direct overlap
      if (proposedStart < eventEnd && proposedEnd > eventStart) {
        conflicts.push({
          eventId: event.id,
          eventTitle: event.title,
          startTime: event.startTime,
          endTime: event.endTime,
          conflictType: 'overlap',
        });
        continue;
      }

      // Back-to-back (less than 15 min gap)
      const gapMinutes = 15;
      const gapMs = gapMinutes * 60000;

      if (
        (proposedEnd > eventStart - gapMs && proposedEnd <= eventStart) ||
        (proposedStart >= eventEnd && proposedStart < eventEnd + gapMs)
      ) {
        conflicts.push({
          eventId: event.id,
          eventTitle: event.title,
          startTime: event.startTime,
          endTime: event.endTime,
          conflictType: 'back_to_back',
        });
      }
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Calendar bridge: conflict detection failed');
  }

  return conflicts;
}

/**
 * Find the next available slot that doesn't conflict
 */
export async function findNonConflictingSlot(
  userId: string,
  preferredTime: Date,
  durationMinutes: number,
  options: {
    maxDaysToSearch?: number;
    workHoursOnly?: boolean;
  } = {}
): Promise<TimeSlot | null> {
  const { maxDaysToSearch = 7, workHoursOnly = true } = options;

  // First, check if preferred time has no conflicts
  const preferredEnd = new Date(preferredTime.getTime() + durationMinutes * 60000);
  const conflicts = await detectConflicts(userId, preferredTime, preferredEnd);

  if (conflicts.length === 0) {
    return {
      start: preferredTime,
      end: preferredEnd,
      durationMinutes,
    };
  }

  // Find alternative slots
  for (let dayOffset = 0; dayOffset < maxDaysToSearch; dayOffset++) {
    const searchDate = new Date(preferredTime);
    searchDate.setDate(searchDate.getDate() + dayOffset);

    const freeSlots = await findFreeTimeSlots(userId, searchDate, {
      minDurationMinutes: durationMinutes,
      workDayOnly: workHoursOnly,
    });

    // Return the first suitable slot
    for (const slot of freeSlots) {
      if (slot.durationMinutes >= durationMinutes) {
        return {
          start: slot.start,
          end: new Date(slot.start.getTime() + durationMinutes * 60000),
          durationMinutes,
        };
      }
    }
  }

  return null;
}

// ============================================================================
// CONVENIENCE FUNCTIONS FOR SPECIFIC ITEM TYPES
// ============================================================================

/**
 * Sync a reminder to the calendar
 */
export async function syncReminderToCalendar(
  userId: string,
  reminderId: string,
  message: string,
  scheduledFor: Date,
  createdBy?: string
): Promise<CalendarBridgeResult> {
  return createCalendarSyncedItem({
    userId,
    type: 'reminder',
    title: message,
    scheduledFor,
    externalId: reminderId,
    createdBy,
    durationMinutes: 15,
  });
}

/**
 * Sync a scheduled text message to the calendar
 */
export async function syncScheduledTextToCalendar(
  userId: string,
  messageId: string,
  contactName: string,
  message: string,
  scheduledFor: Date,
  createdBy?: string
): Promise<CalendarBridgeResult> {
  return createCalendarSyncedItem({
    userId,
    type: 'scheduled_text',
    title: message.length > 50 ? message.substring(0, 47) + '...' : message,
    scheduledFor,
    contactName,
    description: message,
    externalId: messageId,
    createdBy,
    durationMinutes: 5,
  });
}

/**
 * Sync a scheduled email to the calendar
 */
export async function syncScheduledEmailToCalendar(
  userId: string,
  emailId: string,
  contactName: string,
  subject: string,
  scheduledFor: Date,
  createdBy?: string
): Promise<CalendarBridgeResult> {
  return createCalendarSyncedItem({
    userId,
    type: 'scheduled_email',
    title: subject,
    scheduledFor,
    contactName,
    externalId: emailId,
    createdBy,
    durationMinutes: 10,
  });
}

/**
 * Sync a scheduled call to the calendar
 */
export async function syncScheduledCallToCalendar(
  userId: string,
  callId: string,
  contactName: string,
  purpose: string,
  scheduledFor: Date,
  durationMinutes: number = 15,
  createdBy?: string
): Promise<CalendarBridgeResult> {
  return createCalendarSyncedItem({
    userId,
    type: 'scheduled_call',
    title: purpose,
    scheduledFor,
    contactName,
    externalId: callId,
    createdBy,
    durationMinutes,
  });
}

/**
 * Sync an appointment to the calendar
 */
export async function syncAppointmentToCalendar(
  userId: string,
  appointmentId: string,
  title: string,
  scheduledFor: Date,
  options: {
    durationMinutes?: number;
    location?: string;
    contactName?: string;
    description?: string;
    createdBy?: string;
  } = {}
): Promise<CalendarBridgeResult> {
  return createCalendarSyncedItem({
    userId,
    type: 'appointment',
    title,
    scheduledFor,
    externalId: appointmentId,
    ...options,
    durationMinutes: options.durationMinutes || 60,
  });
}

/**
 * Sync a task to the calendar (for high-priority tasks)
 */
export async function syncTaskToCalendar(
  userId: string,
  taskId: string,
  taskTitle: string,
  scheduledFor: Date,
  durationMinutes: number = 30,
  createdBy?: string
): Promise<CalendarBridgeResult> {
  return createCalendarSyncedItem({
    userId,
    type: 'task',
    title: taskTitle,
    scheduledFor,
    externalId: taskId,
    createdBy,
    durationMinutes,
  });
}

/**
 * Sync a medication reminder to the calendar
 */
export async function syncMedicationToCalendar(
  userId: string,
  medicationId: string,
  medicationName: string,
  dosage: string,
  scheduledFor: Date,
  options: {
    instructions?: string;
    isRecurring?: boolean;
  } = {}
): Promise<CalendarBridgeResult> {
  const description = options.instructions
    ? `Take ${dosage}\n\n${options.instructions}`
    : `Take ${dosage}`;

  return createCalendarSyncedItem({
    userId,
    type: 'medication',
    title: `${medicationName} (${dosage})`,
    scheduledFor,
    externalId: medicationId,
    description,
    durationMinutes: 5,
  });
}

/**
 * Sync a bill due date to the calendar
 */
export async function syncBillToCalendar(
  userId: string,
  billId: string,
  billName: string,
  amount: number,
  dueDate: Date,
  options: {
    payee?: string;
    isAutoPay?: boolean;
    reminderDaysBefore?: number;
  } = {}
): Promise<CalendarBridgeResult> {
  const title = `${billName}: $${amount.toFixed(2)}`;
  let description = `Amount due: $${amount.toFixed(2)}`;
  if (options.payee) {
    description += `\nPayee: ${options.payee}`;
  }
  if (options.isAutoPay) {
    description += '\n\nAutomatic payment enabled';
  }

  return createCalendarSyncedItem({
    userId,
    type: 'bill_due',
    title,
    scheduledFor: dueDate,
    externalId: billId,
    description,
    durationMinutes: 15,
  });
}

/**
 * Sync a goal deadline to the calendar
 */
export async function syncGoalToCalendar(
  userId: string,
  goalId: string,
  goalTitle: string,
  deadline: Date,
  options: {
    description?: string;
    category?: string;
  } = {}
): Promise<CalendarBridgeResult> {
  let description = options.description || '';
  if (options.category) {
    description += `\n\nCategory: ${options.category}`;
  }

  return createCalendarSyncedItem({
    userId,
    type: 'goal_deadline',
    title: goalTitle,
    scheduledFor: deadline,
    externalId: goalId,
    description: description.trim(),
    durationMinutes: 30,
  });
}

/**
 * Sync a life milestone to the calendar
 */
export async function syncMilestoneToCalendar(
  userId: string,
  milestoneId: string,
  milestoneName: string,
  eventDate: Date,
  options: {
    description?: string;
    isAllDay?: boolean;
    location?: string;
    category?: string;
    culturalType?: string;
  } = {}
): Promise<CalendarBridgeResult> {
  let description = options.description || '';
  if (options.category) {
    description = `[${options.category}] ${description}`.trim();
  }
  if (options.culturalType) {
    description += `\nCelebration type: ${options.culturalType}`;
  }

  return createCalendarSyncedItem({
    userId,
    type: 'milestone',
    title: milestoneName,
    scheduledFor: eventDate,
    externalId: milestoneId,
    description: description || undefined,
    location: options.location,
    durationMinutes: options.isAllDay ? 1440 : 60, // 24 hours for all-day events
  });
}

/**
 * Sync a commitment/follow-up to the calendar
 */
export async function syncCommitmentToCalendar(
  userId: string,
  commitmentId: string,
  commitmentTitle: string,
  targetDate: Date,
  options: {
    description?: string;
    contactName?: string;
    type?: string;
    emotionalWeight?: number;
  } = {}
): Promise<CalendarBridgeResult> {
  return createCalendarSyncedItem({
    userId,
    type: 'commitment',
    title: commitmentTitle,
    scheduledFor: targetDate,
    externalId: commitmentId,
    description: options.description,
    contactName: options.contactName,
    durationMinutes: 30,
  });
}

/**
 * Sync a travel plan to the calendar
 */
export async function syncTravelToCalendar(
  userId: string,
  travelId: string,
  destination: string,
  startDate: Date,
  endDate: Date,
  options: {
    tripName?: string;
    description?: string;
    notes?: string;
    budget?: number;
    flightInfo?: string;
    hotelInfo?: string;
  } = {}
): Promise<CalendarBridgeResult> {
  let description = options.description || `Trip to ${destination}`;
  if (options.notes) {
    description += `\n\n${options.notes}`;
  }
  if (options.budget) {
    description += `\n\nBudget: $${options.budget.toLocaleString()}`;
  }
  if (options.flightInfo) {
    description += `\n\nFlight: ${options.flightInfo}`;
  }
  if (options.hotelInfo) {
    description += `\n\nHotel: ${options.hotelInfo}`;
  }

  const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
  const title = options.tripName ? `Trip: ${options.tripName} (${destination})` : `Trip: ${destination}`;

  return createCalendarSyncedItem({
    userId,
    type: 'travel',
    title,
    scheduledFor: startDate,
    externalId: travelId,
    description,
    location: destination,
    durationMinutes: Math.max(durationMinutes, 60), // At least 1 hour
  });
}

/**
 * Sync a habit reminder to the calendar
 */
export async function syncHabitToCalendar(
  userId: string,
  habitId: string,
  habitName: string,
  scheduledFor: Date,
  options: {
    isRecurring?: boolean;
    frequency?: string;
    category?: string;
    description?: string;
  } = {}
): Promise<CalendarBridgeResult> {
  let description = '';
  if (options.frequency) {
    description = `Frequency: ${options.frequency}`;
  }

  return createCalendarSyncedItem({
    userId,
    type: 'habit',
    title: habitName,
    scheduledFor,
    externalId: habitId,
    description,
    durationMinutes: 15,
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Core functions
  createCalendarSyncedItem,
  removeCalendarSyncedItem,
  updateCalendarSyncedItem,

  // Conflict detection
  detectConflicts,
  findNonConflictingSlot,

  // Convenience functions
  syncReminderToCalendar,
  syncScheduledTextToCalendar,
  syncScheduledEmailToCalendar,
  syncScheduledCallToCalendar,
  syncAppointmentToCalendar,
  syncTaskToCalendar,
  syncMedicationToCalendar,
  syncBillToCalendar,
  syncGoalToCalendar,
  syncMilestoneToCalendar,
  syncCommitmentToCalendar,
  syncTravelToCalendar,
  syncHabitToCalendar,
};
