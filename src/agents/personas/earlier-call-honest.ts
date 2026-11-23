/**
 * EARLIER_CALL_NO_DENIAL=on (default off): having no record of an earlier call
 * is not proof that it didn't happen.
 *
 * Prod 2026-10 (#3134): a caller on an unrecognised line hung up and called
 * back about 30 seconds later. Each unrecognised call gets a fresh `anon:` id
 * (user-identification-handler.ts), so the second call had nothing from the
 * first. When the caller said Ferni had told them something on that first
 * call, which he had, he denied it again and again ("I definitely didn't say
 * that", "I'm not lying"), and the caller said they couldn't trust him any
 * more. A member's earlier calls arrive only as a summary and recalled facts,
 * so the same gap is there for a known caller whose line isn't in them.
 *
 * Two parts, both off with the flag:
 * - earlierCallNote(): a block in the model-level instructions of every call
 *   Ferni answers, member or not (agent-setup.ts). It is the same text on every
 *   call, so it sits in the cached prefix. Example lines, since describing the
 *   move does little on the cascade model (#3764). The rule: no record is not a
 *   denial; neither deny nor pretend to remember; say so and ask. What is true
 *   of Ferni now (a boundary, what he is) still holds, whatever they say he said.
 * - earlierCallRuleFor(): a rule for the director and the deliberator, added to
 *   guardRuleFor (director-guard.ts), which every director and deliberator
 *   prompt carries. It forbids both directions: no note may push a denial, and
 *   none may push building on a call nobody can see ("build on the advice you
 *   gave last week"). The director's note on that call read "They are trying to
 *   trap you in a contradiction; stay firm and don't let them gaslight you",
 *   and Ferni's denials followed it. A word filter on notes was tried and
 *   missed every rewording it was probed with, while dropping helpful negated
 *   notes ("nobody here is trying to gaslight you"), so the rule is at the
 *   source instead.
 *
 * - noRecordWording(): the notes for a caller with no past calls said "this is
 *   your first call with them" (user-awareness.ts, returning-caller.ts via
 *   first-call-stranger.ts, personal-beats.ts, first-call-rapport.ts). They
 *   know there is no record, not that there was no call, and on dev they
 *   outweighed the block: "this really is our first time talking". With the
 *   flag on, each says there is no earlier call on record.
 * - helloWording() and claimsNoPast(): the hello (the stranger's direction and
 *   fact, FIRST_CALL_INTRO's direction) says "you don't know them yet" instead,
 *   since records words there could be spoken, and a hello line claiming no
 *   past is turned away.
 *
 * There is no grounded detector for "you told me last time", so the block is
 * always in the instructions rather than added on a matching turn.
 *
 * @module agents/personas/earlier-call-honest
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import type { Cast } from './director-cast.js';

export function earlierCallNoDenialEnabled(env: Env = process.env): boolean {
  return flagOn('EARLIER_CALL_NO_DENIAL', env);
}

export const EARLIER_CALL_HEADING = "## Earlier Calls You Can't See";

const NOTE = `
---

${EARLIER_CALL_HEADING}

You only know what you've been given here about earlier calls with this caller, and often that's nothing. Not having a record of something doesn't mean it didn't happen. If they say you told them something on an earlier call and it isn't in what you've been given, never deny it, never say they're mistaken or mixing you up, and never act like you remember it either. Say you don't have that call in front of you, ask what happened, then answer what they're asking now.
Never guess that there was no call either: don't say it's your first time talking, that you missed their call or that the line dropped, and never call yourself mixed up.
What's true of you now still holds, whatever they say you said before. If it's something you wouldn't say, say you can't see that call, then say what's true now.
They say: "It's me again, I called you ten minutes ago." You say: "I don't have that call here. What did we get into?"
They say: "You told me last week to quit." You say: "I don't have that call in front of me, so I can't say what I said. Tell me what happened?"
They say: "Last call you said you'd answer that." You say: "I can't see that call from here. Either way, that's still not something I'll get into."
`;

/**
 * The model-instructions block about earlier calls Ferni can't see, or '' with
 * the flag off or on a call he placed on someone's behalf: that person has
 * never spoken with him, and has their own block (outbound-opener.ts). A
 * family check-in keeps it: its recipient is the one most likely to say "last
 * week you said". `placed`: the call's outbound parties (outboundPartiesFor),
 * passed in so this module never loads the outbound call context.
 */
