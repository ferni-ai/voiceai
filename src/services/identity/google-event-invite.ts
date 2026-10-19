/**
 * The invite fields of a Google Calendar event: who organized it and how the
 * calendar's owner answered. Google returns them on every event; the brief
 * uses them so someone else's unaccepted invite never shows by its title.
 *
 * @module services/identity/google-event-invite
 */

export type GoogleResponseStatus = 'needsAction' | 'declined' | 'tentative' | 'accepted';

export interface GoogleAttendee {
  email: string;
  displayName?: string;
  /** This attendee is the calendar's owner. */
  self?: boolean;
  responseStatus?: GoogleResponseStatus;
}

/** Who created the invite; `self` when it's the calendar's owner. */
export interface GoogleOrganizer {
  email?: string;
  self?: boolean;
}

/** 'organizer' for their own event, else their answer; undefined when Google sent no organizer. */
export type OwnerResponse = 'organizer' | GoogleResponseStatus;

export function ownerResponseOf(event: {
  organizer?: GoogleOrganizer;
  attendees?: GoogleAttendee[];
}): OwnerResponse | undefined {
  if (!event.organizer) return undefined;
  if (event.organizer.self) return 'organizer';
  return event.attendees?.find((a) => a.self)?.responseStatus ?? 'needsAction';
}
