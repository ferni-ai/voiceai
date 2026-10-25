/**
 * Agent acknowledgements and fallbacks the app has to react to.
 *
 * The voice agent answers some requests with an `*_ack` data message and tells
 * the app when it could not start team mode. Until these were handled, the app
 * showed success while the agent had failed: the picker opens the game board
 * right after publishing the request, and nothing corrected that when the agent
 * answered `success: false`. Its "Starting..." toast now waits for `success: true`.
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

/** How long after the app opened a game board an ack failure may still close it. */
const GAME_START_WINDOW_MS = 60_000;

let lastGameStart: { gameType: string; gameName: unknown; at: number } | null = null;

// The game picker opens the board optimistically; remember what it opened so the
// agent's ack can confirm, or take back, that one game and no other.
document.addEventListener('ferni:game-started', (event) => {
  const detail = (event as CustomEvent<{ gameType?: unknown; gameName?: unknown }>).detail;
  const gameType = detail?.gameType;
  if (typeof gameType === 'string') {
    lastGameStart = { gameType, gameName: detail?.gameName, at: Date.now() };
  }
});

/** The picker's start of this game, if it is still waiting for the agent's answer. */
function takeGameStart(gameType: unknown): typeof lastGameStart {
  const started = lastGameStart;
  if (!started || started.gameType !== gameType) return null;
  lastGameStart = null;
  return Date.now() - started.at < GAME_START_WINDOW_MS ? started : null;
}

function undoGameStart(gameType: unknown): void {
  if (takeGameStart(gameType)) {
    document.dispatchEvent(new CustomEvent('ferni:game-ended', { detail: { gameType } }));
  }
}

/** "Starting <game>..." only once the agent has said the game started. */
function confirmGameStart(type: string, message: DataMessage): void {
  if (type !== 'game_start_ack' && type !== 'text_game_start_ack') return;
  const name = takeGameStart(message['gameType'])?.gameName;
  if (typeof name === 'string') toast.success(t('gamePicker.starting', { game: name }));
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
      undoGameStart(message['gameType']);
      toast.error(t('agentAcks.gameStartFailed'));
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
  else if (message['success'] === true) confirmGameStart(type, message);
  return true;
}
