/**
 * NAME_CORRECTION=on: when the caller says their own name ("I'm Jess",
 * "call me Jess", "it's Jess actually"), Ferni uses it from then on, and it
 * becomes their preferred name for the next call.
 *
 * First-call eval (2026-10-11): the account said Sam, the caller said "I'm
 * Jess". Ferni kept calling her Sam, and on the next call said "I know Jess
 * is…" as if Jess were someone else. The model-level instructions name the
 * account ("You're talking to Sam", agent-setup.ts) for the whole call, and
 * nothing changed the profile, so Sam won every time.
 *
 * Detection is deliberately narrow: a name is a capitalised word right after
 * "I'm" / "my name is" / "call me" / "I go by", or after "it's" only when
 * Ferni's last line used the account name or asked for theirs. Not a name:
 * "I'm tired", "I'm Jewish", "I'm Jess's mom", or someone speaking for the
 * account holder ("I'm Jess, Sam's wife"). Calls Ferni places for a user
 * (outbound-opener.ts) are skipped: the person on the line isn't the account.
 * The account (profile.preferredName, in Firestore and in the in-memory
 * profile the end-of-call save writes) changes only on an affirmative owner
 * signal: sessionIsVerifiedOwner (caller-recognition.ts: a signed-in app
 * dispatch or a signed caller attestation, never a number lookup, a model or
 * tool argument), passed in by turn-request.ts. Anyone else is renamed for
 * this call only. Still possible: someone else talking on a verified owner's
 * session (on speaker) who says "I'm X" without naming whose phone it is.
 *
 * @module agents/personas/name-correction
 */

import type { llm } from '@livekit/agents';

import { flagOn, type Env } from '../../config/env-flag.js';
import { runBackground } from '../../utils/background-task.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  acceptsSpokenName,
  extractCallerName,
  nameCaptureStrict,
} from '../../utils/caller-name.js';
import { outboundPartiesFor } from '../shared/outbound-opener.js';
import { guestsPresent } from './room-guests.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';

const log = createLogger({ module: 'NameCorrection' });

export function nameCorrectionEnabled(env: Env = process.env): boolean {
  return flagOn('NAME_CORRECTION', env);
}

// The cues match in any case; whether the word is capitalised is checked apart
// (with the i flag, \p{Lu} would match lower case too).
const NAME = String.raw`(\p{L}+(?:-\p{L}+)?)`;
const CAPITALISED = /^\p{Lu}\p{Ll}+(?:-\p{Lu}\p{Ll}+)?$/u;
/** "I'm Jess", "my name is Jess", "call me Jess", "I go by Jess" (optionally "actually"/"just"). */
const SELF_CUE = new RegExp(
  String.raw`\b(?:i['’]?m|i am|my name['’]?s|my name is|call me|i go by)\s+(?:actually\s+|just\s+)?${NAME}`,
  'giu'
);
/** "it's Jess (actually)", "it's actually Jess": only as an answer to a name. */
const ITS_CUE = new RegExp(String.raw`\b(?:it['’]?s|it is)\s+(?:actually\s+)?${NAME}`, 'giu');

/** Capitalised words that follow "I'm" without being a name. */
const NOT_NAMES = new Set(
  (
    'i ok okay not so just sorry good fine great well here back home still really very sure glad ' +
    'happy tired actually also doing ready done calling trying looking from in at on with the a an ' +
    'monday tuesday wednesday thursday friday saturday sunday january february march april may june ' +
    'july august september october november december american canadian british english irish ' +
    'scottish mexican spanish french german italian indian chinese japanese korean asian black white ' +
    'latino latina jewish catholic christian muslim buddhist hindu mormon gay straight trans ' +
    'ferni maya peter alex jordan nayan'
  ).split(' ')
);

/** Speaking for the account holder, not as them. */
const FOR_SOMEONE_ELSE =
  /\b(?:his|her|their)\s+(?:wife|husband|partner|mom|mum|mother|dad|father|son|daughter|sister|brother|friend|kid|boss|assistant)\b|\bcalling (?:for|about|on behalf of)\b/i;

function possessiveAfter(words: string, end: number): boolean {
  return /^['’]s?\b|^['’](?=\s)/.test(words.slice(end));
}

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** "Sam" in "Sam's" or "Sam" (possessive or not), as a word. */
const mentions = (text: string, name: string, suffix = ''): boolean =>
  new RegExp(`(?:^|[^\\p{L}])${escaped(name)}${suffix}(?![\\p{L}])`, 'iu').test(text);

/** NAME_CAPTURE_STRICT=on: the shared check (utils/caller-name.ts: its stopwords and the team roster). */
const notAName = (name: string): boolean =>
  nameCaptureStrict() ? !acceptsSpokenName(name) : NOT_NAMES.has(name.toLowerCase());

function firstName(words: string, cue: RegExp, current: string | undefined): string | null {
  for (const m of words.matchAll(cue)) {
    const name = m[1];
    if (!CAPITALISED.test(name) || notAName(name)) continue;
    if (possessiveAfter(words, (m.index ?? 0) + m[0].length)) continue;
    if (current && mentions(words, current, "['’]s")) return null;
    if (FOR_SOMEONE_ELSE.test(words)) return null;
    return name;
  }
  return null;
}

/** NAME_CAPTURE_STRICT=on: the shared extractor, and never while naming the account holder ("I'm Jess, Sam's wife"). */
const strictOwnName = (words: string, current: string | undefined): string | null =>
  current && mentions(words, current, "['’]s") ? null : extractCallerName(words);