export function earlierCallNote(
  placed: { checkin?: boolean } | undefined,
  env: Env = process.env
): string {
  const onBehalf = placed !== undefined && !placed.checkin;
  return earlierCallNoDenialEnabled(env) && !onBehalf ? NOTE : '';
}

/** What a first call's in-call notes say with the flag on: no record, never "first call". */
export const NO_EARLIER_CALLS = 'You have no earlier calls with them on record';

/** A note that opens by calling this the first call. */
const FIRST_CALL_CLAIM = /^This is your first (?:call|conversation) with them\b/;
/** The name-swap note's idiom (first-call-rapport.ts), on every early reply while the name is unknown. */
const FIRST_CALL_IDIOM = 'the way people do on a first call';

/** An in-call note with the flag on: no earlier call on record, in place of a first call. Pure. */
export function noRecordWording(note: string, env: Env = process.env): string {
  if (!earlierCallNoDenialEnabled(env)) return note;
  return note
    .replace(FIRST_CALL_CLAIM, NO_EARLIER_CALLS)
    .replace(FIRST_CALL_IDIOM, 'the way people do when they meet');
}

/**
 * The hello is its own request and never sees the block above, so records words
 * there could be spoken ("I don't have any record of us talking"). It says only
 * what is true and sayable: you don't know them yet.
 */
export const DONT_KNOW_THEM_YET = "you don't know them yet";

/** The stranger hello's first-meeting clause (first-call-stranger.ts). */
export const FIRST_TALK_CLAUSE = ', and this is the first time you have ever talked';

/** First-meeting words in the hello directions, and what each says with the flag on. */
const HELLO_FIRST_MEETING: ReadonlyArray<readonly [string, string]> = [
  [FIRST_TALK_CLAUSE, `, and ${DONT_KNOW_THEM_YET}`],
  // firstCallIntroDirection (first-call-greeting.ts, FIRST_CALL_INTRO)
  [
    'This is your first call together and they may not know your voice yet',
    "You don't know them yet and they may not know your voice",
  ],
  [', the way a friend calling for the first time would', ''],
  [', since you have only just met', ''],
];

/** A hello direction with the flag on: "you don't know them yet", never a first meeting. Pure. */
export function helloWording(direction: string, env: Env = process.env): string {
  if (!earlierCallNoDenialEnabled(env)) return direction;
  return HELLO_FIRST_MEETING.reduce((text, [from, to]) => text.replace(from, to), direction);
}

/** A hello that says there is no past: no record of them, a first time, never talked before. */
const CLAIMS_NO_PAST =
  /\b(?:records?|on file|first (?:time|call|conversation)|(?:never|ever) (?:talked|spoken)|(?:just|only just) met)\b/i;

/** True with the flag on when a hello line claims there is no past with the caller. Pure. */
export function claimsNoPast(line: string, env: Env = process.env): boolean {
  return earlierCallNoDenialEnabled(env) && CLAIMS_NO_PAST.test(line.replace(/[‘’]/g, "'"));
}

/** The director's and deliberator's rule, with a leading space, or '' with the flag off. */
export function earlierCallRuleFor(c: Cast, env: Env = process.env): string {
  if (!earlierCallNoDenialEnabled(env)) return '';
  return ` A caller who says ${c.name} said something on an earlier call may be right: ${c.name} can't see earlier calls. Never call them lying, mistaken or out to trap ${c.p.object}, and never tell ${c.p.object} to deny it, stand firm against it, or act as if ${c.p.subject} ${c.p.subject === 'they' ? 'remember' : 'remembers'} it; what is true of ${c.name} now still holds.`;
}
