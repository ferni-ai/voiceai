/**
 * Voice Agent Integration Session Store
 *
 * Manages humanization session state.
 *
 * @module @ferni/humanization/voice-agent-integration/session-store
 */

import type { HumanizationSessionState } from './types.js';

const sessions = new Map<string, HumanizationSessionState>();

export function getSession(sessionId: string): HumanizationSessionState | undefined {
  return sessions.get(sessionId);
}

export function setSession(sessionId: string, state: HumanizationSessionState): void {
  sessions.set(sessionId, state);
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function hasSession(sessionId: string): boolean {
  return sessions.has(sessionId);
}