/**
 * The name the caller just gave as their own, or null. `current` is the name
 * Ferni has for them; `agentLast` is Ferni's last line (for "it's Jess").
 */
export function statedName(words: string, current?: string, agentLast = ''): string | null {
  const own = nameCaptureStrict()
    ? strictOwnName(words, current)
    : firstName(words, SELF_CUE, current);
  if (own) return own;
  const usedName = !!current && mentions(agentLast, current);
  const askedName = /\b(your name|call you|who(?:'s| is) this|who am i talking to)\b/i.test(
    agentLast
  );
  return usedName || askedName ? firstName(words, ITS_CUE, current) : null;
}

export const nameNote = (name: string, was?: string): string =>
  was
    ? `They told you their name is ${name}, not ${was}; ${name} is them, not someone else.`
    : `They told you their name is ${name}; ${name} is them, not someone else.`;

interface Corrected {
  name: string;
  was?: string;
}
const corrected = new WeakMap<object, Corrected>();

interface SessionUser {
  userId?: string;
  userName?: string;
  services?: { sessionId?: string; userProfile?: { preferredName?: string } | null };
}

export interface NameCorrectionDeps {
  /** Writes profile.preferredName (default: an atomic Firestore update). */
  persist?: (userId: string, name: string) => Promise<void>;
  /** Whether this session is the proven account owner; none means no profile write. */
  verifiedOwner?: (sessionId: string) => boolean;
  outbound?: (sessionId: string) => boolean;
}

async function persistPreferredName(userId: string, name: string): Promise<void> {
  const { getFirestoreStore } = await import('../../memory/firestore-store.js');
  await getFirestoreStore().atomicProfileUpdate(userId, (p) => ({ ...p, preferredName: name }));
}

function lastAgentLine(chatCtx: llm.ChatContext): string {
  for (let i = chatCtx.items.length - 1; i >= 0; i--) {
    const item = chatCtx.items[i];
    if (item.type === 'message' && item.role === 'assistant') return item.textContent ?? '';
  }
  return '';
}

const outboundOf = (deps: NameCorrectionDeps): ((sessionId: string) => boolean) =>
  deps.outbound ?? ((id: string) => outboundPartiesFor(id) !== undefined);

/**
 * Whether the account may keep the name: only on an affirmative owner signal
 * for this session (a signed-in app session or a signed caller attestation,
 * from turn-request.ts), never on a call Ferni placed for someone, and never
 * without an account. Undefined or anything but true is no.
 */
function ownerMayKeep(user: SessionUser, deps: NameCorrectionDeps): boolean {
  const { userId, services } = user;
  const sessionId = services?.sessionId;
  if (!isMemberIdentity(userId) || !sessionId) return false;
  return deps.verifiedOwner?.(sessionId) === true && !outboundOf(deps)(sessionId);
}

/**
 * Renames the caller for the rest of the call (session only) and, when the
 * account owner is proven to be the one on the line, on the account.
 */
function rename(user: SessionUser, name: string, deps: NameCorrectionDeps): void {
  user.userName = name;
  if (!ownerMayKeep(user, deps)) return;
  // The end-of-call save writes the in-memory profile, so it changes only
  // for the owner too, and the save then keeps the name instead of the old one.
  if (user.services?.userProfile) user.services.userProfile.preferredName = name;
  const userId = user.userId as string;
  const sessionId = user.services?.sessionId as string;
  runBackground((deps.persist ?? persistPreferredName)(userId, name), {
    task: 'name-correction-persist',
    sessionId,
  });
}

/** The caller of this session, or null on a call Ferni placed for the user (someone else is on the line). */
function callerOn(session: object, deps: NameCorrectionDeps): SessionUser | null {
  const user = (session as { userData?: SessionUser }).userData;
  const sessionId = user?.services?.sessionId;
  // No session id: it can't be told apart from an on-behalf call, so nothing.
  return user && sessionId && !outboundOf(deps)(sessionId) ? user : null;
}

/** "Sam" is the name Ferni has for "Sam Smith". */
const sameName = (name: string, current: string | undefined): boolean =>
  name.toLowerCase() === current?.split(/\s+/)[0].toLowerCase();

/**
 * The name note for this reply, or ''. On the turn the caller gives a new
 * name it also renames them (rename above). Idempotent: the preemptive and
 * final requests of one turn rename once.
 */
export function nameCorrectionNote(
  chatCtx: llm.ChatContext,
  session: object,
  callerWords: string,
  env: Env = process.env,
  deps: NameCorrectionDeps = {}
): string {
  const user = nameCorrectionEnabled(env) ? callerOn(session, deps) : null;
  if (!user) return '';
  const known = corrected.get(session);
  const current = known?.name ?? user.userName;
  // With a guest in the room, "I'm David" may be the guest (room-guests.ts).
  const listen = callerWords && !guestsPresent(session, env);
  const name = listen ? statedName(callerWords, current, lastAgentLine(chatCtx)) : null;
  if (name && !sameName(name, current)) {
    corrected.set(session, { name, was: known?.was ?? current });
    rename(user, name, deps);
    log.info({ sessionId: user.services?.sessionId, hadName: !!current }, 'NAME_CORRECTION');
  }
  const now = corrected.get(session);
  return now ? nameNote(now.name, now.was) : '';
}
