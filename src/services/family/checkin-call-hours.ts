/**
 * Family check-ins respect the call-hours guard: a check-in that comes due
 * outside 9:00–20:30 in the family member's time zone moves to the next
 * opening instead of ringing then (schedules store `preferredTime` but are
 * computed in server time, so "14:00" can land at 7am on the West Coast).
 *
 * @module services/family/checkin-call-hours
 */

import { createLogger } from '../../utils/safe-logger.js';
import { checkCallHours, isCallHoursGuardOn } from '../outreach/call-hours-guard.js';
import { updateCheckinSchedule, type FamilyCheckinSchedule } from './proactive-family-checkin.js';

const log = createLogger({ module: 'CheckinCallHours' });

/**
 * With CALL_HOURS_GUARD=on, push a check-in that's outside the family member's
 * hours to the next opening. True when deferred (counted as skipped).
 */
export async function deferredOutsideCallHours(
  schedule: FamilyCheckinSchedule,
  counts: { callsSkipped: number },
  now?: Date
): Promise<boolean> {
  if (!isCallHoursGuardOn()) return false;
  const decision = await checkCallHours({
    now,
    recipientTimezone: schedule.timezone,
    recipientPhone: schedule.phoneNumber,
    sponsorUserId: schedule.sponsorUserId,
  });
  if (decision.allowed) return false;
  await updateCheckinSchedule(schedule.sponsorUserId, schedule.id, {
    nextScheduledCall: decision.at.toISOString(),
  });
  counts.callsSkipped++;
  log.info(
    { scheduleId: schedule.id, at: decision.at.toISOString(), timezone: decision.timezone },
    'Check-in deferred to the family member’s calling hours'
  );
  return true;
}
