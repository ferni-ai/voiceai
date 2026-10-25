/**
 * One line in the turn reminder (withTurnReminder, no extra call) about a
 * snore, whistle, hum or laugh Ferni did that isn't in his words
 * (services/session/quirk-log.ts). A friend who mock-snored owns it when
 * called on it ("ha, guilty, you went quiet and I got cozy") and doesn't
 * narrate it. So: the most notable one, done since his last reply or brought
 * up by the caller within a few minutes; never breaths, sighs or "mm-hm"s.
 * Reading the caller's words here also marks a quirk as landed.
 * QUIRK_AWARENESS=on. A VOICED_QUIRKS snore is the one he owns unasked: the
 * caller's next turn gets one line to own it lightly, once, and never when
 * they sound upset (their voice, venting, hard news, crisis risk).
 *
 * @module agents/personas/quirk-note
 */

import type { llm } from '@livekit/agents';
import {
  isNotable,
  NOTABLE_QUIRKS,
  quirkAwarenessEnabled,
  quirkEvents,
  type QuirkEvent,
  type QuirkKind,
} from '../../services/session/quirk-log.js';
import { callIsGrave } from '../integrations/presence-heavy.js';
import { isHeavyMood } from '../integrations/presence-watcher.js';
import { callerLaughed, callerVenting } from './turn-extras.js';

/** How long after a quirk the caller can still bring it up and get the note. */
export const ASK_WINDOW_MS = 3 * 60_000;

/** The caller talking about it. Whole words only ("human" is not a hum). */
const MENTIONS: Record<string, RegExp> = {
  snore: /\b(?:snor\w*|asleep|fell asleep|falling asleep|dozed?|dozing|nap(?:ping)?|zzz+)\b/i,
  whistle: /\b(?:whistl\w*|that tune|that song)\b/i,
  hum: /\b(?:hum|humm\w*|hummed|that tune|that song)\b/i,
  yawn: /\b(?:yawn\w*)\b/i,
  laugh: /\b(?:laugh\w*|chuckl\w*|giggl\w*)\b/i,
};

function what(e: QuirkEvent): string {
  switch (e.kind) {
    case 'snore':
      return 'You let out a playful mock snore during the long quiet';
    case 'whistle':
      return 'You whistled a few bars to yourself in the quiet';
    case 'hum':
      return 'You hummed a little tune to yourself in the quiet';
    case 'yawn':
      return 'You let out a big yawn in the quiet';
    default:
      return e.source === 'director'
        ? `You laughed out loud at the ${e.where === 'after' ? 'end' : 'start'} of a reply just now`
        : 'You laughed along with them a moment ago';
  }
}

/** When Ferni's last reply started: chat items carry their creation time. */
function lastReplyAt(chatCtx: llm.ChatContext): number {
  for (let i = chatCtx.items.length - 1; i >= 0; i--) {
    const item = chatCtx.items[i];
    if (item.type === 'message' && item.role === 'assistant') return item.createdAt;
  }
  return 0;
}

interface Candidate {
  e: QuirkEvent;
  asked: boolean;
}

/**
 * Notable quirks this reply could mention: done since his last reply (`since`),
 * or brought up by the caller within ASK_WINDOW_MS. Marks the ones that landed.
 */
function candidatesFor(
  events: QuirkEvent[],
  since: number,
  words: string,
  now: number
): Candidate[] {
  const laughed = callerLaughed(words);
  const out: Candidate[] = [];
  for (const e of events) {
    if (!isNotable(e.kind) || now - e.at > ASK_WINDOW_MS) continue;
    // A snore waiting on its punchline outlives his check-in reply until the caller speaks
    const fresh = e.at > since || !!e.ownIt;
    const asked = MENTIONS[e.kind].test(words);
    if (asked) e.landed = 'mentioned';
    else if (fresh && laughed && e.kind !== 'laugh' && !e.landed) e.landed = 'laughed';
    if (fresh || asked) out.push({ e, asked });
  }
  return out;
}

/** What they're asking about first, then the most notable, then the latest. */
const rank = (c: Candidate): number =>
  (c.asked ? 0 : 10) + NOTABLE_QUIRKS.indexOf(c.e.kind as QuirkKind);

const OWN_IT =
  'They just spoke after it: own it lightly in a few words before you answer (something like oh, was I snoring? sorry, long day), just this once, then carry on.';

/** This turn: how the caller sounds (`careful` is a crisis turn, turn-request.ts), and when. */
export interface QuirkTurn {
  mood?: string;
  careful?: boolean;
  now?: number;
}

function upset(sessionId: string | undefined, words: string, turn: QuirkTurn): boolean {
  return (
    !!turn.careful ||
    isHeavyMood(turn.mood) ||
    callerVenting(words) ||
    callIsGrave(sessionId, [words])
  );
}

/**
 * The note for this reply, or '' (flag off, nothing notable since his last
 * reply, nothing the caller is asking about). `words` are the caller's words
 * this reply answers.
 */
export function quirkTurnNote(
  sessionId: string | undefined,
  chatCtx: llm.ChatContext,
  words: string,
  turn: QuirkTurn = {},
  env: Record<string, string | undefined> = process.env
): string {
  if (!quirkAwarenessEnabled(env)) return '';
  const events = quirkEvents(sessionId);
  const candidates = candidatesFor(events, lastReplyAt(chatCtx), words, turn.now ?? Date.now());
  // The snore's punchline is for the caller's next turn only, used or not. A reply Ferni
  // starts himself (a check-in, no caller words) leaves it for when they speak.
  const spoke = words.trim() !== '';
  const ownIt = spoke && events.some((x) => x.ownIt);
  if (spoke) for (const x of events) x.ownIt = false;
  if (candidates.length === 0) return '';
  const { e, asked } = candidates.sort((a, b) => rank(a) - rank(b) || b.e.at - a.e.at)[0];
  const why = e.reason ? ` (${e.reason})` : '';
  const punchline = ownIt && e.kind === 'snore' && !asked && !upset(sessionId, words, turn);
  const tail = asked
    ? "They seem to be asking about it: own it playfully, say why if they want to know, and don't deny it or explain it away."
    : punchline
      ? OWN_IT
      : "If they bring it up, own it playfully; don't announce it yourself.";
  return `[${what(e)}${why}. ${tail}]`;
}
