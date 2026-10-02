/**
 * Bridge for the superhuman milestone detector: its "tracked dates" now live
 * in the canonical important-dates store instead of its own profile document.
 *
 * @module services/important-dates/milestone-bridge
 */

import { parseStoredDate } from './date-math.js';
import { importantDateKey } from './identity.js';
import { listImportantDates, upsertImportantDate } from './store.js';

/** Same shape as the detector's TrackedDate (type kept as a plain string). */
export interface BridgedTrackedDate {
  id: string;
  label: string;
  date: string;
  type: string;
  recurring: boolean;
  associatedWith?: string;
  context?: string;
  createdAt: string;
}

/** Store a detector date in the canonical store; returns it in detector shape. */
export async function trackMilestoneDate(
  userId: string,
  label: string,
  date: string,
  type: string,
  options?: { recurring?: boolean; associatedWith?: string; context?: string }
): Promise<BridgedTrackedDate> {
  const kind = type === 'anniversary' || type === 'friendship' ? 'anniversary' : 'event';
  const iso = date.slice(0, 10);
  const recurring = options?.recurring ?? true;
  const result = await upsertImportantDate(userId, {
    key: importantDateKey({ kind, person: options?.associatedWith, title: label }),
    title: label,
    date: iso,
    recurring,
    kind,
    subtype: type,
    source: 'user',
    sourceConversationIds: [],
    confidence: 1,
  });
  return {
    id: result.success ? result.data.id : `${type}_${iso}`,
    label,
    date: iso,
    type,
    recurring,
    ...(options?.associatedWith ? { associatedWith: options.associatedWith } : {}),
    ...(options?.context ? { context: options.context } : {}),
    createdAt: new Date().toISOString(),
  };
}

/** Canonical recurring dates with a known year, in detector shape (for anniversary counts). */
export async function loadMilestoneDates(userId: string): Promise<BridgedTrackedDate[]> {
  const listed = await listImportantDates(userId);
  if (!listed.success) return [];
  return (
    listed.data
      // Birthdays and memorials aren't "anniversaries to celebrate" here.
      .filter((r) => r.kind !== 'birthday' && r.subtype !== 'memorial')
      .filter((r) => r.recurring && parseStoredDate(r.date)?.year !== undefined)
      .map((r) => ({
        id: r.id,
        label: r.title,
        date: r.date,
        type: r.subtype ?? (r.kind === 'anniversary' ? 'anniversary' : 'custom'),
        recurring: r.recurring,
        createdAt: r.createdAt,
      }))
  );
}
