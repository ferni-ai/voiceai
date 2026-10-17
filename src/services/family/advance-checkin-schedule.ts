/**
 * Move a family check-in schedule to its next slot as soon as the call is placed.
 *
 * Over LiveKit SIP nothing reports the end of a check-in call back to the
 * caller service, so waiting for a 'completed' call record (which is what
 * updateScheduleAfterCall in proactive-family-checkin waits for) left the
 * schedule due, and the two-hourly job rang the same family member again.
 * Advancing when the dial is accepted means a lost completion costs at most one
 * skipped check-in, never a repeat call. A completion that does arrive (the
 * Twilio webhooks) recomputes the same next slot, so the two never disagree.
 *
 * The write goes through the CheckinScheduleWriter port; the Firestore adapter
 * is services/stores/checkin-schedule-store.ts, handed in by the job.
 *
 * @module services/family/advance-checkin-schedule
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { FamilyCheckinSchedule } from './proactive-family-checkin.js';
import { calculateNextCallTime, type NextCheckinInput } from './next-checkin-time.js';

const log = createLogger({ module: 'AdvanceCheckinSchedule' });

/** Port for moving a schedule's next call time. */
export interface CheckinScheduleWriter {
  /** Save the schedule's next call time; false when not saved. */
  setNextCall: (
    sponsorUserId: string,
    scheduleId: string,
    nextScheduledCall: string,
    now: Date
  ) => Promise<boolean>;
}

type ScheduleToAdvance = NextCheckinInput & Pick<FamilyCheckinSchedule, 'id' | 'sponsorUserId'>;

/**
 * Set the schedule's next call to its next slot after `now`. Returns the new
 * time, or null when it could not be saved (logged as an error: until it is
 * fixed, the next job run would ring this person again).
 */
export async function advanceScheduleAfterDial(
  schedule: ScheduleToAdvance,
  writer: CheckinScheduleWriter,
  now: Date = new Date()
): Promise<string | null> {
  try {
    // Inside the try: the phone has already rung, so bad schedule data must not throw out of here
    const nextScheduledCall = calculateNextCallTime(schedule, now);
    if (!(await writer.setNextCall(schedule.sponsorUserId, schedule.id, nextScheduledCall, now)))
      throw new Error('not saved');
    log.info({ scheduleId: schedule.id, nextScheduledCall }, 'Check-in schedule advanced at dial');
    return nextScheduledCall;
  } catch (error) {
    log.error(
      { scheduleId: schedule.id, error: String(error) },
      'Check-in placed but the schedule was not advanced; the next job run may ring again'
    );
    return null;
  }
}
