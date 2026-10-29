/**
 * Ferni never tells how a call he made went when nothing says it happened.
 *
 * Owner call 2026-10-18: Ferni opened on "how did that phone call with your mom
 * go?", the caller said "pretty good", and Ferni went on "we ended up talking
 * for nearly an hour". The call was still held for a better hour and had never
 * rung. The claim check (action-claims.ts) reads claims that a call is placed
 * or under way; this reads the next step, a story of how it went: "we talked
 * for an hour", "she told me…", "she said to tell you hi", "it rang out",
 * "nobody picked up", and "it went great" when the caller asked about the call.
 *
 * Such a sentence is dropped (action-claim-guard.ts) only when all hold:
 * - a call Ferni made or was asked to make is in play: a call tool ran on this
 *   call, a recent line talks about a call with or to someone, or the caller
 *   asks about one ("how did it go with my dad?", "did you reach Fred?");
 * - no call result reached this conversation (a "Reported from Ferni's call"
 *   block, pending-call-results.ts), and when the caller asked about someone,
 *   their requested call (call-status.ts) has no completed result either;
 * - the caller isn't telling their own call ("I called her and we talked"):
 *   then Ferni is echoing them, which stands.
 *
 * Dev replay 2026-10-18: in a new call, asked "how did it go with my dad?",
 * Ferni said he had called, the dad was watching a game and "did say to tell
 * you he's fine". The call had been requested on an earlier call and no result
 * existed. The honest line now says where that call stands instead.
 *
 * With GROUNDED_CLAIMS=on (#3005, prod 2026-10-28): asked "did you call my
 * mom?", Ferni said "I did, yeah. I called her earlier and let her know..." of
 * a call that never happened. A completed call to her three days before made
 * the records lookup say 'completed', which let the story stand, though the
 * model never saw that result. Now only a result in the conversation lets a
 * story (or a plain "yes, I did") stand; the lookup only picks the honest line,
 * and what the reply then says she said or how she sounded goes with the story.
 * A call result in the conversation backs a claim of it, person by person
 * (claim-evidence.ts): never deny a real call, never borrow one for someone else.
 *
 * @module agents/personas/call-narration
 */

import {
  personWord,
  requestedCallStatus,
  type CallRecords,
  type FerniCall,
} from '../../services/outreach/call-status.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import type { ClaimEvidence } from './claim-evidence.js';

/** What Ferni says in place of a story about a call no result has come back from. */
export const UNHEARD_LINE = "I don't actually know how that call went yet, I haven't heard back.";
/** GROUNDED_CLAIMS: in place of a story of a call no tool ran for and no record shows. */
export const NO_RECORD_LINE = "I don't have a record of that call in front of me.";
/** In place of a story with no asked-about status: with `grounded` and no call run, no record either. */
export const unheardLine = (grounded: boolean, callRan: boolean): string =>
  grounded && !callRan ? NO_RECORD_LINE : UNHEARD_LINE;

/** Where an asked-about call stands: from call-status.ts, or 'none' when no call to them is on record. */
export type AskedCallStatus = FerniCall | 'none';

const WHO = '(?:[Ss]he|[Hh]e|[Tt]hey|[Yy]our (?:\\w+ )?\\w+|[A-Z][a-z]+)';
/** Who Ferni reached: a pronoun, "your dad", or a name (case matters: names are capitalised). */
const REACHED = '(?:her|him|them|[Yy]our (?:\\w+ )?\\w+|[A-Z][a-z]+)';
/** Ferni's own story of how a call went, read on the whole sentence. */
const TOLD = [
  /\bwe (?:ended up |just |actually |really )?(?:talked|talking|chatted|chatting|spoke|caught up)\b/i,
  // "I called Fred", "I talked to your dad", "I finally reached him".
  new RegExp(
    `\\b[Ii] (?:just |finally |actually )?(?:called|rang|phoned|reached|got through to|got (?:a ?hold|ahold) of|(?:talked|chatted|spoke|caught up) (?:to|with)) ${REACHED}\\b`
  ),
  new RegExp(
    `\\b${WHO} (?:told me|said to me|asked me|thanked me|(?:did |also )?(?:said|says|say) to tell you|wanted me to tell you|says hi|said hi)\\b`
  ),
  // "He said he's fine", "Fred says she was out" (never "It says it's sunny").
  new RegExp(
    `\\b(?!It\\b|That\\b|This\\b|The\\b)${WHO} (?:said|says|mentioned) (?:that )?(?:he|she|they|it)(?:'s|'re|'ll| is| are| was| were| has| had| will)\\b`
  ),
  /\b(?:loved|was (?:so )?(?:happy|glad|thrilled) about) hearing from (?:me|us)\b/i,
  /\b(?:it|the call|the phone|her phone|his phone) (?:just )?(?:rang out|went (?:straight )?to voicemail)\b/i,
  /\b(?:no ?one|nobody) (?:picked up|answered)\b/i,
];
/** "It went great": a story only when the caller just asked how the call went. */
const WENT =
  /^(?:\W*(?:oh|so|yeah|well|honestly)\W+)*(?:it|the call|that call) went (?:really |so )?(?:great|well|fine|good|amazing|wonderfully|lovely)\b/i;
