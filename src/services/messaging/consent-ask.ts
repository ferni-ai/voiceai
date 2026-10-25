/**
 * The consent ask: the only first message Ferni may send a contact whose
 * consent is unknown (consent-grants.ts). It is a narrow allowed kind:
 *
 * - only when the owner explicitly confirmed it (`ownerConfirmed`), and only to
 *   a number in the owner's contacts or relationships (owner-contacts.ts);
 * - never while the owner or that number is held by a minor-care call
 *   (MINOR_CARE_SHARED_HOLD): no text anyone didn't ask for right now;
 * - at most one per contact per 30 days, claimed atomically in
 *   consent/{phoneHash} before sending and given back if it doesn't go;
 * - never to a number that opted out, and not needed once they said yes;
 * - through the guarded on-behalf sender, so STOP, quiet hours and the gap
 *   still apply. The claim is what lets this one text reach unknown consent.
 *
 * Their YES (recordContactYes) then turns texts 'in'.
 *
 * @module services/messaging/consent-ask
 */
import { heldSender, phoneHash } from '../outreach/checkin-replies.js';
import {
  defaultTextDeps,
  sendOnBehalfText,
  type OnBehalfOutcome,
  type TextDeps,
} from '../outreach/guarded-text.js';
import {
  claimConsentAsk,
  consentAskText,
  hasGrant,
  ownerFirstName,
  releaseConsentAsk,
} from './consent-grants.js';
import {
  defaultConsentDeps,
  messagingPipelineOn,
  readConsent,
  type ConsentDeps,
} from './consent.js';
import { ownerKnowsNumber } from './owner-contacts.js';

export interface ConsentAskRequest {
  readonly senderUserId: string;
  readonly toPhone: string;
  /** What it is about (the outreach id), stored with the record. */
  readonly refId: string;
  /** True only when the owner said yes to sending this ask (ActionGate). */
  readonly ownerConfirmed: boolean;
  readonly ownerName?: string;
  readonly zone?: string;
}

export type ConsentAskOutcome =
  | OnBehalfOutcome
  | {
      sent: false;
      reason:
        | 'pipeline-off'
        | 'not-confirmed'
        | 'held'
        | 'not-a-contact'
        | 'asked-recently'
        | 'already-consented';
    };

export async function sendConsentAsk(
  req: ConsentAskRequest,
  deps: { text: TextDeps; consent: ConsentDeps } = {
    text: defaultTextDeps(),
    consent: defaultConsentDeps(),
  }
): Promise<ConsentAskOutcome> {
  if (!messagingPipelineOn(deps.consent.env)) return { sent: false, reason: 'pipeline-off' };
  if (req.ownerConfirmed !== true) return { sent: false, reason: 'not-confirmed' };
  const hash = phoneHash(req.toPhone, deps.consent.env);
  if (!hash) return { sent: false, reason: 'bad-number' };
  if (await heldSender(req.senderUserId, req.toPhone, deps.consent.env)) {
    return { sent: false, reason: 'held' };
  }
  if (!(await ownerKnowsNumber(req.senderUserId, req.toPhone))) {
    return { sent: false, reason: 'not-a-contact' };
  }
  const { sms } = await readConsent(hash, deps.consent);
  if (sms.state === 'opted-out') return { sent: false, reason: 'opted-out' };
  if (await hasGrant(hash, req.senderUserId, 'sms', deps.consent)) {
    return { sent: false, reason: 'already-consented' };
  }
  const claim = await claimConsentAsk(hash, req.senderUserId, deps.consent, req.refId);
  if (!claim) return { sent: false, reason: 'asked-recently' };
  const owner = req.ownerName ?? ownerFirstName(await deps.text.store.userDoc(req.senderUserId));
  const outcome = await sendOnBehalfText(
    {
      senderUserId: req.senderUserId,
      toPhone: req.toPhone,
      body: consentAskText(owner),
      refId: req.refId,
      zone: req.zone,
      consentAskClaim: claim,
    },
    { ...deps.text, consent: deps.consent }
  );
  if (!outcome.sent) await releaseConsentAsk(hash, claim, deps.consent);
  return outcome;
}
