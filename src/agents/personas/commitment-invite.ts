/**
 * COMMITMENT_INVITE=on: once a call, when the caller has been working
 * something through and it is landing, Ferni asks the way a friend would if
 * there's one small thing they'll try before they talk again, with an easy
 * out. If they name one, the next reply says it back once, plainly. If they
 * floated one themselves on that turn ("I might text him this weekend"),
 * Ferni says it back instead of asking (asking then sounded scripted).
 *
 * Why: in 49 real calls (12 accounts, 2026-10) callers made almost no
 * commitments, so the follow-through that asks about them next time
 * (after-call-commitments.ts, commitment-follow-up.ts) had nothing to ask
 * about. Saying it back plainly gives the after-call extraction a clear quote,
 * with the day if they gave one.
 *
 * Fires on at most one reply a call, and only when all of these hold, read
 * from the words on the call (no model call of its own):
 *  - they have talked about a problem, decision or goal in two or more turns
 *    (venting alone never counts) and the call is past its first minutes;
 *    a first call needs longer, so there is some rapport first
 *  - this turn has them reaching clarity ("that makes sense", "maybe I
 *    could") or winding down ("anyway", "thanks for listening"), but is not
 *    the goodbye itself: asked as someone leaves, it holds them on the line
 *    (simulated calls, 2026-10-12), and happy-exits.ts lets them go
 *  - nothing heavy: no crisis guidance at any point on the call, no hard news
 *    on the call (turn-candor.ts), and this turn isn't venting or tender
 *  - they haven't already said what they'll do, and Ferni hasn't asked
 *
 * Off by default.
 *
 * @module agents/personas/commitment-invite
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { LEAVING } from '../shared/call-farewell.js';
import { sayingGoodbye } from './happy-exits.js';
import { hardNews } from './turn-candor.js';

/** Leaving, which the goodbye words miss: "I should probably head out" (call-farewell.ts). */
export { LEAVING };

const log = createLogger({ module: 'CommitmentInvite' });

export function commitmentInviteEnabled(env: Env = process.env): boolean {
  return flagOn('COMMITMENT_INVITE', env);
}

/** Caller turns before an invite can come: past the first minutes, longer on a first call. */
export const MIN_TURNS = 6;
export const MIN_TURNS_FIRST_CALL = 10;

/** Not "I should probably head out": that is leaving, not a goal. */
const STAY = '(?!(?:probably |really |just )?(?:go\\b|get going|head|hop|run\\b|let you))';

