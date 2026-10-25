/**
 * Agent acknowledgements and fallbacks the app has to react to.
 *
 * The voice agent answers some requests with an `*_ack` data message and tells
 * the app when it could not start team mode. Until these were handled, the app
 * showed success while the agent had failed: the picker opens the game board
 * right after publishing the request, and nothing corrected that when the agent
 * answered `success: false`. Its "Starting..." toast now waits for `success: true`,
 * and no answer within GAME_ACK_TIMEOUT_MS counts as a failed start. Each ack
 * names the tap it answers (the picker's requestId, echoed by the agent), and a
 * failed start only undoes what it put on the board.
 *
 * Senders (the payload shapes below come from there):
 * - src/agents/voice-agent/data-channel-handler.ts: *_ack messages
 * - src/agents/voice-agent/phases/multi-agent-mode.ts: multi_agent_unavailable
 * - src/agents/realtime/emotion-event-dispatcher.ts: micro_expression
 */

import { playMicroExpression } from '../eq/index.js';
import { t } from '../i18n/index.js';
import { appState } from '../state/app.state.js';
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

/** The detail of a `ferni:game-started` event, as the board reads it. */
type StartDetail = Record<string, unknown> & { gameType: string };

/** A game the agent is playing, on the board: started by voice, or a picker start it confirmed. */
interface ShownGame {
  kind: 'shown';
  detail: StartDetail;
  /** Its last `ferni:game-state-update`, to redraw it if a failed start covered it. */
  lastState: unknown;
}

/** A picker start the agent hasn't confirmed yet. */
interface GameStart {
  kind: 'start';
  /** The picker's id for the tap, echoed in the ack (an older agent echoes none). */
  requestId: string | undefined;
  gameType: string;
  gameName: unknown;
  detail: StartDetail;
  lastState: unknown;
  timer: ReturnType<typeof setTimeout> | undefined;
  /** The game the board showed when this start opened over it: put back if this one fails. */
  covered: ShownGame | null;
}

/** The picker's start still waiting for the agent's ack (one at a time: a new tap replaces it). */
let pending: GameStart | null = null;
/** Starts that timed out: the user was told they failed; their late ack may still come. */
const timedOut = new Set<GameStart>();
/** What the board shows now. */
let board: GameStart | ShownGame | null = null;

const shown = (detail: StartDetail, lastState?: unknown): ShownGame => ({
  kind: 'shown',
  detail,
  lastState,
});

// The game picker opens the board optimistically (its event says it awaits an
// ack); remember what it opened so the agent's ack can confirm, or take back,
// that one start and no other. A game started by voice gets no ack, so it's not timed.
document.addEventListener('ferni:game-started', (event) => {
  const detail = (event as CustomEvent<Record<string, unknown> | undefined>).detail;
  const gameType = detail?.['gameType'];
  if (!detail || typeof gameType !== 'string') return;
  if (detail['awaitsAck'] !== true) {
    board = shown({ ...detail, gameType });
    return;
  }
  if (pending) clearTimeout(pending.timer);
  const requestId = detail['requestId'];
  const start: GameStart = {
    kind: 'start',
    requestId: typeof requestId === 'string' ? requestId : undefined,
    gameType,
    gameName: detail['gameName'],
    detail: { ...detail, gameType, awaitsAck: false, requestId: undefined },
    lastState: undefined,
    timer: undefined,
    // A tap that replaced an unconfirmed one covers what that one covered
    covered: board?.kind === 'start' ? board.covered : board,
  };
  start.timer = setTimeout(() => timeOut(start), GAME_ACK_TIMEOUT_MS);
  pending = start;
  board = start;
});

document.addEventListener('ferni:game-state-update', (event) => {
  if (board) board.lastState = (event as CustomEvent<unknown>).detail;
});

// The agent ended a game (or this module took one back): nothing is left to put back.
document.addEventListener('ferni:game-ended', () => {
  if (board?.kind === 'start') board.covered = null;
  else board = null;
});

