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
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { apiPost } from '../utils/api.js';
import { connectionService } from '../services/connection.service.js';

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
// ICONS (Lucide SVG - 2px stroke)
// ============================================================================

const ICONS = {
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>`,
  undo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 7v6h6"></path>
    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
  </svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12 6 12 12 16 14"></polyline>
  </svg>`,
  // Category-specific icons
  message: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
  </svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
  </svg>`,
  restaurant: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path>
    <path d="M7 2v20"></path>
    <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"></path>
  </svg>`,
  car: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"></path>
    <circle cx="7" cy="17" r="2"></circle>
    <circle cx="17" cy="17" r="2"></circle>
  </svg>`,
  shopping: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="8" cy="21" r="1"></circle>
    <circle cx="19" cy="21" r="1"></circle>
    <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path>
  </svg>`,
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
    <polyline points="9 22 9 12 15 12 15 22"></polyline>
  </svg>`,
  music: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 18V5l12-2v13"></path>
    <circle cx="6" cy="18" r="3"></circle>
    <circle cx="18" cy="16" r="3"></circle>
  </svg>`,
  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>
  </svg>`,
};

function getCategoryIcon(category: string): string {
  const iconMap: Record<string, string> = {
    messaging: ICONS.message,
    calendar: ICONS.calendar,
    booking: ICONS.restaurant,
    ordering: ICONS.shopping,
    smart_home: ICONS.home,
    music: ICONS.music,
    reminder: ICONS.bell,
    task: ICONS.check,
  };
  return iconMap[category] || ICONS.check;
}

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let pendingActions: PendingAction[] = [];
let callbacks: ActionConfirmationCallbacks = {};
let countdownIntervals: Map<string, number> = new Map();

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

      await room.localParticipant.publishData(new TextEncoder().encode(message), {
        reliable: true,
      });

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

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'action-confirmation-container';
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', 'Pending actions');

  // Add styles if not present
  if (!document.getElementById('action-confirmation-styles')) {
    const styles = document.createElement('style');
    styles.id = 'action-confirmation-styles';
    styles.textContent = getStyles();
    document.head.appendChild(styles);
  }

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
        <span class="action-eyebrow">Can I do this?</span>
        <h3 class="action-title" id="action-title-${action.id}">${action.preview.title}</h3>
      </div>
      <button class="action-dismiss" aria-label="Dismiss">
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
          <span class="cost-label">Estimated cost:</span>
          <span class="cost-value">$${action.preview.estimatedCost.toFixed(2)}</span>
        </div>
      ` : ''}

      ${action.preview.affectedParties && action.preview.affectedParties.length > 0 ? `
        <div class="action-parties">
          <span class="parties-label">Will notify:</span>
          <span class="parties-value">${action.preview.affectedParties.join(', ')}</span>
        </div>
      ` : ''}
    </div>

    <div class="action-card-footer">
      <div class="action-countdown">
        <span class="countdown-icon">${ICONS.clock}</span>
        <span class="countdown-text" data-countdown="${action.id}">${expiresIn}s</span>
      </div>
      
      <div class="action-buttons">
        <button class="action-btn action-btn-reject" data-action="reject">
          Not now
        </button>
        <button class="action-btn action-btn-approve" data-action="approve">
          ${ICONS.check}
          <span>Do it</span>
        </button>
      </div>
    </div>

    ${action.preview.canUndo ? `
      <div class="action-undo-note">
        <span class="undo-icon">${ICONS.undo}</span>
        <span>Can be undone</span>
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
      btn.innerHTML = `${ICONS.check}<span>Do it</span>`;
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
        <span>Done!</span>
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
      countdownEl.textContent = `${remaining}s`;
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

    .action-card {
      background: var(--color-bg-elevated, #FFFDFB);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
      border-radius: var(--radius-xl, 16px);
      box-shadow: 
        0 8px 32px rgba(0, 0, 0, 0.12),
        0 2px 8px rgba(0, 0, 0, 0.06);
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
  clearAllTimeouts();
  countdownIntervals.forEach((interval) => clearInterval(interval));
  countdownIntervals.clear();
  pendingActions = [];
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
