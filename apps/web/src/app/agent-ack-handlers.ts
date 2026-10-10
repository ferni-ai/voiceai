/**
 * Agent acknowledgements and fallbacks the app has to react to.
 *
 * The voice agent answers some requests with an `*_ack` data message and tells
 * the app when it could not start team mode. Until these were handled, the app
 * showed success while the agent had failed: it opens the game board and says
 * "Starting..." right after publishing the request, and nothing corrected that
 * when the agent answered `success: false`.
 *
 * Senders (the payload shapes below come from there):
 * - src/agents/voice-agent/data-channel-handler.ts: *_ack messages
 * - src/agents/voice-agent/phases/multi-agent-mode.ts: multi_agent_unavailable
 * - src/agents/realtime/emotion-event-dispatcher.ts: micro_expression
 */

import { playMicroExpression } from '../eq/index.js';
import { t } from '../i18n/index.js';
import { markMultiAgentUnavailable } from '../state/multi-agent-availability.js';
import type { DataMessage } from '../types/events.js';
import { toast } from '../ui/whisper.ui.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('AgentAcks');

/** Acks the app listens for. Only a failed one (`success: false`) changes the UI. */
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

let lastGameStart: { gameType: string; at: number } | null = null;

// The game picker opens the board optimistically; remember what it opened so a
// failed ack can take back that one game and no other.
document.addEventListener('ferni:game-started', (event) => {
  const gameType = (event as CustomEvent<{ gameType?: unknown }>).detail?.gameType;
  if (typeof gameType === 'string') lastGameStart = { gameType, at: Date.now() };
});

function undoGameStart(gameType: unknown): void {
  const started = lastGameStart;
  if (started && started.gameType === gameType && Date.now() - started.at < GAME_START_WINDOW_MS) {
    lastGameStart = null;
    document.dispatchEvent(new CustomEvent('ferni:game-ended', { detail: { gameType } }));
  }
}

const MULTI_AGENT_STYLE_ID = 'multi-agent-unavailable-styles';

/** Dim the team roster's persona buttons: handoffs are refused for this call. */
function injectUnavailableStyles(): void {
  if (document.getElementById(MULTI_AGENT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = MULTI_AGENT_STYLE_ID;
  style.textContent =
    'html[data-multi-agent="unavailable"] #teamRoster .team-member:not(.team-member--marketplace)' +
    ' { opacity: 0.5; pointer-events: none; }';
  document.head.appendChild(style);
}

function handleMultiAgentUnavailable(message: DataMessage): void {
  log.warn('Team mode unavailable, agent fell back to a single agent', {
    reason: message['reason'],
  });
  // The agent can send this twice for one failure; tell the user once.
  if (!markMultiAgentUnavailable()) return;
  injectUnavailableStyles();
  toast.info(t('agentAcks.multiAgentUnavailable'));
  document.dispatchEvent(new CustomEvent('ferni:multi-agent-unavailable'));
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
  // A success ack matches what the UI already shows; only a failure needs the user.
  if (message['success'] === false) handleFailedAck(type, message);
  return true;
}
