/**
 * openRideLink (RIDE_LINKS): a link that opens Uber with the trip filled in.
 *
 * Uber's ride-request API needs Uber's approval, which we don't have, so Ferni
 * books nothing (#3103 removed the booking module that pretended to). This
 * geocodes both ends and builds Uber's universal link; the caller taps it and
 * books in Uber. A place the geocoder can't find gets "I couldn't find that
 * place" and no link: never 0,0 or a guess. Lyft is left out: its deep-link
 * format could not be confirmed from Lyft's own docs (developer.lyft.com no
 * longer resolves, 2026-10-30).
 *
 * Delivery: in the app the result carries the link. On a phone call it offers
 * to text it, and texts only when the caller says yes (sendText), through
 * twilio-sms sendSMS, which stops at an SMS opt-out and a minor-care hold.
 *
 * @module tools/domains/ride-links/ride-link
 */

import { sendSMS } from '../../../services/external-apis/twilio-sms.js';
import { sessionPhone } from '../../../utils/minor-care.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { toolCallerId } from '../../registry/per-caller-tool.js';
import { isUnspecifiedLocation } from '../../shared/caller-location.js';
import { geocodeWithGoogle, type GeocodingResult } from '../information/utils/geocoding.js';

const log = createLogger({ module: 'ride-link' });

export const CANT_BOOK =
  "I can't book it for you, but here's a link that opens Uber with your trip filled in.";
export const OFFER_TEXT =
  "I can't book it for you, but I can text you a link that opens Uber with your trip filled in. Want me to send it?";
export const TEXTED =
  "I texted you a link that opens Uber with your trip filled in. I can't book it, so you finish it in Uber.";
export const TEXT_NOT_SENT = "I couldn't text you the link, so nothing was sent.";
export const NO_TEXT_IN_APP = "I can't text from here, but the link is right here in the app.";
export const ASK_DESTINATION = 'Where are you headed?';
export const ASK_PICKUP =
  "Where should Uber pick you up? I don't know exactly where you are, so give me an address or a place.";
export const notFound = (place: string): string =>
  `I couldn't find "${place}", so I didn't make a link. Can you give me the address or a nearby landmark?`;

export interface RideEnd {
  latitude: number;
  longitude: number;
  /** The caller's own words for the place, shown in Uber as its name */
  nickname: string;
}

/** A coordinate a ride can use: finite, in range, and not 0,0 (what a failed lookup defaults to). */
export function usableCoordinates(p: { latitude: number; longitude: number }): boolean {
  const { latitude: lat, longitude: lng } = p;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  return !(lat === 0 && lng === 0);
}

/**
 * Uber's m.uber.com universal link: `pickup` and `drop[0]` are URL-encoded
 * JSON Location objects {latitude, longitude, addressLine1}; addressLine1 is
 * the nickname, and an address never overrides the coordinates.
 * https://developer.uber.com/docs/riders/ride-requests/tutorials/deep-links/introduction
 * (sections "Universal Deep Links", "m.uber.com Deep Links", "Location Object").
 */
export function uberRideLink(pickup: RideEnd, drop: RideEnd): string {
  const location = (end: RideEnd): string =>
    JSON.stringify({
      latitude: end.latitude,
      longitude: end.longitude,
      addressLine1: end.nickname,
    });
  const params = new URLSearchParams();
  params.set('pickup', location(pickup));
  params.set('drop[0]', location(drop));
  return `https://m.uber.com/looking?${params.toString()}`;
}

export interface RideLinkArgs {
  destination: string;
  pickup?: string;
  /** The caller said yes to a text of the link (phone calls) */
  sendText?: boolean;
}

export type RideLinkResult =
  | { outcome: 'needs_input' | 'not_found' | 'text_not_sent'; say: string }
  | {
      outcome: 'link_ready' | 'offer_text' | 'texted';
      say: string;
      link: string;
      delivery: 'app' | 'phone';
    };

export interface RideLinkDeps {
  geocode: (place: string) => Promise<GeocodingResult | null>;
  phoneOf: (sessionId: string) => string | undefined;
  text: (to: string, body: string, opts: { userId?: string }) => Promise<string | null>;
}

const defaultDeps: RideLinkDeps = {
  geocode: geocodeWithGoogle,
  phoneOf: sessionPhone,
  text: sendSMS,
};

/** The call's session id (userData.services.sessionId), never a model argument. */
function sessionIdOf(opts: unknown): string | undefined {
  const userData = (opts as { ctx?: { userData?: { services?: { sessionId?: unknown } } } })?.ctx
    ?.userData;
  const id = userData?.services?.sessionId;
  return typeof id === 'string' ? id : undefined;
}

async function locate(place: string, deps: RideLinkDeps): Promise<RideEnd | null> {
  const geo = await deps.geocode(place);
  if (!geo) return null;
  const end = { latitude: geo.latitude, longitude: geo.longitude, nickname: place };
  return usableCoordinates(end) ? end : null;
}

export async function openRideLink(
  args: RideLinkArgs,
  opts: unknown,
  deps: RideLinkDeps = defaultDeps
): Promise<RideLinkResult> {
  const destination = args.destination?.trim();
  if (!destination) return { outcome: 'needs_input', say: ASK_DESTINATION };
  if (isUnspecifiedLocation(args.pickup)) return { outcome: 'needs_input', say: ASK_PICKUP };
  const pickupPlace = (args.pickup as string).trim();

  const [pickup, drop] = await Promise.all([locate(pickupPlace, deps), locate(destination, deps)]);
  if (!drop) return { outcome: 'not_found', say: notFound(destination) };
  if (!pickup) return { outcome: 'not_found', say: notFound(pickupPlace) };
  const link = uberRideLink(pickup, drop);

  const sessionId = sessionIdOf(opts);
  const phone = sessionId ? deps.phoneOf(sessionId) : undefined;
  if (!phone) {
    const say = args.sendText ? `${CANT_BOOK} ${NO_TEXT_IN_APP}` : CANT_BOOK;
    log.info({ outcome: 'link_ready', delivery: 'app' }, 'openRideLink');
    return { outcome: 'link_ready', say, link, delivery: 'app' };
  }
  if (!args.sendText) return { outcome: 'offer_text', say: OFFER_TEXT, link, delivery: 'phone' };

  const body = `Your Uber link from Ferni, trip filled in. Ferni can't book rides, so you confirm it in Uber: ${link}`;
  const sid = await deps.text(phone, body, { userId: toolCallerId(opts) });
  log.info({ outcome: sid ? 'texted' : 'text_not_sent', delivery: 'phone' }, 'openRideLink');
  if (!sid) return { outcome: 'text_not_sent', say: TEXT_NOT_SENT };
  return { outcome: 'texted', say: TEXTED, link, delivery: 'phone' };
}