/** Put a game the agent is playing back on the board. */
function showOnBoard(game: ShownGame): void {
  document.dispatchEvent(new CustomEvent('ferni:game-started', { detail: game.detail }));
  board = game; // the listener above made a fresh record; keep this one and its state
  if (game.lastState !== undefined) {
    const detail = game.lastState;
    document.dispatchEvent(new CustomEvent('ferni:game-state-update', { detail }));
  }
}

/** No ack in time: tell the user it didn't start, and take back what it put on the board. */
function timeOut(start: GameStart): void {
  if (pending !== start) return; // a later tap replaced it
  log.warn('No answer from the agent to a game start', { gameType: start.gameType });
  pending = null;
  timedOut.add(start);
  takeBackBoardOf(start);
  toast.error(t('agentAcks.gameStartFailed'));
}

/**
 * Undo only what this start did to the board: if nothing has replaced it, put
 * back the game it covered (a voice game the agent is still playing), else close.
 */
function takeBackBoardOf(start: GameStart): void {
  if (board !== start) return;
  if (start.covered) {
    showOnBoard(start.covered);
    return;
  }
  board = null;
  const detail = { gameType: start.gameType };
  document.dispatchEvent(new CustomEvent('ferni:game-ended', { detail }));
}

/**
 * The call ended: no ack is coming, so nothing may be announced later. call-end.ts
 * onCallEnded calls this on every end; the listeners below catch the rest.
 */
export function forgetGameStarts(): void {
  if (pending) clearTimeout(pending.timer);
  pending = null;
  timedOut.clear();
  board = null;
}
// The agent left; the room closed or dropped (connection.service reports every end here);
// or the page went into the back/forward cache with a start still waiting.
document.addEventListener('ferni:disconnected', forgetGameStarts);
appState.subscribe('connection', (state) => {
  if (state === 'disconnected' || state === 'error') forgetGameStarts();
});
window.addEventListener('pagehide', forgetGameStarts);

/**
 * Does this ack answer that start? By the echoed request id; an ack without one
 * (an agent older than request ids) by its game, as before.
 */
function answers(message: DataMessage, start: GameStart): boolean {
  const requestId = message['requestId'];
  if (typeof requestId === 'string') return start.requestId === requestId;
  return start.gameType === message['gameType'];
}

/** The waiting start this ack answers, taken off the clock. */
function takePending(message: DataMessage): GameStart | null {
  if (!pending || !answers(message, pending)) return null;
  const start = pending;
  clearTimeout(start.timer);
  pending = null;
  return start;
}

function takeTimedOut(message: DataMessage): GameStart | null {
  for (const start of timedOut) {
    if (!answers(message, start)) continue;
    timedOut.delete(start);
    return start;
  }
  return null;
}

/**
 * The agent's answer to a game start. "Starting <game>..." shows only now. A
 * success after the timeout means the agent is playing it, so it goes back on the
 * board and the toast corrects the "didn't start", unless a newer tap is waiting.
 */
function handleGameAck(message: DataMessage, started: boolean): void {
  const start = takePending(message);
  const late = start ? null : takeTimedOut(message);
  const echoed = typeof message['requestId'] === 'string';
  if (started) {
    if (start) {
      if (board === start) board = shown(start.detail, start.lastState);
    } else if (late && !pending) {
      showOnBoard(shown(late.detail, late.lastState));
    } else {
      return; // an earlier tap's answer (the newer tap's ack decides) or one we never asked for
    }
    const name = (start ?? late)?.gameName;
    if (typeof name === 'string') toast.success(t('gamePicker.starting', { game: name }));
    return;
  }
  if (start) {
    takeBackBoardOf(start);
    toast.error(t('agentAcks.gameStartFailed'));
    return;
  }
  // Late (already told at the timeout), an earlier tap's answer, or, from an agent
  // without request ids, a failure we can't place: that one is told unless a game is loading.
  if (!late && !echoed && !pending) toast.error(t('agentAcks.gameStartFailed'));
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
