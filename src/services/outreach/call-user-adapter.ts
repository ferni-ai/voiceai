/**
 * The outreach side of callUser's port (tools/domains/proactive/outreach/call-user-port.ts):
 * the account's verified phone (userReach) and email (Firebase Auth), texts to the owner
 * through the guarded sender (sendGuardedText), and the call through scheduleProactiveCall,
 * so calling hours and quiet hours decide when it rings.
 *
 * @module services/outreach/call-user-adapter
 */
import {
  setCallUserPort,
  type CallUserPort,
} from '../../tools/domains/proactive/outreach/call-user-port.js';
import { getFirebaseUser } from '../identity/firebase-auth.js';
import { setEngagementReachPort } from '../engagement/engagement-reach-port.js';
import { userTimeZone } from '../../utils/caller-time-zone.js';
import { isValidTimeZone } from '../../utils/time-zone.js';
import { isQuietHour } from '../follow-through/index.js';
import { scheduleProactiveCall } from './conversational-calls.js';
import { sendGuardedText, type TextSkip } from './guarded-text.js';
import { movingToPhone, type PhoneMove } from './live-agent-call.js';
import { escapeXml } from './twilio-ssml.js';
import { userReach } from './user-reach.js';

/** What Ferni says when a text to the owner was held. */
const HELD: Record<TextSkip | 'quiet-hours', string> = {
  'quiet-hours': "it's quiet hours where you are",
  'opted-out': 'you replied STOP to my texts',
  'consent-unknown': "I couldn't check your text settings just now",
  paused: 'you sounded like you might want fewer texts, so I held off',
  'sms-off': 'texts are turned off in your settings',
  'recently-sent': 'I just texted you',
  'no-verified-phone': "there's no verified phone number on your account",
  'no-hash-secret': "texting isn't set up here",
  'send-failed': "the text didn't go through",
};

/** No second immediate text within a minute: a loop can't spam the owner. */
const OWNER_TEXT_GAP_MS = 60 * 1000;

export const callUserAdapter: CallUserPort = {
  // They asked for this call, so a verified phone is enough; no standing opt-in.
  verifiedPhone: async (userId) =>
    (await userReach(userId, 'voice_call', { standingOptIn: false })).phone,
  // Only an address Firebase verified; a phone: account has none.
  verifiedEmail: async (userId) => {
    if (userId.startsWith('phone:')) return undefined;
    const user = await getFirebaseUser(userId);
    return user?.emailVerified ? (user.email ?? undefined) : undefined;
  },
  textOwner: async (userId, body, { askedNow }) => {
    const zone = userTimeZone({ userId });
    if (!askedNow && isValidTimeZone(zone) && isQuietHour(new Date(), zone)) {
      return { sent: false, reason: HELD['quiet-hours'] };
    }
    const refId = `${Date.now()}`;
    const t = {
      userId,
      body,
      kind: 'message' as const,
      refId,
      minGapMs: OWNER_TEXT_GAP_MS,
      askedNow,
    };
    const outcome = await sendGuardedText(t);
    return outcome.sent ? { sent: true } : { sent: false, reason: HELD[outcome.reason] };
  },
  call: async ({ userId, phoneNumber, message, personaId, handover }) => {
    const place = () =>
      scheduleProactiveCall({
        userId,
        phoneNumber,
        message,
        ssml: `<speak>${escapeXml(message)}</speak>`,
        personaId,
        reason: 'user_requested_call',
      });
    if (!handover) return place();
    // CALL_ME_MOVES_TO_PHONE: the app call's id rides the dispatch; the live dial comes back
    const move: PhoneMove = { conversationId: handover.conversationId };
    const result = await movingToPhone(userId, move, place);
    return move.dial ? { ...result, dial: move.dial } : result;
  },
};

/** Install the adapter; safe to call on every call. */
export function installCallUserPort(): void {
  setCallUserPort(callUserAdapter);
  // Maya's notifications (services/engagement) reach only the same verified phone and email.
  setEngagementReachPort({
    verifiedPhone: callUserAdapter.verifiedPhone,
    verifiedEmail: async (userId) => (await callUserAdapter.verifiedEmail?.(userId)) ?? undefined,
  });
}
