/**
 * The placer behind CALL_PATHS_PLACE_OR_HOLD (tools/domains/telephony/gated-call-port.ts):
 * a call from the backgroundCall tool or a referral tool is placed the way
 * callOnBehalf places one. First the checks the old engines made before dialling
 * (consent grant, outreach pause), so the flag only adds gates;
 * then compliance, then placeOrHold and the on-behalf
 * orchestrator, so it is held for the recipient's good hour, refused for a number
 * that must not be rung, or placed, with its agent reporting the result when it ends.
 *
 * @module services/outreach/gated-call-paths
 */
import { getLogger } from '../../utils/safe-logger.js';
import {
  checkCallCompliance,
  setGatedCallPort,
  type GatedCall,
  type Placement,
} from '../../tools/domains/telephony/index.js';
import { ownerRefusal } from '../messaging/consent-reach.js';
import { toE164 } from './checkin-replies.js';
import { placeOrHold, requesterNameNow } from './deferred-calls.js';
import { outreachPausedFor } from './outreach-pause.js';

const log = getLogger().child({ service: 'gated-call-paths' });

type OnBehalfRequest = Parameters<typeof placeOrHold>[0];

/** Why the orchestrator would not dial, in words the user can hear. */
function refusalFor(error: unknown): string {
  const { name, message } = error instanceof Error ? error : new Error(String(error));
  if (name === 'RecipientOptedOutError') return message; // asked not to be called, or never agreed
  if (message.startsWith('Call refused: ')) return message.slice('Call refused: '.length);
  return 'the call could not be placed'; // a minor-care hold or an outage: no detail to the user
}

const CONSENT_WORDS = {
  'opted-out': 'they asked not to get calls from me',
  'needs-consent': "they haven't said yes to calls from me yet",
  unverifiable: "I couldn't check that they're okay with a call",
} as const;

/**
 * The checks callWithPersonaVoice and makeConversationalCall made before dialling that
 * the orchestrator doesn't make: the recipient's call grant from this owner, and (unless
 * the user asked for this call) an outreach pause. Their minor-care hold check is the
 * orchestrator's own (assertNotOptedOut), before any hold.
 */
async function oldEngineRefusal(call: GatedCall): Promise<string | null> {
  const phone = toE164(call.phone);
  if (!phone) return "that number isn't one I can dial";
  const consent = await ownerRefusal(call.userId, phone, 'call'); // MESSAGING_PIPELINE
  if (consent) return CONSENT_WORDS[consent];
  if (!call.askedFor && (await outreachPausedFor(call.userId, phone))) return 'outreach is paused';
  return null;
}

async function placeThroughPlaceOrHold(call: GatedCall): Promise<Placement> {
  const refused = await oldEngineRefusal(call);
  if (refused) return { refused };
  const request: OnBehalfRequest = {
    contactQuery: call.contactName,
    resolvedContact: { name: call.contactName, phone: call.phone },
    purpose: call.purpose,
    objective: call.objective,
    callType: call.callType,
    originalSessionId: call.sessionId ?? '',
    userId: call.userId,
    userTimezone: '',
    userName: call.userName ?? (await requesterNameNow(call.userId, 'the user')),
    ...(call.context && { userPreferences: { additionalContext: call.context } }),
    recordingConsent: false,
  };
  // Before any hold, as callOnBehalf does: a number that can never be dialled is refused now.
  const compliance = checkCallCompliance(request);
  if (!compliance.passed) return { refused: compliance.issues.join(', ') };
  try {
    const { getOnBehalfCallOrchestrator } = await import('./on-behalf-call-orchestrator.js');
    const orchestrator = getOnBehalfCallOrchestrator();
    const { callId, held } = await placeOrHold(request, (r) => orchestrator.initiateCall(r));
    if (held || !callId) return { held: held ?? `Nothing was dialed yet for ${call.contactName}.` };
    return { placed: callId };
  } catch (error) {
    log.warn({ userId: call.userId, error: String(error) }, 'Gated call not placed');
    return { refused: refusalFor(error) };
  }
}

/** Install the placer; safe to call on every call. */
export function installGatedCallPort(): void {
  setGatedCallPort(placeThroughPlaceOrHold);
}
