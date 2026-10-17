/**
 * Firestore writer for family check-in schedules:
 * bogle_users/{sponsorUserId}/family_checkin_schedules/{scheduleId}.
 *
 * Implements the CheckinScheduleWriter port
 * (services/family/advance-checkin-schedule.ts). No database or a failed
 * write gives false, which the caller logs as an error.
 *
 * @module services/stores/checkin-schedule-store
 */

import type { CheckinScheduleWriter } from '../family/advance-checkin-schedule.js';
import { CHECKIN_SCHEDULES_COLLECTION } from '../family/proactive-family-checkin.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'checkin-schedule-store' });

export function createCheckinScheduleWriter(): CheckinScheduleWriter {
  return {
    async setNextCall(sponsorUserId, scheduleId, nextScheduledCall, now) {
      const db = getFirestoreDb();
      if (!db) return false;
      try {
        await db
          .collection('bogle_users')
          .doc(sponsorUserId)
          .collection(CHECKIN_SCHEDULES_COLLECTION)
          .doc(scheduleId)
          .update({ nextScheduledCall, updatedAt: now.toISOString() });
        return true;
      } catch (error) {
        log.error({ scheduleId, error: String(error) }, 'Could not save the next check-in time');
        return false;
      }
    },
  };
}
