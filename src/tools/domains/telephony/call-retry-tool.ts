/**
 * retryMissedCall (CALL_RETRY_ASKS_FIRST). Owner, 2026-11-26: Ferni does not redial on its
 * own. After a missed call the report offers a retry, and only the owner's yes schedules it.
 * The yes is the outbound confirm gate's (outbound-gate.ts reads back retryCallConfirm), the
 * same one every call Ferni places for the owner goes through. The tool itself is defined in
 * telephony/index.ts.
 *
 * The offers live in services/outreach (call-retry-offer.ts), which tools can't reach, so
 * they are installed as a port by the live call; with no port nothing is scheduled.
 *
 * @module tools/domains/telephony/call-retry-tool
 */
import type { ConfirmSpec } from '../communication/outreach/outreach-confirm.js';

/** A missed call's open retry offer: its id and how the retry is read back to the owner. */
export interface FoundRetryOffer {
  offerId: string;
  readBack: string;
}

/** The offers side (call-retry-offer.ts installMissedCallOffersPort). */
export interface MissedCallOffers {
  /** The open offer for the person named (the newest when none is named), or why there is none. */
  find: (userId: string, who: string) => Promise<FoundRetryOffer | string>;
  /** Schedule that offer's one retry; the words for the owner. */
  accept: (userId: string, offerId: string) => Promise<string>;
}

let offers: MissedCallOffers | undefined;
export function setMissedCallOffersPort(next: MissedCallOffers | undefined): void {
  offers = next;
}

const NO_PORT = "Nothing was scheduled: a missed call can't be tried again from here.";
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Read back the retry (who, when where they are, why); the yes schedules exactly that offer. */
export const retryCallConfirm: ConfirmSpec = {
  prepare: async (args, userId) => {
    if (!offers) return NO_PORT;
    const found = await offers.find(userId, text(args.contactName));
    if (typeof found === 'string') return found;
    return { args: { ...args, offerId: found.offerId }, readBack: found.readBack };
  },
};

export const RETRY_MISSED_CALL_TOLD =
  'Try once more to reach someone you called for the caller who did not pick up. Use it only ' +
  'after the caller says yes to trying them again; never on your own, and never for someone ' +
  'who said no. It sets the call for the next morning where that person is.';

/** Schedule the retry: the offer read back when the gate confirmed it, else the one named. */
export async function retryMissedCall(
  userId: string,
  args: { contactName?: unknown; offerId?: unknown }
): Promise<string> {
  if (!offers) return NO_PORT;
  const offerId = text(args.offerId);
  if (offerId) return offers.accept(userId, offerId);
  const found = await offers.find(userId, text(args.contactName));
  return typeof found === 'string' ? found : offers.accept(userId, found.offerId);
}
