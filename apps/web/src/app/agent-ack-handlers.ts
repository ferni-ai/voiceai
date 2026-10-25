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
import { normalizeGameType } from '../ui/game-board.ui.js';
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

/** A game the board shows, or may show: started by voice or by a picker tap. */
interface Game {
  /** Arrival order: of the games the agent may be running, the newest is the one to show. */
  seq: number;
  gameType: string;
  detail: StartDetail;
  /** Its latest `ferni:game-state-update`, to redraw it. */
  lastState: unknown;
}

/** A picker tap, kept until the call ends so its ack (however late) finds it. */
interface GameStart extends Game {
  /** The picker's id for the tap, echoed in the ack (an older agent echoes none). */
  requestId: string | undefined;
  gameName: unknown;
  /** A text game: it has a board. A music game has none, and runs on the other engine. */
  onBoard: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
  /** 'waiting' for its ack; 'timedOut' (told it failed, may still be answered); 'answered'. */
  status: 'waiting' | 'timedOut' | 'answered';
  started: boolean;
  /** Started while a newer tap was waiting: its "Starting" waits for that one to settle. */
  startedQuietly: boolean;
}

let seq = 0;
/** This call's taps, oldest first. */
let starts: GameStart[] = [];
/** The board game the agent is running, as its acks and voice starts tell it. */
let agentGame: Game | null = null;
/** What the board shows, as far as this module knows. */
let onScreen: Game | null = null;
/** This module is redrawing the board: its own events aren't news. */
let redrawing = false;

const isBoardGame = (gameType: string): boolean => normalizeGameType(gameType) !== null;
const sameGame = (a: string, b: unknown): boolean =>
  typeof b === 'string' && normalizeGameType(a) === normalizeGameType(b);

// The game picker opens the board optimistically (its event says it awaits an
// ack); a game started by voice gets no ack, so it's not timed.
document.addEventListener('ferni:game-started', (event) => {
  const detail = (event as CustomEvent<Record<string, unknown> | undefined>).detail;
  const gameType = detail?.['gameType'];
  if (redrawing || !detail || typeof gameType !== 'string') return;
  const game = { seq: ++seq, gameType, detail: { ...detail, gameType }, lastState: undefined };
  if (detail['awaitsAck'] !== true) {
    if (isBoardGame(gameType)) agentGame = onScreen = game; // a music game leaves the board as is
    return;
  }
  // A newer tap stops the older one's clock; that one's ack still counts when it comes
  for (const start of starts) clearTimeout(start.timer);
  const requestId = detail['requestId'];
  const start: GameStart = {
    ...game,
    detail: { ...game.detail, awaitsAck: false, requestId: undefined },
    requestId: typeof requestId === 'string' ? requestId : undefined,
    gameName: detail['gameName'],
    onBoard: isBoardGame(gameType),
    timer: undefined,
    status: 'waiting',
    started: false,
    startedQuietly: false,
  };
  start.timer = setTimeout(() => timeOut(start), GAME_ACK_TIMEOUT_MS);
  starts.push(start);
  if (start.onBoard) onScreen = start;
});

// A move: saved on the newest game it can be for, so a redraw shows the latest state.
document.addEventListener('ferni:game-state-update', (event) => {
  const state = (event as CustomEvent<{ gameType?: unknown } | undefined>).detail;
  if (redrawing || !state) return;
  const games = [agentGame, ...starts.filter((s) => s.status === 'waiting' && s.onBoard)];
  let game: Game | null = null;
  for (const g of games) {
    if (g && sameGame(g.gameType, state.gameType) && g.seq > (game?.seq ?? 0)) game = g;
  }
  if (game) game.lastState = state;
});

// The agent ended a game: it's no longer one to put back. (Any end hides the board.)
document.addEventListener('ferni:game-ended', (event) => {
  if (redrawing) return;
  const gameType = (event as CustomEvent<{ gameType?: unknown } | undefined>).detail?.gameType;
  if (agentGame && (gameType === undefined || sameGame(agentGame.gameType, gameType))) {
    agentGame = null;
  }
  onScreen = null;
});

/** The newest game the agent may be running: a waiting text tap, or its known board game. */
function gameToShow(): Game | null {
  let game = agentGame;
  for (const start of starts) {
    if (start.onBoard && start.status === 'waiting' && start.seq > (game?.seq ?? 0)) game = start;
  }
  return game;
}

