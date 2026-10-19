/**
 * The wellness check-in an Apple Health activity day is indexed as.
 *
 * Activity says nothing about mood, so no mood is filed (it used to be a
 * made-up 5/10). A reading the phone didn't send is unknown, not 0: energy
 * and the notes only carry what was measured.
 *
 * @module services/identity/apple-health-checkin
 */
import type { WellnessCheckinEntity } from '../data-layer/types.js';
import type { AppleHealthActivityData } from './apple-health-types.js';

/** A measured number, or undefined: a missing reading is not 0. */
function known(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function activityCheckin(activity: AppleHealthActivityData): WellnessCheckinEntity {
  const calories = known(activity.activeEnergyBurned);
  const exercise = known(activity.appleExerciseTime);
  return {
    energy: calories === undefined ? undefined : Math.min(10, Math.round(calories / 50)),
    notes: [
      calories === undefined ? '' : `Active calories: ${calories}`,
      exercise === undefined ? '' : `Exercise: ${exercise} min`,
    ]
      .filter(Boolean)
      .join(', '),
    timestamp: activity.date,
  };
}
