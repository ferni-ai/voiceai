/**
 * Action Confirmation UI
 *
 * Shows users what actions Ferni wants to take on their behalf.
 * Core to the AGI-like experience - user sees a preview and can approve/reject.
 *
 * Design Philosophy:
 * - Non-intrusive: Appears as a gentle notification, not blocking
 * - Informative: Shows exactly what will happen
 * - Trustworthy: Clear approve/reject with undo options shown
 * - Warm: Ferni's voice, not corporate robot
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { formatCurrency, t } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { apiPost } from '../utils/api.js';
import { connectionService } from '../services/connection.service.js';
import { isOverlayHostEnabled } from './overlay/overlay-flag.js';
import { openDialog, type DialogHandle } from './overlay/dialog.js';
import { ICONS, getCategoryIcon } from './action-confirmation-icons.js';

const log = createLogger('ActionConfirmation');
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export interface ActionPreview {
  title: string;
  summary: string;
  details: string[];
  canUndo: boolean;
  estimatedCost?: number;
  affectedParties?: string[];
}

export interface PendingAction {
  id: string;
  actionType: string;
  category: string;
  description: string;
  preview: ActionPreview;
  expiresAt: string;
  metadata: Record<string, unknown>;
}

interface ActionConfirmationCallbacks {
  onApprove?: (actionId: string) => void;
  onReject?: (actionId: string) => void;
}

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let pendingActions: PendingAction[] = [];
let callbacks: ActionConfirmationCallbacks = {};
let countdownIntervals: Map<string, number> = new Map();
/** Overlay host: the action in front of the reader, and the ones waiting behind it. */
let current: { id: string; dialog: DialogHandle } | null = null;
let waiting: PendingAction[] = [];

// ============================================================================
// API & DATA CHANNEL
// ============================================================================

/**
 * Send action response via LiveKit data channel (preferred) or API fallback
 *
 * The data channel approach is preferred because it goes through the voice agent
 * which can then speak the confirmation in Ferni's voice.
 */
async function sendActionResponse(actionId: string, approved: boolean): Promise<boolean> {
  // Try data channel first (for voice confirmation)
  const room = connectionService.getRoom();
  if (room?.localParticipant) {
    try {
      const message = JSON.stringify({
        type: 'action_response',
        actionId,
        approved,
        timestamp: Date.now(),
      });

      await room.localParticipant.publishData(new TextEncoder().encode(message), { reliable: true });

      log.info({ actionId, approved }, 'Action response sent via data channel');
      return true;
    } catch (error) {
      log.warn({ error, actionId }, 'Failed to send via data channel, falling back to API');
    }
  }

  // Fall back to API (for when not connected to voice)
  try {
    const endpoint = approved ? '/api/actions/approve' : '/api/actions/reject';
    const response = await apiPost(endpoint, { actionId });
    if (response.ok) {
      log.info({ actionId, approved }, 'Action response sent via API');
      return true;
    }
    return false;
  } catch (error) {
    log.error({ error, actionId }, 'Failed to send action response');
    return false;
  }
}

async function approveAction(actionId: string): Promise<boolean> {
  const success = await sendActionResponse(actionId, true);
  if (success) {
    callbacks.onApprove?.(actionId);
  }
  return success;
}

async function rejectAction(actionId: string): Promise<boolean> {
  const success = await sendActionResponse(actionId, false);
  if (success) {
    callbacks.onReject?.(actionId);
  }
  return success;
}

// ============================================================================
// UI CREATION
// ============================================================================

function ensureStyles(): void {
  if (document.getElementById('action-confirmation-styles')) return;
  const styles = document.createElement('style');
  styles.id = 'action-confirmation-styles';
  styles.textContent = getStyles();
  document.head.appendChild(styles);
}

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'action-confirmation-container';
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', t('actionConfirmation.pendingActions'));
  ensureStyles();

  document.body.appendChild(el);
  return el;
}

