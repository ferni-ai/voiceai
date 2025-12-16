/**
 * Modal Coordinator Service
 *
 * Prevents popup storms by coordinating all modals, celebrations,
 * and overlays through a single queue system.
 *
 * CORE PRINCIPLE: First conversation IS the onboarding.
 * - No popups until user has had 2+ conversations
 * - Only ONE modal at a time
 * - Cooldowns between celebrations
 * - Never interrupt active conversations
 *
 * @module @ferni/modal-coordinator
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('ModalCoordinator');

// ============================================================================
// TYPES
// ============================================================================

export type ModalPriority =
  | 'critical' // Subscription limits, errors (always show)
  | 'high' // Stage celebrations, team unlocks
  | 'medium' // Feature hints, trust signals
  | 'low'; // Toasts, small acknowledgments

interface QueuedModal {
  id: string;
  priority: ModalPriority;
  show: () => void;
  queuedAt: number;
}

interface CooldownConfig {
  modal: number; // Min gap between any modals
  celebration: number; // Min gap between celebrations
  hint: number; // Min gap between hints
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PRIORITY_VALUES: Record<ModalPriority, number> = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
};

const COOLDOWNS: CooldownConfig = {
  modal: 5000, // 5s between any modals
  celebration: 60000, // 60s between celebrations
  hint: 15000, // 15s between hints
};

const STORAGE_KEYS = {
  conversationCount: 'ferni:conversation_count',
  firstSessionComplete: 'ferni:first_session_complete',
  lastModalTime: 'ferni:last_modal_time',
  lastCelebrationTime: 'ferni:last_celebration_time',
  lastHintTime: 'ferni:last_hint_time',
} as const;

// ============================================================================
// STATE
// ============================================================================

let activeModalId: string | null = null;
let queue: QueuedModal[] = [];
let isConversationActive = false;
let lastModalTime = 0;
let lastCelebrationTime = 0;
let lastHintTime = 0;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initModalCoordinator(): void {
  // Load persisted timestamps
  lastModalTime = parseInt(localStorage.getItem(STORAGE_KEYS.lastModalTime) || '0');
  lastCelebrationTime = parseInt(localStorage.getItem(STORAGE_KEYS.lastCelebrationTime) || '0');
  lastHintTime = parseInt(localStorage.getItem(STORAGE_KEYS.lastHintTime) || '0');

  // Listen for conversation state changes
  document.addEventListener('ferni:conversation-start', () => {
    isConversationActive = true;
    log.debug('Conversation started - blocking modals');
  });

  document.addEventListener('ferni:conversation-end', () => {
    isConversationActive = false;
    log.debug('Conversation ended - modals allowed');
    processQueue();
  });

  // Also listen for connection events as fallback
  document.addEventListener('ferni:connected', () => {
    isConversationActive = true;
  });

  document.addEventListener('ferni:disconnected', () => {
    isConversationActive = false;
    // Process queue after a brief delay to let disconnect UI settle
    setTimeout(processQueue, 500);
  });

  log.info('Modal coordinator initialized');
}

// ============================================================================
// CONVERSATION TRACKING
// ============================================================================

/**
 * Get total conversation count from localStorage
 */
export function getConversationCount(): number {
  return parseInt(localStorage.getItem(STORAGE_KEYS.conversationCount) || '0');
}

/**
 * Increment conversation count (call when conversation ends)
 */
export function incrementConversationCount(): void {
  const count = getConversationCount() + 1;
  localStorage.setItem(STORAGE_KEYS.conversationCount, count.toString());
  log.debug('Conversation count incremented', { count });

  // Mark first session complete after first conversation
  if (count === 1) {
    localStorage.setItem(STORAGE_KEYS.firstSessionComplete, 'true');
  }
}

/**
 * Check if user is a first-time user (no conversations yet)
 */
export function isFirstTimeUser(): boolean {
  return getConversationCount() === 0;
}

/**
 * Check if user has completed minimum conversations for feature unlocks
 */
export function hasMinimumConversations(minCount: number = 2): boolean {
  return getConversationCount() >= minCount;
}

// ============================================================================
// MODAL COORDINATION
// ============================================================================

/**
 * Request permission to show a modal
 * Returns true if modal can show immediately, false if queued or rejected
 */
