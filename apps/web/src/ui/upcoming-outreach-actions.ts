/**
 * Cancel or move one upcoming item, for both panels that list them (When I'll
 * Reach Out, When I'll Check In): POST /api/outreach/upcoming/cancel|reschedule
 * (src/api/outreach-upcoming-route.ts).
 *
 * Says "cancelled" or "moved" only when the server answered success; anything
 * else, a lost connection included, says nothing changed. Never retried: a cancel
 * that landed and was sent again would read as a failure. The caller reloads the
 * list either way, so it shows what is really set.
 */
import { formatDate, t } from '../i18n/index.js';
import { apiPost } from '../utils/api.js';
import type { UpcomingOutreachItem } from './upcoming-outreach-item.js';
import { toast } from './whisper.ui.js';

type Answer = { success?: boolean; scheduledFor?: string };

/** The words for a refusal: too late (409), a time it won't send at (422), or anything else. */
function failure(status: number): string {
  if (status === 409) return t('outreachSchedule.actionTooLate');
  if (status === 422) return t('outreachSchedule.moveBadTime');
  return t('outreachSchedule.actionFailed');
}

async function change(path: 'cancel' | 'reschedule', body: Record<string, string>) {
  const res = await apiPost<Answer>(`/api/outreach/upcoming/${path}`, body, { maxRetries: 0 });
  const done = res.ok && res.data?.success === true;
  if (!done) toast.error(failure(res.status));
  return done ? res.data : null;
}

/** True only when the server cancelled it. */
export async function cancelUpcomingItem(item: UpcomingOutreachItem): Promise<boolean> {
  const done = await change('cancel', { type: item.type, id: item.id });
  if (done) toast.success(t('outreachSchedule.cancelled'));
  return done !== null;
}

/** True only when the server moved it to `at` (an ISO instant). */
export async function moveUpcomingItem(item: UpcomingOutreachItem, at: string): Promise<boolean> {
  const done = await change('reschedule', { type: item.type, id: item.id, at });
  if (!done) return false;
  const when = new Date(done.scheduledFor ?? at);
  const time = formatDate(when, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  toast.success(t('outreachSchedule.moved', { time }));
  return true;
}
