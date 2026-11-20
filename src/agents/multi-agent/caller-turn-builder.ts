/**
 * The caller turn the turn context pusher (turn-intelligence.ts) is building: its words, one final
 * transcript segment at a time, and its name (CALLER_TURN_KEY, shared/caller-turn-count.ts), a
 * fresh key from the turn's first segment until Ferni thinks or speaks.
 *
 * CRISIS_HOLD_FOLLOWS_REPLY (off by default): the reply gate reads each turn under its name, so
 * the turn handler's memory writers wait for the gate's read of their own turn
 * (utils/crisis-memory-hold.ts). With the flag on, each new name is noted for the call the moment
 * it is made, and an interim or preflight segment opens the turn too: LiveKit starts a preemptive
 * reply, which the gate reads, on a preflight before the first final. Flag off, names are made
 * exactly as before it.
 *
 * @module agents/multi-agent/caller-turn-builder
 */

import { randomUUID } from 'node:crypto';
import { callerTurnNoter } from '../../utils/crisis-memory-hold.js';

export interface CallerTurnBuilder {
  /** An interim or preflight segment: opens the turn's name, with the flag on only. */
  heard: () => void;
  /** A final segment joins the turn: the turn's words so far and its name. */
  add: (segment: string) => { text: string; key: string };
  /** Ferni thinks or speaks: the turn ended. */
  end: () => void;
}

/** `sessionId`: the call whose turns are named; none, the names are noted nowhere. */
export function callerTurnBuilder(
  sessionId?: string,
  env: Readonly<Record<string, string | undefined>> = process.env
): CallerTurnBuilder {
  const noteKey = callerTurnNoter(sessionId, env);
  let text = '';
  let key = '';
  let open = false;
  const opened = (): string => {
    if (open) return key;
    [key, open] = [randomUUID(), true];
    noteKey?.(key);
    return key;
  };
  return {
    heard: () => void (noteKey && opened()),
    add: (segment) => {
      const turnKey = opened();
      text = `${text} ${segment.trim()}`.trim();
      return { text, key: turnKey };
    },
    end: () => {
      [text, open] = ['', false];
    },
  };
}
