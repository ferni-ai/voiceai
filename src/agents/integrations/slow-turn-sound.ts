/**
 * A sound on a slow turn: "Mm." / "Hmm." when the reply is late and nothing
 * else has filled the wait (SLOW_TURN_SOUND, off by default).
 *
 * The early opening clip cut the longest silence from p90 2.6 s to 1.6 s on real
 * prod calls (dead-air audit, 10-22) but skips tool turns and dropped preemptive
 * replies. This plays once, the reply waiting for it, when nothing has started
 * (no words at TTS since the caller began, no clip, no opening sound this turn
 * or last: opening-sound-ledger.ts), never on a grave or closing call, and is
 * skipped, not delayed, while the crisis classifier holds the reply.
 *
 * @module agents/integrations/slow-turn-sound
 */

import { createLogger } from '../../utils/safe-logger.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';

const log = createLogger({ module: 'SlowTurnSound' });

export const SLOW_TURN = { waitMs: 900, longTurnWords: 25 } as const;

export interface SlowTurnDeps {
  playClip: (text: string) => boolean;
  lastPlayedAt: () => number;
  replyStartedSince: (since: number) => boolean;
  grave: () => boolean;
  crisisPending: () => Promise<unknown> | null;
  /** Music, the call closing, goodbyes said, or these words are a goodbye. */
  stayQuiet: (words: string) => boolean;
  /** No opening sound this turn or last, opening not decided (opening-sound-ledger.ts). */
  soundAllowed: () => boolean;
  mayNeedTool: (text: string) => boolean;
  onToolRequested: (listener: (names: readonly string[]) => void) => () => void;
  holdReply: (text: string) => void;
  noteOpened: () => void;
}

const stateOf = (ev: unknown): unknown => (ev as { newState?: string } | undefined)?.newState;

export const slowTurnClip = (words: string): string => (/\?\s*$/.test(words.trim()) ? 'Hmm' : 'Mm');

/** Why this turn looks slow, or null. No preemptive decision at all is not a reason. */
export function slowTurnReason(
  turn: Pick<Turn, 'words' | 'preemptiveUsed'> & { toolRequested: boolean; mayNeedTool: boolean }
): string | null {
  if (turn.toolRequested) return 'tool';
  if (turn.mayNeedTool) return 'tool_likely';
  if (turn.preemptiveUsed === false) return 'preemptive_dropped';
  const words = turn.words.trim().split(/\s+/).filter(Boolean).length;
  return words >= SLOW_TURN.longTurnWords ? 'long_turn' : null;
}

interface Turn {
  committedAt: number;
  since: number;
  words: string;
  preemptiveUsed: boolean | null;
  tool: boolean;
  closing: boolean;
}

export function attachSlowTurnSound(
  session: Pick<NodeJS.EventEmitter, 'on' | 'off'>,
  deps: SlowTurnDeps
): () => void {
  let timer: NodeJS.Timeout | null = null;
  let userSpeaking = false;
  let userStartedAt = 0;
  let userStoppedAt = 0;
  let agentSpeaking = false;
  let turn: Turn | null = null;
  /** LiveKit's latest preemptive decision; the commit right after it takes it. */
  let preemptive: boolean | null = null;
  let detached = false;
  const cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const blocked = (t: Turn): string | null => {
    if (detached || turn !== t || userSpeaking || agentSpeaking) return 'moved_on';
    if (deps.replyStartedSince(t.since)) return 'reply';
    // With ink, VAD's stop for this turn can come after the commit.
    const clipSince = userStoppedAt >= t.since ? userStoppedAt : t.committedAt;
    if (deps.lastPlayedAt() >= clipSince || !deps.soundAllowed()) return 'sound';
    if (deps.grave()) return 'grave';
    if (t.closing || deps.stayQuiet(t.words)) return 'closing';
    return deps.crisisPending() ? 'crisis_pending' : null;
  };

  const fire = (t: Turn): void => {
    const reason = slowTurnReason({
      words: t.words,
      toolRequested: t.tool,
      preemptiveUsed: t.preemptiveUsed,
      mayNeedTool: deps.mayNeedTool(t.words),
    });
    if (!reason || blocked(t)) return;
    const text = slowTurnClip(t.words);
    if (!deps.playClip(text)) return;
    deps.noteOpened();
    deps.holdReply(text);
    log.info({ text, reason, afterCommitMs: Date.now() - t.committedAt }, 'SLOW_TURN_SOUND');
  };

  const onItem = (ev: unknown): void => {
    const item = (ev as { item?: { role?: string; textContent?: string } })?.item;
    const words = item?.textContent ?? '';
    if (item?.role !== 'user' || words.startsWith(TURN_CONTEXT_HEADER)) return;
    cancel();
    const committedAt = Date.now();
    const since = userStartedAt || committedAt;
    const t: Turn = {
      committedAt,
      since,
      words,
      preemptiveUsed: preemptive,
      tool: false,
      closing: false,
    };
    preemptive = null;
    turn = t;
    timer = setTimeout(() => {
      timer = null;
      fire(t);
    }, SLOW_TURN.waitMs);
  };
  const onUserState = (ev: unknown): void => {
    const speaking = stateOf(ev) === 'speaking';
    if (speaking) {
      cancel();
      turn = null;
      if (!userSpeaking) userStartedAt = Date.now();
    } else if (userSpeaking) {
      userStoppedAt = Date.now();
    }
    userSpeaking = speaking;
  };
  const offTool = deps.onToolRequested((names) => {
    if (!turn) return;
    turn.tool = true;
    if (names.includes('endCall')) turn.closing = true; // no "Mm" right before a hang-up
  });

  const handlers: Array<[string, (ev: unknown) => void]> = [
    ['conversation_item_added', onItem],
    ['user_state_changed', onUserState],
    [
      'agent_state_changed',
      (ev) => {
        agentSpeaking = stateOf(ev) === 'speaking';
        if (agentSpeaking) cancel();
      },
    ],
    ['ferni_preemptive_decision', (ev) => (preemptive = Boolean((ev as { used?: boolean })?.used))],
  ];
  for (const [event, handler] of handlers) session.on(event, handler);
  return () => {
    detached = true;
    turn = null;
    cancel();
    offTool();
    for (const [event, handler] of handlers) session.off(event, handler);
  };
}
