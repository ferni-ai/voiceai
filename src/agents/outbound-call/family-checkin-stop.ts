/**
 * An easy stop for family check-in calls (FAMILY_CHECKIN_STOP, off by default).
 *
 * When the family member says on a check-in call that they don't want these
 * calls ("please stop calling", "don't call me again"), Ferni never rings them
 * for a check-in again: at the end of the session their consent record is
 * withdrawn, so the sponsor's switch for them turns off, and their number goes
 * on the shared do-not-call list that on-behalf calls use too.
 *
 * Check-in calls have no call transcript (that is for on-behalf calls), so this
 * listens to services.addTurn for the family member's own words and passes
 * every turn on unchanged. Only a dispatch our server signed is acted on: its
 * sponsoredIdentityId and number say whose consent and which number.
 *
 * @module agents/outbound-call/family-checkin-stop
 */

import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { isOptOutPhrase } from './on-behalf-call-lifecycle.js';

const log = createLogger({ module: 'family-checkin-stop' });

/** The family member's words so far, by session. Capped: only the asking matters. */
const heardBySession = new Map<string, string[]>();
const MAX_TURNS = 200;

type AddTurn = (role: 'user' | 'assistant', text: string, durationMs?: number) => void;

/** Listen for the family member's words on a check-in call; every turn still goes where it went. */
export function listenForStop(sessionId: string, services: { addTurn?: AddTurn }): void {
  const { addTurn } = services;
  if (!flagOn('FAMILY_CHECKIN_STOP') || !addTurn) return;
  const heard: string[] = [];
  heardBySession.set(sessionId, heard);
  services.addTurn = (role, text, durationMs) => {
    if (role === 'user' && text && heard.length < MAX_TURNS) heard.push(text);
    addTurn.call(services, role, text, durationMs);
  };
}

export interface FamilyStopPorts {
  withdrawConsent: (sponsoredIdentityId: string, now: Date) => Promise<boolean>;
  recordOptOut: (
    phone: string,
    context: { callId: string; requesterUserId: string }
  ) => Promise<boolean>;
}

async function defaultPorts(): Promise<FamilyStopPorts> {
  const { createFamilyConsentStore } =
    await import('../../services/stores/family-call-consent-store.js');
  const { recordCallOptOut } = await import('../../services/outreach/call-retry.js');
  const consent = createFamilyConsentStore();
  return {
    withdrawConsent: async (id, now) => consent.withdraw(id, now),
    recordOptOut: recordCallOptOut,
  };
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * At the end of a check-in session: if the family member asked not to be
 * called again, withdraw their consent and put the number on the do-not-call
 * list. Returns whether they asked. Never throws.
 */
export async function finishFamilyCheckin(
  sessionId: string,
  metadata: Record<string, unknown>,
  trusted: boolean,
  ports?: FamilyStopPorts
): Promise<boolean> {
  const heard = heardBySession.get(sessionId) ?? [];
  heardBySession.delete(sessionId);
  if (!flagOn('FAMILY_CHECKIN_STOP') || !trusted || !heard.some(isOptOutPhrase)) return false;

  const callId = text(metadata.callId);
  const sponsoredIdentityId = text(metadata.sponsoredIdentityId);
  const phone = text(metadata.familyMemberPhone);
  const sponsorUserId = text(metadata.sponsorUserId);
  try {
    const { withdrawConsent, recordOptOut } = ports ?? (await defaultPorts());
    const [withdrawn, listed] = await Promise.all([
      sponsoredIdentityId ? withdrawConsent(sponsoredIdentityId, new Date()) : false,
      phone ? recordOptOut(phone, { callId, requesterUserId: sponsorUserId }) : false,
    ]);
    log.info(
      { callId, sponsoredIdentityId, withdrawn, listed },
      'Family member asked not to be called again; check-in calls to them are stopped'
    );
    if (!withdrawn || !listed)
      log.error(
        { callId, sponsoredIdentityId, withdrawn, listed },
        'Could not fully record a family member asking not to be called again'
      );
  } catch (error) {
    log.error(
      { callId, sponsoredIdentityId, error: String(error) },
      'Could not record a family member asking not to be called again'
    );
  }
  return true;
}
