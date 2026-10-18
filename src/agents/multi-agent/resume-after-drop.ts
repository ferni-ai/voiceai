/**
 * Picking a call back up after our side dropped (RESUME_AFTER_DROP, off by default).
 *
 * When a pod dies mid-call, LiveKit re-dispatches the same job to another pod.
 * That pod used to start a brand-new call: empty history and a cold "Hey.
 * What's up?". On the 2026-10-13 call with Ryan it had lost his introduction,
 * and when Seth asked "Did you crash?" Ferni said "Still here, no crash."
 * This module notices the dropped call, puts its last turns back into the new
 * agent's history, and opens with an honest reconnect line instead.
 *
 * The signal: the caller's newest other conversation was never ended (the dead
 * pod never ran endConversation) and its last turn is under two minutes old.
 * Nothing records the room or job id against a conversation, so this is the
 * most reliable signal the store has when a session starts.
 *
 * @module agents/multi-agent/resume-after-drop
 */

import { flagOn } from '../../config/env-flag.js';
import {
  getConversationTurns,
  getRecentConversations,
  type ConversationTurn,
} from '../../services/memory/realtime-memory.js';
import { directedText } from '../../speech/direction/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import { calmGreeting, directedGreeting } from './greeting-direction.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';

const log = createLogger({ module: 'ResumeAfterDrop' });

/** A call whose last turn is older than this is a new call, not a drop. */
export const RESUME_WINDOW_MS = 2 * 60_000;
/** How many of the dropped call's turns go back into the history. */
export const RESTORED_TURNS = 12;
/** Pods' clocks differ a little: a last turn this far "in the future" still counts. */
const CLOCK_SKEW_MS = 30_000;
/** Turns read from the dropped call (the store reads oldest first). */
const MAX_TURNS_READ = 200;
/** How long the greeting waits for the lookup before greeting cold. */
const LOOKUP_WAIT_MS = 1500;

export function resumeAfterDropMode(
  env: Record<string, string | undefined> = process.env
): boolean {
  return flagOn('RESUME_AFTER_DROP', env);
}

/** A call that dropped moments ago: its last turns, oldest first. */
export interface DroppedCall {
  conversationId: string;
  turns: ConversationTurn[];
  secondsAgo: number;
}

/** The caller's call that dropped moments ago, or undefined. */
export async function findDroppedCall(
  userId: string,
  currentConversationId: string | undefined,
  now: number = Date.now()
): Promise<DroppedCall | undefined> {
  const recent = await getRecentConversations(userId, 2);
  const previous = recent.find((c) => c.id !== currentConversationId);
  if (!previous || previous.endedAt) return undefined;
  const turns = (await getConversationTurns(userId, previous.id, MAX_TURNS_READ)).filter((t) =>
    t.content?.trim()
  );
  const last = turns.at(-1);
  if (!last) return undefined;
  const ageMs = now - new Date(last.timestamp).getTime();
  if (!(ageMs <= RESUME_WINDOW_MS) || ageMs < -CLOCK_SKEW_MS) return undefined;
  return {
    conversationId: previous.id,
    turns: turns.slice(-RESTORED_TURNS),
    secondsAgo: Math.max(0, Math.round(ageMs / 1000)),
  };
}

/** Lookups started while the agent builds, taken by the greeting. */
const lookups = new Map<string, Promise<DroppedCall | undefined>>();

/** Start looking for a dropped call this session picks up (flag off: does nothing). */
export function startResumeLookup(
  sessionId: string,
  userId: string | undefined,
  currentConversationId: string | undefined
): void {
  if (!resumeAfterDropMode() || !isMemberIdentity(userId)) return;
  const lookup = findDroppedCall(userId, currentConversationId).catch((error: unknown) => {
    log.warn({ error: String(error), sessionId }, 'Dropped-call lookup failed, greeting cold');
    return undefined;
  });
  lookups.set(sessionId, lookup);
}

async function takeDroppedCall(sessionId: string): Promise<DroppedCall | undefined> {
  const lookup = lookups.get(sessionId);
  if (!lookup) return undefined;
  lookups.delete(sessionId);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), LOOKUP_WAIT_MS);
  });
  const found = await Promise.race([lookup, late]);
  clearTimeout(timer);
  return found;
}

