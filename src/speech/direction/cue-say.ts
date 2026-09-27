/**
 * Speak a cue in a live session: build the scene from the session (who is
 * talking, what was just said), let the director write the line, then say it
 * through the speech coordinator like any other line.
 *
 * @module speech/direction/cue-say
 */

import { coordinatedSay, getSessionForCoordination } from '../coordination/session-integration.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { Cue } from './cue.js';
import { directLine, type DirectedLine, type Scene } from './director.js';

const log = createLogger({ module: 'CueSay' });

const CHARACTERS: Record<string, { name: string; brief: string }> = {
  ferni: {
    name: 'Ferni',
    brief: 'A warm, curious, lightly playful friend and life coach. Plain-spoken, never salesy.',
  },
  'maya-santos': {
    name: 'Maya',
    brief: 'An upbeat, encouraging habits coach. Practical and kind.',
  },
  'peter-john': {
    name: 'Peter',
    brief: 'A calm, thoughtful money mentor. Steady and plain-spoken.',
  },
  'alex-chen': { name: 'Alex', brief: 'A crisp, friendly organizer. Efficient and warm.' },
  'jordan-taylor': {
    name: 'Jordan',
    brief: 'An energetic, celebratory planner. Bright and personal.',
  },
  'nayan-patel': { name: 'Nayan', brief: 'A gentle, reflective guide. Unhurried and wise.' },
};

interface HistoryItem {
  type?: string;
  role?: string;
  textContent?: string;
}

/** The scene for a session: character, recent turns, the user's name. */
export function sceneForSession(sessionId: string): Scene {
  const session = getSessionForCoordination(sessionId) as unknown as {
    history?: { items?: HistoryItem[] };
    userData?: { personaId?: string; userName?: string };
  } | null;
  const personaId = session?.userData?.personaId ?? 'ferni';
  const character = CHARACTERS[personaId] ?? CHARACTERS.ferni;

  const recentTurns = (session?.history?.items ?? [])
    .filter(
      (i) => i.type === 'message' && (i.role === 'user' || i.role === 'assistant') && i.textContent
    )
    .slice(-6)
    .map((i) => ({
      speaker: i.role === 'user' ? ('user' as const) : ('character' as const),
      text: (i.textContent ?? '')
        .replace(/<[^>]+>/g, '')
        .trim()
        .slice(0, 300),
    }));

  return {
    character: character.name,
    brief: character.brief,
    recentTurns,
    userName: session?.userData?.userName,
  };
}

/** The line for a cue in this session (actor's or understudy's). Never throws. */
export async function directedText(sessionId: string, cue: Cue): Promise<DirectedLine> {
  try {
    return await directLine(cue, sceneForSession(sessionId));
  } catch (error) {
    log.warn({ moment: cue.moment, error: String(error) }, 'Cue failed, using fallback');
    return { text: cue.fallback, source: 'understudy', ms: 0, reason: 'error' };
  }
}

/** Speak a cue through the coordinator. Fire and forget, like coordinatedSay. */
export function cueSay(
  sessionId: string,
  cue: Cue,
  options?: { allowInterruptions?: boolean }
): void {
  void directedText(sessionId, cue).then((line) => coordinatedSay(sessionId, line.text, options));
}

/**
 * Speak a canned line as the character's own words. The canned text becomes
 * the intent ("say this idea in your words") and stays the understudy.
 * Used where a reply failed and a fixed fallback ("Done!", "One moment.")
 * used to play verbatim.
 */
export function sayInOwnWords(
  sessionId: string,
  canned: string,
  moment: string,
  options?: { allowInterruptions?: boolean }
): void {
  cueSay(
    sessionId,
    {
      moment,
      direction: `Say this idea in your own words so it fits the conversation right now: "${canned.replace(/<[^>]+>/g, '').trim()}". Keep it to one short sentence. Don't mention errors or glitches.`,
      fallback: canned,
      urgency: 'now',
      maxChars: 160,
    },
    options
  );
}
