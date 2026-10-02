/**
 * Session Turn Ring
 *
 * The last few turns of each live session — both the user's and the agent's
 * words — kept in process so extraction can see what the agent just said
 * when it reads the user's reply ("What's your sister's name?" → "Sarah").
 *
 * Written by the voice capture path (agents/voice-agent/assistant-turn-capture.ts
 * and user-turn-capture.ts). Read with `getRecentSessionTurns(sessionId)` or
 * `getPrecedingAssistantText(sessionId, turnNumber)`. Lives at the
 * infrastructure layer so memory/dynamic can read it.
 *
 * @module memory/capture/session-turn-ring
 */

export interface SessionTurnEntry {
  role: 'user' | 'assistant';
  text: string;
  turnNumber: number;
  personaId?: string;
  timestamp: number;
}

const RING_SIZE = 12;
const MAX_SESSIONS = 5_000;
const rings = new Map<string, SessionTurnEntry[]>();

export function rememberSessionTurn(sessionId: string, entry: SessionTurnEntry): void {
  let ring = rings.get(sessionId);
  if (!ring) {
    if (rings.size >= MAX_SESSIONS) {
      const oldest = rings.keys().next().value;
      if (oldest !== undefined) rings.delete(oldest);
    }
    ring = [];
    rings.set(sessionId, ring);
  }
  ring.push(entry);
  if (ring.length > RING_SIZE) ring.splice(0, ring.length - RING_SIZE);
}

/** Most recent turns, oldest first. */
export function getRecentSessionTurns(sessionId: string, limit = RING_SIZE): SessionTurnEntry[] {
  const ring = rings.get(sessionId) ?? [];
  return ring.slice(-limit);
}

/** The agent's last utterance before the given turn number (context for extraction). */
export function getPrecedingAssistantText(
  sessionId: string,
  beforeTurnNumber: number
): string | undefined {
  const ring = rings.get(sessionId) ?? [];
  for (let i = ring.length - 1; i >= 0; i--) {
    const entry = ring[i];
    if (entry && entry.role === 'assistant' && entry.turnNumber < beforeTurnNumber) {
      return entry.text;
    }
  }
  return undefined;
}

export function clearSessionTurns(sessionId: string): void {
  rings.delete(sessionId);
}
