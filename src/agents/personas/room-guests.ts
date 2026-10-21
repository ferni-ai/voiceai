/**
 * ROOM_GUESTS=on: when the caller says someone else is in the room ("I'm with
 * my friend David"), Ferni stops assuming every line is the account owner.
 *
 * Prod, 2026-10-12: Seth called with his friend David on one mic. All speech
 * arrives as one caller, and the model is told "You're talking to Seth" for the
 * whole call, so it called David Seth and Seth David, and answered David's
 * "did you figure out how to summarize the important things for Seth?" with
 * "Mine's still unopened", as if Seth's mail were its own.
 *
 * This knows who is present, not who is speaking (that needs per-turn voice
 * tags). While a guest is in the room:
 * - each reply gets a note: any line could be either person, don't name the
 *   one you're answering unless it's clear, ask lightly when it matters, and
 *   questions about the owner's tasks are about the owner;
 * - a spoken "yes" doesn't confirm a text or call (live-call-behaviors.ts);
 * - "I'm David" doesn't rename the owner (name-correction.ts).
 *
 * Detection is narrow, like name-correction's: a capitalised name after a
 * whole-word cue, never the owner's name or a teammate's.
 *
 * @module agents/personas/room-guests
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'RoomGuests' });

export function roomGuestsEnabled(env: Env = process.env): boolean {
  return flagOn('ROOM_GUESTS', env);
}

const NAME = String.raw`(\p{L}+(?:-\p{L}+)?)`;
const CAPITALISED = /^\p{Lu}\p{Ll}+(?:-\p{Lu}\p{Ll}+)?$/u;
const REL = String.raw`(?:friend|buddy|pal|wife|husband|partner|girlfriend|boyfriend|mom|mum|mother|dad|father|brother|sister|son|daughter|kid|cousin|colleague|coworker|co-worker|neighbou?r|roommate|boss|uncle|aunt|grandma|grandpa)`;

/** Cues that bring a named guest in. */
const ARRIVE = [
  // "I'm with my friend David", "we're here with David"
  String.raw`\b(?:i['’]?m|i am|we['’]?re|we are)\s+(?:here\s+)?with\s+(?:my\s+|our\s+)?(?:${REL}\s+)?${NAME}`,
  // "my friend David is here"
  String.raw`\bmy\s+${REL}\s+${NAME}\s+is\s+(?:here|right here|with me|with us|in the room)\b`,
  // "David is here with me", "David is in the room"
  String.raw`\b${NAME}\s+is\s+(?:here with (?:me|us)|with me|with us|in the room|sitting (?:here|with me))\b`,
  // "this is Seth's friend David", "this is my friend David"
  String.raw`\bthis is\s+(?:\p{L}+['’]s\s+|my\s+)${REL}\s+${NAME}`,
  // "that was David talking"
  String.raw`\bthat was\s+${NAME}\s+(?:talking|speaking|asking)\b`,
].map((src) => new RegExp(src, 'giu'));

/** "I'm with a friend", "someone's here with me": a guest with no name yet. */
const UNNAMED = new RegExp(
  String.raw`\b(?:(?:i['’]?m|i am|we['’]?re)\s+(?:here\s+)?with\s+(?:a|my|some)\s+${REL}s?\b|some(?:one|body)(?:\s+is|['’]s)\s+(?:here\s+)?with me\b)`,
  'iu'
);
/** "David left", "David went home", "David's gone". */
const LEAVE = new RegExp(
  String.raw`\b${NAME}\s+(?:left|just left|went home|had to go|is gone|['’]s gone)\b`,
  'giu'
);

const NOT_NAMES = new Set(
  'i me my here there home back just really also still now not so the a an you he she they we it someone somebody ferni maya peter alex jordan nayan'.split(
    ' '
  )
);

const isGuestName = (name: string, owner: string | undefined): boolean =>
  CAPITALISED.test(name) &&
  !NOT_NAMES.has(name.toLowerCase()) &&
  name.toLowerCase() !== owner?.split(/\s+/)[0]?.toLowerCase();

