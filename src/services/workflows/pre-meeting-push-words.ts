/**
 * The words of the pre-meeting push (15 minutes before an event).
 *
 * The event title is whatever the invite's sender typed, and the attendee's name
 * and past topics come from stored text. With OWNER_OUTREACH_STORED_TEXT_SCREEN on,
 * each goes through the owner-outreach screen (storedTextForOwner) first: a refused
 * title gives a neutral line, a refused name drops the "Meeting with" line, and a
 * refused past topic is dropped. Flag off, the push reads exactly as before.
 *
 * @module services/workflows/pre-meeting-push-words
 */

import { storedTextForOwner } from '../../tools/domains/proactive/outreach/index.js';

/** Who the meeting is with, from the briefing's first known attendee. */
export interface PreMeetingAttendee {
  name: string;
  pastTopics?: readonly string[];
}

interface PreMeetingPushWords {
  title: string;
  body: string;
}

export function preMeetingPushWords(
  userId: string,
  eventTitle: string | undefined,
  minutesBefore: number,
  attendee: PreMeetingAttendee | null
): PreMeetingPushWords {
  const ok = (text: string): boolean =>
    storedTextForOwner([text], { site: 'calendar-push', userId });
  const shown = !eventTitle || ok(eventTitle) ? eventTitle || 'Meeting' : null;
  const title = `📅 ${shown ?? 'Meeting'} soon`;
  if (!attendee || !ok(attendee.name)) {
    const body = shown
      ? `${shown} starts in ${minutesBefore} minutes`
      : `You have a meeting in ${minutesBefore} minutes`;
    return { title, body };
  }
  const topic = attendee.pastTopics?.find(ok);
  const lastTime = topic === undefined ? '' : `. Last time: ${topic}`;
  return { title, body: `Meeting with ${attendee.name} in ${minutesBefore} min${lastTime}` };
}
