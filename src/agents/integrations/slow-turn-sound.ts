/**
 * A sound on a slow turn: "Mm." / "Hmm." when the reply is late and nothing
 * else has filled the wait.
 *
 * Real prod calls, 2026-10-15 to 10-22 (dead-air audit): the early opening clip
 * (turn-opening-sound.ts) played on 35% of turns, and when it did the longest
 * silence was p90 1.6 s against 2.6 s without it. It skips the turn after one
 * it opened, short turns, short questions and laughs, so slow turns often got
 * nothing: tool turns (the second model call after the result is the wait) and
 * turns whose preemptive reply was thrown away. A person in that gap says "mm".
 *
 * With SLOW_TURN_SOUND on, SLOW_TURN.waitMs after the caller's turn is
 * committed, if no reply words have reached TTS, no clip has played since the
 * caller stopped, and the turn looks slow (a tool asked for or likely, the
 * preemptive reply not used, or a long turn), the cached "Mm" (or "Hmm" for a
 * question) plays once and the reply waits for it to finish. Never on two
 * turns running, and never on a grave call: not with crisis risk or hard news
 * (sessionIsGrave), not after the crisis gate acted on the call, and not while
 * its classifier still holds this turn's reply (the sound waits for the verdict
 * and plays only if the turn cleared and is still silent).
 *
 * @module agents/integrations/slow-turn-sound
 */

import { createLogger } from '../../utils/safe-logger.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';

const log = createLogger({ module: 'SlowTurnSound' });

export const SLOW_TURN = {
  /** From the commit to the sound, if the reply has no words at TTS by then. */
  waitMs: 900,
  /** A caller turn this long is a long request: its reply is slow too. */
  longTurnWords: 25,
  /** Longest wait for the crisis classifier's verdict before giving up on the sound. */
  crisisWaitMs: 1500,
} as const;

interface SessionEvents {
  on(event: string, handler: (ev: unknown) => void): unknown;
  off(event: string, handler: (ev: unknown) => void): unknown;
}

export interface SlowTurnDeps {
  playClip: (text: string) => boolean;
  /** When any clip (backchannel, opening sound) last played. */
  lastPlayedAt: () => number;
  /** Whether reply words reached TTS, or reply audio exists, at or after this time. */
  replyStartedSince: (since: number) => boolean;
  /** Crisis risk or hard news on the call, or the crisis gate acted on it. */
  grave: () => boolean;
  /** This turn's crisis verdict while it still holds the reply; null when none is pending. */
  crisisPending: () => Promise<unknown> | null;
  /** Whether these words may ask for a tool (fast-lane.ts mayNeedTool). */
  mayNeedTool: (text: string) => boolean;
  /** Subscribe to the reply asking for a tool; returns the unsubscribe. */
  onToolRequested: (listener: () => void) => () => void;
  /** Hold the reply's first audio for the clip (ms); the reply follows it. */
  holdReply: (text: string) => void;
  /** The opener gate trims the reply's own "Mm" after this one (turn-opening-sound.ts). */
  noteOpened: () => void;
}

/** "Hmm" for a question, "Mm" for anything else. */
export function slowTurnClip(transcript: string): string {
  return /\?\s*$/.test(transcript.trim()) ? 'Hmm' : 'Mm';
}

/** Why this turn looks slow, or null when it doesn't. */
export function slowTurnReason(turn: {
  words: string;
  toolRequested: boolean;
  preemptiveUsed: boolean | null;
  mayNeedTool: boolean;
}): string | null {
  if (turn.toolRequested) return 'tool';
  if (turn.mayNeedTool) return 'tool_likely';
  if (turn.preemptiveUsed !== true)
    return turn.preemptiveUsed === false ? 'preemptive_dropped' : 'no_preemptive';
  const words = turn.words.trim().split(/\s+/).filter(Boolean).length;
  return words >= SLOW_TURN.longTurnWords ? 'long_turn' : null;
}

