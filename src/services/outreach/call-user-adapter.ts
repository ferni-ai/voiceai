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
import { userTimeZone } from '../../utils/caller-time-zone.js';
import { isValidTimeZone } from '../../utils/time-zone.js';
import { isQuietHour } from '../follow-through/index.js';
import { scheduleProactiveCall } from './conversational-calls.js';
import { prefsQuietUntil } from '../messaging/prefs-gate.js';
import { sendGuardedText, type TextSkip } from './guarded-text.js';
import { escapeXml } from './twilio-ssml.js';
import { userReach } from './user-reach.js';

/** What Ferni says when a text to the owner was held. */
const HELD: Record<TextSkip, string> = {
  'quiet-hours': "it's quiet hours where you are",
  'opted-out': 'you replied STOP to my texts',
  'sms-off': 'texts are turned off in your settings',
  'recently-sent': 'I just texted you',
  'no-verified-phone': "there's no verified phone number on your account",
  'no-hash-secret': "texting isn't set up here",
  'send-failed': "the text didn't go through",
};

/** Their own quiet hours (messagingPrefs) with MESSAGING_PREFS on, else 21:00-08:00 in their zone. */
async function ownerQuiet(userId: string, now: Date): Promise<boolean> {
  const zone = userTimeZone({ userId });
  const fromPrefs = await prefsQuietUntil(userId, now, isValidTimeZone(zone) ? zone : undefined);
  if (fromPrefs !== undefined) return fromPrefs !== null;
  return isValidTimeZone(zone) && isQuietHour(now, zone);
}

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
    if (!askedNow && (await ownerQuiet(userId, new Date()))) {
      return { sent: false, reason: HELD['quiet-hours'] };
    }
    const refId = `${Date.now()}`;
    const t = { userId, body, kind: 'message' as const, refId, minGapMs: OWNER_TEXT_GAP_MS };
    const outcome = await sendGuardedText(t);
    return outcome.sent ? { sent: true } : { sent: false, reason: HELD[outcome.reason] };
  },
  call: ({ userId, phoneNumber, message, personaId }) =>
    scheduleProactiveCall({
      userId,
      phoneNumber,
      message,
      ssml: `<speak>${escapeXml(message)}</speak>`,
      personaId,
      reason: 'user_requested_call',
    }),
};

/** Install the adapter; safe to call on every call. */
export function installCallUserPort(): void {
  setCallUserPort(callUserAdapter);
}
