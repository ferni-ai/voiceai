/**
 * CALLBACK_MEANS_ASKED (#4468): `callbackRequired` on a call result meant two things. The
 * call paths set it when nobody picked up, a voicemail greeting answered, the person refused
 * or the transcript was lost, meaning "Ferni should offer a retry"; the reports read it as
 * "the person asked the user to call back". A user whose mother missed the call was told
 * she wanted a call back.
 *
 * On: a call nobody asked to be returned carries `retryOffered`, and `callbackRequired` is
 * only the person's own ask (the analysis's callbackRequested). Every line is what a friend
 * would say (Seth 11-26): a missed call by name with one offer (spokenOutcome,
 * retryOfferLine), and a person who picked up and said no handed back to the user, never
 * redialled (declinedWords). Off: results are written as
 * before. Both stores keep the call's own fields (on_behalf_calls its outcome, a
 * background_results copy `callFollowUp`), and every reader derives the two meanings from
 * them here, at read time, so a result written by a process with the flag off reads right in
 * one with it on, and the other way round.
 *
 * A result from before the split (callbackRequired, no retryOffered) is read, with the flag
 * on, as an ask only when the person picked up (status 'completed'): every other status, or
 * none, had nobody to ask, so it reads as a retry offer. A refusal from before the split is
 * 'completed' too and still reads as an ask; the next-call reports read 24-48 h of results,
 * so that lasts at most two days after the flag goes on.
 *
 * It lives in background-agents (L3 agency) so the result writers here (call-executor,
 * unified-result-capture) and the reports and call paths above (L4/L5, through
 * call-follow-up/index.ts) share one home for the meaning.
 *
 * @module services/background-agents/call-follow-up/callback-meaning
 */
import { flagOn } from '../../../config/env-flag.js';
import type { BackgroundResult } from '../result-types.js';
import type { CallOutcome } from '../../../tools/domains/telephony/index.js';
// consent-words.ts is a leaf in this same context (L3 agency), so the gate allows it; the
// outreach folder's index.ts would load the outreach tools at every call path's start.
import { pronounOf } from '../../../tools/domains/communication/outreach/consent-words.js';

type Env = Record<string, string | undefined>;
/** A call's follow-up fields as either store keeps them; `status` is CallOutcome's. */
type CallbackFields = Partial<Pick<CallOutcome, 'callbackRequired' | 'retryOffered'>> & {
  status?: string;
};
type StoredResult = Pick<
  BackgroundResult,
  | 'type'
  | 'requiresCallback'
  | 'callbackTime'
  | 'callFollowUp'
  | 'contactName'
  | 'summary'
  | 'details'
>;

export function callbackMeansAskedOn(env?: Env): boolean {
  return flagOn('CALLBACK_MEANS_ASKED', env);
}

/** What a result says when Ferni should (or, `false`, no longer should) offer a retry. */
export function retryOffer(
  offered = true,
  env?: Env
): Pick<CallOutcome, 'callbackRequired' | 'retryOffered'> {
  return callbackMeansAskedOn(env) ? { retryOffered: offered } : { callbackRequired: offered };
}

/** The person on the call asked the user to call them back. */
export function callbackAsked(result: CallbackFields, env?: Env): boolean {
  if (result.callbackRequired !== true) return false;
  return (
    !callbackMeansAskedOn(env) || (result.status === 'completed' && result.retryOffered !== true)
  );
}

/** Ferni should offer the user another try at the call. */
export function retryWanted(result: CallbackFields, env?: Env): boolean {
  if (result.retryOffered === true) return true;
  return (
    callbackMeansAskedOn(env) && result.callbackRequired === true && result.status !== 'completed'
  );
}

/** Either one: the user has something to decide (priority, follow-up action, push wording). */
export function callbackFollowUp(result: CallbackFields, env?: Env): boolean {
  return callbackAsked(result, env) || retryWanted(result, env);
}

/** The fields a store keeps, so a reader can derive both meanings later. */
export function callbackFields(result: CallbackFields): CallbackFields {
  const { status, callbackRequired, retryOffered } = result;
  return { status, callbackRequired, retryOffered };
}

/**
 * A stored call read the one way every reader of either store reads it. A missing status
 * (an older or partial record) is not an ask: nobody is known to have picked up.
 */
export function callbackOf(stored: unknown, env?: Env): { asked: boolean; retry: boolean } {
  const s = (stored ?? {}) as Record<string, unknown>;
  const call: CallbackFields = {
    status: typeof s.status === 'string' ? s.status : undefined,
    callbackRequired: s.callbackRequired === true,
    retryOffered: s.retryOffered === true,
  };
  return { asked: callbackAsked(call, env), retry: retryWanted(call, env) };
}

/**
 * A background_results copy: a call's carries its own fields (`callFollowUp`); a copy from
 * before it has only main's flag, read like a record with no status. Other results: as is.
 */
export function callbackOfResult(
  result: Pick<BackgroundResult, 'type' | 'requiresCallback' | 'callFollowUp'>,
  env?: Env
): { asked: boolean; retry: boolean } {
  if (result.type !== 'on_behalf_call') return { asked: result.requiresCallback, retry: false };
  return callbackOf(result.callFollowUp ?? { callbackRequired: result.requiresCallback }, env);
}

/** Who a line is about: the name, and the saved relationship a pronoun comes from. */
interface CallContact {
  name?: string;
  relationship?: string;
}

/**
 * "she"/"her" for a saved mom or sister, "he"/"him" for a dad; none (the line uses the name)
 * for anyone else, and for a possessive ("mom's friend" names someone else).
 */