export function requestModal(
  modalId: string,
  priority: ModalPriority,
  show: () => void,
  options: {
    requireMinConversations?: number;
    isCelebration?: boolean;
    isHint?: boolean;
    allowDuringConversation?: boolean;
  } = {}
): boolean {
  const {
    requireMinConversations = 0,
    isCelebration = false,
    isHint = false,
    allowDuringConversation = false,
  } = options;

  const now = Date.now();

  // Check conversation count gate
  if (requireMinConversations > 0 && !hasMinimumConversations(requireMinConversations)) {
    log.debug('Modal blocked - insufficient conversations', {
      modalId,
      required: requireMinConversations,
      current: getConversationCount(),
    });
    return false;
  }

  // Check if conversation is active (except for critical priority)
  if (isConversationActive && !allowDuringConversation && priority !== 'critical') {
    log.debug('Modal blocked - conversation active', { modalId });
    // Queue it for later
    queueModal(modalId, priority, show);
    return false;
  }

  // Check cooldowns
  if (!checkCooldown(now, isCelebration, isHint)) {
    log.debug('Modal blocked - cooldown active', { modalId, isCelebration, isHint });
    // Queue it for later (except low priority which we just drop)
    if (priority !== 'low') {
      queueModal(modalId, priority, show);
    }
    return false;
  }

  // Check if another modal is active
  if (activeModalId !== null) {
    log.debug('Modal queued - another modal active', { modalId, activeModalId });
    queueModal(modalId, priority, show);
    return false;
  }

  // All checks passed - show the modal
  showModal(modalId, show, isCelebration, isHint);
  return true;
}

/**
 * Release a modal (call when modal is dismissed)
 */
export function releaseModal(modalId: string): void {
  if (activeModalId === modalId) {
    log.debug('Modal released', { modalId });
    activeModalId = null;

    // Process queue after a brief delay
    setTimeout(processQueue, 300);
  }
}

/**
 * Check if a specific modal is currently showing
 */
export function isModalActive(modalId?: string): boolean {
  if (modalId) {
    return activeModalId === modalId;
  }
  return activeModalId !== null;
}

/**
 * Get current active modal ID (for debugging)
 */
export function getActiveModalId(): string | null {
  return activeModalId;
}

/**
 * Check if conversation is currently active
 */
export function isConversationCurrentlyActive(): boolean {
  return isConversationActive;
}

/**
 * Manually set conversation state (for components that manage their own state)
 */
