/**
 * Moves a family check-in schedule to its next slot as soon as Ferni dials.
 *
 * Over LiveKit SIP nothing reports when the call ends, so a schedule that
 * advanced only on completion stayed due and the two-hourly job rang the same
 * person on every run. Advancing at dial time means each slot rings at most
 * once; a completed call still records itself through completeCallRecord.
 *
 * @module services/family/checkin-schedule-advance
 */

import { createLogger } from '../../utils/safe-logger.js';
import { calculateNextCallTime } from './next-checkin-time.js';
import { updateCheckinSchedule, type FamilyCheckinSchedule } from './proactive-family-checkin.js';

const log = createLogger({ module: 'CheckinScheduleAdvance' });

/** Set the schedule's next call after a dial went out. Never throws. */
export async function advanceScheduleAfterDial(
  schedule: FamilyCheckinSchedule,
  now: Date = new Date()
): Promise<void> {
  try {
    const nextScheduledCall = calculateNextCallTime(schedule, now);
    await updateCheckinSchedule(schedule.sponsorUserId, schedule.id, { nextScheduledCall });
    log.info({ scheduleId: schedule.id, nextScheduledCall }, 'Check-in schedule advanced after dial');
  } catch (error) {
    log.error(
      { scheduleId: schedule.id, error: String(error) },
      'Could not advance the check-in schedule; it may ring again on the next run'
    );
  }
}
