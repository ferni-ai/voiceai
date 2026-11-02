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
  callerText,
  carriesCrisis,
  crisisCallerLine,
  crisisRead,
  isRiskyCallerText,
  riskyCallerLine,
  screenCallerParts,
  type ScreenedCallerParts,
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

/** A field's words as the screen reads them, or null when the field holds something else. */
function fieldText(value: unknown): string | null {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return null; // never coerced: a number, or an object's toString
  // An array of words is read as its words, as the alert always read it.
  const parts: unknown[] = value.flat(Infinity);
  return parts.every((p) => typeof p === 'string') ? parts.join(' ') : null;
}

/** A field that isn't text: none of it is quoted. */
const NOT_TEXT: ScreenedCallerParts = { said: '', risky: true, safety: false };

/** One field through the screen, and whether it went out word for word (cleaned only). */
function screenField(value: unknown, name: string): ScreenedCallerParts & { intact: boolean } {
  const raw = fieldText(value);
  const part = raw === null ? NOT_TEXT : screenCallerParts(raw, name, 200);
  return { ...part, intact: raw !== null && part.said === callerText(raw, SCREEN_WINDOW) };
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
 * Ferni's own line. Fields too long for the screen to read in full send the
 * generic alert, and a field that is not text gets Ferni's line for that field.
 *
 * The screen never costs a crisis signal. Before it, the sponsor got the
 * concern's words in full. So whenever any of those words are withheld or cut,
 * the alert says crisisCallerLine, whatever the words were: the crisis guard
 * reads first-person wording, not "she said she doesn't want to be here", so
 * an urgent concern's lost words are never left to its reading. When the words
 * go out in full they carry their own meaning, and crisisCallerLine is added
 * only for crisis the guard reads in both fields together that they don't
 * carry, such as a phrase split across the two fields.
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

  const desc = screenField(concern.description, name);
  const act = screenField(concern.recommendedAction, name);
  const what = desc.said || (desc.risky ? riskyCallerLine(name) : 'something came up');
  const next = act.said || CHECK_IN_ACTION; // Ferni's line whenever it was risky or not text
  const both = [concern.description, concern.recommendedAction]
    .map(fieldText)
    .filter(Boolean)
    .join(' ');
  const withheld = !desc.intact || !act.intact;
  // crisisRead is the crisis guard's own read (services/safety/crisis-guard.ts),
  // the one each turn gets, on the full text of both fields: no cap, no window.
  const crisis = withheld || (crisisRead(both) && !carriesCrisis(what) && !carriesCrisis(next));
  const sent = alert(what, next, crisis);
  const screened = both.length <= SCREEN_WINDOW && sent.length <= SCREEN_WINDOW;
  if (screened && !isRiskyCallerText(sent)) return sent;
  // Too long to screen in full, or the joined fields formed something risky:
  // pass neither on, so their words are withheld and crisisCallerLine goes.
  return alert(riskyCallerLine(name), CHECK_IN_ACTION, true);
}
