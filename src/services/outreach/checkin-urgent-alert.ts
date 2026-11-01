/**
 * The urgent alert the sponsor gets after a family check-in call.
 *
 * The concern in it is written from the family member's words on the call (an
 * unverified caller), so it goes through the caller-text screen before it is
 * pushed or texted to the sponsor.
 *
 * It lives here, next to the screen and the sender, because the family context
 * (L3) may not import the outreach screen (L4). Family code reaches it through
 * its lazy import of ./urgent-alert.js.
 *
 * @module services/outreach/checkin-urgent-alert
 */

import {
  carriesCrisis,
  crisisCallerLine,
  crisisRead,
  isRiskyCallerText,
  riskyCallerLine,
  screenCallerParts,
  screenedCallerText,
} from './caller-text.js';

/**
 * What the alert reads from a check-in call record. Typed here so this module
 * needs nothing from the family context; a CheckinCallRecord fits it.
 */
export interface CheckinAlertInput {
  familyMemberName: string;
  concernsIdentified?: ReadonlyArray<{
    urgency: string;
    description: unknown;
    recommendedAction?: unknown;
  }>;
}

/** Said when the concern's own suggestion can't be passed on: Ferni's words. */
const CHECK_IN_ACTION = 'You may want to check in with them.';

/**
 * The caller-text screen reads only this many characters (isRiskyCallerText).
 * Text longer than that is never screened in full, so it is not passed on.
 */
const SCREEN_WINDOW = 10_000;

/**
 * The model's JSON can put any value in a field. Only a string (or nothing) is
 * read; anything else is never coerced to text, and is treated as risky.
 */
function readable(value: unknown): value is string | null | undefined {
  return value == null || typeof value === 'string';
}

/** Drops the closing stop so the line can sit inside Ferni's own sentence. */
function clause(text: string): string {
  return text.replace(/[.\s]+$/, '');
}

/**
 * Generate a notification message for the sponsor about urgent concerns.
 *
 * The concern is written from the family member's words on the call, so it
 * goes through the caller-text screen before it reaches the sponsor: a link,
 * number or money/credential request is never passed on. Each field is
 * screened alone, then the exact alert is screened again, since two fields
 * that each pass can join into a number. A risky suggestion is dropped for
 * Ferni's own line. Crisis wording always reaches the sponsor, in their words
 * or in crisisCallerLine, including a phrase split across the two fields.
 * Fields too long for the screen to read in full send the generic alert, and
 * a field that is not text gets Ferni's line for that field.
 */
export function generateUrgentNotification(record: CheckinAlertInput): string | null {
  if (!record.concernsIdentified || record.concernsIdentified.length === 0) {
    return null;
  }

  const urgentConcerns = record.concernsIdentified.filter(
    (c) => c.urgency === 'urgent' || c.urgency === 'high'
  );

  if (urgentConcerns.length === 0) {
    return null;
  }

  const concern = urgentConcerns[0];
  const name = record.familyMemberName;
  const alert = (what: string, next: string, crisis: boolean): string => {
    const tail = [crisis ? crisisCallerLine(name) : '', next].filter(Boolean).join(' ');
    return `Important: During my call with ${name}, ${clause(what)}. ${tail}`;
  };

  const description: unknown = concern.description;
  const suggestion: unknown = concern.recommendedAction;
  const what = readable(description)
    ? screenedCallerText(description, name, 200) || 'something came up'
    : riskyCallerLine(name);
  const action = screenCallerParts(readable(suggestion) ? suggestion : null, name, 200);
  const next = action.said || CHECK_IN_ACTION; // empty whenever it was risky or not text
  const both = [description, suggestion].filter((f) => typeof f === 'string' && f).join(' ');
  const crisis = action.safety || crisisRead(both);
  const sent = alert(what, next, crisis && !carriesCrisis(what) && !carriesCrisis(next));
  const screened = both.length <= SCREEN_WINDOW && sent.length <= SCREEN_WINDOW;
  if (screened && !isRiskyCallerText(sent)) return sent;
  // Too long to screen in full, or the joined fields formed something risky:
  // pass neither on, and never lose a crisis.
  return alert(riskyCallerLine(name), CHECK_IN_ACTION, crisis || carriesCrisis(sent));
}