/** A problem, decision or goal of theirs. Whole words only. */
const WORKING = new RegExp(
  `\\b(?:${[
    "should i|whether (?:to|i)|can'?t decide|deciding|torn between|figure (?:it |this |that )?out|what to do",
    "not sure (?:if|whether|what|how|where|when)|(?:don'?t|do not) (?:even |really )?know (?:how|what|whether|if|where)",
    'no idea (?:how|what|where|whether)|no clue|clueless|where (?:to|do i|does \\w+|would i|should i) (?:even )?(?:start|begin)|how (?:do|would|should|can) i\\b|how to (?:start|bring|ask|tell|talk|deal|handle|approach|say|get)',
    `i(?: want| need|'d like| would like) to ${STAY}\\w+|i (?:should|need to) ${STAY}(?:probably |really )?\\w+`,
    "(?:been|keep|kept) (?:meaning to|putting (?:it |this |that )?off|avoiding|telling myself)|putting (?:it|this|that) off|procrastinat\\w*|can'?t bring myself",
    '(?:afraid|scared|terrified|nervous|worried) (?:of|to|that|about)|i (?:just )?worry|(?:freeze|froze|freezing) up|hate (?:confrontation|conflict)|keep (?:staring at|looking at|finding (?:anything|excuses|reasons))',
    'my goal|trying to (?:get|be|stop|start|quit|save|find|make|fix|stick|decide|figure|work out)|wish i could',
    "i can'?t (?:seem to|get myself|figure)|stuck|struggling (?:with|to)|the problem is|paralyz\\w*|back and forth|weighing|on the fence",
    "(?:i'?m |i was |been )?wondering (?:if|whether|why|what|how)|do i (?:just|need|even|have to)|i don'?t know if i (?:can|should)",
    'where do (?:\\w+ ){0,2}(?:even )?(?:put|start|begin|go)|i know what i (?:need|have|should) to do|(?:keep|kept) (?:drafting|rewriting|trying|going back)',
  ].join('|')})\\b`,
  'i'
);

/** They are getting somewhere ("that makes sense", "maybe I could just"). */
const CLARITY =
  /\b(?:that(?: makes sense| helps| helped| is (?:fair|true|helpful)|'s (?:fair|true|helpful|(?:a )?(?:good|great|fair) (?:idea|point|call)|actually (?:helpful|true|smart)))|makes sense|good point|fair enough|you'?re (?:so |totally |absolutely |probably )?right|i hadn'?t thought|feel (?:a (?:bit|little|lot) )?better|(?:i think|i guess|maybe) i(?:'ll| will| should| could| can| just| need to| know)|i could (?:just|probably|try)|i might (?:just |actually )?\w+|i know what (?:i|to))\b/i;

/** Tender or spent, which the venting words miss: "I just need to breathe". */
const TENDER =
  /\b(?:need(?:ed)? to (?:breathe|rest|process|sit with)|just (?:breathe|breathing)|needed (?:that|to hear (?:that|this))|means a lot|(?:so |really )?(?:drained|numb|spent)|crying|cried|tears|feeling things|sit (?:here )?(?:with|in) (?:it|this|the quiet)|in the quiet|so heavy|feels heavy)\b/i;

/** They said up front they don't want to plan anything. */
const NO_PLANS =
  /\b(?:not looking for (?:homework|advice|a plan|solutions)|don'?t want to (?:plan|fix|decide|solve|be (?:managed|coached))|(?:let'?s|can we) not (?:try to )?(?:fix|solve|unlock|plan|figure)|just (?:want|need) to (?:vent|sit|talk it out|think out loud)|no (?:homework|action items))\b/i;

/** Heavy news hardNews (turn-candor.ts) misses: "my brother passed". */
const LOSS = /\b(?:my|our|his|her) (?:\w+ ){0,2}(?:passed|is gone|went into hospice)\b/i;

/** The talk is winding down. */
export const WINDING =
  /\b(?:anyway|anyways|(?:alright|all right|okay|ok),? well|that'?s (?:all|it) (?:really|for now)|i think that'?s (?:it|all)|enough about me|thanks? (?:you )?for (?:listening|letting me|hearing me|talking)|i feel (?:a (?:bit|little|lot) )?better)\b/i;

/** A step's verb: any, but not a state, a feeling or call talk ("I'll be fine", "I'll talk to you"). */
const ACT =
  '(?:(?:just|finally|actually|definitely|probably|try (?:and|to)|go ahead and|go)\\s+)*(?!be\\b|have\\b|feel\\b|see\\b|think\\b|know\\b|need\\b|miss\\b|never\\b|not\\b|say\\b|imagine\\b|understand\\b|let you\\b|talk to you\\b|get going\\b|head\\b|survive\\b|live\\b)[a-z]+';

/** They floated a step of their own, not yet a promise ("I guess I could look through my files"). */
const FLOATED = new RegExp(
  `\\b(?:i (?:could|might)|maybe i(?:'ll| could| will| can| should)?|i guess i(?:'ll| could| can| should)|i think i(?:'ll| could| might| can))\\s+${ACT}`,
  'i'
);

/** They have already said what they'll do ("I'll aim for Thursday"). */
const COMMITTED = new RegExp(
  `(?<!\\b(?:maybe|guess|think) )\\b(?:i'?ll|i will|i'?m (?:going to|gonna)|(?<!\\b(?:not|never) )gonna)\\s+${ACT}`,
  'i'
);

/** Ferni already asked about a next step this call. */
const FERNI_ASKED = /\b(?:one|a) (?:small|little|tiny) (?:thing|step)\b|\bnext step\b/i;

export const INVITE_NOTE =
  "THIS REPLY, over any length or no-question line above: they've been working this through. In your own words, tied to what they just said, ask if there's one small thing they want to try before you talk again, easy to say no to; or, if it sounds more natural, just say back what you hear them leaning toward. Never name a step for them.";

/** Ways a friend asks, rotated per caller so no two calls sound the same. */
export const ASKS = [
  'Anything small you want to try before we talk again? Totally fine if not.',
  "So, is there a little something you're up for this week, or let it sit?",
  'What, if anything, do you feel like doing about it?',
  'Want to pick one tiny thing to try? Or not, honestly.',
  'Is there a first step you can feel, or is it too soon?',
  'Anything you want to do with that before next time, or nah?',
] as const;

/** Rotation seed: the caller and the turn, so the preemptive and final requests agree. */
export function inviteSeed(session: object, said: string): number {
  const data = (session as { userData?: { userId?: string } }).userData;
  let h = 0;
  for (const ch of `${data?.userId ?? ''}|${said}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** The invite note with two of ASKS as examples, never to be said word for word. */
export function inviteNote(seed: number): string {
  const a = ASKS[seed % ASKS.length];
  const b = ASKS[(seed + 1 + (seed % (ASKS.length - 1))) % ASKS.length];
  return `${INVITE_NOTE} The kind of thing, not the words: "${a}" / "${b}"`;
}

export const REFLECT_NOTE =
  "THIS REPLY: if they just named a small step, say back what and when in a few plain words of theirs, then move on (no cheering, no plan around it). If they passed, let it go lightly; don't bring it up again.";

/** When they floated a step themselves: no need to ask, just make it plainly theirs. */
export const NAMED_NOTE =
  "THIS REPLY: they just floated a small step of their own. Say it back once in a few plain words of theirs, with the day if they gave one; don't ask for another and don't add to it.";

export interface InviteInput {
  /** The caller's words this reply answers. */
  said: string;
  /** Every caller message on the call, oldest first, this one included. */
  callerTurns: readonly string[];
  /** What Ferni has said on the call. */
  ferniLines: readonly string[];
  /** This turn reads as venting, bad news or tender (turn-extras.ts). */
  careful: boolean;
  /** The model's reading that they are wrapping up (TURN_UNDERSTANDING). */
  wantsToEnd?: boolean;
  /** A known account on its first call (first-call-rapport.ts). */
  firstCall: boolean;
}

/** The call itself rules an invite out: too early, heavy, or nothing being worked through. */
function callRulesOut(i: InviteInput): string | undefined {
  if (i.callerTurns.length < (i.firstCall ? MIN_TURNS_FIRST_CALL : MIN_TURNS)) return 'early';
  if (i.callerTurns.some((t) => hardNews(t) || LOSS.test(t))) return 'heavy';
  if (i.callerTurns.filter((t) => WORKING.test(t)).length < 2) return 'not-working';
  return undefined;
}

/** Nothing to ask: they don't want to plan, already promised, already floated one, or were asked. */
function alreadySettled(i: InviteInput): string | undefined {
  if (i.callerTurns.some((t) => NO_PLANS.test(t))) return 'no-plans';
  if (i.callerTurns.some((t) => COMMITTED.test(t))) return 'committed';
  // A step they floated before this turn: asking now would be asking again.
  if (i.callerTurns.slice(0, -1).some((t) => FLOATED.test(t))) return 'floated';
  if (i.ferniLines.some((t) => FERNI_ASKED.test(t))) return 'asked';
  return undefined;
}

/** Why an invite does or doesn't fit this turn (for the log and the tests). */
export function inviteFits(i: InviteInput): string | true {
  if (i.careful || TENDER.test(i.said)) return 'careful';
  if (sayingGoodbye(i.said) || LEAVING.test(i.said) || i.wantsToEnd === true) return 'goodbye';
  const ruledOut = callRulesOut(i);
  if (ruledOut) return ruledOut;
  if (!CLARITY.test(i.said) && !WINDING.test(i.said)) return 'not-landing';
  return alreadySettled(i) ?? true;
}

type Phase = 'waiting' | 'invited' | 'named' | 'reflecting' | 'done';
interface CallState {
  phase: Phase;
  /** The turn the note was given on (the preemptive and final requests are one turn). */
  said: string;
  /** This turn's note, and the rotation seed of an invite (the reply check reads it). */
  note?: string;
  seed?: number;
}
const calls = new WeakMap<object, CallState>();

const sameTurn = (a: string, b: string): boolean => a.startsWith(b) || b.startsWith(a);

/** A crisis turn closes the call to invites (crisis-gate.ts). */
export function holdCommitmentInvite(session: object): void {
  calls.set(session, { phase: 'done', said: '' });
}

/** The rotation seed when this reply is the invite turn, else undefined (commitment-invite-reply.ts). */
export function inviteTurnSeed(session: object): number | undefined {
  const st = calls.get(session);
  return st?.phase === 'invited' ? st.seed : undefined;
}

/** A new turn after the note: the say-it-back after an invite (unless it turned heavy), then nothing. */
function nextTurn(st: CallState, said: string, careful: boolean): string {
  if (st.phase !== 'invited' || careful) {
    st.phase = 'done';
    return '';
  }
  Object.assign(st, { phase: 'reflecting', said, note: REFLECT_NOTE });
  log.info({ fired: 'reflect' }, 'COMMITMENT_INVITE');
  return REFLECT_NOTE;
}

/**
 * The note for this reply: the invite on the one turn it fits, the say-it-back
 * on the turn after, otherwise ''. `crisis` is a reply with crisis guidance.
 */
export function commitmentInviteNote(
  session: object,
  input: InviteInput,
  options: { crisis?: boolean; env?: Env } = {}
): string {
  if (!input.said || !commitmentInviteEnabled(options.env)) return '';
  if (options.crisis) {
    holdCommitmentInvite(session);
    return '';
  }
  const said = input.said.trim();
  const st = calls.get(session) ?? { phase: 'waiting', said: '' };
  calls.set(session, st);
  if (st.phase !== 'waiting' && sameTurn(said, st.said)) {
    st.said = said.length > st.said.length ? said : st.said;
    return st.note ?? '';
  }
  if (st.phase !== 'waiting') return nextTurn(st, said, input.careful);
  const fits = inviteFits(input);
  if (fits !== true) return '';
  const seed = inviteSeed(session, said);
  const named = FLOATED.test(said);
  const note = named ? NAMED_NOTE : inviteNote(seed);
  Object.assign(st, { phase: named ? 'named' : 'invited', said, note, seed });
  log.info({ fired: st.phase, turns: input.callerTurns.length }, 'COMMITMENT_INVITE');
  return note;
}
