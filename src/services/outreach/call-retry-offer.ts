/**
 * The owner's yes to a missed call's retry (CALL_RETRY_ASKS_FIRST). Owner, 2026-11-26: Ferni
 * does not redial on its own. After a missed call it offers, and the retry is scheduled only
 * after the owner says yes, for a sensible hour where the callee is.
 *
 * scheduleCallRetry (call-retry.ts) stores the signed retry as an offer and the report keeps
 * its "want me to try again?". On a yes, retryMissedCall (tools/domains/telephony/
 * call-retry-tool.ts, read back through the outbound confirm gate) finds the offer and
 * accepts it here. A stored retry counts only if the server signed it and it is the owner's.
 *
 * @module services/outreach/call-retry-offer
 */
import { getLogger } from '../../utils/safe-logger.js';
import {
  setMissedCallOffersPort,
  type FoundRetryOffer,
} from '../../tools/domains/telephony/index.js';
import {
  calleeHoursGuard,
  calleeRetrySlot,
  calleeZoneOf,
  isCallFollowthroughEnabled,
  isCallOptedOut,
  isCallRetryAsksFirst,
  OFFER_TTL_MS,
  retryOffersOf,
  storeScheduledRetry,
  toE164,
  type CallRetryDeps,
} from './call-retry.js';
import {
  dispatchVerifySecrets,
  parseOnBehalfDispatch,
  verifyOnBehalfDispatch,
  type OnBehalfDispatch,
} from './on-behalf-dispatch.js';

const log = getLogger().child({ service: 'call-retry-offer' });

const OFF = 'Nothing was scheduled: trying a missed call again is off.';
const UNREAD = "Nothing was scheduled: I couldn't check the missed calls just now.";

interface Offer {
  id: string;
  /** The stored payload exactly as signed: what the scheduled-outreach job verifies and places. */
  signed: OnBehalfDispatch;
  call: OnBehalfDispatch;
  offeredAt: number;
}

/** The stored retry, only when the server signed it and it retries a call of this owner's. */
function ownRetry(stored: unknown, userId: string): OnBehalfDispatch | null {
  if (!verifyOnBehalfDispatch(JSON.stringify(stored ?? null), dispatchVerifySecrets())) return null;
  const call = parseOnBehalfDispatch(stored as Record<string, unknown>);
  return call?.retryOf && call.requester.userId === userId && toE164(call.contact.phone)
    ? call
    : null;
}

/** The owner's open, unexpired offers, newest first; null when they can't be read. */
async function openOffers(userId: string, now: Date): Promise<Offer[] | null> {
  try {
    const offers = await retryOffersOf(userId);
    if (!offers) return null;
    const snapshot = await offers.where('status', '==', 'offered').get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        const call = ownRetry(data.onBehalfDispatch, userId);
        return {
          id: doc.id,
          signed: data.onBehalfDispatch,
          call,
          offeredAt: Number(data.offeredAt), // epoch ms; missing is NaN, so expired
        };
      })
      .filter((o): o is Offer => o.call !== null && now.getTime() - o.offeredAt <= OFFER_TTL_MS)
      .sort((a, b) => b.offeredAt - a.offeredAt);
  } catch (error) {
    log.warn({ error: String(error) }, 'Could not read retry offers');
    return null;
  }
}

