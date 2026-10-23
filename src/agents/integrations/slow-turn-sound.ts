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
 * committed, the cached "Mm" (or "Hmm" for a question) plays once and the
 * reply waits for it to finish, when all of these hold:
 * - the turn looks slow: a tool asked for or likely, the preemptive reply
 *   thrown away (LiveKit decides just before the commit, often while VAD still
 *   says the caller is speaking), or a long turn. No decision at all is not slow;
 * - no reply words have reached TTS since the caller started this turn (with
 *   preemptive TTS they can arrive before the commit), and the opener gate has
 *   not yet decided the reply's opening (its own "Mm," would double);
 * - no clip has played since the caller stopped, and no opening sound of
 *   either kind opened this turn or the one before (opening-sound-ledger.ts);
 * - the call is not grave (crisis risk or hard news, or the crisis gate acted),
 *   the crisis classifier is not holding this turn's reply (then it is skipped,
 *   not delayed), and the call is not closing: no music, no goodbye, no endCall.
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
} as const;

/** Tools that close the call: no "Mm" right before a hang-up. */
const CLOSING_TOOLS = new Set(['endCall']);

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
  /** Whether the opener gate decided a reply's opening at or after this time. */
  openingDecidedSince: (since: number) => boolean;
  /** Crisis risk or hard news on the call, or the crisis gate acted on it. */
  grave: () => boolean;
  /** The crisis verdict holding this turn's reply; null when none is pending. */
  crisisPending: () => Promise<unknown> | null;
  /** Music, the call closing, goodbyes said, or these words are a goodbye. */
  stayQuiet: (words: string) => boolean;
  /** No opening sound this turn or the one before (opening-sound-ledger.ts). */
  soundAllowed: () => boolean;
  /** When the caller started this turn (0 when unknown). */
  turnStartedAt: () => number;
  /** Whether these words may ask for a tool (fast-lane.ts mayNeedTool). */
  mayNeedTool: (text: string) => boolean;
  /** Subscribe to the reply asking for tools (their names); returns the unsubscribe. */
  onToolRequested: (listener: (names: readonly string[]) => void) => () => void;
  /** Hold the reply's first audio for the clip (ms); the reply follows it. */
  holdReply: (text: string) => void;
  /** Record the sound: the ledger, and the opener gate trims the reply's own "Mm". */
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
  if (turn.preemptiveUsed === false) return 'preemptive_dropped';
  const words = turn.words.trim().split(/\s+/).filter(Boolean).length;
  return words >= SLOW_TURN.longTurnWords ? 'long_turn' : null;
}

interface Turn {
  committedAt: number;
  /** Reply progress counts from here: the caller's start of speech. */
  since: number;
  words: string;
  preemptiveUsed: boolean | null;
  tool: boolean;
  closing: boolean;
}

/** Watch the session and play the slow-turn sound; returns a detach function. */
export function attachSlowTurnSound(session: SessionEvents, deps: SlowTurnDeps): () => void {
  let timer: NodeJS.Timeout | null = null;
  let userSpeaking = false;
  let userStartedAt = 0;
  let userStoppedAt = 0;
  let agentSpeaking = false;
  let turn: Turn | null = null;
  /** LiveKit's latest preemptive decision, taken by the commit that follows it. */
  let preemptive: boolean | null = null;
  let detached = false;
  const cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  /** Why the sound must not play now, or null. */
  const blocked = (t: Turn): string | null => {
    if (detached || turn !== t || userSpeaking || agentSpeaking) return 'moved_on';
    if (deps.replyStartedSince(t.since) || deps.openingDecidedSince(t.since)) return 'reply';
    // The caller's stop for this turn; with ink it can come after the commit.
    const clipSince = userStoppedAt >= t.since ? userStoppedAt : t.committedAt;
    if (deps.lastPlayedAt() >= clipSince || !deps.soundAllowed()) return 'sound';
    if (deps.grave()) return 'grave';
    if (t.closing || deps.stayQuiet(t.words)) return 'closing';
    if (deps.crisisPending()) return 'crisis_pending';
    return null;
  };

  const fire = (t: Turn): void => {
    const reason = slowTurnReason({
      words: t.words,
      toolRequested: t.tool,
      preemptiveUsed: t.preemptiveUsed,
      mayNeedTool: deps.mayNeedTool(t.words),
    });
    if (!reason) return;
    const skipped = blocked(t);
    if (skipped) {
      if (skipped === 'crisis_pending' || skipped === 'closing') {
        log.info({ reason, skipped }, 'SLOW_TURN_SOUND_SKIPPED');
      }
      return;
    }
    const text = slowTurnClip(t.words);
    if (!deps.playClip(text)) return;
    deps.noteOpened();
    deps.holdReply(text);
    log.info({ text, reason, afterCommitMs: Date.now() - t.committedAt }, 'SLOW_TURN_SOUND');
  };

  const onItem = (ev: unknown): void => {
    const item = (ev as { item?: { role?: string; textContent?: string } })?.item;
    if (item?.role !== 'user') return;
    const words = item.textContent ?? '';
    if (words.startsWith(TURN_CONTEXT_HEADER)) return;
    cancel();
    const committedAt = Date.now();
    const t: Turn = {
      committedAt,
      since: deps.turnStartedAt() || userStartedAt || committedAt,
      words,
      preemptiveUsed: preemptive,
      tool: false,
      closing: false,
    };
    preemptive = null; // each decision belongs to the one commit after it
    turn = t;
    timer = setTimeout(() => {
      timer = null;
      fire(t);
    }, SLOW_TURN.waitMs);
  };
  const onUserState = (ev: unknown): void => {
    const speaking = (ev as { newState?: string }).newState === 'speaking';
    if (speaking) {
      cancel();
      turn = null;
      if (!userSpeaking) userStartedAt = Date.now();
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
    preemptive = Boolean((ev as { used?: boolean })?.used);
  };
  const offTool = deps.onToolRequested((names) => {
    if (!turn) return;
    turn.tool = true;
    if (names.some((name) => CLOSING_TOOLS.has(name))) turn.closing = true;
  });

  session.on('conversation_item_added', onItem);
  session.on('user_state_changed', onUserState);
  session.on('agent_state_changed', onAgentState);
  session.on('ferni_preemptive_decision', onPreemptive);
  return () => {
    detached = true;
    turn = null;
    cancel();
    offTool();
    session.off('conversation_item_added', onItem);
    session.off('user_state_changed', onUserState);
    session.off('agent_state_changed', onAgentState);
    session.off('ferni_preemptive_decision', onPreemptive);
  };
}