/** Make the board show gameToShow(): redraw it (with its latest state), or close it. */
function showOnBoard(): void {
  const game = gameToShow();
  const was = onScreen;
  if (game === was) return;
  onScreen = game;
  redrawing = true;
  try {
    if (!game) {
      const detail = { gameType: was?.gameType };
      document.dispatchEvent(new CustomEvent('ferni:game-ended', { detail }));
      return;
    }
    document.dispatchEvent(new CustomEvent('ferni:game-started', { detail: game.detail }));
    if (game.lastState !== undefined) {
      const detail = game.lastState;
      document.dispatchEvent(new CustomEvent('ferni:game-state-update', { detail }));
    }
  } finally {
    redrawing = false;
  }
}

/** A newer game on the same engine started after this one, so this one isn't running. */
function replaced(start: GameStart): boolean {
  if (start.onBoard && agentGame && agentGame.seq > start.seq) return true;
  return starts.some((s) => s.seq > start.seq && s.onBoard === start.onBoard && s.started);
}

function sayStarting(start: GameStart): void {
  if (typeof start.gameName === 'string') {
    toast.success(t('gamePicker.starting', { game: start.gameName }));
  }
}

/** No tap is waiting any more: say "Starting" for the ones that started meanwhile. */
function settle(): void {
  if (starts.some((s) => s.status === 'waiting')) return;
  for (const start of starts) {
    if (!start.startedQuietly) continue;
    start.startedQuietly = false;
    if (!replaced(start)) sayStarting(start);
  }
  showOnBoard();
}

/** No ack in time: tell the user it didn't start (nor any tap before it), and redraw. */
function timeOut(start: GameStart): void {
  log.warn('No answer from the agent to a game start', { gameType: start.gameType });
  for (const s of starts) if (s.status === 'waiting') s.status = 'timedOut';
  toast.error(t('agentAcks.gameStartFailed'));
  settle();
}

/**
 * The call ended: no ack is coming, so nothing may be announced later. call-end.ts
 * onCallEnded calls this on every end; the listeners below catch the rest.
 */
export function forgetGameStarts(): void {
  for (const start of starts) clearTimeout(start.timer);
  starts = [];
  agentGame = null;
  onScreen = null;
}
// The agent left; the room closed or dropped (connection.service reports every end here);
// or the page went into the back/forward cache with a start still waiting.
document.addEventListener('ferni:disconnected', forgetGameStarts);
appState.subscribe('connection', (state) => {
  if (state === 'disconnected' || state === 'error') forgetGameStarts();
});
window.addEventListener('pagehide', forgetGameStarts);

/**
 * The tap this ack answers: by the echoed request id; an ack without one (an agent
 * older than request ids) by its game, an unanswered tap first.
 */
function tapAnswered(message: DataMessage): GameStart | undefined {
  const requestId = message['requestId'];
  if (typeof requestId === 'string') return starts.find((s) => s.requestId === requestId);
  const ofGame = starts.filter((s) => s.gameType === message['gameType']).reverse();
  return ofGame.find((s) => s.status !== 'answered') ?? ofGame[0];
}

/**
 * The agent's answer to a game start. "Starting <game>..." shows only now, and
 * after a timeout it corrects the "didn't start". The board then shows the newest
 * game the agent is running; while a newer tap waits, that tap's answer comes first.
 */
function handleGameAck(message: DataMessage, started: boolean): void {
  const start = tapAnswered(message);
  if (!start) {
    // From an agent without request ids, a failure we can't place: told unless a game is loading
    const waiting = starts.some((s) => s.status === 'waiting');
    if (!started && typeof message['requestId'] !== 'string' && !waiting) {
      toast.error(t('agentAcks.gameStartFailed'));
    }
    return;
  }
  if (start.status === 'answered') return; // a repeat
  const wasWaiting = start.status === 'waiting';
  clearTimeout(start.timer);
  start.status = 'answered';
  start.started = started;
  const newerWaiting = starts.some((s) => s.seq > start.seq && s.status === 'waiting');
  if (started && !replaced(start)) {
    if (start.onBoard) agentGame = start;
    if (newerWaiting) start.startedQuietly = true;
    else sayStarting(start);
  }
  // Only the newest tap's failure is news; the user was told at a timeout already
  if (!started && wasWaiting && !starts.some((s) => s.seq > start.seq)) {
    toast.error(t('agentAcks.gameStartFailed'));
  }
  settle();
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
