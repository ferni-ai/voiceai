/**
 * JSON-path bridges to the native timer / reminder / alarm / goal stores.
 *
 * @module agents/shared/tool-executors/productivity-time-bridge
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import type { ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'ProductivityTimeBridge' });

export async function updateGoal(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<string> {
  const title = (args.title || args.goal || args.name) as string | undefined;
  const progress = typeof args.progress === 'number' ? args.progress : undefined;
  if (!ctx.userId) return "I don't have your goals stored yet. What are you working toward?";
  if (!title && progress === undefined) return 'Which goal should I update, and how is it going?';

  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();
    const snapshot = await db
      .collection('bogle_users')
      .doc(ctx.userId)
      .collection('goals')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();
    if (snapshot.empty) return "You haven't set any goals yet. What would you like to work toward?";

    const needle = title?.toLowerCase();
    const match = snapshot.docs.find((doc) => {
      const data = doc.data() as { title?: string };
      return needle ? (data.title || '').toLowerCase().includes(needle) : true;
    });
    if (!match) return `I couldn't find a goal matching "${title}".`;

    const nextProgress = progress === undefined ? undefined : Math.max(0, Math.min(100, progress));
    await match.ref.update(
      cleanForFirestore({
        ...(nextProgress === undefined ? {} : { progress: nextProgress }),
        ...(args.description ? { description: args.description } : {}),
        updatedAt: new Date(),
      })
    );
    const data = match.data() as { title: string; progress?: number };
    const shown = nextProgress ?? data.progress ?? 0;
    return `Updated "${data.title}"${nextProgress === undefined ? '.' : ` — ${shown}% of the way there.`}`;
  } catch (err) {
    log.warn({ error: String(err) }, 'Goal update failed');
    return "I couldn't update that goal just now.";
  }
}

export async function getTimer(ctx: ToolExecutionContext): Promise<string> {
  const { activeTimers } = await import(
    '../../../tools/domains/simple-utilities/shared-state.js'
  );
  const timer = activeTimers.get(ctx.userId || 'session');
  if (!timer) return "You don't have an active timer running. Want me to set one?";
  const remaining = timer.endTime.getTime() - Date.now();
  if (remaining <= 0) return `Your ${timer.label} timer is done.`;
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return minutes > 0
    ? `${timer.label} timer: ${minutes} minute${minutes === 1 ? '' : 's'} ${seconds} seconds left.`
    : `${timer.label} timer: ${seconds} seconds left.`;
}

export async function cancelTimer(ctx: ToolExecutionContext): Promise<string> {
  const { activeTimers } = await import(
    '../../../tools/domains/simple-utilities/shared-state.js'
  );
  const userId = ctx.userId || 'session';
  const timer = activeTimers.get(userId);
  if (!timer) return "You don't have an active timer running.";
  clearTimeout(timer.timeout);
  activeTimers.delete(userId);
  return `Timer canceled (was set for ${timer.label}).`;
}

export async function getReminders(ctx: ToolExecutionContext): Promise<string> {
  const { getPendingReminders } = await import(
    '../../../services/scheduling/reminder-scheduler.js'
  );
  const reminders = getPendingReminders(ctx.userId || 'session');
  if (reminders.length === 0) return "You don't have any pending reminders right now.";
  const lines = reminders.map((r, i) => `${i + 1}. "${r.message}"`);
  return `You have ${reminders.length} pending reminder${reminders.length > 1 ? 's' : ''}:\n${lines.join('\n')}`;
}

export async function getAlarms(ctx: ToolExecutionContext): Promise<string> {
  if (!ctx.userId) return "You don't have any alarms set.";
  const { loadAlarms } = await import(
    '../../../tools/domains/simple-utilities/alarm-tools.js'
  );
  const alarms = await loadAlarms(ctx.userId);
  if (alarms.length === 0) {
    return "You don't have any alarms set. Say 'Set an alarm for 7am' to create one.";
  }
  const lines = [...alarms]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((alarm, i) => `${i + 1}. ${alarm.time}${alarm.label !== 'Alarm' ? ` - ${alarm.label}` : ''}`);
  return `Your alarms:\n${lines.join('\n')}`;
}

export async function deleteAlarm(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<string> {
  if (!ctx.userId) return "You don't have any alarms to delete.";
  const { loadAlarms, deleteAlarm: removeAlarm } = await import(
    '../../../tools/domains/simple-utilities/alarm-tools.js'
  );
  const alarms = await loadAlarms(ctx.userId);
  if (alarms.length === 0) return "You don't have any alarms to delete.";
  const query = String(args.query || args.time || args.label || 'all').toLowerCase();
  if (query === 'all' || query === 'everything') {
    for (const alarm of alarms) await removeAlarm(ctx.userId, alarm.id);
    return `Deleted all ${alarms.length} alarm${alarms.length > 1 ? 's' : ''}.`;
  }
  const num = parseInt(query, 10);
  const sorted = [...alarms].sort((a, b) => a.time.localeCompare(b.time));
  const match =
    (!isNaN(num) && num > 0 && num <= sorted.length && sorted[num - 1]) ||
    alarms.find(
      (a) =>
        a.time === query ||
        a.label.toLowerCase().includes(query) ||
        query.includes(a.label.toLowerCase())
    );
  if (!match) return `I couldn't find an alarm matching "${query}".`;
  await removeAlarm(ctx.userId, match.id);
  return `Deleted alarm for ${match.time}.`;
}

export async function snoozeAlarm(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<string> {
  if (!ctx.userId) return "I don't see an alarm that needs snoozing.";
  const minutes = typeof args.minutes === 'number' ? args.minutes : 9;
  const { loadAlarms, saveAlarm } = await import(
    '../../../tools/domains/simple-utilities/alarm-tools.js'
  );
  const alarms = await loadAlarms(ctx.userId);
  const now = Date.now();
  const currentMin = new Date().getHours() * 60 + new Date().getMinutes();
  const recent = alarms.find((a) => {
    const [h, m] = a.time.split(':').map(Number);
    const diff = currentMin - (h * 60 + m);
    return diff >= -5 && diff <= 30;
  });
  if (!recent) return "I don't see an alarm that needs snoozing. Set an alarm first!";
  recent.snoozedUntil = now + minutes * 60 * 1000;
  recent.updatedAt = now;
  await saveAlarm(ctx.userId, recent);
  return `Snoozed for ${minutes} minute${minutes !== 1 ? 's' : ''}. I'll remind you again soon.`;
}
