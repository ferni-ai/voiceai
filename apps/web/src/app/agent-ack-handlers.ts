/**
 * Agent acknowledgements and fallbacks the app has to react to.
 *
 * The voice agent answers some requests with an `*_ack` data message and tells
 * the app when it could not start team mode. Until these were handled, the app
 * showed success while the agent had failed: the picker opens the game board
 * right after publishing the request, and nothing corrected that when the agent
 * answered `success: false`. Its "Starting..." toast now waits for `success: true`,
 * and no answer within GAME_ACK_TIMEOUT_MS counts as a failed start.
 *
 * Senders (the payload shapes below come from there):
 * - src/agents/voice-agent/data-channel-handler.ts: *_ack messages
 * - src/agents/voice-agent/phases/multi-agent-mode.ts: multi_agent_unavailable
 * - src/agents/realtime/emotion-event-dispatcher.ts: micro_expression
 */

import { playMicroExpression } from '../eq/index.js';
import { t } from '../i18n/index.js';
import type { DataMessage } from '../types/events.js';
import { toast } from '../ui/whisper.ui.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('AgentAcks');

/** Acks the app listens for. A failed one undoes what the UI did; a game start confirms it. */
const ACK_TYPES = new Set([
  'game_start_ack',
  'text_game_start_ack',
  'practice_start_ack',
  'action_response_ack',
  'music_control_ack',
  'repeat_last_ack',
  'voice_pack_ack',
  'user_feedback_ack',
]);

const GAME_ACKS = new Set(['game_start_ack', 'text_game_start_ack']);

/** How long the picker's start waits for the agent's ack before it counts as failed. */
export const GAME_ACK_TIMEOUT_MS = 10_000;

interface GameStart {
  gameType: string;
  gameName: unknown;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/** The picker's start still waiting for the agent's ack (one at a time: a new tap replaces it). */
let pending: GameStart | null = null;
/** Starts that timed out, by game: the user was told they failed; their late ack may still come. */
const timedOut = new Map<string, GameStart>();
/** What last opened the board: a picker start, or a game started by voice. */
let boardOpener: GameStart | 'voice' | null = null;

// The game picker opens the board optimistically (its event says it awaits an
// ack); remember what it opened so the agent's ack can confirm, or take back,
// that one game and no other. A game started by voice gets no ack, so it's not timed.
document.addEventListener('ferni:game-started', (event) => {
  const detail = (
    event as CustomEvent<{ gameType?: unknown; gameName?: unknown; awaitsAck?: unknown }>
  ).detail;
  const gameType = detail?.gameType;
  if (typeof gameType !== 'string') return;
  if (detail?.awaitsAck !== true) {
    boardOpener = 'voice';
    return;
  }
  if (pending) clearTimeout(pending.timer);
  const start: GameStart = { gameType, gameName: detail.gameName, timer: undefined };
  start.timer = setTimeout(() => timeOut(start), GAME_ACK_TIMEOUT_MS);
  pending = start;
  boardOpener = start;
});

/** No ack in time: tell the user it didn't start, and close the board it opened. */
function timeOut(start: GameStart): void {
  if (pending !== start) return; // a later tap replaced it
  log.warn('No answer from the agent to a game start', { gameType: start.gameType });
  pending = null;
  timedOut.set(start.gameType, start);
  closeBoardOf(start);
  toast.error(t('agentAcks.gameStartFailed'));
}

/** Close the board only if this start opened it and nothing has opened it since. */
function closeBoardOf(start: GameStart): void {
  if (boardOpener !== start) return;
  boardOpener = null;
  const detail = { gameType: start.gameType };
  document.dispatchEvent(new CustomEvent('ferni:game-ended', { detail }));
}

/** The call ended: nothing is coming, so nothing may be announced later. */
function forgetGameStarts(): void {
  if (pending) clearTimeout(pending.timer);
  pending = null;
  timedOut.clear();
  boardOpener = null;
}
document.addEventListener('ferni:disconnected', forgetGameStarts);
document.addEventListener('ferni:session-end', forgetGameStarts);

/** The waiting start of this game, taken off the clock. */
function takePending(gameType: unknown): GameStart | null {
  if (!pending || pending.gameType !== gameType) return null;
  const start = pending;
  clearTimeout(start.timer);
  pending = null;
  return start;
}

function takeTimedOut(gameType: unknown): GameStart | null {
  const start = typeof gameType === 'string' ? timedOut.get(gameType) : undefined;
  if (!start) return null;
  timedOut.delete(start.gameType);
  return start;
}

/**
 * The agent's answer to a game start. "Starting <game>..." shows only now; after
 * a timeout it corrects the "didn't start" the user already saw.
 */
function handleGameAck(message: DataMessage, started: boolean): void {
  const start = takePending(message['gameType']);
  const late = start ? null : takeTimedOut(message['gameType']);
  if (started) {
    const name = (start ?? late)?.gameName;
    if (typeof name === 'string') toast.success(t('gamePicker.starting', { game: name }));
    return;
  }
  if (start) closeBoardOf(start);
  // Not when it was already told at the timeout, or while another game is loading
  if (start || (!late && !pending)) toast.error(t('agentAcks.gameStartFailed'));
}

/**
 * The agent fell back to a single agent. Handoffs still work there (the agent's
 * data-channel handler runs them through the coordinator), so the UI stays as is.
 */
function handleMultiAgentUnavailable(message: DataMessage): void {
  log.warn('Team mode unavailable, agent fell back to a single agent', {
    reason: message['reason'],
  });
}

function handleMicroExpression(message: DataMessage): void {
  // dispatchMicroExpression also sends a humanization_signal for the same flash.
  // The bridge does not route that signal type to the avatar, so this plays it once.
  const expressionType = message['expressionType'];
  if (typeof expressionType === 'string') playMicroExpression(expressionType);
}

function handleFailedAck(type: string, message: DataMessage): void {
  log.warn('Agent reported a failed request', { type, error: message['error'] });
  switch (type) {
    case 'game_start_ack':
    case 'text_game_start_ack':
      handleGameAck(message, false);
      break;
    case 'practice_start_ack':
      toast.error(t('app.practiceStartFailed'));
      break;
    case 'action_response_ack':
      toast.error(t('agentAcks.actionFailed'));
      break;
    default:
      toast.error(t('toasts.hmmmTryAgain'));
  }
}

/**
 * Handle the agent's acks and fallback notices.
 * @returns true when the message was one of them (and is consumed)
 */
export function handleAgentAckMessage(message: DataMessage): boolean {
  const { type } = message;
  if (type === 'multi_agent_unavailable') {
    handleMultiAgentUnavailable(message);
    return true;
  }
  if (type === 'micro_expression') {
    handleMicroExpression(message);
    return true;
  }
  if (!ACK_TYPES.has(type)) return false;
  if (message['success'] === false) handleFailedAck(type, message);
  else if (message['success'] === true && GAME_ACKS.has(type)) handleGameAck(message, true);
  return true;
}