function createActionCard(action: PendingAction): HTMLElement {
  const card = document.createElement('div');
  card.className = 'action-card';
  card.dataset.actionId = action.id;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', `action-title-${action.id}`);

  const expiresIn = Math.max(0, Math.floor((new Date(action.expiresAt).getTime() - Date.now()) / 1000));

  card.innerHTML = `
    <div class="action-card-header">
      <div class="action-icon">${getCategoryIcon(action.category)}</div>
      <div class="action-header-text">
        <span class="action-eyebrow">${t('actionConfirmation.eyebrow')}</span>
        <h3 class="action-title" id="action-title-${action.id}">${action.preview.title}</h3>
      </div>
      <button class="action-dismiss" aria-label="${t('common.dismiss')}">
        ${ICONS.x}
      </button>
    </div>

    <div class="action-card-body">
      <p class="action-summary">${action.preview.summary}</p>
      
      ${action.preview.details.length > 0 ? `
        <ul class="action-details">
          ${action.preview.details.map((detail) => `<li>${detail}</li>`).join('')}
        </ul>
      ` : ''}

      ${action.preview.estimatedCost ? `
        <div class="action-cost">
          <span class="cost-label">${t('actionConfirmation.estimatedCost')}</span>
          <span class="cost-value">${formatCurrency(action.preview.estimatedCost, 'USD')}</span>
        </div>
      ` : ''}

      ${action.preview.affectedParties && action.preview.affectedParties.length > 0 ? `
        <div class="action-parties">
          <span class="parties-label">${t('actionConfirmation.willNotify')}</span>
          <span class="parties-value">${action.preview.affectedParties.join(', ')}</span>
        </div>
      ` : ''}
    </div>

    <div class="action-card-footer">
      <div class="action-countdown">
        <span class="countdown-icon">${ICONS.clock}</span>
        <span class="countdown-text" data-countdown="${action.id}">${t('actionConfirmation.secondsShort', { count: expiresIn })}</span>
      </div>
      
      <div class="action-buttons">
        <button class="action-btn action-btn-reject" data-action="reject">
          ${t('actionConfirmation.notNow')}
        </button>
        <button class="action-btn action-btn-approve" data-action="approve">
          ${ICONS.check}
          <span>${t('actionConfirmation.doIt')}</span>
        </button>
      </div>
    </div>

    ${action.preview.canUndo ? `
      <div class="action-undo-note">
        <span class="undo-icon">${ICONS.undo}</span>
        <span>${t('actionConfirmation.canBeUndone')}</span>
      </div>
    ` : ''}
  `;

  // Event listeners
  card.querySelector('.action-dismiss')?.addEventListener('click', () => {
    dismissAction(action.id);
  });

  card.querySelector('[data-action="approve"]')?.addEventListener('click', async () => {
    const btn = card.querySelector('[data-action="approve"]') as HTMLButtonElement;
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-loading"></span>';

    const success = await approveAction(action.id);
    if (success) {
      showSuccessFeedback(card);
      trackedTimeout(() => dismissAction(action.id), DURATION.SLOW);
    } else {
      btn.disabled = false;
      btn.innerHTML = `${ICONS.check}<span>${t('actionConfirmation.doIt')}</span>`;
    }
  });

  card.querySelector('[data-action="reject"]')?.addEventListener('click', async () => {
    await rejectAction(action.id);
    dismissAction(action.id);
  });

  // Start countdown
  startCountdown(action.id, expiresIn);

  return card;
}

function showSuccessFeedback(card: HTMLElement): void {
  card.classList.add('action-card-success');
  const body = card.querySelector('.action-card-body');
  if (body) {
    body.innerHTML = `
      <div class="action-success-message">
        <span class="success-icon">${ICONS.check}</span>
        <span>${t('actionConfirmation.done')}</span>
      </div>
    `;
  }
}

function startCountdown(actionId: string, seconds: number): void {
  let remaining = seconds;

  const interval = window.setInterval(() => {
    remaining--;
    const countdownEl = document.querySelector(`[data-countdown="${actionId}"]`);
    if (countdownEl) {
      countdownEl.textContent = t('actionConfirmation.secondsShort', { count: remaining });
    }

    if (remaining <= 0) {
      clearInterval(interval);
      countdownIntervals.delete(actionId);
      dismissAction(actionId);
    }
  }, 1000);

  countdownIntervals.set(actionId, interval);
}

function dismissAction(actionId: string): void {
  if (current?.id === actionId) {
    current.dialog.close(); // onClose runs the rest of the cleanup
    return;
  }
  waiting = waiting.filter((a) => a.id !== actionId);
  // Stop countdown
  const interval = countdownIntervals.get(actionId);
  if (interval) {
    clearInterval(interval);
    countdownIntervals.delete(actionId);
  }

  // Remove from state
  pendingActions = pendingActions.filter((a) => a.id !== actionId);

  // Animate out
  const card = container?.querySelector(`[data-action-id="${actionId}"]`);
  if (card) {
    card.classList.add('action-card-dismissing');
    trackedTimeout(() => {
      card.remove();
      if (pendingActions.length === 0 && container) {
        container.classList.remove('visible');
      }
    }, DURATION.NORMAL);
  }
}