const words = (s: string): string =>
  s
    .toLowerCase()
    .replace(/^my\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** The offer for the person the owner named (name, first name or relationship); unnamed, the newest. */
function offerFor(offers: Offer[], who: string): Offer | undefined {
  const asked = words(who);
  if (!asked) return offers[0];
  return offers.find(({ call }) => {
    const name = words(call.contact.name);
    return [name, name.split(' ')[0], words(call.contact.relationship ?? '')].includes(asked);
  });
}

interface Plan {
  at: Date;
  /** The read-back's "tomorrow around 10 AM where Rosa is": the zone is said, never hidden. */
  when: string;
  /** The yes's shorter "tomorrow around 10 AM Rosa's time". */
  whenAgain: string;
}

/** When the retry rings and how the owner hears it: tomorrow morning where the callee is. */
async function planFor(
  call: OnBehalfDispatch,
  now: Date,
  deps: CallRetryDeps
): Promise<Plan | string> {
  const name = call.contact.name;
  if (await isCallOptedOut(call.contact.phone)) {
    return `Nothing was scheduled: ${name} asked not to be called again.`;
  }
  const zone = calleeZoneOf(call);
  const guard = deps.isAllowedCallTime ?? calleeHoursGuard;
  const at = zone && (await calleeRetrySlot(call, zone.zone, now, guard));
  if (!zone || !at) return `Nothing was scheduled: I couldn't find a good hour to call ${name}.`;
  const clock = new Intl.DateTimeFormat('en-US', {
    timeZone: zone.zone,
    hour: 'numeric',
    minute: '2-digit',
  })
    .format(at)
    .replace(':00', '')
    .replace(/\s/g, ' '); // ICU puts a narrow no-break space before "AM"
  // An unknown zone is said, never hidden: the owner may know better (owner, 2026-11-26). The
  // name, never "them": no pronoun is stored for the callee.
  const known = zone.source === 'area_code';
  const where = known
    ? `where ${name} is`
    : `your time, since I don't know what time it is where ${name} is`;
  return {
    at,
    when: `tomorrow around ${clock} ${where}`,
    whenAgain: `tomorrow around ${clock} ${known ? `${name}'s` : 'your'} time`,
  };
}

/** ", to see how she's feeling", said the way the first call's read-back says it; a purpose
 * already starting "to" or "about" is not doubled ("to to ask…"). Never quoted like a form. */
function toPurpose(purpose: string | undefined): string {
  const said = (purpose ?? '').trim();
  if (!said) return '';
  return /^(to|about)\s/i.test(said) ? `, ${said}` : `, to ${said}`;
}

const noOffer = (who: string): string =>
  `Nothing was scheduled: I don't have a missed call${who ? ` to ${who}` : ''} to try again.`;

/** The open offer for `who`, read back as the one retry the owner is saying yes to. */
async function findCallRetryOffer(
  userId: string,
  who: string,
  deps: CallRetryDeps = {}
): Promise<FoundRetryOffer | string> {
  if (!isCallFollowthroughEnabled() || !isCallRetryAsksFirst()) return OFF;
  const now = deps.now?.() ?? new Date();
  const offers = await openOffers(userId, now);
  if (!offers) return UNREAD;
  const offer = offerFor(offers, who);
  if (!offer) return noOffer(who);
  const plan = await planFor(offer.call, now, deps);
  if (typeof plan === 'string') return plan;
  const { name } = offer.call.contact;
  return {
    offerId: offer.id,
    readBack: `one more try at ${name} ${plan.when}${toPurpose(offer.call.purpose)}`,
  };
}

/** The owner said yes: schedule that offer's one retry, exactly as it was signed. */
async function acceptCallRetry(
  userId: string,
  offerId: string,
  deps: CallRetryDeps = {}
): Promise<string> {
  if (!isCallFollowthroughEnabled() || !isCallRetryAsksFirst()) return OFF;
  const now = deps.now?.() ?? new Date();
  const offers = await openOffers(userId, now);
  if (!offers) return UNREAD;
  const offer = offers.find((o) => o.id === offerId);
  if (!offer) return noOffer('');
  const plan = await planFor(offer.call, now, deps);
  if (typeof plan === 'string') return plan;
  const name = offer.call.contact.name;
  if (!(await storeScheduledRetry(offer.signed, plan.at, now))) {
    return `Nothing new was scheduled: a retry to ${name} is already set, or it couldn't be saved.`;
  }
  const stored = await retryOffersOf(userId);
  await stored
    ?.doc(offer.id)
    // expireAt: the TTL clock restarts at the yes, so the accepted offer goes two days on.
    .update({
      status: 'accepted',
      acceptedAt: now,
      expireAt: new Date(now.getTime() + OFFER_TTL_MS),
    })
    .catch((error: unknown) => log.warn({ error: String(error) }, 'Offer not marked accepted'));
  // Said like a person, not a status line (owner, 2026-11-26).
  return `Okay, I'll try ${name} again ${plan.whenAgain}.`;
}

/** Install the offers behind retryMissedCall; safe to call on every call. */
export function installMissedCallOffersPort(): void {
  setMissedCallOffersPort({
    find: (userId, who) => findCallRetryOffer(userId, who),
    accept: (userId, offerId) => acceptCallRetry(userId, offerId),
  });
}
