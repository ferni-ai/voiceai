/**
 * Commitment-Calendar Integration
 *
 * Validates commitments against calendar reality and creates calendar blocks.
 * This is "better than human" because no assistant:
 * - Validates if you actually have time for a commitment
 * - Auto-creates calendar blocks for commitments
 * - Warns when calendar changes conflict with commitments
 *
 * @module superhuman/commitment-calendar-integration
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getWeekOverview,
  findFreeTimeSlots,
  createEvent,
  type CalendarEvent,
  type TimeSlot,
  type CreateEventInput,
} from '../calendar/calendar-service.js';
import type { Commitment } from './commitment-keeper.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'commitment-calendar' });

// ============================================================================
// TYPES
// ============================================================================

export interface CommitmentFeasibility {
  feasible: boolean;
  score: number; // 0-100
  conflicts: string[];
  suggestedSlots: TimeSlot[];
  suggestion: string | null;
  alternativeCommitment: string | null;
}

export interface CommitmentConflict {
  commitmentId: string;
  commitmentText: string;
  conflictingEvent: Partial<CalendarEvent>;
  severity: 'blocked' | 'reduced' | 'at_risk';
  suggestion: string;
}

export interface CommitmentCalendarBlock {
  commitmentId: string;
  eventIds: string[];
  blockedMinutesTotal: number;
}

// ============================================================================
// FEASIBILITY VALIDATION
// ============================================================================

/**
 * Validate if a commitment is feasible given the user's calendar
 *
 * This is the core "better than human" function - we check if the user
 * actually has time for what they're committing to.
 */