/** The guests these words bring in and send off. `unnamed` when a guest is mentioned without a name. */
export function guestChanges(
  words: string,
  owner?: string
): { arrived: string[]; left: string[]; unnamed: boolean } {
  const arrived = new Set<string>();
  for (const cue of ARRIVE) {
    for (const m of words.matchAll(cue)) if (isGuestName(m[1], owner)) arrived.add(m[1]);
  }
  const left = [...words.matchAll(LEAVE)].map((m) => m[1]).filter((n) => isGuestName(n, owner));
  return { arrived: [...arrived], left, unnamed: arrived.size === 0 && UNNAMED.test(words) };
}

/** Unnamed guests are kept as ''. */
const rooms = new Map<string, Set<string>>();
const MAX_ROOMS = 500;

export function hasGuests(sessionId: string | undefined): boolean {
  return !!sessionId && (rooms.get(sessionId)?.size ?? 0) > 0;
}

/** Updates the room from the caller's words. Returns the guests now present. */
export function updateRoom(sessionId: string, words: string, owner?: string): string[] {
  const { arrived, left, unnamed } = guestChanges(words, owner);
  const room = rooms.get(sessionId) ?? new Set<string>();
  const before = room.size;
  for (const name of arrived) room.add(name);
  if (arrived.length > 0) room.delete('');
  else if (unnamed) room.add('');
  for (const name of left) room.delete(name);
  if (room.size > 0) {
    if (!rooms.has(sessionId) && rooms.size >= MAX_ROOMS) {
      const oldest = rooms.keys().next().value;
      if (oldest !== undefined) rooms.delete(oldest);
    }
    rooms.set(sessionId, room);
  } else rooms.delete(sessionId);
  if (room.size !== before) log.info({ sessionId, guests: room.size }, 'ROOM_GUESTS');
  return [...room];
}

/** Whether ROOM_GUESTS is on and someone besides the owner is in this session's room. */
export function guestsPresent(session: object, env: Env = process.env): boolean {
  return roomGuestsEnabled(env) && hasGuests(sessionIdOf(session));
}

export function forgetRoom(sessionId: string): void {
  rooms.delete(sessionId);
}

/**
 * The note for a reply while guests are present. No em dashes or ellipses (speech-markup-notes).
 * `scriptFree` (SCRIPT_FREE_REMINDER, script-free.ts): no quoted question to ask.
 */
export function roomNote(guests: readonly string[], owner = 'they', scriptFree = false): string {
  const named = guests.filter(Boolean);
  const who = named.length > 0 ? named.join(' and ') : 'someone else';
  const verb = named.length > 1 ? 'are' : 'is';
  const example = named[0] ? `"was that you, ${named[0]}?"` : '"who was that?"';
  return (
    `${owner} isn't alone: ${who} ${verb} in the room on the same mic, so any line could be from either of them. ` +
    `Don't assume it's ${owner}, and don't name who you're answering unless the line makes it clear. ` +
    `If it matters who said it, ask lightly${scriptFree ? '' : `, like ${example}`}. ` +
    `Questions about ${owner}'s mail, plans or tasks are about what you do for ${owner}, never about your own life.`
  );
}

interface SessionUser {
  userName?: string;
  services?: { sessionId?: string };
}

/** The sessionId of this AgentSession, if known. */
export function sessionIdOf(session: object): string | undefined {
  return (session as { userData?: SessionUser }).userData?.services?.sessionId;
}

/**
 * The room note for this reply, or ''. Updates the room from the caller's
 * words first. Idempotent across the preemptive and final requests of a turn.
 */
export function roomGuestsNote(
  session: object,
  callerWords: string,
  env: Env = process.env,
  scriptFree = false
): string {
  if (!roomGuestsEnabled(env)) return '';
  const user = (session as { userData?: SessionUser }).userData;
  const sessionId = user?.services?.sessionId;
  if (!sessionId) return '';
  const guests = callerWords
    ? updateRoom(sessionId, callerWords, user?.userName)
    : [...(rooms.get(sessionId) ?? [])];
  const first = user?.userName?.split(/\s+/)[0];
  return guests.length > 0 ? roomNote(guests, first, scriptFree) : '';
}
