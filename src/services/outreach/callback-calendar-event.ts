/**
 * The "Call them back" calendar event after a call Ferni placed for the user, moved here
 * from call-result-capture.ts. It is made only when the person on the call asked for a
 * call back (callbackAsked).
 *
 * CALLBACK_MEANS_ASKED on (#4468): its times are the user's own wall clock, in their saved
 * zone (userTimezone, validated, never a default), and with no valid zone there is no
 * event. Off: the server's clock, as before. The agents run without a TZ override, so
 * "tomorrow 10:00" on the server clock is 02:00-06:00 for most users, with a popup ten
 * minutes before.
 *
 * @module services/outreach/callback-calendar-event
 */
import { getLogger } from '../../utils/safe-logger.js';
import { WallClock, wallTimeIn } from '../../utils/time-zone.js';
import type { CallOutcome, OnBehalfCallRequest } from '../../tools/domains/telephony/index.js';
import { userTimezone } from './call-hours-guard.js';
import { callbackAsked, callbackMeansAskedOn } from '../background-agents/call-follow-up/index.js';

const log = getLogger().child({ service: 'callback-calendar-event' });
const HOUR_MS = 60 * 60 * 1000;

/** "3pm" / "3:30 pm" in a hint, as 24-hour time. */
function clockTime(hint: string): { hour: number; minute: number } | null {
  const time = hint.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!time) return null;
  const pm = time[3].toLowerCase() === 'pm';
  let hour = parseInt(time[1], 10);
  if (pm && hour < 12) hour += 12;
  if (!pm && hour === 12) hour = 0;
  return { hour, minute: time[2] ? parseInt(time[2], 10) : 0 };
}

/**
 * When to call back, from the person's hint. `zone` is the user's (flag on): its wall clock,
 * a clock time wins and the words only pick the day ("tonight at 8pm" 20:00 today, "tomorrow
 * at 3pm" 15:00 tomorrow), and "tonight" alone is 18:00, or an hour from now once past.
 * No zone (flag off): the server's clock, read as before, where the words win. Anything it
 * can't read, or no hint, is tomorrow at 10:00.
 */
function callbackStart(hint: string | undefined, now: Date, zone?: string): Date {
  const at = (days: number, hour: number, minute = 0): Date => {
    const clock = zone ? new WallClock(now, zone) : new Date(now);
    clock.setDate(clock.getDate() + days);
    clock.setHours(hour, minute, 0, 0);
    return clock instanceof Date ? clock : clock.toDate();
  };
  const lower = (hint ?? '').toLowerCase();
  const time = clockTime(lower);
  if (zone && time) {
    const days = lower.includes('tomorrow') ? 1 : lower.includes('next week') ? 7 : 0;
    const start = at(days, time.hour, time.minute);
    return start > now ? start : at(days + 1, time.hour, time.minute);
  }
  if (zone && /\b(tonight|this evening)\b/.test(lower)) {
    const evening = at(0, 18);
    return evening > now ? evening : new Date(now.getTime() + HOUR_MS);
  }
  if (lower.includes('tomorrow')) {
    const hour = lower.includes('morning')
      ? 9
      : lower.includes('afternoon')
        ? 14
        : lower.includes('evening')
          ? 18
          : 10;
    return at(1, hour);
  }
  if (lower.includes('this afternoon') || lower.includes('later today')) {
    const afternoon = at(0, 14);
    const hourNow = zone ? wallTimeIn(now, zone).hour : now.getHours();
    return afternoon > now ? afternoon : at(0, hourNow + 2);
  }
  if (lower.includes('next week')) return at(7, 10);
  if (time) {
    const today = at(0, time.hour, time.minute);
    return today > now ? today : at(1, time.hour, time.minute);
  }
  return at(1, 10);
}

/** Add the event to the user's calendar, if they asked and one is connected. Never throws. */
export async function createCallbackCalendarEvent(
  request: OnBehalfCallRequest,
  outcome: CallOutcome,
  callId: string,
  now: Date = new Date()
): Promise<void> {
  if (!callbackAsked(outcome)) return;
  try {
    const on = callbackMeansAskedOn();
    const zone = on ? await userTimezone(request.userId) : undefined;
    if (on && !zone) {
      log.info({ callId, hasZone: false }, 'No user time zone, skipping callback event');
      return;
    }
    const { createEvent, hasAnyProviderConnected } = await import('../calendar/index.js');
    if (!(await hasAnyProviderConnected(request.userId))) {
      log.debug({ callId }, 'No calendar connected, skipping callback event');
      return;
    }

    const contactName = request.resolvedContact?.name || request.contactQuery;
    const contactPhone = request.resolvedContact?.phone;
    const startTime = callbackStart(outcome.callbackTime, now, zone);
    const description = [
      `Follow up on your earlier call with ${contactName}.`,
      '',
      `📞 Original purpose: ${request.purpose}`,
      `📝 What happened: ${outcome.outcome}`,
      '',
      contactPhone ? `Phone: ${contactPhone}` : '',
      '',
      `Created by Ferni`,
    ]
      .filter(Boolean)
      .join('\n');

    await createEvent(request.userId, {
      title: `📞 Call ${contactName} back`,
      description,
      startTime,
      endTime: new Date(startTime.getTime() + 15 * 60 * 1000), // 15 min
      reminders: [{ method: 'popup', minutesBefore: 10 }],
      color: '#FF9800', // Tangerine - stands out
    });

    log.info(
      { callId, userId: request.userId, scheduledFor: startTime.toISOString() },
      'Created calendar event for callback'
    );
  } catch (error) {
    // Don't fail the whole capture if calendar fails
    log.warn({ error: String(error), callId }, 'Failed to create callback calendar event');
  }
}