export async function validateCommitmentFeasibility(
  userId: string,
  commitment:
    | Commitment
    | {
        text: string;
        type?: string;
        frequency?: { times: number; period: string };
        duration?: number;
      }
): Promise<CommitmentFeasibility> {
  try {
    // Parse commitment requirements
    const requirements = parseCommitmentRequirements(commitment);

    if (!requirements) {
      // Can't parse requirements, assume feasible
      return {
        feasible: true,
        score: 50,
        conflicts: [],
        suggestedSlots: [],
        suggestion: null,
        alternativeCommitment: null,
      };
    }

    // Get week overview
    const weekOverview = await getWeekOverview(userId);

    // Find available slots that match requirements
    const availableSlots: TimeSlot[] = [];

    for (const dayOverview of weekOverview.days) {
      const dayOfWeek = dayOverview.date.getDay();

      // Skip weekends unless commitment is explicitly for weekends
      if ((dayOfWeek === 0 || dayOfWeek === 6) && !requirements.includesWeekends) {
        continue;
      }

      const daySlots = await findFreeTimeSlots(userId, dayOverview.date, {
        minDurationMinutes: requirements.durationMinutes,
        workDayOnly: !requirements.includesWeekends,
      });

      // Filter by preferred time if specified
      for (const slot of daySlots) {
        if (requirements.preferredTime) {
          const hour = slot.start.getHours();
          if (requirements.preferredTime === 'morning' && hour >= 6 && hour < 12) {
            availableSlots.push(slot);
          } else if (requirements.preferredTime === 'afternoon' && hour >= 12 && hour < 18) {
            availableSlots.push(slot);
          } else if (requirements.preferredTime === 'evening' && hour >= 18) {
            availableSlots.push(slot);
          }
        } else {
          availableSlots.push(slot);
        }
      }
    }

    // Check if we have enough slots
    const slotsNeeded = requirements.timesPerPeriod;
    const slotsAvailable = availableSlots.length;

    if (slotsAvailable >= slotsNeeded) {
      // Fully feasible
      return {
        feasible: true,
        score: Math.min(100, 60 + (slotsAvailable - slotsNeeded) * 10),
        conflicts: [],
        suggestedSlots: availableSlots.slice(0, slotsNeeded),
        suggestion: null,
        alternativeCommitment: null,
      };
    }

    // Partially feasible or not feasible
    const conflicts: string[] = [];

    if (slotsAvailable === 0) {
      conflicts.push('No available time slots this week');
    } else {
      conflicts.push(`Only ${slotsAvailable} slots available, need ${slotsNeeded}`);
    }

    // Check what's blocking
    const heavyDays = weekOverview.days.filter((d) => d.isOverloaded);
    if (heavyDays.length >= 3) {
      conflicts.push(`${heavyDays.length} overloaded days this week`);
    }

    // Calculate score
    const score = Math.round((slotsAvailable / slotsNeeded) * 60);

    // Generate suggestion
    let suggestion: string | null = null;
    let alternativeCommitment: string | null = null;

    if (slotsAvailable > 0 && slotsAvailable < slotsNeeded) {
      suggestion = `Your calendar only has room for ${slotsAvailable} ${requirements.activityName || 'sessions'} this week instead of ${slotsNeeded}`;
      alternativeCommitment = commitment.text
        ? commitment.text.replace(new RegExp(`${slotsNeeded}`, 'g'), String(slotsAvailable))
        : null;
    } else if (slotsAvailable === 0) {
      suggestion = 'Your calendar is packed this week. Consider clearing some time first.';
    }

    return {
      feasible: slotsAvailable >= slotsNeeded,
      score,
      conflicts,
      suggestedSlots: availableSlots,
      suggestion,
      alternativeCommitment,
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to validate commitment feasibility');
    return {
      feasible: true, // Fail open
      score: 50,
      conflicts: [],
      suggestedSlots: [],
      suggestion: null,
      alternativeCommitment: null,
    };
  }
}

/**
 * Find available time slots for a commitment
 */
export async function findTimeForCommitment(
  userId: string,
  commitment: Commitment | { duration?: number; preferredTime?: string }
): Promise<TimeSlot[]> {
  const duration = commitment.duration || 30;
  const { preferredTime } = commitment;

  const slots: TimeSlot[] = [];
  const weekOverview = await getWeekOverview(userId);

  for (const dayOverview of weekOverview.days) {
    const dayOfWeek = dayOverview.date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    const daySlots = await findFreeTimeSlots(userId, dayOverview.date, {
      minDurationMinutes: duration,
      workDayOnly: true,
    });

    for (const slot of daySlots) {
      if (preferredTime) {
        const hour = slot.start.getHours();
        if (preferredTime === 'morning' && hour >= 6 && hour < 12) {
          slots.push(slot);
        } else if (preferredTime === 'afternoon' && hour >= 12 && hour < 18) {
          slots.push(slot);
        } else if (preferredTime === 'evening' && hour >= 18) {
          slots.push(slot);
        }
      } else {
        slots.push(slot);
      }
    }
  }

  return slots;
}

// ============================================================================
// CALENDAR BLOCK CREATION
// ============================================================================

/**
 * Create calendar blocks for a commitment
 */
export async function createCalendarBlocksForCommitment(
  userId: string,
  commitment: Commitment | { text: string; id?: string; duration?: number },
  slots: TimeSlot[]
): Promise<CommitmentCalendarBlock> {
  const eventIds: string[] = [];
  let totalMinutes = 0;

  for (const slot of slots) {
    const duration = commitment.duration || slot.durationMinutes;

    const eventInput: CreateEventInput = {
      title: `📌 ${extractActivityName(commitment.text)}`,
      description: `Blocked for commitment: ${commitment.text}\n\nCreated by Ferni to help you keep your commitment.`,
      startTime: slot.start,
      durationMinutes: Math.min(duration, slot.durationMinutes),
    };

    try {
      const event = await createEvent(userId, eventInput);
      if (event) {
        eventIds.push(event.id);
        totalMinutes += duration;
        log.debug(
          { userId, eventId: event.id, commitment: commitment.text },
          'Created calendar block for commitment'
        );
      }
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to create commitment block');
    }
  }

  return {
    commitmentId: commitment.id || `commitment_${Date.now()}`,
    eventIds,
    blockedMinutesTotal: totalMinutes,
  };
}

// ============================================================================
// CONFLICT DETECTION
// ============================================================================

/**
 * Check if a new calendar event conflicts with existing commitments
 */
export async function checkCommitmentConflicts(
  userId: string,
  newEvent: Partial<CalendarEvent>,
  commitments: Commitment[]
): Promise<CommitmentConflict[]> {
  const conflicts: CommitmentConflict[] = [];

  // Only check commitments that have calendar blocks
  const commitmentsWithBlocks = commitments.filter(
    (c) => c.calendarEventIds && c.calendarEventIds.length > 0
  );

  for (const commitment of commitmentsWithBlocks) {
    if (!commitment.calendarEventIds) continue;

    // Check if new event overlaps with any commitment block
    // This is simplified - in production, would fetch actual event times
    for (const eventId of commitment.calendarEventIds) {
      // Check if this is the event being blocked
      if (newEvent.id && newEvent.id === eventId) {
        conflicts.push({
          commitmentId: commitment.id,
          commitmentText: commitment.text,
          conflictingEvent: newEvent,
          severity: 'blocked',
          suggestion: `This blocks time you reserved for "${extractActivityName(commitment.text)}"`,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Handler for calendar changes that might affect commitments
 *
 * If commitments are not provided, will fetch them from the commitment keeper.
 */
export async function onCalendarChange(
  userId: string,
  change: {
    type: 'created' | 'updated' | 'deleted';
    event: Partial<CalendarEvent>;
  },
  commitments?: Commitment[]
): Promise<CommitmentConflict[]> {
  // Fetch commitments if not provided
  let userCommitments: Commitment[] = commitments || [];
  if (!commitments || commitments.length === 0) {
    try {
      const { loadUserCommitments } = await import('./commitment-keeper.js');
      userCommitments = await loadUserCommitments(userId);
      log.debug(
        { userId, count: userCommitments.length },
        'Fetched commitments for conflict check'
      );
    } catch (error) {
      log.warn(
        { error: String(error), userId },
        'Could not fetch commitments, skipping conflict check'
      );
      return [];
    }
  }

  if (change.type === 'deleted') {
    // Check if deleted event was a commitment block
    const affectedCommitments = userCommitments.filter((c) =>
      c.calendarEventIds?.includes(change.event.id || '')
    );

    const conflicts = affectedCommitments.map((c) => ({
      commitmentId: c.id,
      commitmentText: c.text,
      conflictingEvent: change.event,
      severity: 'at_risk' as const,
      suggestion: 'Calendar block for your commitment was deleted. Want to reschedule?',
    }));

    // Emit conflict event for proactive notification
    if (conflicts.length > 0) {
      emitCommitmentConflictEvent(userId, conflicts);
    }

    return conflicts;
  }

  if (change.type === 'created') {
    const conflicts = await checkCommitmentConflicts(userId, change.event, userCommitments);

    // Emit conflict event for proactive notification
    if (conflicts.length > 0) {
      emitCommitmentConflictEvent(userId, conflicts);
    }

    return conflicts;
  }

  return [];
}

/**
 * Emit a commitment conflict event for proactive notification
 */
function emitCommitmentConflictEvent(userId: string, conflicts: CommitmentConflict[]): void {
  try {
    // Store conflict for next conversation turn
    // This will be picked up by the cross-persona insight system
    const highPriorityConflicts = conflicts.filter((c) => c.severity === 'blocked');

    if (highPriorityConflicts.length > 0) {
      log.info(
        {
          userId,
          count: highPriorityConflicts.length,
          commitments: highPriorityConflicts.map((c) => c.commitmentText),
        },
        '⚠️ High-priority commitment conflicts detected'
      );

      // Store for proactive mention in next conversation
      storeCommitmentAlert(userId, highPriorityConflicts).catch((err) =>
        log.warn({ error: String(err) }, 'Failed to store commitment alert')
      );
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to emit commitment conflict event');
  }
}

/**
 * Store a commitment alert for proactive notification
 */
async function storeCommitmentAlert(
  userId: string,
  conflicts: CommitmentConflict[]
): Promise<void> {
  try {
    const { Firestore } = await import('@google-cloud/firestore');
    const db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });

    await db
      .collection(`users/${userId}/superhuman_alerts`)
      .doc(`commitment_conflicts_${Date.now()}`)
      .set(cleanForFirestore({
        type: 'commitment_conflict',
        conflicts: conflicts.map((c) => ({
          commitmentId: c.commitmentId,
          commitmentText: c.commitmentText,
          severity: c.severity,
          suggestion: c.suggestion,
        })),
        createdAt: new Date().toISOString(),
        acknowledged: false,
      }));
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to store commitment alert');
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

interface CommitmentRequirements {
  timesPerPeriod: number;
  period: 'day' | 'week' | 'month';
  durationMinutes: number;
  preferredTime: 'morning' | 'afternoon' | 'evening' | null;
  includesWeekends: boolean;
  activityName: string | null;
}

function parseCommitmentRequirements(
  commitment:
    | Commitment
    | { text: string; frequency?: { times: number; period: string }; duration?: number }
): CommitmentRequirements | null {
  const text = commitment.text?.toLowerCase() || '';

  // Default values
  let times = 1;
  let period: 'day' | 'week' | 'month' = 'week';
  let duration = commitment.duration || 30;
  let preferredTime: 'morning' | 'afternoon' | 'evening' | null = null;

  // Parse frequency from commitment object
  if ('frequency' in commitment && commitment.frequency) {
    times = commitment.frequency.times || 1;
    if (commitment.frequency.period === 'day') period = 'day';
    else if (commitment.frequency.period === 'month') period = 'month';
    else period = 'week';
  }

  // Parse from text if not in object
  // Match patterns like "3 times", "3x", "three times", "twice", "once"
  const timesMatch = text.match(/(\d+)\s*(times?|x)/i);
  if (timesMatch) {
    times = parseInt(timesMatch[1], 10);
  } else if (text.includes('twice')) {
    times = 2;
  } else if (text.includes('once')) {
    times = 1;
  } else if (text.includes('every day') || text.includes('daily')) {
    times = 5; // Weekdays
    period = 'week';
  }

  // Parse period
  if (text.includes('per day') || text.includes('daily')) {
    period = 'day';
  } else if (text.includes('per month') || text.includes('monthly')) {
    period = 'month';
  }

  // Parse preferred time
  if (text.includes('morning')) preferredTime = 'morning';
  else if (text.includes('afternoon')) preferredTime = 'afternoon';
  else if (text.includes('evening') || text.includes('night')) preferredTime = 'evening';

  // Parse duration from text
  const durationMatch = text.match(/(\d+)\s*(min|hour|hr)/i);
  if (durationMatch) {
    const num = parseInt(durationMatch[1], 10);
    const unit = durationMatch[2].toLowerCase();
    duration = unit.startsWith('h') ? num * 60 : num;
  } else if (text.includes('workout') || text.includes('exercise') || text.includes('gym')) {
    duration = 45;
  } else if (text.includes('meditation') || text.includes('meditate')) {
    duration = 15;
  } else if (text.includes('run') || text.includes('jog')) {
    duration = 30;
  }

  // Check for weekends
  const includesWeekends =
    text.includes('weekend') || text.includes('saturday') || text.includes('sunday');

  return {
    timesPerPeriod: times,
    period,
    durationMinutes: duration,
    preferredTime,
    includesWeekends,
    activityName: extractActivityName(text),
  };
}

function extractActivityName(text: string): string {
  const lower = text.toLowerCase();

  // Common activity patterns
  if (lower.includes('workout') || lower.includes('exercise')) return 'Workout';
  if (lower.includes('gym')) return 'Gym';
  if (lower.includes('run') || lower.includes('running')) return 'Run';
  if (lower.includes('meditation') || lower.includes('meditate')) return 'Meditation';
  if (lower.includes('yoga')) return 'Yoga';
  if (lower.includes('read')) return 'Reading';
  if (lower.includes('journal')) return 'Journaling';
  if (lower.includes('walk')) return 'Walk';

  // Try to extract verb + noun pattern
  const match = text.match(/(?:to\s+)?(\w+(?:\s+\w+)?)/i);
  if (match) {
    return match[1].charAt(0).toUpperCase() + match[1].slice(1);
  }

  return 'Commitment';
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build context for LLM about commitment-calendar status
 */
export async function buildCommitmentCalendarContext(
  userId: string,
  commitment: Commitment | { text: string }
): Promise<string> {
  const feasibility = await validateCommitmentFeasibility(userId, commitment);

  if (feasibility.feasible) {
    return `✅ Calendar check: You have time for "${commitment.text}" (${feasibility.suggestedSlots.length} slots available)`;
  }

  const lines: string[] = [
    `⚠️ Calendar check for "${commitment.text}":`,
    ...feasibility.conflicts.map((c) => `• ${c}`),
  ];

  if (feasibility.suggestion) {
    lines.push(`→ ${feasibility.suggestion}`);
  }

  if (feasibility.alternativeCommitment) {
    lines.push(`💡 Alternative: "${feasibility.alternativeCommitment}"`);
  }

  return lines.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const commitmentCalendarIntegration = {
  validateFeasibility: validateCommitmentFeasibility,
  findTime: findTimeForCommitment,
  createBlocks: createCalendarBlocksForCommitment,
  checkConflicts: checkCommitmentConflicts,
  onCalendarChange,
  buildContext: buildCommitmentCalendarContext,
};

export default commitmentCalendarIntegration;