// ============================================================================
// STYLES
// ============================================================================

function getStyles(): string {
  return `
    .action-confirmation-container {
      position: fixed;
      bottom: var(--space-4);
      right: var(--space-4);
      z-index: var(--z-tooltip);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      max-width: 400px;
      width: calc(100vw - var(--space-8));
      opacity: 0;
      transform: translateY(20px);
      pointer-events: none;
      transition: all ${DURATION.MODERATE}ms ${EASING.SPRING};
    }

    .action-confirmation-container.visible {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }

    /* Overlay host: the card is the dialog's content, not a card of its own. */
    .ferni-dialog.action-confirmation-dialog .ferni-dialog__surface { padding: 0; }
    .ferni-dialog.action-confirmation-dialog .action-card {
      border: 0;
      border-radius: 0;
      box-shadow: none;
      background: transparent;
      animation: none;
    }
    .ferni-dialog.action-confirmation-dialog .action-btn { white-space: nowrap; }

    .action-card {
      background: var(--color-bg-elevated, #FFFDFB);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
      border-radius: var(--radius-xl, 16px);
      box-shadow: var(--shadow-xl);
      overflow: hidden;
      animation: action-card-enter ${DURATION.MODERATE}ms ${EASING.SPRING};
    }

    @keyframes action-card-enter {
      from {
        opacity: 0;
        transform: translateX(20px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateX(0) scale(1);
      }
    }

    .action-card-dismissing {
      animation: action-card-exit ${DURATION.NORMAL}ms ${EASING.GENTLE} forwards;
    }

    @keyframes action-card-exit {
      to {
        opacity: 0;
        transform: translateX(20px) scale(0.95);
      }
    }

    .action-card-success {
      border-color: var(--color-success, #4a6741);
    }

    .action-card-header {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      padding: var(--space-4);
      border-bottom: 1px solid var(--color-border-subtle);
    }

    .action-icon {
      width: 40px;
      height: 40px;
      padding: var(--space-2);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border-radius: var(--radius-lg);
      color: var(--persona-primary, #4a6741);
      flex-shrink: 0;
    }

    .action-icon svg {
      width: 100%;
      height: 100%;
    }

    .action-header-text {
      flex: 1;
      min-width: 0;
    }

    .action-eyebrow {
      display: block;
      font-size: var(--text-xs);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-text-muted);
      margin-bottom: var(--space-1);
    }

    .action-title {
      font-family: var(--font-display);
      font-size: var(--text-base);
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0;
    }

    .action-dismiss {
      width: 28px;
      height: 28px;
      padding: 0;
      background: transparent;
      border: none;
      border-radius: var(--radius-md);
      color: var(--color-text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all ${DURATION.FAST}ms;
      flex-shrink: 0;
    }

    .action-dismiss:hover {
      background: var(--color-background-primary);
      color: var(--color-text-primary);
    }

    .action-dismiss svg {
      width: 16px;
      height: 16px;
    }

    .action-card-body {
      padding: var(--space-4);
    }

    .action-summary {
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      margin: 0 0 var(--space-3) 0;
      line-height: 1.5;
    }

    .action-details {
      margin: 0 0 var(--space-3) 0;
      padding-left: var(--space-4);
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
    }

    .action-details li {
      margin-bottom: var(--space-1);
    }

    .action-cost, .action-parties {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--text-sm);
      margin-bottom: var(--space-2);
    }

    .cost-label, .parties-label {
      color: var(--color-text-muted);
    }

    .cost-value {
      font-weight: 600;
      color: var(--color-text-primary);
    }

    .parties-value {
      color: var(--color-text-secondary);
    }

    .action-card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--space-3) var(--space-4);
      background: var(--color-background-primary);
    }

    .action-countdown {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      font-size: var(--text-xs);
      color: var(--color-text-muted);
    }

    .countdown-icon {
      width: 14px;
      height: 14px;
    }

    .countdown-icon svg {
      width: 100%;
      height: 100%;
    }

    .action-buttons {
      display: flex;
      gap: var(--space-2);
    }

    .action-btn {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-lg);
      font-size: var(--text-sm);
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
      border: none;
    }

    .action-btn svg {
      width: 16px;
      height: 16px;
    }

    .action-btn-reject {
      background: transparent;
      color: var(--color-text-muted);
    }

    .action-btn-reject:hover {
      background: var(--color-background-elevated);
      color: var(--color-text-primary);
    }

    .action-btn-approve {
      background: var(--persona-primary, #4a6741);
      color: white;
    }

    .action-btn-approve:hover:not(:disabled) {
      filter: brightness(1.1);
      transform: translateY(-1px);
    }

    .action-btn-approve:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    .btn-loading {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .action-undo-note {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-1);
      padding: var(--space-2);
      font-size: var(--text-xs);
      color: var(--color-text-muted);
      background: var(--color-background-primary);
      border-top: 1px solid var(--color-border-subtle);
    }

    .undo-icon {
      width: 12px;
      height: 12px;
    }

    .undo-icon svg {
      width: 100%;
      height: 100%;
    }

    .action-success-message {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      padding: var(--space-4);
      font-size: var(--text-lg);
      font-weight: 600;
      color: var(--color-success, #4a6741);
    }

    .success-icon {
      width: 24px;
      height: 24px;
    }

    .success-icon svg {
      width: 100%;
      height: 100%;
    }

    /* Mobile adjustments */
    @media (max-width: 480px) {
      .action-confirmation-container {
        right: var(--space-2);
        bottom: var(--space-2);
        width: calc(100vw - var(--space-4));
      }
    }
  `;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show a pending action for user approval
 */
export function showActionConfirmation(action: PendingAction): void {
  if (isOverlayHostEnabled()) {
    if (pendingActions.some((a) => a.id === action.id)) return;
    pendingActions.push(action);
    if (current) waiting.push(action);
    else openActionDialog(action);
    log.info({ actionId: action.id, type: action.actionType }, 'Showing action confirmation');
    return;
  }
  if (!container) {
    container = createContainer();
  }

  // Don't show duplicates
  if (pendingActions.find((a) => a.id === action.id)) {
    return;
  }

  pendingActions.push(action);
  const card = createActionCard(action);
  container.appendChild(card);
  container.classList.add('visible');

  log.info({ actionId: action.id, type: action.actionType }, 'Showing action confirmation');
}

/**
 * Overlay host on: one consent at a time, in a native alert dialog (top layer,
 * so nothing renders over it, and never on top of the call controls the way
 * the bottom-right card did). Escape or the backdrop count as dismissing it,
 * which is what the card's close button did; it is not a rejection.
 */
function openActionDialog(action: PendingAction): void {
  ensureStyles();
  const card = createActionCard(action);
  card.removeAttribute('role'); // the <dialog> carries the semantics
  const dialog = openDialog(card, {
    size: 'md',
    role: 'alertdialog',
    labelledBy: `action-title-${action.id}`,
    className: 'action-confirmation-dialog',
    onClose: () => {
      const interval = countdownIntervals.get(action.id);
      if (interval) clearInterval(interval);
      countdownIntervals.delete(action.id);
      pendingActions = pendingActions.filter((a) => a.id !== action.id);
      current = null;
      const next = waiting.shift();
      if (next) openActionDialog(next);
    },
  });
  current = { id: action.id, dialog };
  card.querySelector<HTMLElement>('[data-action="reject"]')?.focus();
}

/**
 * Dismiss a pending action
 */
export function dismissActionConfirmation(actionId: string): void {
  dismissAction(actionId);
}

/**
 * Set callbacks for approve/reject events
 */
export function setActionConfirmationCallbacks(cbs: ActionConfirmationCallbacks): void {
  callbacks = cbs;
}

/**
 * Cleanup all confirmations
 */
export function cleanupActionConfirmations(): void {
  _clearAllTimeouts();
  countdownIntervals.forEach((interval) => clearInterval(interval));
  countdownIntervals.clear();
  pendingActions = [];
  waiting = [];
  current?.dialog.close();
  current = null;
  container?.remove();
  container = null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const actionConfirmation = {
  show: showActionConfirmation,
  dismiss: dismissActionConfirmation,
  setCallbacks: setActionConfirmationCallbacks,
  cleanup: cleanupActionConfirmations,
};

export default actionConfirmation;