function pronounsOf(relationship: string | undefined): { subject: string; object: string } | null {
  const words = (relationship ?? '').toLowerCase().split(/[^a-z]+/);
  const pronoun = words.includes('s') ? undefined : pronounOf(words);
  if (pronoun === 'her') return { subject: 'she', object: 'her' };
  return pronoun === 'him' ? { subject: 'he', object: 'him' } : null;
}

const capitalised = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** What happened to a call Ferni can try again, said the way a person would, by name. */
const MISSED: Partial<Record<CallOutcome['status'], (name: string) => string>> = {
  no_answer: (name) => `${name} didn't pick up.`,
  busy: (name) => `${name}'s line was busy.`,
  voicemail: (name) => `The call went to ${name}'s voicemail.`,
  // A call that never connected and one whose transcript was lost are both 'failed'.
  failed: (name) => `My call to ${name} didn't go through.`,
};

/**
 * On: a call Ferni can try again is reported in Ferni's own words, the person by name, never
 * a status ("Linda didn't answer", "Call to Linda failed", a carrier's error); each report
 * adds the offer once (retryOfferLine). A voicemail Ferni left drops main's "letting them
 * know"; one where it spoke no message still says so (the voicemail evidence rule), and only
 * a voicemail with no record either way (an older result) is "went to her voicemail". Off, any
 * other call, or no name: as it was written. Only missed, failed and
 * voicemail calls are rewritten, and none of them carries the crisis line (withFlags adds it
 * to calls someone answered), so a rewrite never drops one.
 */
export function spokenOutcome(
  outcome: CallOutcome,
  name: string | undefined,
  env?: Env
): CallOutcome {
  if (!callbackMeansAskedOn(env) || !name) return outcome;
  if (outcome.status === 'voicemail' && typeof outcome.voicemailLeft === 'boolean') {
    const left = outcome.voicemailLeft
      ? 'so I left a warm message from you'
      : "but I didn't leave a message";
    const spoken = `I got ${name}'s voicemail, ${left}.`;
    // Said once already (completeOnBehalfCall), maybe with "I'll try again tomorrow" after it.
    return outcome.outcome.startsWith(spoken) ? outcome : { ...outcome, outcome: spoken };
  }
  const missed = MISSED[outcome.status];
  return missed && retryWanted(outcome, env) ? { ...outcome, outcome: missed(name) } : outcome;
}

/**
 * When the person picked up and said no. Off: main's words. On (Seth 11-26, "the most human
 * and natural thing"): what a friend would say, handing it back to the user, never a redial;
 * an opt-out keeps Ferni's promise not to call again. `flags` are Ferni's fixed lines for what
 * their words carried (lifecycle flaggedLines), after the words as main has them; on, when
 * one is the crisis line it leads and the hand-back goes, because "she might like hearing
 * from you" next to a safety worry reads as "leave it be" (lead r6).
 */
export function declinedWords(
  contact: { name: string; relationship?: string },
  how: 'refused' | 'declined' | 'opted_out',
  flags = '',
  crisis = false,
  env?: Env
): string {
  const { name } = contact;
  const flagged = (said: string): string => (flags ? `${said} ${flags}` : said);
  if (!callbackMeansAskedOn(env)) {
    if (how === 'refused') {
      return flagged(
        `${name} picked up but didn't want to talk with me. It might be better coming from you.`
      );
    }
    const promise =
      how === 'opted_out' ? " and asked not to be called again, so I won't call them" : '';
    return flagged(`I reached ${name}, but they didn't want to talk${promise}.`);
  }
  const they = pronounsOf(contact.relationship);
  const what =
    how === 'opted_out'
      ? `I got hold of ${name}, who asked me not to call again, so I won't.`
      : `I got hold of ${name}, but it wasn't a good time${they ? ` for ${they.object}` : ''}.`;
  if (crisis && flags) return `${flags} ${what}`;
  return flagged(
    `${what} ${capitalised(they?.subject ?? name)} might like hearing from you directly.`
  );
}

/** The call's own words already offer a retry ("Want me to try again later?"). */
const OFFERS_RETRY = /\btry again\b/i;

/**
 * The retry offer a report adds after what happened, once per report: '' when there is none,
 * or when `said` (the words the report already carries) makes it. The choice is the user's.
 */
export function retryOfferLine(
  contact: CallContact,
  call: CallbackFields,
  said: string,
  env?: Env
): string {
  if (!retryWanted(call, env) || OFFERS_RETRY.test(said)) return '';
  const them = pronounsOf(contact.relationship)?.object;
  if (them) return `Want me to try ${them} again later, or would you rather call ${them} yourself?`;
  if (!contact.name) return 'Want me to try again later?';
  return `Want me to try again later, or would you rather call ${contact.name} yourself?`;
}

/**
 * The person's own ask in the user's email, as a friend says it (on): "Linda asked you to
 * call her back." The caller says it only when callbackAsked holds, never for a missed call.
 * Off: main's words.
 */
export function askedLine(who: CallContact, main: string, env?: Env): string {
  if (!callbackMeansAskedOn(env)) return main;
  const pronoun = pronounsOf(who.relationship)?.object;
  const object = pronoun ? `${pronoun} ` : ''; // "call her back"; no pronoun, "call back"
  return `${capitalised(who.name || 'they')} asked you to call ${object}back.`;
}

/**
 * A background result's follow-up line: the ask in main's words ("They want a callback around
 * 5pm", no full stop), else the retry offer, else ''.
 */
export function resultFollowUp(result: StoredResult, env?: Env): string {
  const { asked, retry } = callbackOfResult(result, env);
  const when = result.callbackTime ? ` around ${result.callbackTime}` : '';
  if (asked) return `They want a callback${when}`;
  if (!retry) return '';
  const said = [result.summary, result.details].filter(Boolean).join(' ');
  const call = { ...result.callFollowUp, retryOffered: true };
  return retryOfferLine({ name: result.contactName }, call, said, env);
}