export function setConversationActive(active: boolean): void {
  isConversationActive = active;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function checkCooldown(now: number, isCelebration: boolean, isHint: boolean): boolean {
  // Check general modal cooldown
  if (now - lastModalTime < COOLDOWNS.modal) {
    return false;
  }

  // Check celebration-specific cooldown
  if (isCelebration && now - lastCelebrationTime < COOLDOWNS.celebration) {
    return false;
  }

  // Check hint-specific cooldown
  if (isHint && now - lastHintTime < COOLDOWNS.hint) {
    return false;
  }

  return true;
}

function showModal(
  modalId: string,
  show: () => void,
  isCelebration: boolean,
  isHint: boolean
): void {
  const now = Date.now();

  activeModalId = modalId;
  lastModalTime = now;
  localStorage.setItem(STORAGE_KEYS.lastModalTime, now.toString());

  if (isCelebration) {
    lastCelebrationTime = now;
    localStorage.setItem(STORAGE_KEYS.lastCelebrationTime, now.toString());
  }

  if (isHint) {
    lastHintTime = now;
    localStorage.setItem(STORAGE_KEYS.lastHintTime, now.toString());
  }

  log.info('Showing modal', { modalId, isCelebration, isHint });
  show();
}

function queueModal(modalId: string, priority: ModalPriority, show: () => void): void {
  // Don't queue duplicates
  if (queue.some((q) => q.id === modalId)) {
    return;
  }

  queue.push({
    id: modalId,
    priority,
    show,
    queuedAt: Date.now(),
  });

  // Sort by priority (highest first)
  queue.sort((a, b) => PRIORITY_VALUES[b.priority] - PRIORITY_VALUES[a.priority]);

  // Keep queue manageable (max 5 items)
  if (queue.length > 5) {
    queue = queue.slice(0, 5);
  }

  log.debug('Modal queued', { modalId, queueLength: queue.length });
}

function processQueue(): void {
  if (activeModalId !== null) {
    return; // Another modal is showing
  }

  if (queue.length === 0) {
    return; // Nothing queued
  }

  if (isConversationActive) {
    return; // Don't show during conversation
  }

  const now = Date.now();

  // Find first modal that passes cooldown
  const index = queue.findIndex((q) => {
    const isCelebration = q.id.includes('celebration') || q.id.includes('stage');
    const isHint = q.id.includes('hint');
    return checkCooldown(now, isCelebration, isHint);
  });

  if (index === -1) {
    // All queued modals are on cooldown, try again later
    setTimeout(processQueue, COOLDOWNS.modal);
    return;
  }

  // Remove from queue and show
  const modal = queue.splice(index, 1)[0];
  if (modal) {
    const isCelebration = modal.id.includes('celebration') || modal.id.includes('stage');
    const isHint = modal.id.includes('hint');
    showModal(modal.id, modal.show, isCelebration, isHint);
  }
}

// ============================================================================
// CONVENIENCE HELPERS
// ============================================================================

/**
 * Request a celebration modal (uses celebration cooldown)
 */
export function requestCelebration(celebrationId: string, show: () => void): boolean {
  return requestModal(celebrationId, 'high', show, {
    requireMinConversations: 3, // No celebrations until 3+ conversations
    isCelebration: true,
  });
}

/**
 * Request a feature hint (uses hint cooldown)
 */
export function requestHint(hintId: string, show: () => void): boolean {
  return requestModal(hintId, 'medium', show, {
    requireMinConversations: 2, // No hints until 2+ conversations
    isHint: true,
  });
}

/**
 * Request a critical modal (bypasses most checks)
 */
export function requestCriticalModal(modalId: string, show: () => void): boolean {
  return requestModal(modalId, 'critical', show, {
    allowDuringConversation: true,
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

// ============================================================================
// TESTING UTILITIES
// ============================================================================

/**
 * Reset to first-time user state for testing.
 * Clears conversation count and all modal-related localStorage.
 */
export function resetToFirstTimeUser(): void {
  localStorage.removeItem(STORAGE_KEYS.conversationCount);
  localStorage.removeItem(STORAGE_KEYS.firstSessionComplete);
  localStorage.removeItem(STORAGE_KEYS.lastModalTime);
  localStorage.removeItem(STORAGE_KEYS.lastCelebrationTime);
  localStorage.removeItem(STORAGE_KEYS.lastHintTime);
  localStorage.removeItem('ferni:onboarding:complete');
  localStorage.removeItem('ferni_dismissed_hints');

  // Reset in-memory state
  lastModalTime = 0;
  lastCelebrationTime = 0;
  lastHintTime = 0;
  activeModalId = null;
  queue = [];

  log.info('Reset to first-time user state - reload page to test');
}

/**
 * Simulate having N conversations for testing feature unlocks.
 */
export function simulateConversations(count: number): void {
  localStorage.setItem(STORAGE_KEYS.conversationCount, count.toString());
  if (count >= 1) {
    localStorage.setItem(STORAGE_KEYS.firstSessionComplete, 'true');
  }
  log.info(`Simulated ${count} conversations - reload page to see changes`);
}

/**
 * Get current first-time user experience status.
 */
export function getFirstTimeUserStatus(): {
  conversationCount: number;
  isFirstTimeUser: boolean;
  unlockedFeatures: string[];
  lockedFeatures: string[];
} {
  const count = getConversationCount();
  const unlocked: string[] = [];
  const locked: string[] = [];

  // Check what's unlocked
  if (count >= 1) {
    unlocked.push('greeting', 'streak-badge', 'subscription-badge', 'engagement-triggers');
  } else {
    locked.push('greeting', 'streak-badge', 'subscription-badge', 'engagement-triggers');
  }

  if (count >= 2) {
    unlocked.push('onboarding-tour', 'feature-hints', 'persona-intros');
  } else {
    locked.push('onboarding-tour', 'feature-hints', 'persona-intros');
  }

  if (count >= 3) {
    unlocked.push('stage-celebrations', 'value-capture');
  } else {
    locked.push('stage-celebrations', 'value-capture');
  }

  if (count >= 5) {
    unlocked.push('trust-signals');
  } else {
    locked.push('trust-signals');
  }

  return {
    conversationCount: count,
    isFirstTimeUser: count === 0,
    unlockedFeatures: unlocked,
    lockedFeatures: locked,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const modalCoordinator = {
  init: initModalCoordinator,
  request: requestModal,
  release: releaseModal,
  requestCelebration,
  requestHint,
  requestCriticalModal,
  isActive: isModalActive,
  getActiveId: getActiveModalId,
  getConversationCount,
  incrementConversationCount,
  isFirstTimeUser,
  hasMinimumConversations,
  isConversationActive: isConversationCurrentlyActive,
  setConversationActive,
  // Testing utilities
  resetToFirstTimeUser,
  simulateConversations,
  getFirstTimeUserStatus,
};
