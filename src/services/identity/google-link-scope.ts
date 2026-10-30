/**
 * What a Google grant covers. Google's granular consent lets a user untick a
 * scope on the consent screen and still come back to the callback with a code.
 *
 * @module services/identity/google-link-scope
 */

import {
  CALENDAR_EVENTS_SCOPE,
  CALENDAR_FULL_SCOPE,
  CALENDAR_READONLY_SCOPE,
} from '../../config/google-calendar-scopes.js';
import { isGoogleLinkHonest } from '../../config/google-link-honest.js';

/** A stored link that cannot read the calendar (the user unticked it). */
export const INSUFFICIENT_SCOPE = 'insufficient_scope';

/**
 * True when the space-separated scope string Google returned lets Ferni read and write
 * the calendar: full `calendar` (older links), or both events and readonly (the box
 * for either one may have been unticked).
 */
export function hasCalendarScope(scope: string | undefined): boolean {
  const granted = (scope ?? '').split(/\s+/);
  return (
    granted.includes(CALENDAR_FULL_SCOPE) ||
    (granted.includes(CALENDAR_EVENTS_SCOPE) && granted.includes(CALENDAR_READONLY_SCOPE))
  );
}

/** A stored link whose consent left out the calendar reads as not connected (GOOGLE_LINK_HONEST on). */
export function isInsufficientLink(stored: { status?: string }): boolean {
  return isGoogleLinkHonest() && stored.status === INSUFFICIENT_SCOPE;
}