/** Text as it can be spoken: no markup, no em dashes, no ellipses. */
function speakable(text: string): string {
  return calmGreeting(
    text
      .replace(/<[^>]+>/g, '')
      .replace(/\s*[—–]\s*/g, ', ')
      .replace(/…/g, '.')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** The system note after the restored turns, so the model never denies the drop. */
export function resumeNote(call: DroppedCall): string {
  return (
    `[RESUMED CALL] The messages above are from this same call, before your side of the line ` +
    `dropped about ${call.secondsAgo} seconds ago. The caller was just put back through to you. ` +
    `You have said sorry for dropping. If they ask whether you crashed, dropped or cut out, say ` +
    `yes plainly and briefly. Never deny it or act as if nothing happened.`
  );
}

/** The part of the agent this module touches (a voice.Agent). */
export interface HistoryAgent {
  chatCtx: {
    copy: () => {
      addMessage: (msg: { role: 'user' | 'assistant' | 'system'; content: string }) => unknown;
    };
  };
  updateChatCtx: (chatCtx: unknown) => Promise<void>;
}

/** Put the dropped call's turns, then the resume note, into the agent's history. */
export async function restoreDroppedTurns(agent: HistoryAgent, call: DroppedCall): Promise<void> {
  const ctx = agent.chatCtx.copy();
  for (const turn of call.turns) {
    ctx.addMessage({ role: turn.role, content: turn.content.replace(/<[^>]+>/g, '').trim() });
  }
  ctx.addMessage({ role: 'system', content: resumeNote(call) });
  await agent.updateChatCtx(ctx);
}

const lastBy = (call: DroppedCall, role: ConversationTurn['role']): string | undefined =>
  call.turns.filter((t) => t.role === role).at(-1)?.content;

/** The end of what they last said, short enough to quote back. */
function lastHeard(text: string): string {
  const clean = speakable(text)
    .replace(/["“”]/g, '')
    .replace(/[.!?,;:]+$/, '');
  return clean.split(' ').filter(Boolean).slice(-12).join(' ');
}

/** The understudy's reconnect line: honest, and grounded in their last words. */
export function reconnectFallback(call: DroppedCall): string {
  const heard = lastHeard(lastBy(call, 'user') ?? '');
  return heard
    ? `Sorry, I dropped for a second. The last thing I caught was "${heard}".`
    : 'Sorry, I dropped for a second. Where were we?';
}

export const RECONNECT_DIRECTION =
  'Your side of the call dropped for a few seconds and they were just put back through to you. Say sorry, you dropped for a second, then pick up where you left off in a few words, naming what they were last telling you. Use only the facts. One or two short sentences, no exclamation marks.';

type GreetingUserData = Parameters<typeof directedGreeting>[2];

/**
 * The agent's first line. A call that dropped moments ago gets its turns back
 * and an honest reconnect line; any other call gets the usual hello.
 */
export async function greetingOrResume(
  sessionId: string,
  agent: { personaId: string; agent?: HistoryAgent },
  userData: GreetingUserData
): Promise<string> {
  const call = await takeDroppedCall(sessionId);
  if (!call || !agent.agent) return directedGreeting(sessionId, agent.personaId, userData);
  try {
    await restoreDroppedTurns(agent.agent, call);
  } catch (error) {
    log.warn({ error: String(error), sessionId }, 'Dropped-call turns not restored, greeting cold');
    return directedGreeting(sessionId, agent.personaId, userData);
  }
  log.info(
    {
      sessionId,
      conversationId: call.conversationId,
      turns: call.turns.length,
      secondsAgo: call.secondsAgo,
    },
    'Resumed a dropped call'
  );
  const facts: Record<string, string> = {};
  const theirs = lastBy(call, 'user');
  const mine = lastBy(call, 'assistant');
  if (theirs) facts['the last thing they said before the drop'] = speakable(theirs).slice(0, 200);
  if (mine) facts['the last thing you said before the drop'] = speakable(mine).slice(0, 200);
  if (userData?.userName) facts['their name'] = userData.userName;
  const directed = await directedText(sessionId, {
    moment: 'resume_after_drop',
    direction: RECONNECT_DIRECTION,
    facts,
    mustInclude: ['dropped'],
    fallback: reconnectFallback(call),
    urgency: 'now',
    maxChars: 160,
  });
  return speakable(directed.text);
}