/** Watch the session and play the slow-turn sound; returns a detach function. */
export function attachSlowTurnSound(session: SessionEvents, deps: SlowTurnDeps): () => void {
  let timer: NodeJS.Timeout | null = null;
  let userSpeaking = false;
  let userStoppedAt = 0;
  let agentSpeaking = false;
  let playedLastTurn = false;
  let turn: { committedAt: number; words: string; tool: boolean } | null = null;
  let preemptive: { used: boolean; at: number } | null = null;
  let detached = false;
  const cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const stillSilent = (t: NonNullable<typeof turn>): boolean =>
    !detached &&
    turn === t &&
    !userSpeaking &&
    !agentSpeaking &&
    !deps.replyStartedSince(t.committedAt) &&
    deps.lastPlayedAt() < (userStoppedAt || t.committedAt) &&
    !deps.grave();

  const fire = async (t: NonNullable<typeof turn>): Promise<void> => {
    if (!stillSilent(t)) return;
    const reason = slowTurnReason({
      words: t.words,
      toolRequested: t.tool,
      // This turn's decision: made after the caller stopped, around the commit.
      preemptiveUsed: preemptive && preemptive.at >= userStoppedAt ? preemptive.used : null,
      mayNeedTool: deps.mayNeedTool(t.words),
    });
    if (!reason) return;
    const pending = deps.crisisPending();
    if (pending) {
      // No casual sound while the crisis gate holds the reply: wait for its verdict.
      let giveUp: NodeJS.Timeout | undefined;
      await Promise.race([
        pending.catch(() => undefined),
        new Promise((resolve) => {
          giveUp = setTimeout(resolve, SLOW_TURN.crisisWaitMs);
        }),
      ]);
      clearTimeout(giveUp);
      if (deps.crisisPending() || !stillSilent(t)) return;
    }
    const text = slowTurnClip(t.words);
    if (!deps.playClip(text)) return;
    playedLastTurn = true;
    deps.noteOpened();
    deps.holdReply(text);
    log.info(
      { text, reason, afterCommitMs: Date.now() - t.committedAt, crisisWaited: Boolean(pending) },
      'SLOW_TURN_SOUND'
    );
  };

  const onItem = (ev: unknown): void => {
    const item = (ev as { item?: { role?: string; textContent?: string } })?.item;
    if (item?.role !== 'user') return;
    const words = item.textContent ?? '';
    if (words.startsWith(TURN_CONTEXT_HEADER)) return;
    cancel();
    const skip = playedLastTurn; // never on two turns running
    playedLastTurn = false;
    const t = { committedAt: Date.now(), words, tool: false };
    turn = t;
    if (skip) return;
    timer = setTimeout(() => {
      timer = null;
      void fire(t).catch((error: unknown) =>
        log.warn({ error: String(error) }, 'SLOW_TURN_SOUND failed')
      );
    }, SLOW_TURN.waitMs);
  };
  const onUserState = (ev: unknown): void => {
    const speaking = (ev as { newState?: string }).newState === 'speaking';
    if (speaking) {
      cancel();
      turn = null;
    } else if (userSpeaking) {
      userStoppedAt = Date.now();
    }
    userSpeaking = speaking;
  };
  const onAgentState = (ev: unknown): void => {
    agentSpeaking = (ev as { newState?: string }).newState === 'speaking';
    if (agentSpeaking) cancel();
  };
  // LiveKit decides about its preemptive reply just before it commits the turn.
  const onPreemptive = (ev: unknown): void => {
    preemptive = { used: Boolean((ev as { used?: boolean })?.used), at: Date.now() };
  };
  const offTool = deps.onToolRequested(() => {
    if (turn) turn.tool = true;
  });

  session.on('conversation_item_added', onItem);
  session.on('user_state_changed', onUserState);
  session.on('agent_state_changed', onAgentState);
  session.on('ferni_preemptive_decision', onPreemptive);
  return () => {
    detached = true; // a fire() waiting on a crisis verdict must not play after the call ends
    turn = null;
    cancel();
    offTool();
    session.off('conversation_item_added', onItem);
    session.off('user_state_changed', onUserState);
    session.off('agent_state_changed', onAgentState);
    session.off('ferni_preemptive_decision', onPreemptive);
  };
}
