/**
 * Heard: when the caller's own words settle. Two signals, both already on the
 * transcription stream (live-transcription.service.ts), nothing invented:
 * - the caller's line is final once its transcript carries
 *   `lk.transcription_final`; until then it is interim and shows faint;
 * - Ferni has taken the turn once an agent transcript follows the caller's line.
 *
 * @module ui/captions/heard-turn
 */

import type { CaptionEntry } from './caption-entry.js';

export interface HeardTurn {
  /** The caller's latest line, or null before they have spoken. */
  user: CaptionEntry | null;
  /** An agent transcript follows that line: Ferni has taken the turn. */
  agentTookTurn: boolean;
}

/** Where the caller's latest line stands in the history. */
export function heardTurn(entries: readonly CaptionEntry[]): HeardTurn {
  let i = entries.length - 1;
  while (i >= 0 && entries[i]?.speaker !== 'user') i--;
  if (i < 0) return { user: null, agentTookTurn: false };
  return { user: entries[i] ?? null, agentTookTurn: i < entries.length - 1 };
}

/** The caller's line has settled: its transcript is final. */
export function heardSettled(turn: HeardTurn): boolean {
  return turn.user?.final === true;
}

/** The check pops: the caller's line has settled and Ferni has taken the turn. */
export function heardTicked(turn: HeardTurn): boolean {
  return heardSettled(turn) && turn.agentTookTurn;
}
