/**
 * "Caught you whistling" (NAMED_TUNE=on): when the caller notices the bars
 * Ferni whistled or hummed in a quiet, he owns it and asks them to name it.
 * Their answer is kept as that tune's name (tune-state.ts) and their quiet
 * window plays it from then on; now and then, on a light turn, he may say it.
 * "Stop whistling" turns the sounds off for them. Verified owners only, never
 * on a crisis turn, and only ever in a reply to something they said.
 *
 * @module agents/personas/named-tune-note
 */

import {
  callTune,
  firestoreTuneStore,
  loadCallerTune,
  namedTuneEnabled,
  saveCallerTune,
  type CallTune,
  type TuneStore,
} from '../../services/session/tune-state.js';
import { isHeavyMood } from '../integrations/presence-watcher.js';
import { outboundPartiesFor } from '../shared/outbound-opener.js';
import { priorCallsOf } from './personal-beats.js';
import { callerVenting } from './turn-extras.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';

/** How long after a whistle the caller can still bring it up, or answer the naming question. */
export const ASK_WINDOW_MS = 3 * 60_000;
/** Calls between two mentions of the name. */
export const MENTION_EVERY = 3;
export const NAME_MAX = 40;
const NAME_WORDS = 6;

/** Them noticing his whistle or hum. Whole words; "whistleblower" and "I was whistling" are not. */
const REMARKS = [
  /\b(?:were|are|was|did|do|is)\s+(?:that\s+)?(?:you|ya)\s+(?:just\s+|still\s+)?(?:whistl(?:e|es|ed|ing)|hum|hums|hummed|humming)\b/i,
  /\byou(?:'re|\s+are|\s+were|'ve\s+been|\s+just)\s+(?:just\s+)?(?:whistl(?:e|es|ed|ing)|hum|hums|hummed|humming)\b/i,
  /\bwhat(?:'s|\s+is|\s+was)\s+(?:that|this|the)\s+(?:tune|melody|whistle|whistling|humming)\b/i,
  /\b(?:nice|cute|catchy|love\s+that|like\s+that)\s+(?:whistl\w*|humming|tune)\b/i,
  /\bwho(?:'s|\s+is)\s+(?:whistling|humming)\b/i,
];
const NOT_A_REMARK = /\bwhistle[\s-]?blow|\bhumming[\s-]?bird/i;

export function remarksOnTune(words: string): boolean {
  return !NOT_A_REMARK.test(words) && REMARKS.some((re) => re.test(words));
}

/** Them asking him to stop. Not "I can't stop humming" or "I don't hum". */
const STOP =
  /(?<!\b(?:can'?t|cannot|couldn'?t|won'?t|never|i|we|they|he|she)\s)\b(?:stop|quit|no\s+more|don'?t|do\s+not)\s+(?:the\s+)?(?:whistl(?:e|es|ed|ing)|hum|hums|hummed|humming)\b/i;

export function asksToStopTune(words: string): boolean {
  return STOP.test(words);
}

const DECLINE =
  /^(?:no|nah|nope|not really|not now|maybe later|later|pass|no thanks|i don'?t know|idk|you name it|you pick|you choose|anyway|so|but|actually|wait)\b/i;
const LEAD =
  /^(?:(?:um+|uh+|hmm+|oh|ok(?:ay)?|sure|yes|yeah|yep|ha(?:ha)*|lol|well|ooh)\b[,.!\s]*)*(?:(?:let'?s|i'?d|i'?ll|we\s+should|you\s+should)\s+)?(?:call\s+it|name\s+it|it'?s|how\s+about|what\s+about|maybe)?\b[,:\s]*/i;

/**
 * The name in their answer: their words with "let's call it" and the like
 * taken off, at most NAME_MAX characters. '' when they gave only a yes
 * (ask stays open), null when they declined or said something else.
 */
export function tuneNameFrom(words: string): string | null {
  const said = words.trim();
  if (said.includes('?') || DECLINE.test(said)) return null;
  const name = said
    .replace(LEAD, '')
    .replace(/^["'“‘]+|["'”’.!,\s]+$/g, '')
    .trim();
  if (name.split(/\s+/).length > NAME_WORDS) return null;
  return name.slice(0, NAME_MAX).trim();
}

const did = (kind: string): string => (kind === 'hum' ? 'hummed' : 'whistled');
type Env = Record<string, string | undefined>;

export interface TuneTurn {
  sessionId?: string;
  userId?: string;
  /** The caller's words this reply answers. */
  words: string;
  /** Crisis guidance rides this reply. */
  careful: boolean;
  verified: boolean;
  /** TODO(PR 1897): MINOR_CARE's memoryHeld (src/utils/minor-care.ts) once it merges. */
  memoryHeld?: boolean;
  priorCalls?: number;
  mood?: string;
}

/** The note for this reply, or ''. */
export function namedTuneNote(
  turn: TuneTurn,
  store = firestoreTuneStore,
  env: Env = process.env,
  now = Date.now()
): string {
  const call = readyCall(turn, store, env);
  if (!call) return '';
  const stopped = stop(call, turn, store);
  if (stopped !== null || turn.careful) return turn.careful ? '' : (stopped ?? '');
  return (
    naming(call, turn, store, now) ?? remark(call, turn, now) ?? mention(call, turn, store, now)
  );
}

/** The call's state once a verified caller's record is read; null with the flag off or otherwise. */
function readyCall(turn: TuneTurn, store: TuneStore, env: Env): CallTune | null {
  if (!namedTuneEnabled(env) || !turn.sessionId) return null;
  const { userId } = turn;
  if (!turn.verified || turn.memoryHeld || !isMemberIdentity(userId)) return null;
  const call = callTune(turn.sessionId);
  loadCallerTune(call, userId, store);
  return call.state === 'ready' ? call : null;
}

/** "Stop whistling" after a whistle this call: kept, even on a crisis turn. */
function stop(call: CallTune, turn: TuneTurn, store: TuneStore): string | null {
  if (!call.played || call.record.soundsOff || !asksToStopTune(turn.words)) return null;
  saveCallerTune(call, { soundsOff: true }, store);
  return "[They asked you to stop the whistling and humming. Say sure in a few words; you won't do it on their calls again.]";
}

/** Their answer to "want to name it?". */
function naming(call: CallTune, turn: TuneTurn, store: TuneStore, now: number): string | null {
  const { asking } = call;
  if (!asking || now - asking.at > ASK_WINDOW_MS) return null;
  const name = tuneNameFrom(turn.words);
  if (name === '') return ''; // a bare "yes": the next answer is the name
  call.asking = undefined;
  if (name === null) return null;
  call.spoken = true;
  const { tuneId } = asking;
  saveCallerTune(call, { tuneId, name, namedAt: now, mentionedAtCall: turn.priorCalls }, store);
  return `[They named your tune "${name}". Say the name back and that it's theirs now, in a few words.]`;
}

/** They noticed: own it, and ask them to name it if it has no name yet. */
function remark(call: CallTune, turn: TuneTurn, now: number): string | null {
  const { played } = call;
  if (!played || now - played.at > ASK_WINDOW_MS || !remarksOnTune(turn.words)) return null;
  const { name, tuneId } = call.record;
  if (name && tuneId === played.tuneId) {
    call.spoken = true;
    return `[They noticed you ${did(played.kind)} "${name}", the tune they named. Own it playfully, in a few words.]`;
  }
  call.asking = { tuneId: played.tuneId, at: now };
  return `[You ${did(played.kind)} a few bars of a tune you made up, and they noticed. Own it playfully, like "Guilty. It's a tune I made up and it doesn't have a name. Want to name it?"]`;
}

/** Their tune just played on a light turn, and it hasn't come up for a few calls. */
function mention(call: CallTune, turn: TuneTurn, store: TuneStore, now: number): string {
  const { played, record } = call;
  if (call.spoken || !record.name || !played || played.tuneId !== record.tuneId) return '';
  if (now - played.at > ASK_WINDOW_MS || turn.priorCalls === undefined) return '';
  if (turn.priorCalls - (record.mentionedAtCall ?? -MENTION_EVERY) < MENTION_EVERY) return '';
  if (isHeavyMood(turn.mood) || callerVenting(turn.words)) return '';
  call.spoken = true;
  saveCallerTune(call, { mentionedAtCall: turn.priorCalls }, store);
  const doing = played.kind === 'hum' ? 'humming' : 'whistling';
  return `[You just ${did(played.kind)} "${record.name}", the tune they named. If it fits, mention it in passing, like "${doing} ${record.name} again". Don't bring it up just to get their attention.]`;
}

interface UserDataView {
  userId?: string;
  services?: { sessionId?: string };
  voiceEmotion?: { primary?: string };
}

/** The note for the turn reminder (turn-request.ts), from the session's userData. */
export function tuneTurnNote(
  session: object,
  words: string,
  careful: boolean,
  verifiedOwner: (sessionId: string) => boolean
): string {
  if (!namedTuneEnabled()) return '';
  const u = (session as { userData?: UserDataView }).userData;
  const sessionId = u?.services?.sessionId;
  return namedTuneNote({
    sessionId,
    userId: u?.userId,
    words,
    careful,
    // Their own call only: never one Ferni placed for them to someone else.
    verified: !!sessionId && verifiedOwner(sessionId) && !outboundPartiesFor(sessionId),
    priorCalls: priorCallsOf(u),
    mood: u?.voiceEmotion?.primary,
  });
}
