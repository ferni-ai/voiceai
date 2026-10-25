/**
 * A push that tells someone a note from Ferni is waiting in the app.
 *
 * A note saved by saveInAppMessage (unified-delivery.ts) sits in
 * pending_messages until the person opens the app; nothing tells them it is
 * there (loops scorecard, 2026-10-18: three daily notes, all unread, 7 to 17
 * days old). This sends one web/app push for a saved note, the same way the
 * calendar briefing pushes (calendar-briefing-job.ts). Each sender keeps its
 * own flag and calls this after a successful save: the daily outreach run
 * (OUTREACH_IN_APP_PUSH) does; reminders can share it with their own flag.
 *
 * @module services/outreach/in-app-push
 */
import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { PushNotificationPayload } from '../push-notifications.js';
import { pushOriginOf, pushUnlessFocusHeld } from './focus-send-hold.js';

const log = createLogger({ module: 'in-app-push' });

/** A lock-screen line, not the whole note. */
const BODY_MAX = 140;

export interface InAppNote {
  /** pending_messages id, so the app can open that note. */
  messageId?: string;
  text: string;
  personaId?: string;
  /** What kind of note (an outreach type, 'reminder'), passed to the app as data. */
  kind: string;
}

export type SendPush = (userId: string, payload: PushNotificationPayload) => Promise<boolean>;

/** Ferni's note waits out a Focus hold; a reminder's follows their reminder choice (focus-send-hold.ts). */
const sendPush: SendPush = async (userId, payload) =>
  pushUnlessFocusHeld(userId, payload, pushOriginOf(payload));

function bodyOf(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > BODY_MAX ? `${flat.slice(0, BODY_MAX - 1).trimEnd()}…` : flat;
}

/**
 * Sends the push; true when at least one device took it. Never throws: the
 * note is saved either way, and a person with no push subscription still
 * finds it in the app.
 */
export async function pushInAppNote(
  userId: string,
  note: InAppNote,
  send: SendPush = sendPush
): Promise<boolean> {
  try {
    const sent = await send(userId, {
      title: 'Ferni',
      body: bodyOf(note.text),
      type: 'ferni_checkin',
      personaId: note.personaId ?? 'ferni',
      data: { kind: note.kind, ...(note.messageId && { messageId: note.messageId }) },
    });
    log.info({ kind: note.kind, sent }, 'In-app note push');
    return sent;
  } catch (error) {
    log.warn({ error: String(error), kind: note.kind }, 'In-app note push failed');
    return false;
  }
}

/**
 * After a delivery: push only when it ended as a saved note in the app (a push
 * or a text that went out needs none). The daily run calls it only with
 * OUTREACH_IN_APP_PUSH on.
 */
export async function pushIfSavedInApp(
  userId: string,
  delivered: { success: boolean; channel: string; messageId?: string },
  note: Omit<InAppNote, 'messageId'>,
  send: SendPush = sendPush
): Promise<boolean> {
  if (!delivered.success || delivered.channel !== 'in_app') return false;
  return pushInAppNote(userId, { ...note, messageId: delivered.messageId }, send);
}

/** The daily run's call: pushIfSavedInApp while OUTREACH_IN_APP_PUSH is on, else nothing. */
export async function pushInAppIfOn(
  userId: string,
  delivered: { success: boolean; channel: string; messageId?: string },
  note: Omit<InAppNote, 'messageId'>,
  send: SendPush = sendPush
): Promise<boolean> {
  return flagOn('OUTREACH_IN_APP_PUSH') ? pushIfSavedInApp(userId, delivered, note, send) : false;
}
