/**
 * A short line in the persona's own voice on the clip track the moment a
 * covered tool starts ("Let me look.", "On it."): TOOL_ACK_CLIP, off by default.
 *
 * The in-stream lead-in is reply text, so the answer after the tool waited for it
 * to play out; a clip is not, so the answer only waits for the clip itself
 * (latency-2026-10-25/tool-turns DESIGN.md L1: covered turns p50 -1.7 s). Fired
 * when the SDK starts the turn's first tool, never on a streamed chunk. Skipped
 * while the caller speaks, after the reply or another opening sound started, on
 * grave/crisis/minor calls (tool-ack-clip-wiring.ts), and twice in a row.
 *
 * @module agents/integrations/tool-ack-clip
 */

import { createLogger } from '../../utils/safe-logger.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';
import { ACK_CLIP_LINES, ackKindFor, type AckKind } from '../personas/tool-ack-clip-lines.js';
import { setAckClipTakeover, textLeadInAt } from './tool-ack-clip-registry.js';

const log = createLogger({ module: 'ToolAckClip' });

export interface ToolAckDeps {
  onToolStarted: (listener: (name: string) => void) => () => void;
  asked: (words: string) => boolean;
  /** The line is cached in the voice this persona's reply is spoken in. */
  clipReady: (text: string) => boolean;
  playClip: (text: string) => boolean;
  holdReply: (text: string) => void;
  replyStartedSince: (since: number) => boolean;
  /** Why this call stays quiet (crisis, grave, heavy, minor), or null. */
  silencedBy: () => string | null;
  crisisPending: () => unknown;
  /** Music, the call closing, or these words are a goodbye. */
  stayQuiet: (words: string) => boolean;
  /** An opening sound already played this caller turn (opening-sound-ledger.ts). */
  soundThisTurn: () => boolean;
  noteOpened: () => void;
}

interface Turn {
  since: number;
  words: string;
  toolSeen: boolean;
}

const stateOf = (ev: unknown): unknown => (ev as { newState?: string } | undefined)?.newState;

export function attachToolAckClip(
  session: Pick<NodeJS.EventEmitter, 'on' | 'off'>,
  deps: ToolAckDeps
): () => void {
  let turn: Turn | null = null;
  let userSpeaking = false;
  let userStartedAt = 0;
  let last = '';
  const next: Record<AckKind, number> = { lookup: 0, action: 0, outreach: 0, recall: 0 };

  /** The next line of `kind` in rotation that is cached and not the one heard last. */
  const pick = (kind: AckKind): { line: string; at: number } | null => {
    const lines = ACK_CLIP_LINES[kind];
    for (let i = 0; i < lines.length; i++) {
      const at = (next[kind] + i) % lines.length;
      const line = lines[at] ?? '';
      if (line && line !== last && deps.clipReady(line)) return { line, at };
    }
    return null;
  };

  const blocked = (t: Turn): string | null => {
    if (userSpeaking) return 'caller_speaking';
    if (textLeadInAt(session) >= t.since) return 'text_lead_in';
    if (deps.replyStartedSince(t.since)) return 'reply';
    if (deps.soundThisTurn()) return 'sound';
    const silenced = deps.silencedBy();
    if (silenced) return silenced;
    if (deps.stayQuiet(t.words)) return 'closing';
    return deps.crisisPending() ? 'crisis_pending' : null;
  };

  const onTool = (tool: string): void => {
    const t = turn;
    if (!t || t.toolSeen) return;
    t.toolSeen = true; // only the turn's first tool, never a chained one
    const kind = ackKindFor(tool, t.words, deps.asked(t.words));
    if (!kind) return;
    const why = blocked(t);
    const choice = why ? null : pick(kind);
    if (!choice || !deps.playClip(choice.line)) {
      const reason = why ?? (choice ? 'not_played' : 'no_clip');
      log.info({ tool, kind, reason }, 'TOOL_ACK_CLIP_SKIP');
      return;
    }
    last = choice.line;
    next[kind] = choice.at + 1;
    deps.noteOpened();
    deps.holdReply(choice.line);
    log.info({ tool, kind, line: choice.line, afterTurnMs: Date.now() - t.since }, 'TOOL_ACK_CLIP');
  };

  const onItem = (ev: unknown): void => {
    const item = (ev as { item?: { role?: string; textContent?: string } })?.item;
    const words = item?.textContent ?? '';
    if (item?.role !== 'user' || words.startsWith(TURN_CONTEXT_HEADER)) return;
    turn = { since: userStartedAt || Date.now(), words, toolSeen: false };
  };
  const onUserState = (ev: unknown): void => {
    const speaking = stateOf(ev) === 'speaking';
    if (speaking && !userSpeaking) userStartedAt = Date.now();
    userSpeaking = speaking;
  };
  const offTool = deps.onToolStarted(onTool);
  setAckClipTakeover(session, (tool, words) => {
    const kind = ackKindFor(tool, words, deps.asked(words));
    return kind !== null && ACK_CLIP_LINES[kind].some((line) => deps.clipReady(line));
  });

  session.on('conversation_item_added', onItem);
  session.on('user_state_changed', onUserState);
  return () => {
    turn = null;
    offTool();
    setAckClipTakeover(session, null);
    session.off('conversation_item_added', onItem);
    session.off('user_state_changed', onUserState);
  };
}