/** "I did, yeah." or "Yes." to "did you call my mom?": the call happened (GROUNDED_CLAIMS). */
const SAID_YES =
  /^(?:\W*(?:oh|so|well|yes|yeah|yep|yup|mm-?hm+|mhm|uh-huh|of course)\W+)*(?:i (?:sure |already |actually )?did\b(?!n't| not)|i (?:already )?have\W*$|i(?:'ve| have) (?:already |just )?(?:called|rung|phoned|reached)\b|(?:got|reached|caught) (?:him|her|them)\b|(?:yes|yeah|yep|yup|mm-?hm+|mhm|uh-huh)\W*$)/i;
/** After a dropped story: the other person's words or how they were ("She sounded great."). */
const CALLEE_TALK =
  /^\W*(?:and |so |but )?(?:she|he|they|(?!It\b|That\b|This\b|There\b|The\b|What\b)[A-Z][a-z]+)(?:'s| is| was| were| sounded| seemed| says| said| sends?| told| asked| misses| missed| loved| wants| wanted| mentioned| thanked| laughed)\b/i;
const ASKED_HOW =
  /\bhow(?:'d| did) (?:it|the|that)\b[^.?!]{0,40}\bgo\b|\bdid you (?:call|reach|talk to)\b/i;

/** A recent line about a call with or to someone ("that phone call with your mom"). */
const CALL_TALK =
  /\bphone call\b|\bcall (?:with|to) (?:your|her|him|them|my)\b|\bcall(?:ed|ing)? (?:your|my) \w+|\bhow(?:'d| did) (?:the|that) call\b/i;
/** The caller's own call: "I called my mom", "we talked for an hour", "she didn't pick up". */
const OWN_CALL =
  /\b(?:i|we) (?:called|rang|phoned|talked|spoke|chatted|caught up|facetimed)\b|\b(?:she|he|they) (?:said|told me|picked up|answered|didn't (?:pick up|answer))\b|\bwent (?:great|well|fine|good)\b/i;
const REPORTED = /\bReported from Ferni's call\b/;
/**
 * callStatus (telephony/call-status-tool.ts, also told by callOnBehalf) found the call's result: Ferni
 * called (or tried), so telling how it went stands. Owner call 2026-10-26 18:46: asked about an
 * answered call, Ferni said it didn't "know how that call went yet".
 */
const toldByStatus = (item: Item & { output?: unknown }): boolean =>
  item.type === 'function_call_output' &&
  (item.name === 'callStatus' || item.name === 'callOnBehalf') &&
  /(?:^|\. )Ferni (?:called|tried to call) /.test(String(item.output ?? ''));
/** The caller asks Ferni about a call he was asked to make; the group names the person, if any. */
const ASKED_ABOUT = [
  /\bhow(?:'d| did| was) (?:it|things|that|the call|your call) go(?:ing)? with (?:my |the |your )?([a-z]+)/i,
  /\bhow(?:'d| did) (?:the |that |your )?call (?:with|to) (?:my |the |your )?([a-z]+)/i,
  /\bdid you (?:ever |get to |manage to )?(?:call|ring|phone|reach|get (?:a ?hold|ahold) of|get through to|talk to|speak (?:to|with)) (?:my |the )?([a-z]+)/i,
  /\bwhat did (?:my |the )?([a-z]+) (?:say|tell you)\b/i,
  /\bdid (?:my |the )?([a-z]+) (?:pick up|answer)\b/i,
];

const PRONOUN = /^(?:he|she|they|him|her|them)$/i;

/** GROUNDED_CLAIMS: "have you called my mom?" asks about the call too (#3037 verify, B01). */
const ASKED_HAVE =
  /\bhave you (?:already |ever |actually )?(?:called|rung|phoned|reached|talked to|spoken (?:to|with)|gotten (?:a ?hold|ahold) of|gotten through to) (?:my |the )?([a-z]+)/i;

/** The caller asks about a call Ferni was to make: null, or the person (when named, not a pronoun). */
export function callAskedAbout(words: string, grounded = false): { person?: string } | null {
  const text = words.replace(/[‘’]/g, "'");
  for (const re of grounded ? [...ASKED_ABOUT, ASKED_HAVE] : ASKED_ABOUT) {
    const m = re.exec(text);
    if (!m || m[1].toLowerCase() === 'you') continue;
    const person = PRONOUN.test(m[1]) ? null : personWord(m[1]);
    return person ? { person } : {};
  }
  return null;
}

/** How long the reply waits for the asked-about call's status; past it, no result is known. */
const ASKED_LOOKUP_MS = 1200;

/**
 * Where the call the caller just asked about by name stands (requestedCallStatus,
 * #1955's records), or undefined when they didn't ask about one. Started before
 * the reply's first words are awaited, so it runs alongside the model.
 */
export function askedCallLookup(
  callerWords: string,
  userId: string | undefined,
  records: CallRecords,
  grounded = false
): Promise<AskedCallStatus> | undefined {
  const person = callAskedAbout(callerWords, grounded)?.person;
  if (!person || !isMemberIdentity(userId)) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<AskedCallStatus>((resolve) => {
    timer = setTimeout(() => resolve('none'), ASKED_LOOKUP_MS);
  });
  const status = requestedCallStatus(userId, person, Date.now(), records);
  return Promise.race([status, late]).finally(() => clearTimeout(timer));
}

/** What Ferni says, honestly, about an asked-about call that has no completed result. */
export function askedCallLine(status: AskedCallStatus): string {
  if (status === 'none') return "I don't have a result for that call.";
  if (status.state === 'held') {
    return status.when
      ? `I haven't made that call yet. It's set for ${status.when} their time.`
      : "I haven't made that call yet. It's held for a better time.";
  }
  if (status.state === 'failed')
    return "That call didn't get through, so I haven't heard anything.";
  // Only with GROUNDED_CLAIMS: a completed result the conversation never showed.
  if (status.state === 'completed')
    return "I did get through, but I don't have the details of that call in front of me.";
  return UNHEARD_LINE;
}

interface Item {
  type?: string;
  role?: string;
  name?: string;
  textContent?: string;
  content?: unknown;
}

const textOf = (item: Item): string => {
  const text =
    item.textContent ??
    (Array.isArray(item.content)
      ? item.content.filter((part): part is string => typeof part === 'string').join(' ')
      : '');
  return text.replace(/[‘’]/g, "'");
};
/** The spoken line only: a per-turn reminder rides after a blank line (turn-style.ts). */
const spoken = (item: Item): string => {
  const first = textOf(item).split('\n')[0].trim();
  return first.startsWith(TURN_CONTEXT_HEADER) ? '' : first;
};

/**
 * Whether a story of how a call went must be dropped in this reply: a call is in
 * play, no result reached the conversation, and the caller isn't telling their own.
 * `asked` is where the call the caller just asked about stands, when it was looked up;
 * a completed one lets the story stand only without `evidence`. With `evidence` (GROUNDED_CLAIMS), a
 * story stands only when a result for the people it names came back (claim-evidence.ts).
 */
export function callOutcomeUnheard(
  chatCtx: { items: readonly unknown[] },
  callToolRan: boolean,
  asked?: AskedCallStatus,
  evidence?: ClaimEvidence
): Unheard | null {
  const items = chatCtx.items as readonly Item[];
  const grounded = evidence !== undefined;
  if (!grounded && callResultIn(items)) return null;
  const completed = asked !== undefined && asked !== 'none' && asked.state === 'completed';
  if (completed && !grounded) return null;
  const lines = items.filter((item) => item.type === 'message' && item.role !== 'system');
  const recent = lines.slice(-4).map(spoken);
  const caller = lines
    .filter((item) => item.role === 'user')
    .slice(-3)
    .map(spoken);
  const askedAbout = callAskedAbout(caller.at(-1) ?? '', grounded) !== null;
  if (!callToolRan && !askedAbout && !recent.some((line) => CALL_TALK.test(line))) return null;
  if (caller.some((line) => OWN_CALL.test(line))) return null;
  const callerAsked = askedAbout || ASKED_HOW.test(caller.at(-1) ?? '');
  const askedHow = callerAsked || ASKED_HOW.test(recent.join(' '));
  // A bare "Yeah." answers the caller's own "did you call her?", not Ferni's question to them.
  const yesTold = grounded && callerAsked;
  let dropped = false; // a story was dropped in this reply
  const tells = (sentence: string): boolean => {
    // GROUNDED_CLAIMS: a result that came back for the people it names lets the story stand.
    const story = narratesCallOutcome(sentence, askedHow, yesTold) && !evidence?.told(sentence);
    dropped ||= story;
    return story || (grounded && dropped && CALLEE_TALK.test(sentence.trim()));
  };
  return { askedHow, asked, yesTold, tells };
}

/** Where a story of an unheard call stands in one reply (callOutcomeUnheard). */
export interface Unheard {
  askedHow: boolean;
  asked?: AskedCallStatus;
  yesTold: boolean;
  /** This sentence tells the unheard call (with GROUNDED_CLAIMS, so does what follows a dropped one). */
  tells: (sentence: string) => boolean;
}

/** A call result in the conversation: a report from Ferni's call, or callStatus saying he called. */
const callResultIn = (items: readonly Item[]): boolean =>
  items.some((item) => REPORTED.test(textOf(item)) || toldByStatus(item));

/** One sentence that tells how a call went, as if Ferni knew; with `yesTold`, a "yes, I did" too. */
export function narratesCallOutcome(sentence: string, askedHow: boolean, yesTold = false): boolean {
  const text = sentence.replace(/[‘’]/g, "'").trim();
  if (text.includes('?')) return false;
  const answered = WENT.test(text) || (yesTold && SAID_YES.test(text));
  return TOLD.some((re) => re.test(text)) || (askedHow && answered);
}
