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
 * Said instead of their words when they are withheld with no risky read: too long to screen
 * in full, or not text at all. Ferni's own words, naming no reason the screen didn't find
 * (riskyCallerLine is for a money, account or number read).
 */
export function withheldCallerLine(name: string): string {
  return `${name} said something I didn't pass along; ask them directly.`;
}

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

/** A field that isn't text: none of it is quoted, and the screen read nothing in it. */
const NOT_TEXT: ScreenedCallerParts = { said: '', risky: false, safety: false };

/**
 * A field's screen result, whether it went out word for word (cleaned only), and whether it
 * was text at all.
 */
type ScreenedField = ScreenedCallerParts & { intact: boolean; text: boolean };

/** One field through the screen. */
function screenField(value: unknown, name: string): ScreenedField {
  const raw = fieldText(value);
  const part = raw === null ? NOT_TEXT : screenCallerParts(raw, name, 200);
  const intact = raw !== null && part.said === callerText(raw, SCREEN_WINDOW);
  return { ...part, intact, text: raw !== null };
}

/** Ferni's line for a description not passed on: money only for a risky read in either field. */
function heldLine(desc: ScreenedField, act: ScreenedField, name: string): string {
  if (desc.risky || act.risky) return riskyCallerLine(name);
  return desc.text ? 'something came up' : withheldCallerLine(name);
}

/**
 * Whether the alert says crisisCallerLine. Always when any of their words were
 * withheld or cut, or when the screen raised its own safety signal. And when the
 * crisis guard (services/safety/crisis-guard.ts, the read each turn gets) reads
 * crisis in the full text of both fields, no cap and no window, that the words
 * going out don't carry.
 */
function needsCrisisLine(
  desc: ScreenedField,
  act: ScreenedField,
  both: string,
  what: string,
  next: string
): boolean {
  const withheld = !desc.intact || !act.intact;
  const flagged = desc.safety || act.safety;
  const read = crisisRead(both) && !carriesCrisis(what) && !carriesCrisis(next);
  return withheld || flagged || read;
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
 * can still miss a wording, so an urgent concern's lost words are never left to
 * its reading (owner, 2026-11-02: kept until a neutral line lands). When the words
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
  const what = desc.said || heldLine(desc, act, name);
  const next = act.said || CHECK_IN_ACTION; // Ferni's line whenever it was risky or not text
  const both = [concern.description, concern.recommendedAction]
    .map(fieldText)
    .filter(Boolean)
    .join(' ');
  const crisis = needsCrisisLine(desc, act, both, what, next);
  const sent = alert(what, next, crisis);
  const screened = both.length <= SCREEN_WINDOW && sent.length <= SCREEN_WINDOW;
  if (screened && !isRiskyCallerText(sent)) return sent;
  // Too long to screen in full, or the joined fields formed something risky:
  // pass neither on, so their words are withheld and crisisCallerLine goes. The
  // money line only when the screen read something risky in either field alone, the
  // alert, or the joined fields; length alone is neutral. Each field is read alone
  // because the joined text is read only up to the screen's window.
  const risky = desc.risky || act.risky || isRiskyCallerText(sent) || isRiskyCallerText(both);
  return alert(risky ? riskyCallerLine(name) : withheldCallerLine(name), CHECK_IN_ACTION, true);
}
